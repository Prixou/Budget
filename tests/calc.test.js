import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountBalances,
  amortization,
  balanceSeries,
  borrowingCapacity,
  budgetReport,
  byCategory,
  dueOccurrences,
  endOfMonthForecast,
  filterTransactions,
  goalStats,
  groupSplit,
  loanPayment,
  loanStatus,
  monthlyEquivalent,
  nextOccurrence,
  occurrencesBetween,
  periodRange,
  previousPeriod,
  requiredMonthlySaving,
  savingsProjection,
  suggestBudgets,
  summarize,
} from '../js/calc.js';
import { emptyState } from '../js/defaults.js';

function fixture() {
  const s = emptyState();
  s.accounts = [
    { id: 'a1', name: 'Courant', type: 'courant', initialBalance: 100000 },
    { id: 'a2', name: 'Livret', type: 'epargne', initialBalance: 50000 },
  ];
  s.transactions = [
    { id: 't1', type: 'income', amount: 200000, date: '2026-08-28', accountId: 'a1', categoryId: 'cat-salaire', tags: [] },
    { id: 't2', type: 'expense', amount: 80000, date: '2026-09-05', accountId: 'a1', categoryId: 'cat-logement', tags: [] },
    { id: 't3', type: 'expense', amount: 12000, date: '2026-09-10', accountId: 'a1', categoryId: 'cat-courses', tags: ['bio'] },
    { id: 't4', type: 'transfer', amount: 20000, date: '2026-09-29', accountId: 'a1', toAccountId: 'a2', categoryId: null, tags: [] },
    { id: 't5', type: 'expense', amount: 5000, date: '2026-10-02', accountId: 'a1', categoryId: 'cat-restaurants', tags: [] },
    { id: 't6', type: 'income', amount: 210000, date: '2026-09-28', accountId: 'a1', categoryId: 'cat-salaire', tags: [] },
  ];
  return s;
}

test('soldes des comptes avec virements', () => {
  const s = fixture();
  const b = accountBalances(s, '2026-09-30');
  assert.equal(b.get('a1'), 100000 + 200000 - 80000 - 12000 - 20000 + 210000);
  assert.equal(b.get('a2'), 70000);
  const all = accountBalances(s);
  assert.equal(all.get('a1'), b.get('a1') - 5000);
});

test("série de soldes : les virements internes n'impactent pas le total", () => {
  const s = fixture();
  const series = balanceSeries(s, ['2026-08-31', '2026-09-30']);
  assert.deepEqual(series.map((p) => p.balance), [350000, 350000 - 92000 + 210000]);
});

test('résumé : virements exclus, taux d’épargne', () => {
  const s = fixture();
  const txs = filterTransactions(s, { from: '2026-09-01', to: '2026-09-30' });
  const r = summarize(txs);
  assert.equal(r.income, 210000);
  assert.equal(r.expense, 92000);
  assert.equal(r.net, 118000);
  assert.ok(Math.abs(r.savingsRate - 118000 / 210000) < 1e-9);
});

test('filtres : recherche sans accents, étiquette, catégorie', () => {
  const s = fixture();
  assert.equal(filterTransactions(s, { search: 'LOGEMENT' }).length, 1);
  assert.equal(filterTransactions(s, { tag: 'bio' }).length, 1);
  assert.equal(filterTransactions(s, { categoryId: 'cat-salaire' }).length, 2);
  assert.equal(filterTransactions(s, { accountId: 'a2' }).length, 1);
});

test('répartition par catégorie', () => {
  const s = fixture();
  const rows = byCategory(s, filterTransactions(s, { from: '2026-09-01', to: '2026-09-30' }));
  assert.equal(rows[0].category.id, 'cat-logement');
  assert.ok(Math.abs(rows[0].share - 80000 / 92000) < 1e-9);
});

test('budgets : dépassement, alerte et report du reste', () => {
  const s = fixture();
  s.budgets = {
    'cat-logement': { amount: 80000, rollover: false },
    'cat-courses': { amount: 10000, rollover: false },
    'cat-restaurants': { amount: 10000, rollover: true, rolloverSince: '2026-09' },
  };
  const sept = budgetReport(s, '2026-09', { alertThreshold: 80 });
  const find = (r, id) => r.rows.find((x) => x.category.id === id);
  assert.equal(find(sept, 'cat-courses').status, 'over');
  assert.equal(find(sept, 'cat-logement').status, 'full');
  s.budgets['cat-logement'].amount = 85000;
  assert.equal(find(budgetReport(s, '2026-09', { alertThreshold: 80 }), 'cat-logement').status, 'warning');
  // Octobre : 100 € de report sur les restaurants (rien dépensé en septembre).
  const oct = budgetReport(s, '2026-10');
  const resto = find(oct, 'cat-restaurants');
  assert.equal(resto.carry, 10000);
  assert.equal(resto.available, 20000);
  assert.equal(resto.remaining, 15000);
  // Ajustement ponctuel d'un mois
  s.budgetOverrides = { '2026-09': { 'cat-courses': 20000 } };
  assert.equal(find(budgetReport(s, '2026-09'), 'cat-courses').status, 'ok');
});

test('suggestion de budgets arrondie aux 10 € supérieurs', () => {
  const s = fixture();
  const sug = suggestBudgets(s, 3, '2026-10-15');
  assert.equal(sug['cat-courses'], 4000); // 120 € / 3 = 40 €
  assert.equal(sug['cat-logement'], 27000); // 800 / 3 = 266,67 → 270
});

