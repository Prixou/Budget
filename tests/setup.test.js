import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueOccurrences } from '../js/calc.js';
import { buildSetupState, emptyAnswers, setupChecklist, starterBudgets } from '../js/setup.js';
import { normalizeState } from '../js/store.js';

const TODAY = '2026-10-20';

test('assistant : budget d’une personne', () => {
  const a = emptyAnswers();
  Object.assign(a, { names: ['Léa', ''], incomes: [210000, 0], payDay: 28, main: 85000 });
  a.fixed = { logement: { amount: 72000, day: 5 }, internet: { amount: 2999, day: 12 } };
  const s = normalizeState(buildSetupState(a, { today: TODAY }));
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.settings.demo, false);
  assert.equal(s.household.enabled, false);
  assert.equal(s.household.partners[0].name, 'Léa');
  assert.deepEqual(s.accounts.map((x) => [x.name, x.initialBalance]), [['Compte courant', 85000]]);
  const salary = s.recurring.find((r) => r.categoryId === 'cat-salaire');
  assert.equal(salary.amount, 210000);
  assert.equal(salary.startDate, '2026-10-28');
  const rent = s.recurring.find((r) => r.categoryId === 'cat-logement');
  assert.equal(rent.startDate, '2026-11-05', 'le loyer d’octobre est déjà dans le solde');
  assert.equal(s.recurring.flatMap((r) => dueOccurrences(r, TODAY)).length, 0, 'rien à rattraper au démarrage');
  // Reste 2 100 − 720 − 29,99 = 1 350,01 € : budgets plafonnés par adulte, le surplus reste à épargner.
  const total = Object.values(s.budgets).reduce((t, b) => t + b.amount, 0);
  assert.equal(total, 85000);
  assert.equal(s.budgets['cat-courses'].amount, 30000);
});

test('assistant : couple, comptes personnels, livret, titres-restaurant', () => {
  const a = emptyAnswers();
  Object.assign(a, { couple: true, names: ['Alex', 'Sam'], incomes: [285000, 220000], payDay: 27, main: 120000, personal: [null, 40000] });
  a.savings = { product: 'livretA', label: 'Livret A', balance: 500000 };
  a.vouchers = { owner: 'p2', count: 20, value: 900, share: 50, day: 1, balance: 4500 };
  a.fixed = { logement: { amount: 95000, day: 5 } };
  a.saving = 20000;
  a.budgets = { 'cat-courses': 60000 };
  const s = normalizeState(buildSetupState(a, { today: TODAY }));
  assert.equal(s.household.enabled, true);
  assert.deepEqual(s.household.partners.map((p) => [p.name, p.income]), [['Alex', 285000], ['Sam', 220000]]);
  assert.deepEqual(s.accounts.map((x) => [x.name, x.type, x.owner]), [
    ['Compte joint', 'courant', 'joint'],
    ['Compte de Sam', 'courant', 'p2'],
    ['Livret A', 'epargne', 'p1'],
    ['Titres-restaurant Sam', 'avantages', 'p2'],
  ]);
  const byDesc = new Map(s.recurring.map((r) => [r.description, r]));
  assert.equal(byDesc.get('Salaire Alex').accountId, s.accounts[0].id, 'pas de compte personnel : salaire sur le joint');
  assert.equal(byDesc.get('Salaire Sam').accountId, s.accounts[1].id);
  assert.equal(byDesc.get('Épargne automatique').toAccountId, s.accounts[2].id);
  assert.equal(byDesc.get('Crédit titres-restaurant').amount, 18000);
  assert.equal(byDesc.get('Loyer ou crédit immobilier').share, 'shared');
  assert.deepEqual(Object.keys(s.budgets), ['cat-courses']);
  assert.ok(s.categories.some((c) => c.id === 'cat-avantages'));
});

test('budgets de départ et étapes de prise en main', () => {
  const a = emptyAnswers();
  a.incomes = [200000, 0];
  a.fixed = { logement: { amount: 100000 } };
  a.saving = 20000;
  const b = starterBudgets(a);
  const total = Object.values(b).reduce((t, v) => t + v, 0);
  assert.ok(total <= 80000 && total >= 75000, `total ${total}`);
  assert.ok(Object.values(b).every((v) => v % 1000 === 0), 'arrondis à 10 €');
  const s = normalizeState(buildSetupState(a, { today: TODAY }));
  const steps = setupChecklist(s);
  assert.deepEqual(steps.filter((x) => x.done).map((x) => x.id), ['accounts', 'fixed', 'budgets']);
});
