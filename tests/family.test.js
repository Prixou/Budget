import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultBabyPlan, emptyHousehold, emptyState, FAMILY } from '../js/defaults.js';
import {
  assmatMonthly,
  babyPlan,
  balanceStatement,
  cafRights,
  coupleLedger,
  crecheHourly,
  dailyAllowance,
  leavePlan,
  sharedForecast,
  splitRatio,
} from '../js/family.js';

function household(i1 = 300000, i2 = 200000, split = 'income') {
  const h = emptyHousehold();
  h.enabled = true;
  h.partners[0].income = i1;
  h.partners[1].income = i2;
  h.split = split;
  return h;
}

test('répartition : prorata, 50/50, personnalisée', () => {
  assert.deepEqual(splitRatio(household(300000, 200000)), { p1: 0.6, p2: 0.4 });
  assert.deepEqual(splitRatio(household(300000, 200000, 'equal')), { p1: 0.5, p2: 0.5 });
  const h = household();
  h.split = 'custom';
  h.customShare = 70;
  assert.ok(Math.abs(splitRatio(h).p1 - 0.7) < 1e-9);
  assert.deepEqual(splitRatio(household(0, 0)), { p1: 0.5, p2: 0.5 });
});

test('équilibre du couple : qui doit combien', () => {
  const s = emptyState();
  s.household = household(300000, 200000); // 60 / 40
  s.accounts = [
    { id: 'j', name: 'Commun', owner: 'joint', initialBalance: 0 },
    { id: 'a', name: 'Perso 1', owner: 'p1', initialBalance: 0 },
    { id: 'b', name: 'Perso 2', owner: 'p2', initialBalance: 0 },
  ];
  const tx = (id, amount, accountId, share) => ({ id, type: 'expense', amount, date: '2026-10-10', accountId, categoryId: 'cat-courses', share, tags: [] });
  s.transactions = [
    tx('t1', 10000, 'j'), // commune payée par le compte commun : aucune dette
    tx('t2', 10000, 'b', 'shared'), // commune payée par p2 : p1 doit 60 €
    tx('t3', 5000, 'j', 'p1'), // personnelle de p1 payée par le commun : p1 doit 40 % = 20 €
    tx('t4', 3000, 'a'), // personnelle de p1 sur son compte : neutre
  ];
  const ledger = coupleLedger(s);
  assert.equal(ledger.shared, 20000);
  assert.equal(ledger.personal.p1, 8000);
  assert.equal(ledger.net, -8000);
  assert.deepEqual(balanceStatement(s.household, ledger.net), { debtor: 'p1', creditor: 'p2', amount: 8000 });
  // Remboursement de p1 à p2 : soldé
  s.household.settlements = [{ id: 's', date: '2026-10-12', from: 'p1', to: 'p2', amount: 8000 }];
  assert.equal(coupleLedger(s).net, 0);
});

test('indemnités journalières : 79 % du salaire journalier, plafonnées', () => {
  assert.equal(dailyAllowance(300000), Math.round(((300000 * 3) / 91.25) * 0.79));
  assert.equal(dailyAllowance(1000000), FAMILY.dailyAllowanceMax);
});

test('congés : maternité 16 semaines (1 bébé) ou 34 (jumeaux), paternité 25 ou 32 jours', () => {
  const h = household();
  const plan = { ...defaultBabyPlan(), dueDate: '2027-03-15', birthParent: 'p2' };
  const one = leavePlan(plan, h, 1);
  const mat = one.leaves.find((l) => l.kind === 'maternite');
  assert.equal(mat.weeks, 16);
  assert.equal(mat.start, '2027-02-01');
  assert.equal(one.leaves.find((l) => l.kind === 'paternite').days, 25);
  const twins = leavePlan(plan, h, 2);
  assert.equal(twins.leaves.find((l) => l.kind === 'maternite').weeks, 34);
  assert.equal(twins.leaves.find((l) => l.kind === 'paternite').days, 32);
  const third = leavePlan({ ...plan, existingChildren: 2 }, h, 1);
  assert.equal(third.leaves.find((l) => l.kind === 'maternite').weeks, 26);
  // Congé supplémentaire de naissance : 70 % puis 60 % du net
  const extra = leavePlan({ ...plan, extraLeaveMonths: { p1: 2, p2: 0 } }, h, 1).leaves.filter((l) => l.kind === 'naissance');
  assert.equal(extra.length, 2);
  assert.equal(extra[0].rate, 0.7);
  assert.equal(extra[1].rate, 0.6);
  assert.ok(extra[1].dailyLoss > extra[0].dailyLoss);
});

