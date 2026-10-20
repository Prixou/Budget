import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benefitAccepts, benefitBalances, benefitExpiry, nextCreditDate, spentOn, voucherCredit } from '../js/benefits.js';
import { emptyState } from '../js/defaults.js';
import { cashForecast, recommendations } from '../js/insights.js';

test('titres-restaurant : échéance du solde et dépenses acceptées', () => {
  assert.equal(benefitExpiry('restaurant', '2026-10-20'), '2027-02-28');
  assert.equal(benefitExpiry('restaurant', '2027-02-10'), '2027-02-28', 'en février, le solde de l’année précédente expire');
  assert.equal(benefitExpiry('restaurant', '2028-01-05'), '2028-02-29', 'année bissextile');
  assert.equal(benefitExpiry('cesu', '2026-10-20'), '2027-01-31');
  assert.equal(benefitExpiry('vacances', '2026-10-20'), null);
  assert.equal(benefitAccepts('restaurant', 'cat-restaurants', '2027-03-01'), true);
  assert.equal(benefitAccepts('restaurant', 'cat-courses', '2026-12-31'), true);
  assert.equal(benefitAccepts('restaurant', 'cat-courses', '2027-01-01'), false, 'courses : dérogation jusqu’au 31/12/2026');
  assert.equal(benefitAccepts('restaurant', 'cat-shopping', '2026-10-20'), false);
  assert.equal(benefitAccepts('cesu', 'cat-enfants'), true);
});

test('titres-restaurant : crédit mensuel et part de l’employeur', () => {
  const c = voucherCredit({ count: 18, value: 1000, employerShare: 60 });
  assert.deepEqual(c, { total: 18000, employer: 10800, employee: 7200, exempt: true });
  assert.equal(voucherCredit({ count: 10, value: 1500, employerShare: 60 }).exempt, false, '9 € de part patronale > 7,32 €');
  assert.equal(nextCreditDate(3, '2026-10-20'), '2026-11-03');
  assert.equal(nextCreditDate(25, '2026-10-20'), '2026-10-25');
  assert.equal(nextCreditDate(1, '2026-12-15'), '2027-01-01');
});

test('soldes des avantages, plafond journalier et disponible à dépenser', () => {
  const s = emptyState();
  s.accounts = [
    { id: 'cc', name: 'Courant', type: 'courant', initialBalance: 100000, archived: false, includeInTotal: true },
    { id: 'tr', name: 'Titres', type: 'avantages', benefit: 'restaurant', initialBalance: 8000, archived: false, includeInTotal: true },
    { id: 'cv', name: 'Chèques-vacances', type: 'avantages', benefit: 'vacances', initialBalance: 20000, archived: false, includeInTotal: true },
  ];
  const tx = (id, accountId, amount, categoryId, date = '2026-10-18') => ({ id, type: 'expense', accountId, amount, categoryId, date, tags: [] });
  s.transactions = [tx('a', 'tr', 1200, 'cat-restaurants'), tx('b', 'tr', 800, 'cat-courses'), tx('c', 'cc', 9000, 'cat-courses', '2026-10-10')];
  const b = benefitBalances(s, '2026-10-20');
  assert.equal(b.meal, 6000);
  assert.equal(b.total, 26000);
  assert.equal(spentOn(s, 'tr', '2026-10-18'), 2000);
  assert.equal(spentOn(s, 'tr', '2026-10-18', 'a'), 800);
  const f = cashForecast(s, '2026-10-20');
  assert.equal(f.start, 91000, 'les titres ne sont pas comptés dans la trésorerie bancaire');
  assert.equal(f.benefits.meal, 6000);
  const tip = recommendations(s, '2026-10-20').find((t) => t.id.startsWith('meal-vouchers'));
  assert.ok(tip, 'conseil titres-restaurant');
  assert.match(tip.text, /90 € de courses par carte/);
});
