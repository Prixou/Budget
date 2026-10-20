import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanLine, findAmount, findDates, mergeCaptures, parseCapture } from '../js/capture.js';

const TODAY = '2026-10-20';
const brief = (rows) => rows.map((r) => `${r.date} ${r.type === 'income' ? '+' : '-'}${r.amount} ${r.description}`);

test('montants : signes, milliers, devise, confusions de lecture', () => {
  assert.deepEqual(
    ['-23,45 €', '− 23,45€', '+1 900,00 €', '1.234,56 EUR', '€12.50', 'Total 12,00'].map((l) => {
      const a = findAmount(cleanLine(l));
      return a && `${a.sign || ''}${a.cents}`;
    }),
    ['-2345', '-2345', '+190000', '123456', '1250', '1200'],
  );
  assert.equal(findAmount(cleanLine('Uber Eats -2O,5O €')).cents, 2050);
  assert.equal(findAmount('Carte X1234 le 17/10'), null, 'ni carte ni date ne sont des montants');
  assert.equal(findAmount('Ticket 12,50 n°45'), null, 'montant sans devise au milieu du texte');
});

test('dates : en-têtes relatifs, textuels, numériques, année déduite', () => {
  const d = (l, today = TODAY) => findDates(cleanLine(l), today).map((x) => x.date);
  assert.deepEqual(d("Aujourd'hui"), ['2026-10-20']);
  assert.deepEqual(d('Hier'), ['2026-10-19']);
  assert.deepEqual(d('Lundi 13 octobre'), ['2026-10-13']);
  assert.deepEqual(d('19 oct. 2026'), ['2026-10-19']);
  assert.deepEqual(d('1er nov.'), ['2025-11-01'], 'pas dans le futur : année précédente');
  assert.deepEqual(d('28 décembre', '2027-01-05'), ['2026-12-28']);
  assert.deepEqual(d('18/10/2026'), ['2026-10-18']);
  assert.deepEqual(d('31/02'), [], 'date impossible');
});

test('capture type : en-têtes de date, montants sur la ligne, synthèse ignorée', () => {
  const text = `Mes opérations
Solde disponible 1 234,56 €
Aujourd'hui
CB CARREFOUR CITY 19/10 -23,45 €
Courses
PRLV SEPA FREE MOBILE -15,99 €
Hier
VIR SEPA RECU SALAIRE OCTOBRE +1 900,00 €
Lundi 13 octobre
Boulangerie Paul - 4,80 €
Netflix —13,49 €`;
  const { rows, ignored } = parseCapture(text, { today: TODAY });
  assert.deepEqual(brief(rows), [
    '2026-10-19 -2345 CB CARREFOUR CITY',
    '2026-10-20 -1599 PRLV SEPA FREE MOBILE',
    '2026-10-19 +190000 VIR SEPA RECU SALAIRE OCTOBRE',
    '2026-10-13 -480 Boulangerie Paul',
    '2026-10-13 -1349 Netflix',
  ]);
  assert.ok(ignored.some((l) => l.startsWith('Solde')));
  assert.ok(rows.every((r) => !r.signGuessed));
});

test('capture type : montant sur sa propre ligne, sans signe', () => {
  const text = `19 oct. 2026
Amazon
Achat en ligne
42,90 €
Virement de Marie
150,00 €
18/10/2026
Spotify 12,50 €`;
  const { rows } = parseCapture(text, { today: TODAY });
  assert.deepEqual(brief(rows), ['2026-10-19 -4290 Amazon', '2026-10-19 +15000 Virement de Marie', '2026-10-18 -1250 Spotify']);
  assert.ok(rows.every((r) => r.signGuessed));
});

test('plusieurs captures : les opérations en double sont fusionnées', () => {
  const a = parseCapture('Hier\nNetflix -13,49 €\nUber -8,20 €', { today: TODAY }).rows;
  const b = parseCapture('Hier\nUber -8,20 €\nLidl -31,07 €', { today: TODAY }).rows;
  assert.deepEqual(mergeCaptures([a, b]).map((r) => r.description), ['Netflix', 'Uber', 'Lidl']);
});

test('le solde affiché en haut de l’écran n’est pas une opération', () => {
  const text = `Compte courant
1 234,56 €
Aujourd'hui
CB CARREFOUR CITY -23,45 €`;
  const { rows, ignored } = parseCapture(text, { today: TODAY });
  assert.deepEqual(brief(rows), ['2026-10-20 -2345 CB CARREFOUR CITY']);
  assert.ok(ignored.includes('1 234,56 €'));
});

test('catégorie devinée d’après le libellé', async () => {
  const { guessCategory } = await import('../js/capture.js');
  assert.equal(guessCategory('CB CARREFOUR CITY', 'expense'), 'cat-courses');
  assert.equal(guessCategory('Lid! Montpellier', 'expense'), 'cat-courses');
  assert.equal(guessCategory('PRLV SEPA FREE MOBILE', 'expense'), 'cat-telecom');
  assert.equal(guessCategory('VIR SEPA SALAIRE OCTOBRE', 'income'), 'cat-salaire');
  assert.equal(guessCategory('Garage Dupont', 'expense'), null);
});
