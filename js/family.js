// Famille : partage des dépenses en couple et préparation de l'arrivée d'un ou deux bébés.
// Fonctions pures (sans DOM) ; barèmes 2026 dans defaults.js (FAMILY), sources dans docs/RECHERCHE.md.
import { filterTransactions, monthlyEquivalent } from './calc.js';
import { BABY_EQUIPMENT, BABY_MONTHLY, FAMILY } from './defaults.js';
import { addDays, addMonths, daysBetween, daysInMonth, monthEnd, monthKey, monthRange, monthStart, shiftMonth, sum, todayISO } from './utils.js';

export const PARTNERS = ['p1', 'p2'];
export const other = (p) => (p === 'p1' ? 'p2' : 'p1');

export function partnerName(household, id) {
  if (id === 'joint') return 'Compte commun';
  return household?.partners?.find((p) => p.id === id)?.name || (id === 'p1' ? 'Partenaire 1' : 'Partenaire 2');
}

/* ------------------------------------------------------------------ */
/* Couple : répartition des dépenses                                   */
/* ------------------------------------------------------------------ */

/**
 * Part de chacun dans les dépenses communes.
 * 'income' : au prorata des revenus (recommandé quand les revenus diffèrent) ;
 * 'equal' : 50/50 ; 'custom' : pourcentage choisi.
 * incomes permet de recalculer la part avec des revenus temporairement différents (congés).
 */
export function splitRatio(household, incomes = null) {
  if (!household) return { p1: 0.5, p2: 0.5 };
  if (household.split === 'equal') return { p1: 0.5, p2: 0.5 };
  if (household.split === 'custom') {
    const p1 = Math.min(100, Math.max(0, Number(household.customShare) || 50)) / 100;
    return { p1, p2: 1 - p1 };
  }
  const i1 = Math.max(0, incomes ? incomes.p1 : household.partners[0]?.income || 0);
  const i2 = Math.max(0, incomes ? incomes.p2 : household.partners[1]?.income || 0);
  if (i1 + i2 <= 0) return { p1: 0.5, p2: 0.5 };
  return { p1: i1 / (i1 + i2), p2: i2 / (i1 + i2) };
}

/** Qui a payé : titulaire du compte débité (« joint » pour un compte commun ou non attribué). */
export function payerOf(tx, accountsById) {
  const owner = accountsById.get(tx.accountId)?.owner;
  return owner === 'p1' || owner === 'p2' ? owner : 'joint';
}

/** Pour qui est la dépense : « shared », « p1 » ou « p2 ». Par défaut : commune sur un compte commun, personnelle sinon. */
export function shareOf(tx, accountsById) {
  if (tx.share === 'shared' || tx.share === 'p1' || tx.share === 'p2') return tx.share;
  const payer = payerOf(tx, accountsById);
  return payer === 'joint' ? 'shared' : payer;
}

/**
 * Livre de compte du couple sur une période.
 * Le compte commun est considéré comme alimenté selon la règle de partage : une dépense commune
 * payée par le compte commun ne crée pas de dette ; une dépense personnelle payée par le compte
 * commun est due à l'autre pour sa part ; une dépense commune payée personnellement est due par l'autre.
 * net : solde de p1 (positif = p2 doit cette somme à p1).
 */
