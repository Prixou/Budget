// Moteur d'optimisation : détection, score de santé financière, conseils chiffrés,
// prévision de trésorerie, stratégies de remboursement. Fonctions pures, sans DOM.
// Les seuils et références sont documentés et sourcés dans docs/RECHERCHE.md.
import {
  accountBalances,
  amortization,
  countedAccounts,
  dueOccurrences,
  effectiveBudget,
  filterTransactions,
  firstTransactionDate,
  goalStats,
  groupSplit,
  loanPayment,
  loanStatus,
  monthlyEquivalent,
  monthlyTotals,
  spendIndex,
  transactionsByDate,
  upcoming,
} from './calc.js';
import { REFERENCE, SAVINGS_PRODUCTS } from './defaults.js';
import { addDays, addMonths, daysBetween, monthEnd, monthKey, monthRange, normalizeText, shiftMonth, sum, todayISO } from './utils.js';

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let max = 0;
  for (const [v, n] of counts) if (n > max) [best, max] = [v, n];
  return best;
}

const roundUp = (cents, step = 1000) => Math.ceil(cents / step) * step;

/** Interpolation linéaire bornée : score de 100 à `good`, 0 à `bad`. */
function scale(value, good, bad) {
  if (value == null || Number.isNaN(value)) return null;
  const t = (value - bad) / (good - bad);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

/** Taux de marché indicatif d'un crédit immobilier selon sa durée (fourchette 2026). */
export function marketMortgageRate(years) {
  const y = Math.max(15, Math.min(25, years));
  return REFERENCE.mortgageMarket15y + ((y - 15) * (REFERENCE.mortgageMarket25y - REFERENCE.mortgageMarket15y)) / 10;
}

/* ------------------------------------------------------------------ */
/* Situation de référence (3 derniers mois complets)                   */
/* ------------------------------------------------------------------ */

const LIQUID_TYPES = new Set(['courant', 'especes', 'carte']);

/** Moyennes et soldes utilisés par les conseils et le score. */
export function baseline(state, today = todayISO()) {
  const last = shiftMonth(monthKey(today), -1);
  const months = monthRange(shiftMonth(last, -2), last);
  const rows = monthlyTotals(state, months);
  const active = rows.filter((r) => r.income || r.expense);
  const n = active.length;
  const income = n ? Math.round(sum(active, (r) => r.income) / n) : 0;
  const expense = n ? Math.round(sum(active, (r) => r.expense) / n) : 0;
  const txs = filterTransactions(state, { from: `${months[0]}-01`, to: monthEnd(last) });
  const split = groupSplit(state, txs);
  const balances = accountBalances(state, today);
  const accounts = countedAccounts(state);
  const balanceOf = (types) => sum(accounts.filter((a) => types.has(a.type)), (a) => balances.get(a.id) || 0);
  const liquidCash = balanceOf(LIQUID_TYPES);
  const savings = sum(accounts.filter((a) => a.type === 'epargne'), (a) => Math.max(0, balances.get(a.id) || 0));
  const investments = sum(accounts.filter((a) => a.type === 'investissement'), (a) => Math.max(0, balances.get(a.id) || 0));
  const debts = (state.debts || []).map((d) => ({ debt: d, status: loanStatus(d, today) })).filter((d) => d.status.remaining > 0);
  const debtPayments = sum(debts, (d) => d.status.monthly);
  const emergencyMonths = state.settings?.incomeStability === 'variable' ? REFERENCE.emergencyMonthsVariable : REFERENCE.emergencyMonthsStable;
  return {
    months,
    monthsWithData: n,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    split: n ? { needs: split.needs / n, wants: split.wants / n, savings: split.savings / n, income: split.income / n } : null,
    balances,
    liquidCash,
    savings,
    investments,
    debts,
    debtPayments,
    debtRatio: income > 0 ? debtPayments / income : null,
    emergencyTarget: expense * emergencyMonths,
    emergencyMonths,
    coverage: expense > 0 ? savings / expense : null,
  };
}

/* ------------------------------------------------------------------ */
/* Détection des paiements récurrents (abonnements)                    */
/* ------------------------------------------------------------------ */
// Méthode : regrouper par marchand normalisé, garder les montants à ±10 % de la
// médiane, puis chercher un intervalle dominant (hebdomadaire 7±2 j, mensuel 30±4 j…)
// avec au moins 3 occurrences.

const NOISE_WORDS = new Set(['cb', 'carte', 'prlv', 'prelevement', 'sepa', 'vir', 'virement', 'paiement', 'achat', 'facture', 'fact', 'du', 'le', 'la', 'les', 'de', 'des', 'sas', 'sa', 'sarl', 'fr', 'www', 'com', 'recu', 'emis', 'en', 'au', 'aux', 'et']);

export const CADENCES = [
  { id: 'weekly', days: 7, tol: 2, perMonth: 52 / 12, label: 'chaque semaine' },
  { id: 'biweekly', days: 14, tol: 3, perMonth: 26 / 12, label: 'toutes les 2 semaines' },
  { id: 'monthly', days: 30.44, tol: 4, perMonth: 1, label: 'chaque mois' },
  { id: 'bimonthly', days: 61, tol: 7, perMonth: 1 / 2, label: 'tous les 2 mois' },
  { id: 'quarterly', days: 91, tol: 10, perMonth: 1 / 3, label: 'chaque trimestre' },
  { id: 'semiannual', days: 182, tol: 14, perMonth: 1 / 6, label: 'chaque semestre' },
  { id: 'yearly', days: 365, tol: 21, perMonth: 1 / 12, label: 'chaque année' },
];

const merchantCache = new Map();

/** Libellé bancaire → nom de marchand comparable (« PRLV SEPA NETFLIX 12/09 » → « netflix »). */
export function merchantKey(description) {
  let key = merchantCache.get(description);
  if (key === undefined) {
    if (merchantCache.size > 20000) merchantCache.clear();
    key = computeMerchantKey(description);
    merchantCache.set(description, key);
  }
  return key;
}

function computeMerchantKey(description) {
  return normalizeText(description)
    .replace(/[^a-z ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w))
    .slice(0, 3)
    .join(' ');
}

export function detectRecurring(state, today = todayISO(), { minOccurrences = 3 } = {}) {
  const since = addDays(today, -400);
  const tracked = new Set([...state.recurring.map((r) => merchantKey(r.description)).filter(Boolean), ...(state.settings?.ignoredRecurring || [])]);
  const groups = new Map();
  for (const tx of transactionsByDate(state)) {
    if (tx.type !== 'expense' || tx.date < since || tx.date > today || !tx.description) continue;
    const key = merchantKey(tx.description);
    if (!key) continue;
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(tx);
  }
  const found = [];
  for (const [key, list] of groups) {
    if (list.length < minOccurrences || tracked.has(key) || list.some((t) => t.recurringId)) continue;
    const med = median(list.map((t) => t.amount));
    const stable = list.filter((t) => Math.abs(t.amount - med) <= med * 0.1);
    if (stable.length < minOccurrences || stable.length / list.length < 0.75) continue;
    const gaps = [];
    for (let i = 1; i < stable.length; i++) gaps.push(daysBetween(stable[i - 1].date, stable[i].date));
    const gap = median(gaps);
    const cadence = CADENCES.find((c) => Math.abs(gap - c.days) <= c.tol);
    if (!cadence) continue;
    const regular = gaps.filter((g) => Math.abs(g - cadence.days) <= cadence.tol * 1.5).length;
    if (regular / gaps.length < 0.7) continue;
    const last = stable[stable.length - 1];
    const amount = Math.round(median(stable.map((t) => t.amount)));
    found.push({
      key,
      label: last.description,
      cadence: cadence.id,
      cadenceLabel: cadence.label,
      amount,
      monthly: Math.round(amount * cadence.perMonth),
      yearly: Math.round(amount * cadence.perMonth * 12),
      count: stable.length,
      firstDate: stable[0].date,
      lastDate: last.date,
      nextDate: addDays(last.date, Math.round(cadence.days)),
      active: daysBetween(last.date, today) <= cadence.days + cadence.tol * 2,
      categoryId: mostCommon(stable.map((t) => t.categoryId)),
      accountId: last.accountId,
    });
  }
  return found.sort((a, b) => b.yearly - a.yearly);
}

/** Règle récurrente à créer à partir d'un paiement détecté. */
export function ruleFromDetection(d) {
  return {
    type: 'expense',
    amount: d.amount,
    description: d.label,
    categoryId: d.categoryId,
    accountId: d.accountId,
    toAccountId: null,
    frequency: d.cadence,
    startDate: d.lastDate,
    lastDate: d.lastDate,
    endDate: null,
    autoCreate: true,
    active: true,
    tags: [],
  };
}

/* ------------------------------------------------------------------ */
/* Tendances et dépenses inhabituelles                                 */
/* ------------------------------------------------------------------ */

/**
 * Catégories en hausse : 30 derniers jours comparés à la moyenne des 90 jours précédents.
 * Les opérations récurrentes (loyer, prélèvements) sont exclues : leur date de passage
 * créerait de fausses hausses.
 */
export function spendingTrends(state, today = todayISO(), { minIncrease = 0.25, minDiff = 3000, exclude = new Set() } = {}) {
  const first = firstTransactionDate(state);
  const baseFrom = addDays(today, -119);
  if (!first || first > baseFrom) return [];
  const recentFrom = addDays(today, -29);
  const recent = new Map();
  const base = new Map();
  for (const tx of filterTransactions(state, { from: baseFrom, to: today, type: 'expense' })) {
    if (tx.recurringId || exclude.has(tx.id)) continue;
    const map = tx.date >= recentFrom ? recent : base;
    map.set(tx.categoryId, (map.get(tx.categoryId) || 0) + tx.amount);
  }
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const rows = [];
  for (const [catId, amount] of recent) {
    const average = (base.get(catId) || 0) / 3;
    if (average <= 0) continue;
    const diff = amount - average;
    const ratio = diff / average;
    if (ratio >= minIncrease && diff >= minDiff && cats.has(catId)) rows.push({ category: cats.get(catId), recent: amount, average: Math.round(average), diff: Math.round(diff), ratio });
  }
  return rows.sort((a, b) => b.diff - a.diff);
}

/** Dépenses récentes très supérieures au montant habituel de leur catégorie. */
export function unusualExpenses(state, today = todayISO(), { factor = 3, minAmount = 8000 } = {}) {
  const from = addDays(today, -180);
  const recentFrom = addDays(today, -30);
  const byCat = new Map();
  for (const tx of filterTransactions(state, { from, to: today, type: 'expense' })) {
    let list = byCat.get(tx.categoryId);
    if (!list) byCat.set(tx.categoryId, (list = []));
    list.push(tx);
  }
  const out = [];
  for (const list of byCat.values()) {
    if (list.length < 5) continue;
    const med = median(list.map((t) => t.amount));
    for (const tx of list) {
      if (tx.date >= recentFrom && tx.amount >= minAmount && tx.amount >= med * factor && !tx.recurringId) out.push({ tx, median: Math.round(med), factor: tx.amount / med });
    }
  }
  return out.sort((a, b) => b.tx.amount - a.tx.amount);
}

/* ------------------------------------------------------------------ */
/* Prévision de trésorerie                                             */
/* ------------------------------------------------------------------ */

/**
 * Solde prévisionnel des comptes courants (courant, espèces, carte) jour par jour :
 * solde actuel + opérations récurrentes et futures déjà saisies − dépenses variables
 * moyennes (90 derniers jours, hors récurrences). Les revenus variables ne sont pas
 * comptés : la prévision reste prudente.
 */
export function cashForecast(state, today = todayISO(), days = 90, { exclude = new Set(), variableIncome = false } = {}) {
  const accounts = countedAccounts(state).filter((a) => LIQUID_TYPES.has(a.type));
  const ids = new Set(accounts.map((a) => a.id));
  const balances = accountBalances(state, today);
  let balance = sum(accounts, (a) => balances.get(a.id) || 0);
  const start = balance;

  const from = addDays(today, -89);
  let variable = 0;
  for (const tx of filterTransactions(state, { from, to: today })) {
    if (!ids.has(tx.accountId) || tx.recurringId || exclude.has(tx.id)) continue;
    if (tx.type === 'expense') variable += tx.amount;
    else if (tx.type === 'income' && variableIncome) variable -= tx.amount;
  }
  const first = firstTransactionDate(state);
  const historyDays = first ? Math.min(90, daysBetween(first, today) + 1) : 0;
  const dailyVariable = historyDays >= 14 ? variable / historyDays : 0;

  const end = addDays(today, days);
  const events = new Map();
  const add = (date, delta) => delta && events.set(date, (events.get(date) || 0) + delta);
  const effect = (type, amount, accountId, toAccountId) => {
    if (type === 'income') return ids.has(accountId) ? amount : 0;
    if (type === 'expense') return ids.has(accountId) ? -amount : 0;
    return (ids.has(toAccountId) ? amount : 0) - (ids.has(accountId) ? amount : 0);
  };
  for (const { rule, date } of upcoming(state, addDays(today, 1), end)) add(date, effect(rule.type, rule.amount, rule.accountId, rule.toAccountId));
  // Échéances manuelles en attente de validation : comptées demain.
  for (const rule of state.recurring) {
    if (!rule.active || rule.autoCreate) continue;
    const pending = dueOccurrences(rule, today).length;
    if (pending) add(addDays(today, 1), pending * effect(rule.type, rule.amount, rule.accountId, rule.toAccountId));
  }
  for (const tx of filterTransactions(state, { from: addDays(today, 1), to: end })) add(tx.date, effect(tx.type, tx.amount, tx.accountId, tx.toAccountId));

  const points = [{ date: today, balance: Math.round(balance) }];
  let min = points[0];
  let scheduledToMonthEnd = 0;
  const monthLast = monthEnd(monthKey(today));
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const scheduled = events.get(date) || 0;
    if (date <= monthLast) scheduledToMonthEnd += scheduled;
    balance += scheduled - dailyVariable;
    const point = { date, balance: Math.round(balance) };
    points.push(point);
    if (point.balance < min.balance) min = point;
  }
  const daysLeft = daysBetween(today, monthLast) + 1;
  // « Disponible à dépenser » : ce qui reste d'ici la fin du mois une fois les prélèvements prévus passés.
  const available = Math.round(start + scheduledToMonthEnd);
  return {
    accounts,
    start: Math.round(start),
    points,
    min,
    end: points[points.length - 1].balance,
    dailyVariable: Math.round(dailyVariable),
    available,
    perDay: daysLeft > 0 ? Math.round(Math.max(0, available) / daysLeft) : 0,
    daysLeft,
  };
}