test('droits CAF : prime par enfant, allocation de base par enfant pour des jumeaux, allocations familiales dès 2 enfants', () => {
  const h = household(150000, 120000);
  const plan = { ...defaultBabyPlan(), dueDate: '2027-03-15', taxIncome: 2800000 };
  const one = cafRights(plan, h, 1);
  assert.equal(one.premium, FAMILY.birthPremium);
  assert.equal(one.baseRate, 'full');
  assert.equal(one.baseMonthly, FAMILY.baseAllowanceFull);
  assert.equal(one.familyAllowance, 0);
  const twins = cafRights(plan, h, 2);
  assert.equal(twins.premium, FAMILY.birthPremium * 2);
  assert.equal(twins.baseMonthly, FAMILY.baseAllowanceFull * 2);
  assert.equal(twins.familyAllowance, FAMILY.familyAllowance.two[0]);
  assert.equal(twins.halfParts, 2);
  // Revenus au-dessus des plafonds
  const rich = cafRights({ ...plan, taxIncome: 9000000 }, h, 1);
  assert.equal(rich.premium, 0);
  assert.equal(rich.baseRate, null);
  // Deuxième enfant : les allocations familiales commencent
  assert.equal(cafRights({ ...plan, existingChildren: 1 }, h, 1).familyAllowance, FAMILY.familyAllowance.two[0]);
});

test('garde : tarif crèche et complément pour assistante maternelle', () => {
  assert.equal(crecheHourly(400000, 1), Math.round(400000 * 0.000619));
  assert.equal(crecheHourly(10, 1), Math.round(FAMILY.psu.floor * 0.000619));
  assert.equal(crecheHourly(5000000, 1), Math.round(FAMILY.psu.ceiling * 0.000619));
  const a = assmatMonthly({ hourly: 550, hoursPerMonth: 173, children: 1, monthlyResources: 300000, babies: 1 });
  assert.equal(a.cost, 550 * 173);
  assert.ok(a.cmg > 0 && a.net < a.cost);
  assert.ok(a.cmg <= FAMILY.cmg.monthlyMax);
});

test('plan bébé complet et comparaison 1 bébé / jumeaux', () => {
  const h = household(285000, 220000);
  const plan = { ...defaultBabyPlan(), dueDate: '2027-03-15', birthParent: 'p2' };
  const one = babyPlan(plan, h, { count: 1, today: '2026-10-19' });
  const two = babyPlan(plan, h, { count: 2, today: '2026-10-19' });
  assert.ok(two.equipmentTotal > one.equipmentTotal);
  assert.ok(two.childcare.cost > one.childcare.cost);
  assert.ok(two.totals.firstYearCosts > one.totals.firstYearCosts);
  assert.equal(one.months[0].month, '2026-10');
  assert.ok(one.months.some((r) => r.equipment > 0));
  assert.ok(one.timeline.some((e) => e.kind === 'birth' && e.date === '2027-03-15'));
  assert.ok(one.savingsTarget >= one.equipmentLeft);
  assert.equal(babyPlan({ ...plan, dueDate: null }, h), null);
  // Un achat coché sort du reste à acheter
  const bought = babyPlan({ ...plan, checklist: { 'siege-auto': { bought: true, actual: 15000 } } }, h, { count: 1, today: '2026-10-19' });
  assert.ok(bought.equipmentLeft < one.equipmentLeft);
  assert.equal(bought.equipmentSpent, 15000);
});