export function coupleLedger(state, { from = null, to = null } = {}) {
  const household = state.household;
  const ratio = splitRatio(household);
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const result = {
    ratio,
    shared: 0,
    personal: { p1: 0, p2: 0 },
    paidShared: { p1: 0, p2: 0, joint: 0 },
    fair: { p1: 0, p2: 0 },
    net: 0,
    byCategory: new Map(),
    settled: 0,
    count: 0,
  };
  for (const tx of filterTransactions(state, { from: from || undefined, to: to || undefined, type: 'expense' })) {
    const share = shareOf(tx, accounts);
    const payer = payerOf(tx, accounts);
    const a = tx.amount;
    const cost = share === 'shared' ? { p1: a * ratio.p1, p2: a * ratio.p2 } : share === 'p1' ? { p1: a, p2: 0 } : { p1: 0, p2: a };
    const pay = payer === 'joint' ? { p1: a * ratio.p1, p2: a * ratio.p2 } : payer === 'p1' ? { p1: a, p2: 0 } : { p1: 0, p2: a };
    result.net += pay.p1 - cost.p1;
    result.count++;
    if (share === 'shared') {
      result.shared += a;
      result.paidShared[payer] += a;
      result.fair.p1 += cost.p1;
      result.fair.p2 += cost.p2;
      const cat = cats.get(tx.categoryId);
      const key = cat?.id ?? null;
      const entry = result.byCategory.get(key) || { category: cat || null, total: 0 };
      entry.total += a;
      result.byCategory.set(key, entry);
    } else {
      result.personal[share] += a;
    }
  }
  for (const s of household?.settlements || []) {
    if ((from && s.date < from) || (to && s.date > to)) continue;
    // Un remboursement de p2 à p1 diminue ce que p2 doit à p1.
    result.net += s.from === 'p1' ? s.amount : -s.amount;
    result.settled += s.amount;
  }
  result.net = Math.round(result.net);
  result.fair.p1 = Math.round(result.fair.p1);
  result.fair.p2 = Math.round(result.fair.p2);
  return result;
}

/** Phrase d'équilibre : qui doit combien à qui. */
export function balanceStatement(household, net) {
  if (Math.abs(net) < 100) return { debtor: null, creditor: null, amount: 0 };
  return net > 0 ? { debtor: 'p2', creditor: 'p1', amount: net } : { debtor: 'p1', creditor: 'p2', amount: -net };
}

/** Dépenses communes moyennes par mois (3 derniers mois complets), récurrences communes comprises. */
export function averageSharedSpending(state, today = todayISO()) {
  const last = shiftMonth(monthKey(today), -1);
  const months = monthRange(shiftMonth(last, -2), last);
  const totals = months.map((m) => coupleLedger(state, { from: monthStart(m), to: monthEnd(m) }).shared);
  const active = totals.filter((t) => t > 0);
  return active.length ? Math.round(sum(active) / active.length) : 0;
}

/** Récurrences communes (charges fixes partagées), en équivalent mensuel. */
export function sharedRecurring(state) {
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  return sum(
    state.recurring.filter((r) => r.active && r.type === 'expense' && shareOf(r, accounts) === 'shared'),
    monthlyEquivalent,
  );
}

/**
 * Prévision du budget commun mois par mois, avec l'arrivée de bébé si un projet est défini.
 * La part de chacun suit la règle de partage ; au prorata, elle tient compte de la baisse
 * de revenus pendant les congés.
 */
