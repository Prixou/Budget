import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectDelimiter, guessMapping, learnCategories, markDuplicates, parseCSV, rowsToTransactions, toCSV } from '../js/csv.js';
import { defaultCategories } from '../js/defaults.js';

test('analyse un CSV bancaire français (point-virgule, guillemets)', () => {
  const text = '﻿Date;Libellé;Montant\r\n30/09/2026;"CB SUPERMARCHE; PARIS";-45,20\r\n28/09/2026;VIR SALAIRE;"2 480,00"\r\n';
  assert.equal(detectDelimiter(text), ';');
  const rows = parseCSV(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'CB SUPERMARCHE; PARIS');
  const mapping = guessMapping(rows[0]);
  assert.deepEqual(mapping, { date: 0, description: 1, amount: 2 });
  const { transactions, errors } = rowsToTransactions(rows, mapping, { accountId: 'a1' });
  assert.equal(errors.length, 0);
  assert.equal(transactions[0].type, 'expense');
  assert.equal(transactions[0].amount, 4520);
  assert.equal(transactions[1].type, 'income');
  assert.equal(transactions[1].amount, 248000);
});

test('colonnes débit / crédit séparées', () => {
  const rows = parseCSV('Date opération,Libellé,Débit,Crédit\n2026-09-01,Loyer,820.00,\n2026-09-02,Remboursement,,12.5\n2026-09-03,Ligne vide,,\n');
  const mapping = guessMapping(rows[0]);
  assert.equal(mapping.debit, 2);
  assert.equal(mapping.credit, 3);
  const { transactions, errors } = rowsToTransactions(rows, mapping, { accountId: 'a1' });
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].amount, 82000);
  assert.equal(transactions[1].type, 'income');
  assert.equal(errors.length, 1);
});

test('catégories apprises et doublons repérés', () => {
  const cats = defaultCategories();
  const history = [{ type: 'expense', description: 'Boulangerie', categoryId: 'cat-courses', accountId: 'a1', date: '2026-09-01', amount: 350 }];
  const learned = learnCategories([{ type: 'expense', description: 'boulangerie', categoryId: null, accountId: 'a1', date: '2026-09-01', amount: 350 }], history);
  assert.equal(learned[0].categoryId, 'cat-courses');
  const marked = markDuplicates(learned, history);
  assert.equal(marked[0].duplicate, true);
  assert.ok(cats.length > 20);
});

test('export CSV échappe les séparateurs', () => {
  const csv = toCSV([['a;b', 'c"d', 'e']]);
  assert.equal(csv, '﻿"a;b";"c""d";e');
});
