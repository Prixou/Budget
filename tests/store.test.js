import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { dueOccurrences } from '../js/calc.js';
import { buildDemoState } from '../js/demo.js';
import { normalizeState } from '../js/store.js';

test('normalizeState rejette un fichier invalide', () => {
  assert.throws(() => normalizeState(null));
  assert.throws(() => normalizeState('texte'));
});

test('normalizeState nettoie les données importées', () => {
  const state = normalizeState({
    accounts: [{ id: 'a1', name: 'Compte', initialBalance: '1000' }, { name: 'sans id' }],
    transactions: [
      { id: 't1', type: 'expense', amount: -500, date: '2026-09-01', accountId: 'a1', categoryId: 'inconnue' },
      { id: 't2', type: 'expense', amount: 500, date: '2026-13-01', accountId: 'a1' },
      { id: 't3', type: 'transfer', amount: 500, date: '2026-09-01', accountId: 'a1', toAccountId: 'a1' },
      { id: 't4', type: 'bizarre', amount: 500, date: '2026-09-01', accountId: 'a1' },
    ],
    budgets: { 'cat-courses': { amount: '30000' }, fantome: { amount: 1 } },
  });
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0].initialBalance, 1000);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].amount, 500);
  assert.equal(state.transactions[0].categoryId, null);
  assert.deepEqual(Object.keys(state.budgets), ['cat-courses']);
  assert.ok(state.categories.length > 0);
});

test('les données de démonstration sont cohérentes', () => {
  const today = '2026-09-30';
  const demo = buildDemoState(today);
  const state = normalizeState(demo);
  assert.equal(state.transactions.length, demo.transactions.length, 'aucune opération rejetée');
  assert.ok(state.transactions.length > 150);
  assert.ok(state.transactions.every((t) => t.date <= today));
  // Les récurrences automatiques sont à jour : rien à générer au démarrage.
  const due = state.recurring.filter((r) => r.autoCreate).flatMap((r) => dueOccurrences(r, today));
  assert.equal(due.length, 0);
  // Une récurrence manuelle a une échéance à valider.
  assert.ok(state.recurring.some((r) => !r.autoCreate && dueOccurrences(r, today).length === 1));
  assert.equal(JSON.stringify(buildDemoState(today)), JSON.stringify(demo), 'déterministe');
});

test('le service worker met en cache tous les modules', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [
    ...readdirSync(new URL('../js', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...readdirSync(new URL('../js/views', import.meta.url)).map((f) => `js/views/${f}`),
  ];
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `${f} absent de sw.js`);
});

test('index.html précharge tous les modules', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const files = [
    ...readdirSync(new URL('../js', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...readdirSync(new URL('../js/views', import.meta.url)).map((f) => `js/views/${f}`),
  ];
  for (const f of files) assert.ok(html.includes(`<link rel="modulepreload" href="${f}">`), `${f} non préchargé`);
});