export function sharedForecast(state, { months = 12, today = todayISO(), plan = null } = {}) {
  const household = state.household;
  const base = averageSharedSpending(state, today);
  const byMonth = new Map((plan?.months || []).map((r) => [r.month, r]));
  const start = monthKey(today);
  return monthRange(start, shiftMonth(start, months - 1)).map((month) => {
    const baby = byMonth.get(month);
    const babyNet = baby ? baby.costs - baby.aids : 0;
    const incomes = {
      p1: Math.max(0, (household.partners[0]?.income || 0) - (baby?.loss.p1 || 0)),
      p2: Math.max(0, (household.partners[1]?.income || 0) - (baby?.loss.p2 || 0)),
    };
    const ratio = splitRatio(household, incomes);
    const total = Math.max(0, base + babyNet);
    return {
      month,
      base,
      baby: babyNet,
      total,
      ratio,
      incomes,
      contribution: { p1: Math.round(total * ratio.p1), p2: Math.round(total * ratio.p2) },
      left: { p1: incomes.p1 - Math.round(total * ratio.p1), p2: incomes.p2 - Math.round(total * ratio.p2) },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Bébé : congés, dépenses, aides                                      */
/* ------------------------------------------------------------------ */

const AVG_MONTH_DAYS = 30.42;

/** Indemnité journalière maternité / paternité (79 % du salaire journalier brut, plafonnée). */
export function dailyAllowance(grossMonthly) {
  const daily = ((grossMonthly * 3) / 91.25) * FAMILY.dailyAllowanceRate;
  return Math.round(Math.min(FAMILY.dailyAllowanceMax, Math.max(0, daily)));
}

/** Taux d'effort horaire (crèche, et repère du complément de mode de garde) selon le nombre d'enfants. */
export function effortRate(children) {
  const r = FAMILY.psu.rates;
  return children <= 1 ? r[0] : children === 2 ? r[1] : children === 3 ? r[2] : r[3];
}

/** Tarif horaire de crèche (PSU) : ressources mensuelles × taux d'effort, entre plancher et plafond. */
export function crecheHourly(monthlyResources, children) {
  const res = Math.min(FAMILY.psu.ceiling, Math.max(FAMILY.psu.floor, monthlyResources));
  return Math.round(res * effortRate(children));
}

/**
 * Garde chez une assistante maternelle (emploi direct) : coût et complément de mode de garde (CMG).
 * Depuis la réforme du 1er septembre 2025, la participation de la famille se calcule à l'heure,
 * comme en crèche (ressources × taux d'effort), dans la limite d'un coût horaire de 8 € ;
 * le CMG couvre le reste, plafonné par mois. Estimation simplifiée.
 */
export function assmatMonthly({ hourly, hoursPerMonth, children, monthlyResources, babies }) {
  const cost = Math.round(hourly * hoursPerMonth * babies);
  const participation = crecheHourly(monthlyResources, children);
  const covered = Math.max(0, Math.min(hourly, FAMILY.cmg.hourlyCap) - participation);
  const cmg = Math.min(FAMILY.cmg.monthlyMax, Math.round(covered * hoursPerMonth * babies));
  return { cost, cmg, net: cost - cmg };
}

function equipmentFactor(level, usedOk) {
  if (!usedOk) return 1;
  return level === 'second-hand' ? 0.55 : level === 'mixed' ? 0.75 : 1;
}

/** Liste d'achats chiffrée pour 1 ou 2 bébés. */
export function equipmentList(plan, count) {
  const items = BABY_EQUIPMENT.map((item) => {
    const qty = count >= 2 ? item.twins : 1;
    const amount = Math.round((item.price * qty * equipmentFactor(plan.equipmentLevel, item.usedOk)) / 100) * 100;
    const state = plan.checklist?.[item.id] || {};
    return { ...item, qty, amount, bought: !!state.bought, actual: state.actual ?? null };
  });
  if (plan.diapers === 'washable') {
    items.push({ id: 'couches-lavables', label: 'Kit de couches lavables', price: BABY_MONTHLY.washableKit, qty: count, usedOk: true, amount: BABY_MONTHLY.washableKit * count, bought: !!plan.checklist?.['couches-lavables']?.bought, actual: plan.checklist?.['couches-lavables']?.actual ?? null });
  }
  return items;
}

/** Dépenses courantes par mois et par enfant selon l'âge (en mois). */
export function monthlyBabyCost(plan, ageMonths) {
  return (
    BABY_MONTHLY.diapers[plan.diapers] +
    (ageMonths < 12 ? BABY_MONTHLY.feeding[plan.feeding] : 0) +
    BABY_MONTHLY.hygiene +
    BABY_MONTHLY.clothes +
    BABY_MONTHLY.health +
    (ageMonths >= 6 ? BABY_MONTHLY.food : 0)
  );
}

/** Revenu fiscal de référence utilisé pour les plafonds (saisi, sinon estimé : 90 % des revenus nets annuels). */
export function taxIncomeOf(plan, household) {
  if (plan.taxIncome) return { value: plan.taxIncome, estimated: false };
  const annual = 12 * ((household.partners[0]?.income || 0) + (household.partners[1]?.income || 0));
  return { value: Math.round(annual * 0.9), estimated: true };
}

/** Droits CAF liés à la naissance (estimation à partir des plafonds 2026). */
export function cafRights(plan, household, count) {
  const children = plan.existingChildren + count;
  const twoIncomes = (household.partners[0]?.income || 0) > 0 && (household.partners[1]?.income || 0) > 0;
  const { value: income, estimated } = taxIncomeOf(plan, household);
  const extra = Math.max(0, children - 1);
  const partialCeiling = (twoIncomes ? FAMILY.ceilingPartial.two : FAMILY.ceilingPartial.one) + extra * FAMILY.ceilingPartial.step;
  const fullCeiling = (twoIncomes ? FAMILY.ceilingFull.two : FAMILY.ceilingFull.one) + extra * FAMILY.ceilingFull.step;
  const premiumEligible = income <= partialCeiling;
  const baseRate = income <= fullCeiling ? 'full' : income <= partialCeiling ? 'partial' : null;
  // En cas de naissances multiples, une allocation de base est versée pour chaque enfant (art. L531-3 CSS).
  const baseMonthly = baseRate ? (baseRate === 'full' ? FAMILY.baseAllowanceFull : FAMILY.baseAllowancePartial) * count : 0;
  let familyAllowance = 0;
  if (children >= 2) {
    const af = FAMILY.familyAllowance;
    const step = (children - 2) * af.step;
    const tier = income <= af.ceilings[0] + step ? 0 : income <= af.ceilings[1] + step ? 1 : 2;
    familyAllowance = children === 2 ? af.two[tier] : af.three[tier] + Math.max(0, children - 3) * af.extra[tier];
    if (plan.existingChildren >= 2) {
      // Les allocations sont déjà perçues : seule la hausse liée à la naissance compte.
      const before = plan.existingChildren === 2 ? af.two[tier] : af.three[tier] + Math.max(0, plan.existingChildren - 3) * af.extra[tier];
      familyAllowance -= before;
    }
  }
  // Quotient familial : une demi-part par enfant pour les deux premiers, une part à partir du troisième.
  let halfParts = 0;
  for (let rank = plan.existingChildren + 1; rank <= children; rank++) halfParts += rank <= 2 ? 1 : 2;
  return {
    children,
    income,
    estimated,
    twoIncomes,
    premium: premiumEligible ? FAMILY.birthPremium * count : 0,
    premiumEligible,
    partialCeiling,
    fullCeiling,
    baseRate,
    baseMonthly,
    familyAllowance,
    halfParts,
    taxAdvantageMax: halfParts * FAMILY.quotientCap,
  };
}

function overlapDays(start, end, month) {
  const a = start > monthStart(month) ? start : monthStart(month);
  const b = end < monthEnd(month) ? end : monthEnd(month);
  return b >= a ? daysBetween(a, b) + 1 : 0;
}

/** Congés liés à la naissance et baisse de revenus correspondante. */
export function leavePlan(plan, household, count) {
  const due = plan.dueDate;
  const birthParent = plan.birthParent;
  const second = other(birthParent);
  const net = { p1: household.partners[0]?.income || 0, p2: household.partners[1]?.income || 0 };
  const gross = { p1: plan.grossSalaries?.p1 || Math.round(net.p1 / 0.78), p2: plan.grossSalaries?.p2 || Math.round(net.p2 / 0.78) };
  const weeks = count >= 2 ? FAMILY.maternityWeeks.twins : plan.existingChildren >= 2 ? FAMILY.maternityWeeks.third : FAMILY.maternityWeeks.first;
  const leaves = [];
  const dailyLoss = (p, dailyIncome) => (plan.salaryMaintained?.[p] ? 0 : Math.max(0, net[p] / AVG_MONTH_DAYS - dailyIncome));

  const matStart = addDays(due, -7 * weeks[0]);
  const matEnd = addDays(due, 7 * weeks[1] - 1);
  const matDaily = dailyAllowance(gross[birthParent]);
  leaves.push({ parent: birthParent, kind: 'maternite', label: 'Congé maternité', start: matStart, end: matEnd, weeks: weeks[0] + weeks[1], before: weeks[0], after: weeks[1], daily: matDaily, dailyLoss: dailyLoss(birthParent, matDaily) });

  const patDays = count >= 2 ? FAMILY.paternityDays.multiple : FAMILY.paternityDays.single;
  const patEnd = addDays(due, patDays - 1);
  const patDaily = dailyAllowance(gross[second]);
  leaves.push({ parent: second, kind: 'paternite', label: 'Congé de paternité et d’accueil', start: due, end: patEnd, days: patDays, daily: patDaily, dailyLoss: dailyLoss(second, patDaily) });

  // Congé supplémentaire de naissance (1 ou 2 mois par parent, 70 % puis 60 % du salaire net plafonné).
  for (const p of PARTNERS) {
    const monthsWanted = Math.min(2, Math.max(0, Number(plan.extraLeaveMonths?.[p]) || 0));
    let start = addDays(p === birthParent ? matEnd : patEnd, 1);
    for (let i = 0; i < monthsWanted; i++) {
      const end = addDays(addMonths(start, 1), -1);
      const rate = i === 0 ? FAMILY.birthLeave.first : FAMILY.birthLeave.second;
      const indemnity = rate * Math.min(net[p], FAMILY.birthLeave.cap);
      leaves.push({ parent: p, kind: 'naissance', label: `Congé de naissance, ${i === 0 ? '1er' : '2e'} mois`, start, end, rate, daily: Math.round(indemnity / AVG_MONTH_DAYS), dailyLoss: Math.max(0, (net[p] - indemnity) / AVG_MONTH_DAYS) });
      start = addDays(end, 1);
    }
  }
  const backToWork = PARTNERS.reduce((latest, p) => {
    const ends = leaves.filter((l) => l.parent === p).map((l) => l.end);
    const last = ends.sort().pop();
    return !latest || last > latest ? last : latest;
  }, null);
  return { leaves, birthParent, second, net, gross, weeks, childcareStart: addDays(backToWork, 1), totalLoss: Math.round(sum(leaves, (l) => l.dailyLoss * (daysBetween(l.start, l.end) + 1))) };
}

/**
 * Plan complet pour 1 ou 2 bébés : calendrier, dépenses, aides, projection mensuelle.
 * Tous les montants sont en centimes.
 */
export function babyPlan(plan, household, { count = plan.count, today = todayISO(), horizon = 18 } = {}) {
  if (!plan?.dueDate) return null;
  const due = plan.dueDate;
  const dueMonth = monthKey(due);
  const leave = leavePlan(plan, household, count);
  const rights = cafRights(plan, household, count);
  const equipment = equipmentList(plan, count);
  const equipmentTotal = sum(equipment, (i) => i.amount);
  const equipmentLeft = sum(equipment.filter((i) => !i.bought), (i) => i.amount);
  const equipmentSpent = sum(equipment.filter((i) => i.bought), (i) => i.actual ?? i.amount);

  const hoursPerMonth = Math.round(((Number(plan.hoursPerWeek) || 0) * 52) / 12);
  const monthlyResources = Math.round(rights.income / 12);
  const childcareStart = plan.childcareStart || leave.childcareStart;
  let childcare = { cost: 0, cmg: 0, net: 0 };
  if (plan.childcare === 'creche') {
    const cost = crecheHourly(monthlyResources, rights.children) * hoursPerMonth * count;
    childcare = { cost, cmg: 0, net: cost };
  } else if (plan.childcare === 'assmat') {
    childcare = assmatMonthly({ hourly: plan.assmatHourly || 0, hoursPerMonth, children: rights.children, monthlyResources, babies: count });
  }
  // Crédit d'impôt : 50 % des frais restant à charge, dans la limite de 3 500 € par enfant et par an.
  const taxCreditYear = Math.round(Math.min(childcare.net * 12, FAMILY.childcareCredit.cap * count) * FAMILY.childcareCredit.rate);

  // Achats répartis sur les 3 mois qui précèdent la naissance (ou dès maintenant si c'est plus proche).
  const purchaseMonths = monthRange(shiftMonth(dueMonth, -3), shiftMonth(dueMonth, -1)).filter((m) => m >= monthKey(today));
  const buyMonths = purchaseMonths.length ? purchaseMonths : [monthKey(today)];
  const premiumMonth = monthKey(addMonths(due, -2)); // versée au 7e mois de grossesse

  const first = shiftMonth(dueMonth, -6) < monthKey(today) ? monthKey(today) : shiftMonth(dueMonth, -6);
  const months = monthRange(first, shiftMonth(dueMonth, horizon)).map((month) => {
    const row = { month, equipment: 0, living: 0, childcare: 0, costs: 0, loss: { p1: 0, p2: 0 }, incomeLoss: 0, aids: 0, aidDetail: {} };
    if (buyMonths.includes(month)) row.equipment = Math.round(equipmentLeft / buyMonths.length);
    if (month >= dueMonth) {
      const age = Math.max(0, monthDiffSafe(dueMonth, month));
      // Mois de naissance : au prorata des jours restants.
      const [y, m] = month.split('-').map(Number);
      const factor = month === dueMonth ? (daysInMonth(y, m - 1) - Number(due.slice(8, 10)) + 1) / daysInMonth(y, m - 1) : 1;
      row.living = Math.round(monthlyBabyCost(plan, age) * count * factor);
    }
    if (plan.childcare !== 'famille' && month >= monthKey(childcareStart)) {
      row.childcare = childcare.cost;
      if (childcare.cmg) row.aidDetail.cmg = childcare.cmg;
    }
    for (const l of leave.leaves) {
      const days = overlapDays(l.start, l.end, month);
      if (days) row.loss[l.parent] += Math.round(l.dailyLoss * days);
    }
    row.incomeLoss = row.loss.p1 + row.loss.p2;
    if (month === premiumMonth && rights.premium) row.aidDetail.premium = rights.premium;
    if (month > dueMonth && rights.baseMonthly) row.aidDetail.base = rights.baseMonthly;
    if (month > dueMonth && rights.familyAllowance) row.aidDetail.family = rights.familyAllowance;
    row.aids = sum(Object.values(row.aidDetail));
    row.costs = row.equipment + row.living + row.childcare;
    row.net = row.costs + row.incomeLoss - row.aids;
    return row;
  });

  const firstYear = months.filter((r) => r.month >= dueMonth && r.month < shiftMonth(dueMonth, 12));
  const beforeBirth = months.filter((r) => r.month < dueMonth);
  const steady = months.find((r) => r.month >= shiftMonth(monthKey(childcareStart), 1) && r.month > dueMonth) || months[months.length - 1];
  // Somme à avoir de côté : le besoin de trésorerie le plus élevé d'ici la reprise du travail
  // (achats, dépenses courantes, baisse de revenus, aides déduites). Ensuite, le coût relève du budget mensuel.
  let running = 0;
  let peak = 0;
  for (const r of months) {
    if (r.month > monthKey(childcareStart)) break;
    running += r.net;
    peak = Math.max(peak, running);
  }
  const savingsTarget = Math.round(peak / 1000) * 1000;
  const monthsToBirth = Math.max(1, monthDiffSafe(monthKey(today), dueMonth));
  return {
    count,
    due,
    leave,
    rights,
    equipment,
    equipmentTotal,
    equipmentLeft,
    equipmentSpent,
    childcare: { ...childcare, start: childcareStart, hoursPerMonth, mode: plan.childcare, taxCreditYear },
    months,
    totals: {
      beforeBirth: sum(beforeBirth, (r) => r.net),
      firstYearCosts: sum(firstYear, (r) => r.costs) + sum(beforeBirth, (r) => r.equipment),
      firstYearLoss: leave.totalLoss,
      firstYearAids: sum(firstYear, (r) => r.aids) + rights.premium,
      taxCredit: taxCreditYear,
    },
    steadyMonthly: { costs: steady.costs, aids: steady.aids, net: steady.costs - steady.aids, month: steady.month },
    savingsTarget,
    monthlySaving: Math.ceil(savingsTarget / monthsToBirth / 1000) * 1000,
    monthsToBirth,
    timeline: timeline(plan, leave, rights, childcareStart, premiumMonth, count),
  };
}

function monthDiffSafe(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

function timeline(plan, leave, rights, childcareStart, premiumMonth, count) {
  const events = [];
  if (rights.premium) events.push({ date: `${premiumMonth}-15`, label: `Prime à la naissance (${count > 1 ? 'pour chaque bébé' : 'CAF'})`, kind: 'aid', amount: rights.premium });
  for (const l of leave.leaves) events.push({ date: l.start, label: `Début : ${l.label.toLowerCase()}`, parent: l.parent, kind: 'leave', end: l.end });
  events.push({ date: plan.dueDate, label: count > 1 ? 'Naissance des jumeaux (terme prévu)' : 'Naissance (terme prévu)', kind: 'birth' });
  if (plan.childcare !== 'famille') events.push({ date: childcareStart, label: plan.childcare === 'creche' ? 'Début de la crèche' : 'Début chez l’assistante maternelle', kind: 'care' });
  if (rights.baseMonthly) events.push({ date: `${shiftMonth(monthKey(plan.dueDate), 1)}-05`, label: 'Premier versement de l’allocation de base', kind: 'aid', amount: rights.baseMonthly });
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Comparaison 1 bébé / jumeaux. */
export function compareScenarios(plan, household, today = todayISO()) {
  return [1, 2].map((count) => babyPlan(plan, household, { count, today }));
}