/* ------------------------------------------------------------------ */
/* Crédits : stratégies et remboursement anticipé                      */
/* ------------------------------------------------------------------ */

/**
 * Plan de remboursement de plusieurs dettes avec un effort mensuel supplémentaire.
 * avalanche : taux le plus élevé d'abord (le moins cher au total) ;
 * snowball (boule de neige) : plus petit capital d'abord (victoires rapides).
 * Les mensualités des dettes soldées sont reportées sur la suivante.
 */
export function payoffPlan(debts, { extra = 0, strategy = 'avalanche', today = todayISO(), rollover = true } = {}) {
  let firstDue = null;
  const items = debts
    .map((d) => {
      const s = loanStatus(d, today);
      if (s.next && (!firstDue || s.next.date < firstDue)) firstDue = s.next.date;
      return { id: d.id, name: d.name, rate: d.rate, balance: s.remaining, payment: s.rows[0]?.payment ?? 0 };
    })
    .filter((x) => x.balance > 0 && x.payment > 0);
  // Le mois n° 1 correspond à la prochaine échéance.
  const dateOf = (month) => (month ? addMonths(firstDue || today, month - 1) : today);
  const paidOff = {};
  let months = 0;
  let interest = 0;
  let freed = 0;
  while (items.some((x) => x.balance > 0) && months < 720) {
    months++;
    let pool = extra + (rollover ? freed : 0);
    for (const x of items) {
      if (x.balance <= 0) continue;
      const i = Math.round((x.balance * x.rate) / 1200);
      interest += i;
      x.balance += i;
      const pay = Math.min(x.payment, x.balance);
      x.balance -= pay;
      if (rollover) pool += x.payment - pay;
    }
    const order = items
      .filter((x) => x.balance > 0)
      .sort((a, b) => (strategy === 'snowball' ? a.balance - b.balance || b.rate - a.rate : b.rate - a.rate || a.balance - b.balance));
    for (const x of order) {
      if (pool <= 0) break;
      const pay = Math.min(pool, x.balance);
      x.balance -= pay;
      pool -= pay;
    }
    for (const x of items) {
      if (x.balance <= 0 && !paidOff[x.id]) {
        paidOff[x.id] = months;
        freed += x.payment;
      }
    }
  }
  const order = items.map((x) => ({ id: x.id, name: x.name, rate: x.rate, month: paidOff[x.id], date: dateOf(paidOff[x.id]) })).sort((a, b) => a.month - b.month);
  return { months, interest, order, freeDate: dateOf(months) };
}

