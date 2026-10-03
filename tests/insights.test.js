import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState } from '../js/defaults.js';
import { buildDemoState } from '../js/demo.js';
import {
  baseline,
  cashForecast,
  detectRecurring,
  earlyRepayment,
  healthScore,
  marketMortgageRate,
  merchantKey,
  payoffPlan,
  potentialGain,
  prepaymentPenalty,
  recommendations,
  spendingTrends,
  unusualExpenses,
} from '../js/insights.js';
import { normalizeState } from '../js/store.js';
import { addDays, addMonths } from '../js/utils.js';

const TODAY = '2026-10-03';

function base() {
  const s = emptyState();
  s.accounts = [
    { id: 'c', name: 'Courant', type: 'courant', initialBalance: 100000 },
    { id: 'l', name: 'Livret A', type: 'epargne', product: 'livretA', initialBalance: 0 },
  ];
  return s;
}

let n = 0;
const tx = (date, amount, description, extra = {}) => ({ id: `t${++n}`, type: 'expense', amount, date, accountId: 'c', categoryId: 'cat-divers', description, tags: [], createdAt: n, ...extra });

test('merchantKey retire le bruit bancaire', () => {
  assert.equal(merchantKey('PRLV SEPA NETFLIX 12/09/2026'), 'netflix');
  assert.equal(merchantKey('CB Plateforme vidéo 2'), 'plateforme video');
  assert.equal(merchantKey('VIR SEPA EMIS DE M. DUPONT'), 'dupont');
});

test('détection d’un abonnement mensuel à montant stable', () => {
  const s = base();
  for (let i = 0; i < 6; i++) s.transactions.push(tx(addMonths('2026-04-12', i), 1349 + (i % 2), `PRLV NETFLIX ${i}`));
  // Achats irréguliers au même marchand : ne doivent pas être pris pour un abonnement
  for (const [d, a] of [['2026-05-02', 4210], ['2026-05-05', 1500], ['2026-05-20', 9100], ['2026-06-01', 2300]]) s.transactions.push(tx(d, a, 'CB SUPERMARCHE'));
  const found = detectRecurring(s, TODAY);
  assert.equal(found.length, 1);
  assert.equal(found[0].cadence, 'monthly');
  assert.equal(found[0].count, 6);
  assert.equal(found[0].yearly, found[0].amount * 12);
  // Déjà suivi par une règle : plus détecté
  s.recurring.push({ id: 'r', type: 'expense', amount: 1349, description: 'Netflix', startDate: '2026-04-12', frequency: 'monthly', active: true });
  assert.equal(detectRecurring(s, TODAY).length, 0);
});

test('tendances et dépenses inhabituelles', () => {
  const s = base();
  for (let d = 0; d <= 120; d += 3) s.transactions.push(tx(addDays(TODAY, -d - 1), d < 30 ? 4000 : 2000, 'Restaurant', { categoryId: 'cat-restaurants' }));
  s.transactions.push(tx(addDays(TODAY, -2), 50000, 'Restaurant gastronomique', { categoryId: 'cat-restaurants' }));
  const unusual = unusualExpenses(s, TODAY);
  assert.equal(unusual.length, 1);
  assert.equal(unusual[0].tx.amount, 50000);
  const trends = spendingTrends(s, TODAY, { exclude: new Set(unusual.map((u) => u.tx.id)) });
  assert.equal(trends[0].category.id, 'cat-restaurants');
  assert.ok(Math.abs(trends[0].ratio - 1) < 0.01, `hausse ${trends[0].ratio}`);
});

test('prévision de trésorerie : récurrences et dépenses variables', () => {
  const s = base();
  // 90 jours d'historique : 10 € de dépenses variables par jour
  for (let d = 0; d < 90; d++) s.transactions.push(tx(addDays(TODAY, -d), 1000, 'Divers'));
  s.recurring.push({ id: 'loyer', type: 'expense', amount: 50000, accountId: 'c', description: 'Loyer', startDate: '2026-10-05', frequency: 'monthly', lastDate: null, active: true, autoCreate: true });
  const f = cashForecast(s, TODAY, 30);
  assert.equal(f.dailyVariable, 1000);
  assert.equal(f.start, 100000 - 90 * 1000);
  assert.equal(f.points.length, 31);
  assert.equal(f.points[2].balance, f.start - 2 * 1000 - 50000); // 5 octobre
  assert.ok(f.min.balance < 0);
  // Disponible à dépenser d'ici la fin du mois = solde − loyer
  assert.equal(f.available, f.start - 50000);
});

