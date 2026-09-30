// Jeu de données de démonstration réaliste (8 mois d'historique), déterministe.
import { dueOccurrences, loanPayment, transactionFromRule } from './calc.js';
import { emptyState } from './defaults.js';
import { addDays, addMonths, daysInMonth, monthKey, monthRange, shiftMonth } from './utils.js';

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoState(today) {
  const rand = mulberry32(20260930);
  const between = (min, max) => Math.round((min + rand() * (max - min)) * 100);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const chance = (p) => rand() < p;

  const state = emptyState();
  state.settings.demo = true;
  state.settings.onboarded = true;

  const thisMonth = monthKey(today);
  const firstMonth = shiftMonth(thisMonth, -7);
  const start = `${firstMonth}-01`;

  state.accounts = [
    { id: 'acc-courant', name: 'Compte courant', type: 'courant', initialBalance: 184000, archived: false, includeInTotal: true, createdAt: 1 },
    { id: 'acc-livret', name: 'Livret A', type: 'epargne', initialBalance: 450000, archived: false, includeInTotal: true, createdAt: 2 },
    { id: 'acc-especes', name: 'Porte-monnaie', type: 'especes', initialBalance: 6000, archived: false, includeInTotal: true, createdAt: 3 },
    { id: 'acc-pea', name: 'PEA', type: 'investissement', initialBalance: 215000, archived: false, includeInTotal: true, createdAt: 4 },
  ];

  let createdAt = 1000;
  const txs = [];
  const add = (tx) => {
    txs.push({ id: `tx-demo-${txs.length + 1}`, notes: '', tags: [], cleared: false, recurringId: null, toAccountId: null, createdAt: createdAt++, ...tx });
  };

  // Crédit auto suivi dans « Dettes & crédits » et prélevé chaque mois.
  const loanStart = addMonths(`${shiftMonth(thisMonth, -19)}-05`, 0);
  const loan = { id: 'debt-auto', name: 'Prêt auto', kind: 'auto', lender: 'Banque', principal: 1400000, rate: 4.2, termMonths: 60, startDate: loanStart, insurance: 900, notes: '' };
  const loanMonthly = Math.round(loanPayment(loan.principal, loan.rate, loan.termMonths)) + loan.insurance;
  state.debts = [loan];

  const rules = [
    ['rec-salaire', 'income', 285000, 'acc-courant', null, 'cat-salaire', 'Salaire', 'monthly', 28],
    ['rec-loyer', 'expense', 82000, 'acc-courant', null, 'cat-logement', 'Loyer', 'monthly', 5],
    ['rec-edf', 'expense', 7800, 'acc-courant', null, 'cat-factures', 'Électricité', 'monthly', 10],
    ['rec-eau', 'expense', 5400, 'acc-courant', null, 'cat-factures', 'Eau', 'quarterly', 15],
    ['rec-box', 'expense', 2999, 'acc-courant', null, 'cat-telecom', 'Box internet', 'monthly', 12],
    ['rec-mobile', 'expense', 1299, 'acc-courant', null, 'cat-telecom', 'Forfait mobile', 'monthly', 14],
    ['rec-habitation', 'expense', 1850, 'acc-courant', null, 'cat-assurances', 'Assurance habitation', 'monthly', 8],
    ['rec-auto', 'expense', 5200, 'acc-courant', null, 'cat-assurances', 'Assurance auto', 'monthly', 8],
    ['rec-mutuelle', 'expense', 4200, 'acc-courant', null, 'cat-sante', 'Mutuelle santé', 'monthly', 6],
    ['rec-streaming', 'expense', 1349, 'acc-courant', null, 'cat-abonnements', 'Streaming vidéo', 'monthly', 20],
    ['rec-musique', 'expense', 1099, 'acc-courant', null, 'cat-abonnements', 'Streaming musical', 'monthly', 22],
    ['rec-sport', 'expense', 2990, 'acc-courant', null, 'cat-sport', 'Salle de sport', 'monthly', 3],
    ['rec-pret', 'expense', loanMonthly, 'acc-courant', null, 'cat-transport', 'Mensualité prêt auto', 'monthly', 5],
    ['rec-frais', 'expense', 250, 'acc-courant', null, 'cat-banque', 'Frais de tenue de compte', 'monthly', 1],
    ['rec-livret', 'transfer', 20000, 'acc-courant', 'acc-livret', null, 'Épargne mensuelle', 'monthly', 29],
    ['rec-pea', 'transfer', 10000, 'acc-courant', 'acc-pea', null, 'Versement PEA', 'monthly', 29],
  ];

  state.recurring = rules.map(([id, type, amount, accountId, toAccountId, categoryId, description, frequency, day]) => {
    const [y, m] = firstMonth.split('-').map(Number);
    const startDate = `${firstMonth}-${String(Math.min(day, daysInMonth(y, m - 1))).padStart(2, '0')}`;
    return { id, type, amount, accountId, toAccountId, categoryId, description, frequency, startDate, endDate: null, lastDate: null, autoCreate: true, active: true, tags: [] };
  });
  // Une règle à valider manuellement, pour montrer le fonctionnement.
  state.recurring.push({
    id: 'rec-babysitting',
    type: 'expense',
    amount: 12000,
    accountId: 'acc-courant',
    toAccountId: null,
    categoryId: 'cat-enfants',
    description: 'Baby-sitting',
    frequency: 'monthly',
    startDate: `${firstMonth}-25`,
    endDate: null,
    lastDate: null,
    autoCreate: false,
    active: true,
    tags: [],
  });

  for (const rule of state.recurring) {
    const dates = dueOccurrences(rule, today);
    const keep = rule.autoCreate ? dates : dates.slice(0, -1);
    for (const date of keep) add({ ...transactionFromRule(rule, date), recurringId: rule.id });
    rule.lastDate = keep[keep.length - 1] || null;
  }

  // Dépenses variables mois par mois.
  const months = monthRange(firstMonth, thisMonth);
  for (const month of months) {
    const [y, m] = month.split('-').map(Number);
    const lastDay = month === thisMonth ? Number(today.slice(8, 10)) : daysInMonth(y, m - 1);
    const day = () => `${month}-${String(1 + Math.floor(rand() * lastDay)).padStart(2, '0')}`;
    const scale = lastDay / daysInMonth(y, m - 1);
    const times = (n) => Math.max(0, Math.round(n * scale));

    for (let i = 0; i < times(5); i++) add({ type: 'expense', amount: between(38, 115), date: day(), accountId: 'acc-courant', categoryId: 'cat-courses', description: pick(['Supermarché', 'Hypermarché', 'Épicerie bio', 'Drive courses']) });
    for (let i = 0; i < times(4); i++) add({ type: 'expense', amount: between(3, 14), date: day(), accountId: 'acc-especes', categoryId: 'cat-courses', description: pick(['Boulangerie', 'Marché', 'Primeur']) });
    for (let i = 0; i < times(2.5); i++) add({ type: 'expense', amount: between(48, 72), date: day(), accountId: 'acc-courant', categoryId: 'cat-transport', description: 'Carburant' });
    if (chance(0.5)) add({ type: 'expense', amount: between(8, 24), date: day(), accountId: 'acc-courant', categoryId: 'cat-transport', description: pick(['Péage', 'Parking', 'Stationnement']) });
    for (let i = 0; i < times(3); i++) add({ type: 'expense', amount: between(14, 62), date: day(), accountId: 'acc-courant', categoryId: 'cat-restaurants', description: pick(['Restaurant', 'Pizzeria', 'Brasserie', 'Sushi', 'Bar entre amis']), tags: chance(0.3) ? ['amis'] : [] });
    for (let i = 0; i < times(2); i++) add({ type: 'expense', amount: between(3, 7), date: day(), accountId: 'acc-especes', categoryId: 'cat-restaurants', description: 'Café' });
    if (chance(0.7)) add({ type: 'expense', amount: between(10, 45), date: day(), accountId: 'acc-courant', categoryId: 'cat-loisirs', description: pick(['Cinéma', 'Librairie', 'Concert', 'Musée', 'Jeu vidéo']) });
    for (let i = 0; i < times(1.4); i++) add({ type: 'expense', amount: between(19, 130), date: day(), accountId: 'acc-courant', categoryId: 'cat-shopping', description: pick(['Vêtements', 'Chaussures', 'Achat en ligne', 'Décoration']) });
    if (chance(0.45)) add({ type: 'expense', amount: between(8, 35), date: day(), accountId: 'acc-courant', categoryId: 'cat-sante', description: pick(['Pharmacie', 'Médecin généraliste', 'Ostéopathe']) });
    if (chance(0.35)) add({ type: 'income', amount: between(8, 25), date: day(), accountId: 'acc-courant', categoryId: 'cat-remboursements', description: 'Remboursement Sécurité sociale' });
    if (chance(0.3)) add({ type: 'expense', amount: between(20, 80), date: day(), accountId: 'acc-courant', categoryId: 'cat-cadeaux', description: pick(['Cadeau anniversaire', 'Fleurs', 'Don association']) });
    if (chance(0.3)) add({ type: 'expense', amount: between(15, 90), date: day(), accountId: 'acc-courant', categoryId: 'cat-maison', description: pick(['Bricolage', 'Petit électroménager', 'Jardinage']) });
    if (chance(0.25)) add({ type: 'expense', amount: between(25, 60), date: day(), accountId: 'acc-courant', categoryId: 'cat-animaux', description: pick(['Croquettes', 'Vétérinaire']) });
    if (chance(0.4)) add({ type: 'income', amount: between(250, 650), date: day(), accountId: 'acc-courant', categoryId: 'cat-freelance', description: pick(['Mission graphisme', 'Cours particuliers', 'Prestation web']), tags: ['freelance'] });
    // Retrait d'espèces
    add({ type: 'transfer', amount: 6000, date: `${month}-${String(Math.min(2, lastDay)).padStart(2, '0')}`, accountId: 'acc-courant', toAccountId: 'acc-especes', categoryId: null, description: 'Retrait distributeur' });

    // Événements saisonniers
    if (m === 7 || m === 8) {
      add({ type: 'expense', amount: between(480, 720), date: day(), accountId: 'acc-courant', categoryId: 'cat-voyages', description: m === 7 ? 'Location vacances' : 'Billets de train', tags: ['vacances'] });
      add({ type: 'expense', amount: between(60, 140), date: day(), accountId: 'acc-courant', categoryId: 'cat-restaurants', description: 'Restaurant vacances', tags: ['vacances'] });
    }
    if (m === 12) add({ type: 'expense', amount: between(180, 320), date: day(), accountId: 'acc-courant', categoryId: 'cat-cadeaux', description: 'Cadeaux de Noël', tags: ['noël'] });
    if (m === 9) add({ type: 'expense', amount: between(90, 160), date: day(), accountId: 'acc-courant', categoryId: 'cat-education', description: 'Fournitures scolaires' });
    if (m === 6 || m === 12) add({ type: 'income', amount: between(400, 600), date: day(), accountId: 'acc-courant', categoryId: 'cat-primes', description: 'Prime semestrielle' });
    if (m === 9) add({ type: 'expense', amount: between(90, 160), date: day(), accountId: 'acc-courant', categoryId: 'cat-impots', description: 'Solde impôt sur le revenu' });
    if (month === shiftMonth(thisMonth, -3)) add({ type: 'income', amount: between(11, 14), date: day(), accountId: 'acc-livret', categoryId: 'cat-placements', description: 'Intérêts Livret A' });
  }

  // Les opérations de plus de 5 jours sont pointées (rapprochées du relevé).
  const clearedBefore = addDays(today, -5);
  for (const tx of txs) {
    if (tx.date > today) continue;
    tx.cleared = tx.date <= clearedBefore;
  }
  state.transactions = txs.filter((t) => t.date <= today && t.date >= start);

  state.budgets = {
    'cat-logement': { amount: 82000, rollover: false, rolloverSince: null },
    'cat-courses': { amount: 45000, rollover: false, rolloverSince: null },
    'cat-transport': { amount: 45000, rollover: false, rolloverSince: null },
    'cat-factures': { amount: 11000, rollover: false, rolloverSince: null },
    'cat-telecom': { amount: 4500, rollover: false, rolloverSince: null },
    'cat-restaurants': { amount: 15000, rollover: false, rolloverSince: null },
    'cat-loisirs': { amount: 6000, rollover: false, rolloverSince: null },
    'cat-shopping': { amount: 12000, rollover: true, rolloverSince: shiftMonth(thisMonth, -3) },
    'cat-abonnements': { amount: 3000, rollover: false, rolloverSince: null },
    'cat-sante': { amount: 7000, rollover: false, rolloverSince: null },
    'cat-cadeaux': { amount: 5000, rollover: true, rolloverSince: shiftMonth(thisMonth, -3) },
  };

  const contributions = (list) => list.map(([monthsAgo, amount], i) => ({ id: `ctb-demo-${i}-${amount}`, date: `${shiftMonth(thisMonth, -monthsAgo)}-01`, amount, note: '' }));
  state.goals = [
    {
      id: 'goal-urgence',
      name: "Fonds d'urgence",
      icon: '🛟',
      target: 600000,
      deadline: `${shiftMonth(thisMonth, 14)}-01`,
      contributions: contributions([[7, 250000], [5, 15000], [4, 15000], [3, 15000], [2, 15000], [1, 15000], [0, 15000]]),
      archived: false,
      createdAt: 1,
    },
    {
      id: 'goal-voyage',
      name: 'Voyage au Japon',
      icon: '✈️',
      target: 350000,
      deadline: `${shiftMonth(thisMonth, 10)}-01`,
      contributions: contributions([[6, 30000], [4, 20000], [3, 20000], [2, 25000], [1, 25000]]),
      archived: false,
      createdAt: 2,
    },
    {
      id: 'goal-ordi',
      name: 'Nouvel ordinateur',
      icon: '💻',
      target: 120000,
      deadline: `${shiftMonth(thisMonth, 3)}-15`,
      contributions: contributions([[3, 30000], [2, 25000], [1, 20000]]),
      archived: false,
      createdAt: 3,
    },
  ];

  return state;
}