/**
 * Indemnités de remboursement anticipé (plafonds légaux, Code de la consommation) :
 * immobilier (L313-47) : au plus 6 mois d'intérêts sur la somme remboursée et 3 % du capital restant dû ;
 * consommation (L312-34) : rien jusqu'à 10 000 € sur 12 mois, sinon 1 % de la somme (0,5 % si
 * moins d'un an restant), sans dépasser les intérêts qui restaient à payer.
 */
export function prepaymentPenalty(debt, amount, remaining, monthsLeft, interestLeft) {
  if (amount <= 0) return 0;
  if (debt.kind === 'immobilier') {
    return Math.round(Math.min((amount * debt.rate * 6) / 1200, remaining * 0.03));
  }
  if (amount <= 1000000) return 0;
  const rate = monthsLeft > 12 ? 0.01 : 0.005;
  return Math.round(Math.min(amount * rate, interestLeft));
}

/**
 * Simulation d'un remboursement anticipé partiel.
 * mode 'duration' : même mensualité, durée raccourcie ; 'payment' : même durée, mensualité réduite.
 */
export function earlyRepayment(debt, { amount, mode = 'duration', today = todayISO(), placementRate = REFERENCE.livretARate } = {}) {
  const status = loanStatus(debt, today);
  const remaining = status.remaining;
  const sumAmount = Math.max(0, Math.min(amount, remaining));
  const monthsLeft = status.paymentsLeft;
  const payment = status.rows[0]?.payment ?? 0;
  const r = debt.rate / 1200;
  const newBalance = remaining - sumAmount;
  let newMonths = monthsLeft;
  if (mode === 'duration' && newBalance > 0 && payment > 0) {
    newMonths = r === 0 ? Math.ceil(newBalance / payment) : Math.ceil(-Math.log(1 - (newBalance * r) / payment) / Math.log(1 + r));
    if (!Number.isFinite(newMonths)) newMonths = monthsLeft;
    newMonths = Math.min(newMonths, monthsLeft);
  }
  if (newBalance <= 0) newMonths = 0;
  const rows = newBalance > 0 ? amortization({ principal: newBalance, rate: debt.rate, months: newMonths }) : [];
  const interestAfter = sum(rows, (x) => x.interest);
  const interestSaved = Math.max(0, status.interestLeft - interestAfter);
  const insuranceSaved = (debt.insurance || 0) * Math.max(0, monthsLeft - newMonths);
  const penalty = prepaymentPenalty(debt, sumAmount, remaining, monthsLeft, status.interestLeft);
  const gain = interestSaved + insuranceSaved - penalty;
  // Même somme placée au taux de référence pendant la durée restante (intérêts composés).
  const years = monthsLeft / 12;
  const placementGain = Math.round(sumAmount * (Math.pow(1 + placementRate / 100, years) - 1));
  return {
    amount: sumAmount,
    remaining,
    monthsLeft,
    newMonths,
    newPayment: mode === 'payment' && newMonths > 0 ? Math.round(loanPayment(newBalance, debt.rate, newMonths)) : payment,
    payment,
    newEndDate: newMonths > 0 ? addMonths(status.next?.date || today, newMonths - 1) : today,
    interestSaved,
    insuranceSaved,
    penalty,
    gain,
    placementGain,
    worthIt: gain > placementGain,
  };
}