test('récurrences mensuelles ancrées sur le 31', () => {
  const rule = { id: 'r', type: 'expense', amount: 1000, startDate: '2026-01-31', frequency: 'monthly', lastDate: null, active: true };
  assert.deepEqual(dueOccurrences(rule, '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(nextOccurrence({ ...rule, lastDate: '2026-02-28' }), '2026-03-31');
  assert.deepEqual(occurrencesBetween(rule, '2026-05-01', '2026-07-31'), ['2026-05-31', '2026-06-30', '2026-07-31']);
});

test('récurrences hebdomadaires, date de fin et équivalent mensuel', () => {
  const rule = { id: 'r', type: 'expense', amount: 1200, startDate: '2026-09-01', endDate: '2026-09-20', frequency: 'weekly', lastDate: '2026-09-08', active: true };
  assert.deepEqual(dueOccurrences(rule, '2026-12-31'), ['2026-09-15']);
  assert.equal(nextOccurrence({ ...rule, lastDate: '2026-09-15' }), null);
  assert.equal(monthlyEquivalent({ amount: 1200, frequency: 'yearly' }), 100);
  assert.deepEqual(dueOccurrences({ ...rule, active: false }, '2026-12-31'), []);
});

test('prévision de fin de mois avec les récurrences à venir', () => {
  const s = fixture();
  s.transactions = s.transactions.filter((t) => t.date <= '2026-09-10');
  s.recurring = [
    { id: 'r1', type: 'income', amount: 210000, accountId: 'a1', categoryId: 'cat-salaire', startDate: '2026-08-28', frequency: 'monthly', lastDate: '2026-08-28', active: true, autoCreate: true },
    { id: 'r2', type: 'transfer', amount: 20000, accountId: 'a1', toAccountId: 'a2', startDate: '2026-09-29', frequency: 'monthly', lastDate: null, active: true, autoCreate: true },
  ];
  const f = endOfMonthForecast(s, '2026-09-10');
  assert.equal(f.delta, 210000);
  assert.equal(f.items.length, 2);
});

test('mensualité et tableau d’amortissement', () => {
  const m = loanPayment(20000000, 3.4, 240);
  assert.ok(Math.abs(m - 114967) < 1, `mensualité ${m}`);
  const rows = amortization({ principal: 1000000, rate: 0, months: 10 });
  assert.equal(rows.length, 10);
  assert.equal(rows[9].balance, 0);
  const withInterest = amortization({ principal: 1000000, rate: 5, months: 12, startDate: '2026-01-05' });
  assert.equal(withInterest[11].balance, 0);
  assert.equal(withInterest[1].date, '2026-02-05');
  const total = withInterest.reduce((a, r) => a + r.principal, 0);
  assert.equal(total, 1000000);
});

test('situation d’un crédit à une date', () => {
  const debt = { principal: 1200000, rate: 0, termMonths: 12, startDate: '2026-01-10', insurance: 500 };
  const s = loanStatus(debt, '2026-03-15');
  assert.equal(s.paymentsMade, 3);
  assert.equal(s.remaining, 900000);
  assert.equal(s.monthly, 100500);
  assert.equal(s.endDate, '2026-12-10');
});

test('épargne : intérêts composés et versement nécessaire', () => {
  const rows = savingsProjection({ initial: 100000, monthly: 0, rate: 12, years: 1 });
  assert.equal(rows[rows.length - 1].balance, 112000);
  const noRate = savingsProjection({ initial: 0, monthly: 10000, rate: 0, years: 2 });
  assert.equal(noRate[noRate.length - 1].balance, 240000);
  assert.equal(requiredMonthlySaving({ target: 120000, current: 0, rate: 0, months: 12 }), 10000);
  assert.ok(requiredMonthlySaving({ target: 120000, current: 0, rate: 5, months: 12 }) < 10000);
  assert.equal(requiredMonthlySaving({ target: 1000, current: 5000, rate: 0, months: 12 }), 0);
});

test('capacité d’emprunt à 35 %', () => {
  const r = borrowingCapacity({ income: 400000, charges: 20000, maxRatio: 35, rate: 0, months: 100 });
  assert.equal(r.maxPayment, 120000);
  assert.equal(r.capital, 12000000);
});

test('objectif d’épargne : effort mensuel', () => {
  const goal = { target: 120000, deadline: '2027-03-01', contributions: [{ amount: 20000, date: '2026-08-01' }, { amount: 10000, date: '2026-09-01' }] };
  const s = goalStats(goal, '2026-09-15');
  assert.equal(s.saved, 30000);
  assert.equal(s.monthsLeft, 6);
  assert.equal(s.monthlyNeeded, 15000);
  assert.equal(s.done, false);
  assert.ok(s.projectedDate);
});

test('répartition 50/30/20', () => {
  const s = fixture();
  const split = groupSplit(s, filterTransactions(s, { from: '2026-09-01', to: '2026-09-30' }));
  assert.equal(split.needs, 92000);
  assert.equal(split.wants, 0);
  assert.equal(split.savings, 210000 - 92000);
});

test('périodes et période précédente', () => {
  assert.deepEqual(periodRange('last-3', { transactions: [] }, '2026-09-30'), { from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(previousPeriod('2026-07-01', '2026-09-30'), { from: '2026-04-01', to: '2026-06-30' });
  assert.deepEqual(previousPeriod('2026-09-10', '2026-09-19'), { from: '2026-08-31', to: '2026-09-09' });
});