test('IRA : plafonds légaux immobilier et consommation', () => {
  // Immobilier : min(6 mois d'intérêts sur la somme remboursée, 3 % du capital restant dû)
  assert.equal(prepaymentPenalty({ kind: 'immobilier', rate: 4 }, 1000000, 10000000, 200, 0), 20000);
  assert.equal(prepaymentPenalty({ kind: 'immobilier', rate: 4 }, 10000000, 10000000, 200, 0), 200000);
  // Consommation : gratuit jusqu'à 10 000 €, puis 1 % (0,5 % à moins d'un an)
  assert.equal(prepaymentPenalty({ kind: 'conso', rate: 6 }, 900000, 2000000, 30, 100000), 0);
  assert.equal(prepaymentPenalty({ kind: 'auto', rate: 6 }, 1500000, 2000000, 30, 100000), 15000);
  assert.equal(prepaymentPenalty({ kind: 'auto', rate: 6 }, 1500000, 2000000, 10, 100000), 7500);
  assert.equal(prepaymentPenalty({ kind: 'auto', rate: 6 }, 1500000, 2000000, 30, 5000), 5000);
});

test('remboursement anticipé : réduction de durée ou de mensualité', () => {
  const debt = { id: 'd', name: 'Prêt', kind: 'conso', principal: 2000000, rate: 6, termMonths: 60, startDate: '2026-01-10', insurance: 1000 };
  const duration = earlyRepayment(debt, { amount: 500000, mode: 'duration', today: TODAY });
  assert.equal(duration.penalty, 0);
  assert.ok(duration.newMonths < duration.monthsLeft);
  assert.equal(duration.newPayment, duration.payment);
  assert.ok(duration.interestSaved > 0 && duration.insuranceSaved > 0);
  const payment = earlyRepayment(debt, { amount: 500000, mode: 'payment', today: TODAY });
  assert.equal(payment.newMonths, payment.monthsLeft);
  assert.ok(payment.newPayment < payment.payment);
  assert.ok(duration.interestSaved > payment.interestSaved, 'réduire la durée économise plus d’intérêts');
  // Un crédit à 1 % : mieux vaut garder l'épargne au Livret A (1,7 %)
  const cheap = earlyRepayment({ ...debt, rate: 1, insurance: 0 }, { amount: 500000, today: TODAY });
  assert.equal(cheap.worthIt, false);
});

test('stratégies avalanche et boule de neige', () => {
  const debts = [
    { id: 'a', name: 'Carte', kind: 'conso', principal: 300000, rate: 18, termMonths: 36, startDate: '2026-01-05' },
    { id: 'b', name: 'Auto', kind: 'auto', principal: 1200000, rate: 5, termMonths: 60, startDate: '2026-01-05' },
    { id: 'c', name: 'Petit prêt', kind: 'conso', principal: 100000, rate: 8, termMonths: 24, startDate: '2026-01-05' },
  ];
  const none = payoffPlan(debts, { extra: 0, today: TODAY, rollover: false });
  const avalanche = payoffPlan(debts, { extra: 20000, strategy: 'avalanche', today: TODAY });
  const snowball = payoffPlan(debts, { extra: 20000, strategy: 'snowball', today: TODAY });
  assert.ok(avalanche.months < none.months);
  assert.ok(avalanche.interest <= snowball.interest, 'l’avalanche coûte le moins d’intérêts');
  assert.equal(snowball.order[0].id, 'c', 'la boule de neige solde d’abord la plus petite dette');
  assert.equal(avalanche.order.length, 3);
});

test('taux de marché immobilier interpolé selon la durée', () => {
  assert.equal(marketMortgageRate(10), 3.4);
  assert.equal(marketMortgageRate(25), 4.2);
  assert.ok(Math.abs(marketMortgageRate(20) - 3.8) < 1e-9);
});

test('score de santé et conseils sur les données d’exemple', () => {
  const s = normalizeState(buildDemoState(TODAY));
  const b = baseline(s, TODAY);
  assert.ok(b.income > 0 && b.expense > 0);
  const h = healthScore(s, TODAY, b);
  assert.ok(h.score >= 0 && h.score <= 100);
  assert.equal(h.pillars.length, 4);
  assert.ok(h.pillars.every((p) => p.indicators.length === 2));
  const tips = recommendations(s, TODAY, b);
  const ids = tips.map((t) => t.id);
  assert.ok(ids.includes('detected-subscriptions'), 'abonnements non suivis détectés');
  assert.ok(ids.some((id) => id.startsWith('unusual-')), 'dépense inhabituelle signalée');
  assert.ok(tips.every((t) => ['high', 'medium', 'low'].includes(t.severity) && t.title && t.text));
  // Tri : importance décroissante
  const order = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < tips.length; i++) assert.ok(order[tips[i - 1].severity] <= order[tips[i].severity]);
  // Masquer un conseil le retire du potentiel
  const withGain = tips.find((t) => t.gain > 0);
  if (withGain) {
    s.settings.dismissedTips = [withGain.id];
    const after = recommendations(s, TODAY, b);
    assert.ok(potentialGain(after) < potentialGain(tips));
  }
});

test('score indisponible sans historique', () => {
  const h = healthScore(base(), TODAY);
  assert.equal(h.score, null);
});