test('prévision du budget commun avec l’arrivée de bébé', () => {
  const s = emptyState();
  s.household = household(285000, 220000);
  s.accounts = [{ id: 'j', name: 'Commun', owner: 'joint', initialBalance: 0 }];
  for (const m of ['2026-07', '2026-08', '2026-09']) s.transactions.push({ id: m, type: 'expense', amount: 150000, date: `${m}-10`, accountId: 'j', categoryId: 'cat-logement', tags: [] });
  const plan = babyPlan({ ...defaultBabyPlan(), dueDate: '2027-03-15', birthParent: 'p2', extraLeaveMonths: { p1: 0, p2: 2 } }, s.household, { count: 1, today: '2026-10-19' });
  const rows = sharedForecast(s, { months: 12, today: '2026-10-19', plan });
  assert.equal(rows[0].base, 150000);
  const after = rows.find((r) => r.month === '2027-08');
  assert.ok(after.total > after.base, 'les dépenses de bébé s’ajoutent au budget commun');
  assert.equal(after.contribution.p1 + after.contribution.p2, after.total);
  // Pendant le congé de naissance de p2 (baisse de revenus), sa part diminue
  const leave = rows.find((r) => r.month === '2027-06');
  assert.ok(leave.ratio.p2 < rows[0].ratio.p2);
});

test('données d’exemple : couple et bébé attendu', async () => {
  const { buildDemoState } = await import('../js/demo.js');
  const { normalizeState } = await import('../js/store.js');
  const today = '2026-10-19';
  const s = normalizeState(buildDemoState(today));
  assert.equal(s.household.enabled, true);
  assert.ok(s.accounts.some((a) => a.owner === 'p2'));
  const ledger = coupleLedger(s);
  assert.ok(ledger.shared > 0 && ledger.personal.p1 > 0 && ledger.personal.p2 > 0);
  assert.ok(ledger.paidShared.p2 > 0, 'Sam paie aussi des dépenses communes');
  const plan = babyPlan(s.baby, s.household, { today });
  assert.ok(plan.savingsTarget > 0 && plan.monthlySaving > 0);
  assert.equal(plan.leave.leaves.filter((l) => l.kind === 'naissance').length, 1);
});

test('conseils famille : épargne bébé, équilibre et partage 50/50', async () => {
  const { recommendations } = await import('../js/insights.js');
  const today = '2026-10-19';
  const s = emptyState();
  s.accounts = [
    { id: 'joint', name: 'Joint', type: 'courant', owner: 'joint', initialBalance: 300000, archived: false, includeInTotal: true },
    { id: 'perso', name: 'Perso', type: 'courant', owner: 'p2', initialBalance: 50000, archived: false, includeInTotal: true },
  ];
  s.household = household(320000, 180000, 'equal');
  const tx = (t) => ({ type: 'expense', tags: [], cleared: false, ...t });
  for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) {
    s.transactions.push(tx({ id: `l-${m}`, date: `${m}-05`, amount: 90000, categoryId: 'cat-logement', accountId: 'joint' }));
    s.transactions.push(tx({ id: `c-${m}`, date: `${m}-10`, amount: 30000, categoryId: 'cat-courses', accountId: 'perso', share: 'shared' }));
  }
  s.baby = { ...defaultBabyPlan(today), dueDate: '2027-03-01' };
  const ids = (st) => recommendations(st, today).map((t) => t.id);
  const first = ids(s);
  assert.ok(first.includes('baby-savings'), 'épargne bébé proposée');
  assert.ok(first.includes('couple-split'), 'partage au prorata suggéré');
  assert.ok(first.some((id) => id.startsWith('couple-balance-')), 'équilibre à régler');
  const tip = recommendations(s, today).find((t) => t.id === 'baby-savings');
  assert.equal(tip.action.type, 'create-goal');
  assert.equal(tip.action.goal.id, 'goal-bebe');
  // Une fois l'objectif créé, le conseil disparaît (et l'objectif récent n'est pas signalé « en retard »).
  s.goals.push({ ...tip.action.goal, contributions: [], archived: false, createdAt: new Date('2026-10-19T10:00:00').getTime() });
  const after = ids(s);
  assert.ok(!after.includes('baby-savings'));
  assert.ok(!after.some((id) => id.startsWith('goals-late')));
});
