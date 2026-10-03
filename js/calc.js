// Calculs purs sur l'état de l'application (aucun accès au DOM ni au stockage).
import {
  addDays,
  addMonths,
  currentMonth,
  daysBetween,
  daysInMonth,
  monthDiff,
  monthEnd,
  monthKey,
  monthRange,
  monthStart,
  normalizeText,
  parseISODate,
  shiftMonth,
  sum,
  todayISO,
} from './utils.js';

export const UNCATEGORIZED = {
  id: null,
  name: 'Non catégorisé',
  icon: '❔',
  color: '#8a92a0',
  type: 'expense',
  group: 'wants',
};

/* ------------------------------------------------------------------ */
/* Données dérivées mémoïsées                                          */
/* ------------------------------------------------------------------ */

// Le cache est rattaché au tableau des opérations ; le store l'invalide
// après chaque modification (voir invalidateDerived dans store.js).
const derivedCache = new WeakMap();

export function invalidateDerived(state) {
  if (state?.transactions) derivedCache.delete(state.transactions);
}

function memo(state, key, compute) {
  let entry = derivedCache.get(state.transactions);
  if (!entry) {
    entry = new Map();
    derivedCache.set(state.transactions, entry);
  }
  if (!entry.has(key)) entry.set(key, compute());
  return entry.get(key);
}

const compareByDate = (a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1);

/** Opérations triées par date croissante. */
export function transactionsByDate(state) {
  return memo(state, 'byDate', () => [...state.transactions].sort(compareByDate));
}

/** Index mensuel : « YYYY-MM » → opérations du mois (ordre chronologique, mois croissants). */
function monthIndex(state) {
  return memo(state, 'months', () => {
    const index = new Map();
    for (const tx of transactionsByDate(state)) {
      const key = tx.date.slice(0, 7);
      let list = index.get(key);
      if (!list) index.set(key, (list = []));
      list.push(tx);
    }
    return index;
  });
}

/** Opérations d'un intervalle de dates, sans parcourir tout l'historique. */
function candidates(state, from, to) {
  if (!from && !to) return transactionsByDate(state);
  const fromMonth = from ? from.slice(0, 7) : null;
  const toMonth = to ? to.slice(0, 7) : null;
  const out = [];
  for (const [month, list] of monthIndex(state)) {
    if (fromMonth && month < fromMonth) continue;
    if (toMonth && month > toMonth) break;
    const edge = month === fromMonth || month === toMonth;
    for (const tx of list) if (!edge || inRange(tx, from, to)) out.push(tx);
  }
  return out;
}

/**
 * Texte normalisé utilisé par la recherche (libellé, notes, étiquettes, catégorie, compte, montant).
 * Calculé à la demande et gardé en cache : une recherche dans un mois ne traite que ce mois.
 */
function searchText(state) {
  const cache = memo(state, 'search', () => new Map());
  const names = memo(state, 'names', () => ({
    cat: new Map(state.categories.map((c) => [c.id, c.name])),
    acc: new Map(state.accounts.map((a) => [a.id, a.name])),
  }));
  return (tx) => {
    let text = cache.get(tx);
    if (text === undefined) {
      text = normalizeText(
        [tx.description, tx.notes, (tx.tags || []).join(' '), names.cat.get(tx.categoryId), names.acc.get(tx.accountId), (tx.amount / 100).toFixed(2)].join(' '),
      );
      cache.set(tx, text);
    }
    return text;
  };
}

/**
 * Prépare l'index de recherche par petits morceaux, tant qu'il reste du temps libre
 * (deadline de requestIdleCallback). Retourne true quand tout est prêt.
 */
export function warmSearchIndex(state, deadline = null, from = 0) {
  const text = searchText(state);
  const list = state.transactions;
  let i = from;
  while (i < list.length) {
    text(list[i++]);
    if (deadline && i % 200 === 0 && deadline.timeRemaining() < 2) return i;
  }
  return true;
}

/** Date de la première opération (null s'il n'y en a pas). */
export function firstTransactionDate(state) {
  return memo(state, 'first', () => transactionsByDate(state)[0]?.date ?? null);
}