/* ------------------------------------------------------------------ */
/* Score de santé financière                                           */
/* ------------------------------------------------------------------ */
// Inspiré des 4 piliers du FinHealth Score (Financial Health Network) :
// dépenser, épargner, emprunter, planifier ; 2 indicateurs par pilier, chacun sur 100.
// Seuils : 80 et plus « en bonne santé », 40 à 79 « à consolider », moins de 40 « vulnérable ».

function overdraftDays(state, today, days = 90) {
  const accounts = countedAccounts(state).filter((a) => a.type === 'courant');
  if (!accounts.length) return 0;
  const ids = new Set(accounts.map((a) => a.id));
  const from = addDays(today, -days + 1);
  const balances = accountBalances(state, addDays(from, -1));
  const current = new Map(accounts.map((a) => [a.id, balances.get(a.id) || 0]));
  const byDay = new Map();
  for (const tx of filterTransactions(state, { from, to: today })) {
    if (!ids.has(tx.accountId) && !ids.has(tx.toAccountId)) continue;
    let list = byDay.get(tx.date);
    if (!list) byDay.set(tx.date, (list = []));
    list.push(tx);
  }
  let count = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const tx of byDay.get(date) || []) {
      if (tx.type === 'transfer') {
        if (current.has(tx.accountId)) current.set(tx.accountId, current.get(tx.accountId) - tx.amount);
        if (current.has(tx.toAccountId)) current.set(tx.toAccountId, current.get(tx.toAccountId) + tx.amount);
      } else if (current.has(tx.accountId)) {
        current.set(tx.accountId, current.get(tx.accountId) + (tx.type === 'income' ? tx.amount : -tx.amount));
      }
    }
    if ([...current.values()].some((b) => b < 0)) count++;
  }
  return count;
}

export function healthScore(state, today = todayISO(), base = baseline(state, today)) {
  if (!base.monthsWithData || !base.income) {
    return { score: null, level: null, pillars: [], reason: "Il faut au moins un mois complet de revenus et de dépenses pour calculer le score." };
  }
  const lastMonth = base.months[base.months.length - 1];
  const index = spendIndex(state);

  // Dépenser
  const spendIncome = scale(base.savingsRate, 0.1, -0.1);
  const odDays = overdraftDays(state, today);
  const spendBills = scale(odDays, 0, 15);

  // Épargner
  const coverage = base.coverage ?? 0;
  const saveLiquid = scale(coverage, base.emergencyMonths, 0);
  const longTerm = base.investments + Math.max(0, base.savings - base.emergencyTarget);
  const longTermMonths = base.expense > 0 ? longTerm / base.expense : 0;
  const saveLong = scale(longTermMonths, 6, 0);

  // Emprunter
  const borrowRatio = base.debtRatio == null ? null : base.debtPayments === 0 ? 100 : scale(base.debtRatio, 0.15, 0.5);
  const weightedRate = base.debts.length ? sum(base.debts, (d) => d.debt.rate * d.status.remaining) / sum(base.debts, (d) => d.status.remaining) : 0;
  const borrowCost = base.debts.length ? scale(weightedRate, 3, 12) : 100;

  // Planifier
  const budgeted = state.categories.filter((c) => c.type === 'expense' && (state.budgets?.[c.id] || state.budgetOverrides?.[lastMonth]?.[c.id] != null));
  let planBudget = 25;
  let budgetDetail = 'Aucun budget défini';
  if (budgeted.length) {
    const within = budgeted.filter((c) => (index.get(`${lastMonth}|${c.id}`) || 0) <= effectiveBudget(state, c.id, lastMonth)).length;
    planBudget = Math.round((within / budgeted.length) * 100);
    budgetDetail = `${within} budget(s) sur ${budgeted.length} respecté(s) le mois dernier`;
  }
  const goals = state.goals.filter((g) => !g.archived);
  let planGoals = 25;
  let goalDetail = "Aucun objectif d'épargne";
  if (goals.length) {
    const stats = goals.map((g) => goalStats(g, today));
    const needed = sum(stats, (s) => s.monthlyNeeded || 0);
    const done = stats.filter((s) => s.done).length;
    const capacity = Math.max(0, base.net);
    planGoals = needed === 0 ? 100 : Math.round(Math.min(1, capacity / needed) * 100);
    goalDetail = done === goals.length ? 'Tous les objectifs sont atteints' : `Effort nécessaire : ${Math.round(needed / 100)} € / mois pour vos objectifs`;
  }

  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`);
  const pillars = [
    {
      id: 'spend',
      label: 'Dépenser',
      indicators: [
        { label: 'Dépenses inférieures aux revenus', value: `Taux d'épargne ${pct(base.savingsRate)}`, score: spendIncome },
        { label: 'Pas de découvert', value: odDays ? `${odDays} jour(s) à découvert sur 90` : 'Aucun jour à découvert sur 90', score: spendBills },
      ],
    },
    {
      id: 'save',
      label: 'Épargner',
      indicators: [
        { label: 'Épargne de précaution', value: `${coverage.toFixed(1).replace('.', ',')} mois de dépenses (cible ${base.emergencyMonths})`, score: saveLiquid },
        { label: 'Épargne de long terme', value: `${longTermMonths.toFixed(1).replace('.', ',')} mois de dépenses placés`, score: saveLong },
      ],
    },
    {
      id: 'borrow',
      label: 'Emprunter',
      indicators: [
        { label: "Taux d'endettement", value: base.debtPayments ? `${pct(base.debtRatio)} des revenus (max. 35 %)` : 'Aucun crédit en cours', score: borrowRatio },
        { label: 'Coût des dettes', value: base.debts.length ? `Taux moyen ${weightedRate.toFixed(2).replace('.', ',')} %` : 'Aucune dette', score: borrowCost },
      ],
    },
    {
      id: 'plan',
      label: 'Planifier',
      indicators: [
        { label: 'Budgets', value: budgetDetail, score: planBudget },
        { label: "Objectifs d'épargne", value: goalDetail, score: planGoals },
      ],
    },
  ];
  for (const p of pillars) {
    const scores = p.indicators.map((i) => i.score).filter((s) => s != null);
    p.score = scores.length ? Math.round(sum(scores) / scores.length) : null;
  }
  const valid = pillars.filter((p) => p.score != null);
  const score = Math.round(sum(valid, (p) => p.score) / valid.length);
  const level = score >= 80 ? 'healthy' : score >= 40 ? 'coping' : 'vulnerable';
  return { score, level, pillars };
}

