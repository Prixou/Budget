import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthSavings, plannedMonthlySavings, savingsFlow } from '../js/calc.js';
import { emptyState } from '../js/defaults.js';

function fixture() {
  const s = emptyState();
  s.accounts = [
    { id: 'cc', name: 'Courant', type: 'courant', initialBalance: 0 },
    { id: 'joint', name: 'Joint', type: 'courant', initialBalance: 0 },
    { id: 'livret', name: 'Livret A', type: 'epargne', initialBalance: 0 },
    { id: 'pea', name: 'PEA', type: 'investissement', initialBalance: 0 },
  ];
  const rule = (id, type, amount, extra = {}) => ({ id, type, amount, accountId: 'cc', toAccountId: null, categoryId: null, description: id, frequency: 'monthly', startDate: '2026-01-01', endDate: null, lastDate: null, autoCreate: false, active: true, tags: [], ...extra });
  s.recurring = [
    rule('salaire', 'income', 190000, { startDate: '2026-10-30', categoryId: 'cat-salaire' }),
    rule('loyer', 'expense', 30000, { startDate: '2026-11-01', categoryId: 'cat-logement' }),
    rule('apport', 'transfer', 120000, { startDate: '2026-11-01', toAccountId: 'livret' }),
    rule('pea', 'transfer', 60000, { startDate: '2026-11-15', toAccountId: 'pea', frequency: 'quarterly' }),
    rule('joint', 'transfer', 50000, { toAccountId: 'joint' }),
    rule('pause', 'transfer', 10000, { toAccountId: 'livret', active: false }),
  ];
  return s;
}

test('virements : vers l’épargne, retrait, entre comptes courants', () => {
  const s = fixture();
  const accounts = new Map(s.accounts.map((a) => [a.id, a]));
  assert.equal(savingsFlow({ type: 'transfer', amount: 5000, accountId: 'cc', toAccountId: 'livret' }, accounts), 5000);
  assert.equal(savingsFlow({ type: 'transfer', amount: 5000, accountId: 'livret', toAccountId: 'cc' }, accounts), -5000);
  assert.equal(savingsFlow({ type: 'transfer', amount: 5000, accountId: 'cc', toAccountId: 'joint' }, accounts), 0);
  assert.equal(savingsFlow({ type: 'transfer', amount: 5000, accountId: 'livret', toAccountId: 'pea' }, accounts), 0);
  assert.equal(savingsFlow({ type: 'expense', amount: 5000, accountId: 'cc' }, accounts), 0);
});

test('reste à vivre : l’épargne programmée est déduite', () => {
  const s = fixture();
  // 1 200 € par mois vers le livret + 600 € par trimestre vers le PEA ; le virement vers le joint et la règle en pause ne comptent pas.
  assert.equal(plannedMonthlySavings(s), 120000 + 20000);
  // Novembre vu le 20 octobre : apport (1er) et PEA (15) encore à venir.
  assert.deepEqual(monthSavings(s, '2026-11', '2026-10-20'), { done: 0, planned: 180000, total: 180000 });
  // Mi-novembre : l'apport du 1er a été fait, le PEA du 15 aussi ; un retrait de 100 € du livret est déduit.
  s.transactions = [
    { id: 't1', type: 'transfer', amount: 120000, date: '2026-11-01', accountId: 'cc', toAccountId: 'livret', recurringId: 'apport', tags: [] },
    { id: 't2', type: 'transfer', amount: 10000, date: '2026-11-10', accountId: 'livret', toAccountId: 'cc', tags: [] },
  ];
  s.recurring.find((r) => r.id === 'apport').lastDate = '2026-11-01';
  assert.deepEqual(monthSavings(s, '2026-11', '2026-11-12'), { done: 110000, planned: 60000, total: 170000 });
  // Mois passé : seulement ce qui a été fait.
  assert.equal(monthSavings(s, '2026-11', '2026-12-05').planned, 0);
});