/** Dernière catégorie et dernier compte utilisés pour chaque libellé. */
export function descriptionMemory(state) {
  return memo(state, 'descriptions', () => {
    const memory = new Map();
    for (const t of transactionsByDate(state)) {
      if (!t.description) continue;
      memory.set(normalizeText(t.description), { description: t.description, type: t.type, categoryId: t.categoryId, accountId: t.accountId, toAccountId: t.toAccountId });
    }
    return memory;
  });
}

/* ------------------------------------------------------------------ */
/* Comptes et soldes                                                   */
/* ------------------------------------------------------------------ */

/** Effet d'une transaction sur le solde d'un compte (en centimes). */
export function txEffect(tx, accountId) {
  if (tx.type === 'transfer') {
    let effect = 0;
    if (tx.accountId === accountId) effect -= tx.amount;
    if (tx.toAccountId === accountId) effect += tx.amount;
    return effect;
  }
  if (tx.accountId !== accountId) return 0;
  return tx.type === 'income' ? tx.amount : -tx.amount;
}

/** Soldes de tous les comptes à une date donnée (incluse), en un seul passage. */
export function accountBalances(state, upto = null, { clearedOnly = false } = {}) {
  return memo(state, `balances|${upto}|${clearedOnly}`, () => computeBalances(state, upto, clearedOnly));
}

function computeBalances(state, upto, clearedOnly) {
  const balances = new Map(state.accounts.map((a) => [a.id, a.initialBalance || 0]));
  for (const tx of transactionsByDate(state)) {
    if (upto && tx.date > upto) break;
    if (clearedOnly && !tx.cleared) continue;
    if (tx.type === 'transfer') {
      if (balances.has(tx.accountId)) balances.set(tx.accountId, balances.get(tx.accountId) - tx.amount);
      if (balances.has(tx.toAccountId)) balances.set(tx.toAccountId, balances.get(tx.toAccountId) + tx.amount);
    } else if (balances.has(tx.accountId)) {
      const sign = tx.type === 'income' ? 1 : -1;
      balances.set(tx.accountId, balances.get(tx.accountId) + sign * tx.amount);
    }
  }
  return balances;
}

export function accountBalance(state, accountId, upto = null) {
  return accountBalances(state, upto).get(accountId) ?? 0;
}

/** Comptes pris en compte dans le patrimoine (non archivés et non exclus). */
export function countedAccounts(state) {
  return state.accounts.filter((a) => !a.archived && a.includeInTotal !== false);
}

export function totalBalance(state, upto = null) {
  const balances = accountBalances(state, upto);
  return sum(countedAccounts(state), (a) => balances.get(a.id) || 0);
}

/** Patrimoine : actifs (soldes positifs) et passifs (soldes négatifs + dettes suivies). */
export function netWorth(state, today = todayISO()) {
  const balances = accountBalances(state, today);
  let assets = 0;
  let liabilities = 0;
  for (const acc of countedAccounts(state)) {
    const b = balances.get(acc.id) || 0;
    if (b >= 0) assets += b;
    else liabilities += -b;
  }
  const debts = sum(state.debts || [], (d) => loanStatus(d, today).remaining);
  return { assets, liabilities: liabilities + debts, debts, net: assets - liabilities - debts };
}