export const HEALTH_LEVELS = {
  healthy: { label: 'En bonne santé', status: 'ok' },
  coping: { label: 'À consolider', status: 'warning' },
  vulnerable: { label: 'Vulnérable', status: 'over' },
};

/* ------------------------------------------------------------------ */
/* Recommandations                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Conseils personnalisés, classés par importance puis par gain annuel estimé.
 * Chaque conseil : { id, severity, pillar, title, text, gain (centimes / an ou null), action }.
 */
export function recommendations(state, today = todayISO(), base = baseline(state, today), extra = {}) {
  const tips = [];
  const s = state.settings || {};
  const fmt = (c) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(c / 100)} €`;
  const pctFmt = (r) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(r)} %`;
  const accounts = countedAccounts(state);
  const savingsAccounts = accounts.filter((a) => a.type === 'epargne');
  const checking = accounts.filter((a) => a.type === 'courant');
  const hasData = base.monthsWithData > 0 && base.expense > 0;
  // Les dépenses exceptionnelles ne doivent fausser ni les tendances ni la prévision.
  const unusual = extra.unusual || unusualExpenses(state, today);
  const exclude = new Set(unusual.map((u) => u.tx.id));
  const forecast = extra.forecast || cashForecast(state, today, 90, { exclude });

  // 1. Risque de découvert dans les 90 jours
  if (forecast.accounts.length && forecast.min.balance < 0 && forecast.min.date !== today) {
    tips.push({
      id: 'overdraft-risk',
      severity: 'high',
      pillar: 'spend',
      title: `Risque de découvert vers le ${forecast.min.date.split('-').reverse().join('/')}`,
      text: `Au rythme actuel de vos dépenses et avec les prélèvements prévus, vos comptes courants pourraient descendre à ${fmt(forecast.min.balance)}. Un découvert coûte des agios et des commissions d'intervention (jusqu'à 8 € par opération et 80 € par mois). Réduisez les dépenses variables ou prévoyez un virement depuis l'épargne.`,
      gain: null,
      action: { type: 'link', href: '#optimisation', label: 'Voir la prévision' },
    });
  }

  // 2. Épargne de précaution
  if (hasData && base.savings < base.emergencyTarget) {
    const missing = base.emergencyTarget - base.savings;
    const monthly = roundUp(missing / 12);
    const hasGoal = state.goals.some((g) => normalizeText(g.name).includes('urgence') || normalizeText(g.name).includes('precaution'));
    tips.push({
      id: 'emergency-fund',
      severity: (base.coverage ?? 0) < 1 ? 'high' : 'medium',
      pillar: 'save',
      title: `Épargne de précaution : ${String((base.coverage ?? 0).toFixed(1)).replace('.', ',')} mois de dépenses sur ${base.emergencyMonths}`,
      text: `La Banque de France recommande de garder de 2 à 6 mois de revenus disponibles immédiatement (3 mois pour un salarié en CDI, 6 pour des revenus variables). Il vous manque ${fmt(missing)} : ${fmt(monthly)} par mois pendant un an suffisent, sur un livret réglementé sans risque.`,
      gain: null,
      action: hasGoal ? { type: 'link', href: '#objectifs', label: 'Voir mes objectifs' } : { type: 'create-goal', goal: { name: "Fonds d'urgence", icon: '🛟', target: base.emergencyTarget, deadline: addMonths(today, 12) }, label: 'Créer cet objectif' },
    });
  }

  // 3. Argent qui dort sur le compte courant
  if (hasData && checking.length) {
    const cushion = Math.round(base.expense * 1.2);
    const excess = base.liquidCash - cushion;
    if (excess >= 30000) {
      const lep = s.lepEligible === 'yes' && !savingsAccounts.some((a) => a.product === 'lep');
      const rate = lep ? REFERENCE.lepRate : REFERENCE.livretARate;
      const gain = Math.round((excess * rate) / 100);
      const inflationLoss = Math.round((excess * REFERENCE.inflation) / 100);
      const target = savingsAccounts[0];
      tips.push({
        id: 'idle-cash',
        severity: 'medium',
        pillar: 'save',
        title: `${fmt(excess)} dorment sur vos comptes courants`,
        text: `Au-delà d'un mois de dépenses de sécurité (${fmt(cushion)}), cet argent ne rapporte rien et perd environ ${fmt(inflationLoss)} de pouvoir d'achat par an (inflation prévue à ${pctFmt(REFERENCE.inflation)} en 2026). Sur ${lep ? 'un LEP' : 'un Livret A ou un LDDS'} (${pctFmt(rate)} net d'impôt au 1er août 2026), il rapporterait environ ${fmt(gain)} par an.`,
        gain,
        action: target
          ? { type: 'transfer', from: checking[0].id, to: target.id, amount: Math.floor(excess / 1000) * 1000, label: `Virer vers ${target.name}` }
          : { type: 'link', href: '#comptes', label: 'Ajouter un compte épargne' },
      });
    }
  }

  // 4. LEP : le livret réglementé le mieux rémunéré, sous conditions de revenus
  if (hasData && s.lepEligible !== 'no' && !savingsAccounts.some((a) => a.product === 'lep') && base.savings > 0) {
    const amount = Math.min(base.savings, SAVINGS_PRODUCTS.lep.cap);
    const gain = Math.round((amount * (REFERENCE.lepRate - REFERENCE.livretARate)) / 100);
    tips.push({
      id: 'lep',
      severity: s.lepEligible === 'yes' ? 'medium' : 'low',
      pillar: 'save',
      title: s.lepEligible === 'yes' ? 'Ouvrez un LEP : 2,5 % net, sans impôt' : 'Vérifiez si vous avez droit au LEP (2,5 %)',
      text: `Le LEP rapporte ${pctFmt(REFERENCE.lepRate)} contre ${pctFmt(REFERENCE.livretARate)} pour le Livret A, dans la limite de 10 000 € de dépôts. Il est réservé aux foyers dont le revenu fiscal de référence 2024 ne dépasse pas ${fmt(REFERENCE.lepIncomeLimitSingle)} pour une part (${fmt(REFERENCE.lepIncomeLimitCouple)} pour un couple). Gain possible : environ ${fmt(gain)} par an.`,
      gain: s.lepEligible === 'yes' ? gain : null,
      action: { type: 'link', href: '#parametres', label: s.lepEligible === 'yes' ? 'Indiquer mes comptes' : 'Renseigner mon éligibilité' },
    });
  }

  // 5. Plafonds des livrets réglementés
  for (const acc of savingsAccounts) {
    const product = SAVINGS_PRODUCTS[acc.product];
    if (!product?.cap) continue;
    const balance = base.balances.get(acc.id) || 0;
    if (balance >= product.cap) {
      tips.push({
        id: `cap-${acc.id}`,
        severity: 'low',
        pillar: 'save',
        title: `${acc.name} a atteint son plafond`,
        text: `Le plafond de dépôt du ${product.label} est de ${fmt(product.cap)} ; les versements suivants y sont impossibles. Continuez sur un LDDS (12 000 €, même taux), puis sur une assurance vie : les fonds en euros ont rapporté ${pctFmt(REFERENCE.fondsEurosRate)} en moyenne en 2025, avant prélèvements sociaux.`,
        gain: null,
        action: null,
      });
    }
  }

  // 6. Frais bancaires
  const feesFrom = addDays(today, -364);
  const fees = sum(filterTransactions(state, { from: feesFrom, to: today, type: 'expense', categoryId: 'cat-banque' }), (t) => t.amount);
  const first = firstTransactionDate(state);
  const covered = first ? Math.min(365, daysBetween(first, today) + 1) : 0;
  if (covered >= 60 && fees > 0) {
    const yearly = Math.round((fees * 365) / covered);
    if (yearly >= 3000) {
      const incidents = filterTransactions(state, { from: feesFrom, to: today, type: 'expense', search: '' }).filter((t) => /commission|agio|rejet|incident|intervention/.test(normalizeText(t.description)));
      tips.push({
        id: 'bank-fees',
        severity: yearly >= 10000 ? 'medium' : 'low',
        pillar: 'spend',
        title: `${fmt(yearly)} de frais bancaires par an`,
        text: `En 2026, un client paie en moyenne ${fmt(REFERENCE.bankFeesTraditional)} par an dans une banque traditionnelle, contre 0 à ${fmt(REFERENCE.bankFeesOnline)} dans une banque en ligne. Comparez les offres ou négociez la suppression des frais de tenue de compte.${incidents.length ? " Des frais d'incident apparaissent : ils sont plafonnés (8 € par opération, 80 € par mois ; 20 € par mois avec l'offre « clientèle fragile »)." : ''}`,
        gain: Math.max(0, yearly - REFERENCE.bankFeesOnline),
        action: { type: 'link', href: '#transactions?category=cat-banque&all=1', label: 'Voir les frais' },
      });
    }
  }

  // 7. Paiements récurrents non suivis (abonnements)
  const detected = (extra.detected || detectRecurring(state, today)).filter((d) => d.active);
  if (detected.length) {
    const yearly = sum(detected, (d) => d.yearly);
    tips.push({
      id: 'detected-subscriptions',
      severity: 'medium',
      pillar: 'plan',
      title: `${detected.length} paiement(s) récurrent(s) non suivi(s) : ${fmt(yearly)} par an`,
      text: `${detected
        .slice(0, 4)
        .map((d) => `${d.label} (${fmt(d.amount)} ${d.cadenceLabel})`)
        .join(', ')}${detected.length > 4 ? '…' : ''}. Ajoutez-les à vos récurrences pour anticiper votre solde, et résiliez ceux que vous n'utilisez plus.`,
      gain: null,
      action: { type: 'anchor', href: 'detected', label: 'Voir les paiements détectés' },
    });
  }

  // 8. Nombre d'abonnements
  const subscriptionRules = state.recurring.filter((r) => r.active && r.type === 'expense' && r.categoryId === 'cat-abonnements');
  const subscriptionCount = subscriptionRules.length + detected.filter((d) => d.categoryId === 'cat-abonnements').length;
  if (subscriptionCount >= 3) {
    const yearly = sum(subscriptionRules, (r) => monthlyEquivalent(r) * 12) + sum(detected.filter((d) => d.categoryId === 'cat-abonnements'), (d) => d.yearly);
    tips.push({
      id: 'subscriptions-review',
      severity: 'low',
      pillar: 'spend',
      title: `${subscriptionCount} abonnements : ${fmt(yearly)} par an`,
      text: `Faites le tri au moins une fois par an : chaque abonnement de 10 € par mois résilié rapporte 120 € par an. Pensez aux services en double (plusieurs plateformes vidéo ou musicales) et aux offres groupées.`,
      gain: null,
      action: { type: 'link', href: '#recurrentes', label: 'Voir les abonnements' },
    });
  }

  // 9. Hausse de dépenses
  const trends = extra.trends || spendingTrends(state, today, { exclude });
  for (const t of trends.slice(0, 2)) {
    tips.push({
      id: `trend-${t.category.id}`,
      severity: 'medium',
      pillar: 'spend',
      title: `${t.category.name} : +${Math.round(t.ratio * 100)} % sur 30 jours`,
      text: `${fmt(t.recent)} dépensés sur les 30 derniers jours contre ${fmt(t.average)} habituellement (moyenne des 3 mois précédents). Revenir à votre niveau habituel représente ${fmt(t.diff)} par mois.`,
      gain: null,
      action: { type: 'link', href: `#transactions?category=${t.category.id}&all=1`, label: 'Voir les opérations' },
    });
  }

  // 10. Dépenses inhabituelles
  if (unusual.length) {
    const u = unusual[0];
    tips.push({
      id: `unusual-${u.tx.id}`,
      severity: 'low',
      pillar: 'spend',
      title: `Dépense inhabituelle : ${fmt(u.tx.amount)}`,
      text: `« ${u.tx.description || 'Sans libellé'} » le ${u.tx.date.split('-').reverse().join('/')} : ${Math.round(u.factor)} fois votre montant habituel dans cette catégorie (${fmt(u.median)}). Vérifiez qu'il ne s'agit pas d'une erreur ou d'un prélèvement frauduleux.${unusual.length > 1 ? ` ${unusual.length - 1} autre(s) dépense(s) inhabituelle(s).` : ''}`,
      gain: null,
      action: { type: 'edit-tx', id: u.tx.id, label: "Voir l'opération" },
    });
  }

  // 11. Taux d'épargne et virement automatique (« payez-vous en premier »)
  if (hasData && base.income > 0) {
    const autoSaving = sum(
      state.recurring.filter((r) => r.active && r.type === 'transfer' && savingsAccounts.concat(accounts.filter((a) => a.type === 'investissement')).some((a) => a.id === r.toAccountId)),
      monthlyEquivalent,
    );
    const target = Math.round(base.income * 0.1);
    if (autoSaving < target * 0.9 && savingsAccounts.length && checking.length) {
      const amount = Math.max(2000, roundUp(target - autoSaving));
      const salary = state.recurring.filter((r) => r.active && r.type === 'income').sort((a, b) => b.amount - a.amount)[0];
      const day = salary ? Math.min(28, Number(salary.startDate.slice(8, 10)) + 1) : 1;
      let start = `${monthKey(today)}-${String(day).padStart(2, '0')}`;
      if (start <= today) start = addMonths(start, 1);
      tips.push({
        id: 'pay-yourself-first',
        severity: base.savingsRate != null && base.savingsRate < 0.05 ? 'high' : 'medium',
        pillar: 'save',
        title: `Automatisez votre épargne : ${fmt(amount)} par mois`,
        text: `Votre taux d'épargne moyen est de ${base.savingsRate == null ? '—' : `${Math.round(base.savingsRate * 100)} %`}. Un virement automatique le lendemain de la paie (« se payer en premier ») est la méthode la plus efficace : dans le programme Save More Tomorrow, l'épargne automatique a fait passer le taux d'épargne de 3,5 % à 13,6 % en trois ans et demi. Augmentez-le d'un point à chaque hausse de revenus.`,
        gain: null,
        action: {
          type: 'create-rule',
          rule: { type: 'transfer', amount, description: 'Épargne automatique', categoryId: null, accountId: checking[0].id, toAccountId: savingsAccounts[0].id, frequency: 'monthly', startDate: start, lastDate: null, endDate: null, autoCreate: true, active: true, tags: [] },
          label: 'Programmer ce virement',
        },
      });
    }
  }

  // 12. Règle 50/30/20 : part des envies
  if (base.split && base.split.income > 0) {
    const wantsShare = base.split.wants / base.split.income;
    if (wantsShare > 0.3) {
      const excess = Math.round(base.split.wants - base.split.income * 0.3);
      tips.push({
        id: 'wants-share',
        severity: 'low',
        pillar: 'spend',
        title: `Envies : ${Math.round(wantsShare * 100)} % des revenus (repère : 30 %)`,
        text: `Restaurants, loisirs, shopping et abonnements représentent ${fmt(base.split.wants)} par mois. Revenir à 30 % libérerait ${fmt(excess)} par mois, soit ${fmt(excess * 12)} par an à épargner.`,
        gain: excess * 12,
        action: { type: 'link', href: '#rapports', label: 'Voir la répartition' },
      });
    }
  }

  // 13. Budgets irréalistes
  const index = spendIndex(state);
  const budgetMonths = base.months;
  const budgetedCats = state.categories.filter((c) => c.type === 'expense' && state.budgets?.[c.id]);
  if (!budgetedCats.length && base.monthsWithData >= 2) {
    tips.push({
      id: 'no-budget',
      severity: 'medium',
      pillar: 'plan',
      title: 'Fixez des budgets par catégorie',
      text: "Un plafond par catégorie permet de voir tout de suite où part l'argent. Pécule peut les proposer d'après vos 3 derniers mois de dépenses.",
      gain: null,
      action: { type: 'link', href: '#budgets', label: 'Créer mes budgets' },
    });
  }
  const overBudgets = [];
  const underBudgets = [];
  for (const cat of budgetedCats) {
    const spent = budgetMonths.map((m) => index.get(`${m}|${cat.id}`) || 0);
    const budgets = budgetMonths.map((m) => effectiveBudget(state, cat.id, m));
    const over = spent.filter((v, i) => budgets[i] > 0 && v > budgets[i]).length;
    const avg = sum(spent) / spent.length;
    const budget = budgets[budgets.length - 1];
    if (!budget || base.monthsWithData < 3) continue;
    // Un budget avec report sert de cagnotte (cadeaux, vacances) : il est normal qu'il ne soit pas dépensé.
    const rollover = !!state.budgets[cat.id]?.rollover;
    if (over >= 2) overBudgets.push({ cat, over, avg, budget });
    else if (!rollover && spent.every((v, i) => budgets[i] > 0 && v < budgets[i] * 0.6) && budget - roundUp(avg) >= 2000) underBudgets.push({ cat, avg, budget, freed: budget - roundUp(avg) });
  }
  if (overBudgets.length) {
    tips.push({
      id: `budgets-over-${overBudgets.map((b) => b.cat.id).join('-')}`,
      severity: 'low',
      pillar: 'plan',
      title: overBudgets.length === 1 ? `Budget « ${overBudgets[0].cat.name} » régulièrement dépassé` : `${overBudgets.length} budgets régulièrement dépassés`,
      text: `${overBudgets.map((b) => `${b.cat.name} : ${fmt(b.avg)} dépensés en moyenne pour ${fmt(b.budget)} prévus (${b.over} mois sur 3)`).join(' ; ')}. Un budget réaliste est plus utile qu'un budget toujours dépassé : alignez-le sur vos dépenses réelles, puis baissez-le progressivement.`,
      gain: null,
      action: { type: 'link', href: '#budgets', label: 'Ajuster les budgets' },
    });
  }
  if (underBudgets.length) {
    const freed = sum(underBudgets, (b) => b.freed);
    tips.push({
      id: `budgets-under-${underBudgets.map((b) => b.cat.id).join('-')}`,
      severity: 'low',
      pillar: 'plan',
      title: `${fmt(freed)} par mois bloqués dans des budgets peu utilisés`,
      text: `${underBudgets.map((b) => `${b.cat.name} : ${Math.round((b.avg / b.budget) * 100)} % utilisés, ${fmt(roundUp(b.avg))} suffiraient`).join(' ; ')}. Réaffectez cette marge à l'épargne ou à un objectif.`,
      gain: freed * 12,
      action: { type: 'link', href: '#budgets', label: 'Ajuster les budgets' },
    });
  }

  // 14. Crédits
  if (base.debtRatio != null && base.debtRatio > REFERENCE.debtRatioMax) {
    tips.push({
      id: 'debt-ratio',
      severity: 'high',
      pillar: 'borrow',
      title: `Taux d'endettement de ${Math.round(base.debtRatio * 100)} %`,
      text: "Au-delà de 35 % (assurance comprise), les banques refusent en principe tout nouveau crédit immobilier (norme du Haut Conseil de stabilité financière). Évitez les nouveaux crédits à la consommation et remboursez en priorité les plus chers.",
      gain: null,
      action: { type: 'link', href: '#dettes', label: 'Voir mes crédits' },
    });
  }
  const excessSavings = Math.max(0, base.savings - base.emergencyTarget);
  for (const { debt, status } of base.debts) {
    const years = debt.termMonths / 12;
    // Remboursement anticipé d'un crédit cher avec l'épargne excédentaire
    if (excessSavings >= 100000 && debt.rate >= REFERENCE.livretARate + 1) {
      const sim = earlyRepayment(debt, { amount: Math.min(excessSavings, status.remaining), today });
      if (sim.worthIt && sim.gain > 0) {
        tips.push({
          id: `prepay-${debt.id}`,
          severity: 'medium',
          pillar: 'borrow',
          title: `Rembourser une partie de « ${debt.name} » (${pctFmt(debt.rate)})`,
          text: `Votre épargne dépasse votre réserve de sécurité de ${fmt(excessSavings)}. En remboursant ${fmt(sim.amount)} par anticipation, vous économiseriez ${fmt(sim.interestSaved + sim.insuranceSaved)} d'intérêts et d'assurance${sim.penalty ? `, moins ${fmt(sim.penalty)} d'indemnités` : ' sans indemnités'} : gain net de ${fmt(sim.gain)}, contre environ ${fmt(sim.placementGain)} si la somme restait sur un Livret A.`,
          gain: Math.round(sim.gain / Math.max(1, status.paymentsLeft / 12)),
          action: { type: 'tool', tool: 'prepay', debtId: debt.id, amount: sim.amount, label: 'Simuler' },
        });
      }
    }
    if (debt.kind === 'immobilier') {
      const market = marketMortgageRate(years);
      const firstHalf = status.paymentsMade < debt.termMonths / 2;
      if (debt.rate - market >= REFERENCE.renegotiationGap && firstHalf && status.remaining >= 7000000) {
        const now = sum(amortization({ principal: status.remaining, rate: debt.rate, months: status.paymentsLeft }), (r) => r.interest);
        const then = sum(amortization({ principal: status.remaining, rate: market, months: status.paymentsLeft }), (r) => r.interest);
        const penalty = prepaymentPenalty(debt, status.remaining, status.remaining, status.paymentsLeft, status.interestLeft);
        const gain = now - then - penalty;
        if (gain > 0) {
          tips.push({
            id: `renegotiate-${debt.id}`,
            severity: 'medium',
            pillar: 'borrow',
            title: `Renégocier « ${debt.name} » : jusqu'à ${fmt(gain)} d'économie`,
            text: `Votre taux (${pctFmt(debt.rate)}) dépasse d'au moins 0,7 point les taux pratiqués en 2026 pour cette durée (environ ${pctFmt(market)}), vous êtes dans la première moitié du prêt et le capital restant dépasse 70 000 € : les trois conditions d'une renégociation rentable sont réunies. Estimation après indemnités de remboursement anticipé (${fmt(penalty)}), hors frais de dossier et de garantie.`,
            gain: Math.round(gain / Math.max(1, status.paymentsLeft / 12)),
            action: { type: 'link', href: '#dettes', label: 'Voir le crédit' },
          });
        }
      }
      if (debt.insurance > 0 && status.paymentsLeft > 24) {
        const left = debt.insurance * status.paymentsLeft;
        tips.push({
          id: `insurance-${debt.id}`,
          severity: 'low',
          pillar: 'borrow',
          title: `Assurance emprunteur : ${fmt(left)} restant à payer`,
          text: "Depuis la loi Lemoine (2022), vous pouvez changer d'assurance emprunteur à tout moment, sans frais, à garanties équivalentes. Les comparatifs estiment l'économie moyenne entre 5 000 et 15 000 € pour un prêt de 250 000 € sur 20 ans.",
          gain: null,
          action: null,
        });
      }
    }
  }
  if (base.debts.length >= 2) {
    tips.push({
      id: 'debt-strategy',
      severity: 'low',
      pillar: 'borrow',
      title: 'Choisissez une stratégie de remboursement',
      text: "« Avalanche » (taux le plus élevé d'abord) coûte le moins d'intérêts ; « boule de neige » (plus petite dette d'abord) motive davantage : une étude de la Kellogg School portant sur 6 000 personnes montre que solder des dettes une à une aide à aller au bout.",
      gain: null,
      action: { type: 'link', href: '#dettes', label: 'Comparer les stratégies' },
    });
  }

  // 15. Objectifs en retard (versements des 3 derniers mois, mois en cours compris)
  const windowStart = `${shiftMonth(monthKey(today), -2)}-01`;
  const late = [];
  for (const goal of state.goals.filter((g) => !g.archived)) {
    const st = goalStats(goal, today);
    if (st.done || !st.monthlyNeeded) continue;
    const pace = sum((goal.contributions || []).filter((c) => c.date >= windowStart && c.date <= today), (c) => c.amount) / 3;
    if (pace < st.monthlyNeeded * 0.8) late.push({ goal, needed: st.monthlyNeeded, pace });
  }
  if (late.length) {
    tips.push({
      id: `goals-late-${late.map((l) => l.goal.id).join('-')}`,
      severity: 'low',
      pillar: 'plan',
      title: late.length === 1 ? `Objectif « ${late[0].goal.name} » en retard` : `${late.length} objectifs en retard`,
      text: `${late.map((l) => `${l.goal.name} : ${fmt(l.needed)} par mois nécessaires, ${fmt(l.pace)} versés en moyenne`).join(' ; ')}. Programmez un virement mensuel ou repoussez l'échéance.`,
      gain: null,
      action: { type: 'link', href: '#objectifs', label: 'Voir mes objectifs' },
    });
  }

  const dismissed = new Set(s.dismissedTips || []);
  return tips
    .map((t) => ({ ...t, dismissed: dismissed.has(t.id) }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.gain || 0) - (a.gain || 0));
}

/** Somme des gains annuels chiffrés (conseils non masqués). */
export function potentialGain(tips) {
  return sum(tips.filter((t) => !t.dismissed && t.gain > 0), (t) => t.gain);
}
