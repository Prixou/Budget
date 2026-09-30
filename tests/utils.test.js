import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, escapeHtml, formatMoney, html, monthDiff, monthRange, parseAmount, parseFlexibleDate, raw, shiftMonth } from '../js/utils.js';

test('parseAmount lit les formats français et anglais', () => {
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('1 234,56'), 123456);
  assert.equal(parseAmount('1 234,56 €'), 123456);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('1234.5'), 123450);
  assert.equal(parseAmount('-42'), -4200);
  assert.equal(parseAmount('42-'), -4200);
  assert.equal(parseAmount('(15,00)'), -1500);
  assert.equal(parseAmount('+3'), 300);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('0,1'), 10);
  assert.equal(parseAmount(19.99), 1999);
});

test('addMonths ramène le jour à la fin du mois', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2026-05-10', -17), '2024-12-10');
});

test('mois : décalage, écart et plage', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthDiff('2025-11', '2026-02'), 3);
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('parseFlexibleDate comprend les formats bancaires', () => {
  assert.equal(parseFlexibleDate('30/09/2026'), '2026-09-30');
  assert.equal(parseFlexibleDate('2026-09-30'), '2026-09-30');
  assert.equal(parseFlexibleDate('01.02.26'), '2026-02-01');
  assert.equal(parseFlexibleDate('09/30/2026'), '2026-09-30');
  assert.equal(parseFlexibleDate('31/02/2026'), null);
  assert.equal(parseFlexibleDate('hier'), null);
});

test('formatMoney utilise le format français', () => {
  const out = formatMoney(123456).replace(/[  ]/g, ' ');
  assert.equal(out, '1 234,56 €');
  assert.match(formatMoney(-500), /^−5,00/);
  assert.match(formatMoney(500, { sign: 'always' }), /^\+5,00/);
});

test('html échappe les valeurs interpolées', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<b>${name}</b>`), `<b>${escapeHtml(name)}</b>`);
  assert.equal(String(html`<b>${raw('<i>ok</i>')}</b>`), '<b><i>ok</i></b>');
  assert.equal(String(html`${['a', '<']}`), 'a&lt;');
});