/** Solde total à la fin de chaque date fournie (triées), pour un compte ou tous. */
export function balanceSeries(state, dates, accountId = null) {
  const ids = accountId ? [accountId] : countedAccounts(state).map((a) => a.id);
  const idSet = new Set(ids);
  let balance = sum(state.accounts.filter((a) => idSet.has(a.id)), (a) => a.initialBalance || 0);
  const txs = transactionsByDate(state).filter((t) => idSet.has(t.accountId) || idSet.has(t.toAccountId));
  const out = [];
  let i = 0;
  for (const date of dates) {
    while (i < txs.length && txs[i].date <= date) {
      const tx = txs[i];
      if (tx.type === 'transfer') {
        if (idSet.has(tx.accountId)) balance -= tx.amount;
        if (idSet.has(tx.toAccountId)) balance += tx.amount;
      } else {
        balance += tx.type === 'income' ? tx.amount : -tx.amount;
      }
      i++;
    }
    out.push({ date, balance });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Filtres et agrégats                                                 */
/* ------------------------------------------------------------------ */

export function inRange(tx, from, to) {
  return (!from || tx.date >= from) && (!to || tx.date <= to);
}

/**
 * Filtre les transactions.
 * filters : { from, to, type, accountId, categoryId, search, cleared, tag, min, max }
 */
export function filterTransactions(state, filters = {}) {
  const words = normalizeText(filters.search).split(/\s+/).filter(Boolean);
  const texts = words.length ? searchText(state) : null;
  const simple = !filters.type && !filters.accountId && (filters.categoryId === undefined || filters.categoryId === '') && !filters.cleared && !filters.tag && filters.min == null && filters.max == null && !words.length;
  const base = candidates(state, filters.from, filters.to);
  if (simple) return base === state.transactions ? [...base] : base.slice();
  return base.filter((tx) => {
    if (filters.type && tx.type !== filters.type) return false;
    if (filters.accountId && tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) return false;
    if (filters.categoryId !== undefined && filters.categoryId !== '') {
      const wanted = filters.categoryId === 'none' ? null : filters.categoryId;
      if (tx.type === 'transfer' || (tx.categoryId ?? null) !== wanted) return false;
    }
    if (filters.cleared === 'yes' && !tx.cleared) return false;
    if (filters.cleared === 'no' && tx.cleared) return false;
    if (filters.tag && !(tx.tags || []).includes(filters.tag)) return false;
    if (filters.min != null && tx.amount < filters.min) return false;
    if (filters.max != null && tx.amount > filters.max) return false;
    if (words.length) {
      const hay = texts(tx);
      if (!words.every((word) => hay.includes(word))) return false;
    }
    return true;
  });
}

function isSortedByDate(txs) {
  for (let i = 1; i < txs.length; i++) if (compareByDate(txs[i - 1], txs[i]) > 0) return false;
  return true;
}

export function sortTransactions(txs, sort = 'date-desc') {
  switch (sort) {
    case 'amount-desc':
      return [...txs].sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return [...txs].sort((a, b) => a.amount - b.amount);
    default: {
      // Les listes filtrées sont déjà chronologiques : on évite un tri complet.
      const asc = isSortedByDate(txs) ? [...txs] : [...txs].sort(compareByDate);
      return sort === 'date-asc' ? asc : asc.reverse();
    }
  }
}

/** Revenus, dépenses, solde et taux d'épargne (les virements sont exclus). */
export function summarize(txs) {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const tx of txs) {
    if (tx.type === 'income') {
      income += tx.amount;
      count++;
    } else if (tx.type === 'expense') {
      expense += tx.amount;
      count++;
    }
  }
  const net = income - expense;
  return { income, expense, net, count, savingsRate: income > 0 ? net / income : null };
}

/** Répartition par catégorie, triée par montant décroissant. */
export function byCategory(state, txs, type = 'expense') {
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const tx of txs) {
    if (tx.type !== type) continue;
    const key = tx.categoryId && catById.has(tx.categoryId) ? tx.categoryId : null;
    const entry = totals.get(key) || { total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count += 1;
    totals.set(key, entry);
  }
  const grand = sum([...totals.values()], (e) => e.total);
  return [...totals.entries()]
    .map(([id, e]) => ({
      category: id ? catById.get(id) : { ...UNCATEGORIZED, type },
      total: e.total,
      count: e.count,
      share: grand > 0 ? e.total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function byTag(txs, type = 'expense') {
  const totals = new Map();
  for (const tx of txs) {
    if (tx.type !== type) continue;
    for (const tag of tx.tags || []) {
      const e = totals.get(tag) || { tag, total: 0, count: 0 };
      e.total += tx.amount;
      e.count += 1;
      totals.set(tag, e);
    }
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}

/** Totaux mensuels pour une liste de mois « YYYY-MM ». */
export function monthlyTotals(state, months, { accountId = null } = {}) {
  const index = monthIndex(state);
  return months.map((month) => {
    const row = { month, income: 0, expense: 0, net: 0 };
    for (const tx of index.get(month) || []) {
      if (tx.type === 'transfer') continue;
      if (accountId && tx.accountId !== accountId) continue;
      if (tx.type === 'income') row.income += tx.amount;
      else row.expense += tx.amount;
    }
    row.net = row.income - row.expense;
    return row;
  });
}

/** Période précédente de même durée (alignée sur les mois si possible). */
export function previousPeriod(from, to) {
  if (from.endsWith('-01') && to === monthEnd(monthKey(to))) {
    const n = monthDiff(monthKey(from), monthKey(to)) + 1;
    return { from: monthStart(shiftMonth(monthKey(from), -n)), to: monthEnd(shiftMonth(monthKey(to), -n)) };
  }
  const length = daysBetween(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

/** Variation relative (null si la base est nulle). */
export function change(current, previous) {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

/** Moyenne mensuelle des dépenses sur les n derniers mois complets. */
export function averageMonthlyExpense(state, n = 3, today = todayISO()) {
  const last = shiftMonth(monthKey(today), -1);
  const months = monthRange(shiftMonth(last, -(n - 1)), last);
  const rows = monthlyTotals(state, months);
  const active = rows.filter((r) => r.expense > 0 || r.income > 0);
  if (!active.length) return 0;
  return Math.round(sum(active, (r) => r.expense) / active.length);
}

/** Répartition besoins / envies / épargne (règle 50/30/20) sur une période. */
export function groupSplit(state, txs) {
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  let needs = 0;
  let wants = 0;
  let savingsExpense = 0;
  let income = 0;
  for (const tx of txs) {
    if (tx.type === 'income') income += tx.amount;
    if (tx.type !== 'expense') continue;
    const group = catById.get(tx.categoryId)?.group || 'wants';
    if (group === 'needs') needs += tx.amount;
    else if (group === 'savings') savingsExpense += tx.amount;
    else wants += tx.amount;
  }
  const savings = Math.max(0, income - needs - wants);
  return {
    income,
    needs,
    wants,
    savings,
    savingsExpense,
    ratios: income > 0 ? { needs: needs / income, wants: wants / income, savings: savings / income } : null,
  };
}

/** Suivi des dépenses du mois en cours : moyenne quotidienne et projection. */
export function monthPace(state, month, today = todayISO()) {
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(y, m - 1);
  const txs = filterTransactions(state, { from: monthStart(month), to: monthEnd(month) });
  const { expense } = summarize(txs);
  let elapsed = total;
  if (month === monthKey(today)) elapsed = Number(today.slice(8, 10));
  else if (month > monthKey(today)) elapsed = 0;
  const daily = elapsed > 0 ? expense / elapsed : 0;
  return { expense, elapsed, total, daily, projected: Math.round(daily * total) };
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export function effectiveBudget(state, categoryId, month) {
  const override = state.budgetOverrides?.[month]?.[categoryId];
  if (override != null) return override;
  return state.budgets?.[categoryId]?.amount ?? 0;
}

/** Dépenses indexées par « mois|catégorie ». */
export function spendIndex(state) {
  return memo(state, 'spend', () => computeSpendIndex(state));
}

function computeSpendIndex(state) {
  const index = new Map();
  for (const tx of state.transactions) {
    if (tx.type !== 'expense') continue;
    const key = `${monthKey(tx.date)}|${tx.categoryId ?? ''}`;
    index.set(key, (index.get(key) || 0) + tx.amount);
  }
  return index;
}

/** Report du reste des mois précédents (si activé pour la catégorie). */
export function budgetCarry(state, categoryId, month, index = spendIndex(state)) {
  const conf = state.budgets?.[categoryId];
  if (!conf?.rollover || !conf.rolloverSince || month <= conf.rolloverSince) return 0;
  let carry = 0;
  // On limite le calcul à 5 ans pour rester rapide.
  let m = conf.rolloverSince;
  if (monthDiff(m, month) > 60) m = shiftMonth(month, -60);
  for (; m < month; m = shiftMonth(m, 1)) {
    const available = effectiveBudget(state, categoryId, m) + carry;
    carry = available - (index.get(`${m}|${categoryId}`) || 0);
  }
  return carry;
}

/**
 * État des budgets pour un mois : une ligne par catégorie de dépense
 * ayant un budget ou des dépenses.
 */
export function budgetReport(state, month, { alertThreshold = 80 } = {}) {
  const index = spendIndex(state);
  const rows = [];
  let unbudgetedSpent = 0;
  for (const cat of state.categories.filter((c) => c.type === 'expense')) {
    const budget = effectiveBudget(state, cat.id, month);
    const carry = budgetCarry(state, cat.id, month, index);
    const spent = index.get(`${month}|${cat.id}`) || 0;
    const hasBudget = carry !== 0 || state.budgets?.[cat.id] != null || state.budgetOverrides?.[month]?.[cat.id] != null;
    if (!hasBudget) {
      unbudgetedSpent += spent;
      if (spent > 0) rows.push({ category: cat, budget: 0, carry: 0, available: 0, spent, remaining: -spent, ratio: null, status: 'none' });
      continue;
    }
    const available = budget + carry;
    const remaining = available - spent;
    const ratio = available > 0 ? spent / available : spent > 0 ? Infinity : 0;
    let status = 'ok';
    if (remaining < 0) status = 'over';
    else if (remaining === 0 && spent > 0) status = 'full';
    else if (ratio * 100 >= alertThreshold) status = 'warning';
    rows.push({ category: cat, budget, carry, available, spent, remaining, ratio, status, rollover: !!state.budgets?.[cat.id]?.rollover });
  }
  const uncategorized = index.get(`${month}|`) || 0;
  unbudgetedSpent += uncategorized;
  const budgeted = rows.filter((r) => r.status !== 'none');
  const totals = {
    available: sum(budgeted, (r) => r.available),
    budget: sum(budgeted, (r) => r.budget),
    spent: sum(budgeted, (r) => r.spent),
    unbudgetedSpent,
    uncategorized,
  };
  totals.remaining = totals.available - totals.spent;
  const order = { over: 0, warning: 1, full: 2, ok: 3, none: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || b.spent - a.spent);
  return { rows, totals };
}

/** Suggestion de budget : moyenne des n derniers mois complets, arrondie aux 10 unités supérieures. */
export function suggestBudgets(state, n = 3, today = todayISO()) {
  const last = shiftMonth(monthKey(today), -1);
  const months = monthRange(shiftMonth(last, -(n - 1)), last);
  const index = spendIndex(state);
  const out = {};
  for (const cat of state.categories.filter((c) => c.type === 'expense')) {
    const total = sum(months, (m) => index.get(`${m}|${cat.id}`) || 0);
    if (total <= 0) continue;
    const avg = total / n;
    out[cat.id] = Math.ceil(avg / 1000) * 1000;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Opérations récurrentes                                              */
/* ------------------------------------------------------------------ */

export const FREQUENCIES = {
  daily: { label: 'Tous les jours', days: 1, perMonth: 365.25 / 12 },
  weekly: { label: 'Toutes les semaines', days: 7, perMonth: 52 / 12 },
  biweekly: { label: 'Toutes les 2 semaines', days: 14, perMonth: 26 / 12 },
  monthly: { label: 'Tous les mois', months: 1, perMonth: 1 },
  bimonthly: { label: 'Tous les 2 mois', months: 2, perMonth: 1 / 2 },
  quarterly: { label: 'Tous les trimestres', months: 3, perMonth: 1 / 3 },
  semiannual: { label: 'Tous les semestres', months: 6, perMonth: 1 / 6 },
  yearly: { label: 'Tous les ans', months: 12, perMonth: 1 / 12 },
};

/** n-ième occurrence (n ≥ 0) à partir de la date de début. */
export function occurrenceDate(startDate, frequency, n) {
  const f = FREQUENCIES[frequency] || FREQUENCIES.monthly;
  return f.days ? addDays(startDate, f.days * n) : addMonths(startDate, f.months * n);
}

/** Indice de la première occurrence strictement postérieure à `after` (ou 0). */
function firstIndexAfter(rule, after) {
  if (!after || after < rule.startDate) return 0;
  const f = FREQUENCIES[rule.frequency] || FREQUENCIES.monthly;
  let n = f.days
    ? Math.floor(daysBetween(rule.startDate, after) / f.days)
    : Math.floor(monthDiff(monthKey(rule.startDate), monthKey(after)) / f.months);
  n = Math.max(0, n - 1);
  while (occurrenceDate(rule.startDate, rule.frequency, n) <= after) n++;
  return n;
}

/** Prochaine occurrence après la dernière générée (null si terminée). */
export function nextOccurrence(rule) {
  const n = firstIndexAfter(rule, rule.lastDate);
  const date = occurrenceDate(rule.startDate, rule.frequency, n);
  if (rule.endDate && date > rule.endDate) return null;
  return date;
}

/** Occurrences comprises entre `from` (inclus) et `to` (inclus), au plus `limit`. */
export function occurrencesBetween(rule, from, to, limit = 500) {
  const out = [];
  const after = rule.lastDate && rule.lastDate >= from ? rule.lastDate : addDays(from, -1);
  let n = firstIndexAfter(rule, after);
  for (let i = 0; i < limit; i++, n++) {
    const date = occurrenceDate(rule.startDate, rule.frequency, n);
    if (date > to || (rule.endDate && date > rule.endDate)) break;
    out.push(date);
  }
  return out;
}

/** Occurrences échues (≤ aujourd'hui) pas encore générées. */
export function dueOccurrences(rule, today = todayISO(), limit = 400) {
  if (!rule.active) return [];
  const out = [];
  let n = firstIndexAfter(rule, rule.lastDate);
  for (let i = 0; i < limit; i++, n++) {
    const date = occurrenceDate(rule.startDate, rule.frequency, n);
    if (date > today || (rule.endDate && date > rule.endDate)) break;
    out.push(date);
  }
  return out;
}

export function transactionFromRule(rule, date) {
  return {
    type: rule.type,
    amount: rule.amount,
    date,
    accountId: rule.accountId,
    toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
    categoryId: rule.type === 'transfer' ? null : rule.categoryId,
    description: rule.description,
    notes: '',
    tags: [...(rule.tags || [])],
    cleared: false,
    recurringId: rule.id,
  };
}

/** Coût mensuel équivalent d'une règle (centimes). */
export function monthlyEquivalent(rule) {
  const f = FREQUENCIES[rule.frequency] || FREQUENCIES.monthly;
  return Math.round(rule.amount * f.perMonth);
}

/** Occurrences à venir de toutes les règles actives entre deux dates. */
export function upcoming(state, from, to) {
  const out = [];
  for (const rule of state.recurring || []) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule, from, to, 60)) out.push({ rule, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Prévision du solde en fin de mois : solde actuel + opérations récurrentes restantes. */
export function endOfMonthForecast(state, today = todayISO()) {
  const current = totalBalance(state, today);
  const end = monthEnd(monthKey(today));
  const counted = new Set(countedAccounts(state).map((a) => a.id));
  let delta = 0;
  const items = upcoming(state, addDays(today, 1), end);
  for (const { rule } of items) {
    if (rule.type === 'income' && counted.has(rule.accountId)) delta += rule.amount;
    else if (rule.type === 'expense' && counted.has(rule.accountId)) delta -= rule.amount;
    else if (rule.type === 'transfer') {
      if (counted.has(rule.accountId)) delta -= rule.amount;
      if (counted.has(rule.toAccountId)) delta += rule.amount;
    }
  }
  return { current, forecast: current + delta, delta, items };
}

/* ------------------------------------------------------------------ */
/* Objectifs d'épargne                                                 */
/* ------------------------------------------------------------------ */

export function goalStats(goal, today = todayISO()) {
  const saved = sum(goal.contributions || [], (c) => c.amount);
  const remaining = Math.max(0, goal.target - saved);
  const ratio = goal.target > 0 ? saved / goal.target : 0;
  const done = saved >= goal.target && goal.target > 0;
  let monthsLeft = null;
  let monthlyNeeded = null;
  let overdue = false;
  if (goal.deadline && !done) {
    if (goal.deadline < today) overdue = true;
    else {
      monthsLeft = Math.max(1, monthDiff(monthKey(today), monthKey(goal.deadline)));
      monthlyNeeded = Math.ceil(remaining / monthsLeft);
    }
  }
  // Rythme moyen observé depuis le premier versement.
  let projectedDate = null;
  const dates = (goal.contributions || []).map((c) => c.date).sort();
  if (!done && dates.length && saved > 0) {
    const elapsedMonths = Math.max(1, monthDiff(monthKey(dates[0]), monthKey(today)) + 1);
    const pace = saved / elapsedMonths;
    if (pace > 0) projectedDate = addMonths(today, Math.ceil(remaining / pace));
  }
  return { saved, remaining, ratio, done, monthsLeft, monthlyNeeded, overdue, projectedDate };
}

/* ------------------------------------------------------------------ */
/* Crédits et simulateurs                                              */
/* ------------------------------------------------------------------ */

/** Mensualité hors assurance (centimes, non arrondie). */
export function loanPayment(principal, annualRatePct, months) {
  if (months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Tableau d'amortissement à mensualités constantes.
 * Chaque ligne : { n, date, payment, interest, principal, insurance, balance }.
 */
export function amortization({ principal, rate, months, startDate = null, insurance = 0, extra = 0 }) {
  const r = rate / 100 / 12;
  const basePayment = Math.round(loanPayment(principal, rate, months));
  const rows = [];
  let balance = principal;
  for (let n = 1; n <= months && balance > 0; n++) {
    const interest = Math.round(balance * r);
    let capital = basePayment - interest + extra;
    if (capital > balance || n === months) capital = balance;
    balance -= capital;
    rows.push({
      n,
      date: startDate ? addMonths(startDate, n - 1) : null,
      payment: capital + interest,
      interest,
      principal: capital,
      insurance,
      balance,
    });
  }
  return rows;
}

export function loanSummary(params) {
  const rows = amortization(params);
  const interest = sum(rows, (r) => r.interest);
  const insurance = sum(rows, (r) => r.insurance);
  return {
    rows,
    monthly: Math.round(loanPayment(params.principal, params.rate, params.months)) + (params.insurance || 0),
    interest,
    insurance,
    totalCost: interest + insurance,
    totalPaid: params.principal + interest + insurance,
    duration: rows.length,
  };
}

/** Situation d'un crédit suivi à une date donnée. */
export function loanStatus(debt, today = todayISO()) {
  const rows = amortization({
    principal: debt.principal,
    rate: debt.rate,
    months: debt.termMonths,
    startDate: debt.startDate,
    insurance: debt.insurance || 0,
  });
  const paid = rows.filter((r) => r.date <= today);
  const last = paid[paid.length - 1];
  const remaining = last ? last.balance : debt.principal;
  const next = rows.find((r) => r.date > today) || null;
  return {
    rows,
    monthly: rows[0] ? rows[0].payment + (debt.insurance || 0) : 0,
    paymentsMade: paid.length,
    paymentsLeft: rows.length - paid.length,
    remaining,
    repaid: debt.principal - remaining,
    ratio: debt.principal > 0 ? (debt.principal - remaining) / debt.principal : 0,
    interestPaid: sum(paid, (r) => r.interest),
    interestLeft: sum(rows, (r) => r.interest) - sum(paid, (r) => r.interest),
    totalInterest: sum(rows, (r) => r.interest),
    endDate: rows.length ? rows[rows.length - 1].date : debt.startDate,
    next,
  };
}

/** Taux mensuel équivalent à un taux annuel effectif. */
function monthlyRate(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Projection d'épargne avec intérêts composés mensuels et versements en fin de mois.
 * Retourne une ligne par année.
 */
export function savingsProjection({ initial = 0, monthly = 0, rate = 0, years = 10, inflation = 0 }) {
  const r = monthlyRate(rate);
  let balance = initial;
  let contributed = initial;
  const rows = [{ year: 0, balance, contributed, interest: 0, real: balance }];
  for (let m = 1; m <= Math.round(years * 12); m++) {
    balance = balance * (1 + r) + monthly;
    contributed += monthly;
    if (m % 12 === 0 || m === Math.round(years * 12)) {
      const y = m / 12;
      rows.push({
        year: y,
        balance: Math.round(balance),
        contributed: Math.round(contributed),
        interest: Math.round(balance - contributed),
        real: Math.round(balance / Math.pow(1 + inflation / 100, y)),
      });
    }
  }
  return rows;
}

/** Versement mensuel nécessaire pour atteindre `target` en `months` mois. */
export function requiredMonthlySaving({ target, current = 0, rate = 0, months }) {
  if (months <= 0) return Math.max(0, target - current);
  const r = monthlyRate(rate);
  const grown = current * Math.pow(1 + r, months);
  const missing = target - grown;
  if (missing <= 0) return 0;
  if (r === 0) return Math.ceil(missing / months);
  return Math.ceil((missing * r) / (Math.pow(1 + r, months) - 1));
}

/**
 * Capacité d'emprunt selon un taux d'endettement maximal (35 % en France, recommandation HCSF).
 * insuranceRate : taux annuel d'assurance en % du capital initial.
 */
export function borrowingCapacity({ income, charges = 0, maxRatio = 35, rate, months, insuranceRate = 0 }) {
  const maxPayment = Math.max(0, Math.floor((income * maxRatio) / 100 - charges));
  const r = rate / 100 / 12;
  const factor = r === 0 ? 1 / months : r / (1 - Math.pow(1 + r, -months));
  const perUnit = factor + insuranceRate / 100 / 12;
  const capital = perUnit > 0 ? Math.floor(maxPayment / perUnit) : 0;
  const ratio = income > 0 ? (charges + maxPayment) / income : 0;
  return { maxPayment, capital, ratio, currentRatio: income > 0 ? charges / income : 0 };
}

/* ------------------------------------------------------------------ */
/* Périodes prédéfinies pour les rapports                              */
/* ------------------------------------------------------------------ */

export const PERIODS = {
  'this-month': 'Ce mois-ci',
  'last-month': 'Mois dernier',
  'last-3': '3 derniers mois',
  'last-6': '6 derniers mois',
  'this-year': 'Cette année',
  'last-year': 'Année dernière',
  'last-12': '12 derniers mois',
  all: 'Toute la période',
  custom: 'Personnalisée',
};

export function periodRange(key, state, today = todayISO(), custom = {}) {
  const month = monthKey(today);
  const year = today.slice(0, 4);
  switch (key) {
    case 'this-month':
      return { from: monthStart(month), to: monthEnd(month) };
    case 'last-month':
      return { from: monthStart(shiftMonth(month, -1)), to: monthEnd(shiftMonth(month, -1)) };
    case 'last-3':
      return { from: monthStart(shiftMonth(month, -2)), to: monthEnd(month) };
    case 'last-6':
      return { from: monthStart(shiftMonth(month, -5)), to: monthEnd(month) };
    case 'this-year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'last-year':
      return { from: `${+year - 1}-01-01`, to: `${+year - 1}-12-31` };
    case 'last-12':
      return { from: monthStart(shiftMonth(month, -11)), to: monthEnd(month) };
    case 'all': {
      const dates = state.transactions.map((t) => t.date).sort();
      return { from: dates[0] || monthStart(month), to: dates[dates.length - 1] > today ? dates[dates.length - 1] : monthEnd(month) };
    }
    case 'custom':
      return { from: custom.from || monthStart(month), to: custom.to || monthEnd(month) };
    default:
      return { from: monthStart(month), to: monthEnd(month) };
  }
}

/** Nombre de mois (fractionnaire) couverts par une période, pour les moyennes. */
export function monthsInPeriod(from, to) {
  return Math.max(1, monthDiff(monthKey(from), monthKey(to)) + 1);
}

export { currentMonth, parseISODate };
