// Démarrage rapide : construit un budget complet à partir de quelques réponses
// (foyer, comptes, charges fixes, budgets). Fonctions pures, testées.
import { nextCreditDate } from './benefits.js';
import { emptyState } from './defaults.js';
import { todayISO, uid } from './utils.js';

/** Charges fixes les plus courantes, proposées dans l'assistant. */
export const FIXED_COSTS = [
  { id: 'logement', label: 'Loyer ou crédit immobilier', icon: '🏠', categoryId: 'cat-logement', day: 5 },
  { id: 'energie', label: 'Électricité et gaz', icon: '⚡', categoryId: 'cat-factures', day: 10 },
  { id: 'internet', label: 'Box internet', icon: '📶', categoryId: 'cat-telecom', day: 12 },
  { id: 'mobile', label: 'Forfaits mobiles', icon: '📱', categoryId: 'cat-telecom', day: 14 },
  { id: 'habitation', label: 'Assurance habitation', icon: '🛡️', categoryId: 'cat-assurances', day: 8 },
  { id: 'auto', label: 'Assurance auto', icon: '🚗', categoryId: 'cat-assurances', day: 8 },
  { id: 'mutuelle', label: 'Mutuelle santé', icon: '💊', categoryId: 'cat-sante', day: 6 },
  { id: 'transport', label: 'Abonnement de transport', icon: '🚆', categoryId: 'cat-transport', day: 3 },
  { id: 'garde', label: 'Crèche, nounou, cantine', icon: '🧸', categoryId: 'cat-enfants', day: 5 },
  { id: 'abonnements', label: 'Streaming, musique, presse', icon: '📺', categoryId: 'cat-abonnements', day: 20 },
  { id: 'sport', label: 'Salle de sport', icon: '🏋️', categoryId: 'cat-sport', day: 3 },
];

/**
 * Budgets de départ : une part de l'argent qui reste après les charges fixes et l'épargne,
 * plafonnée par adulte (centimes) pour rester réaliste quand les revenus sont élevés ;
 * le surplus reste disponible pour épargner. Point de départ à ajuster avec les vraies dépenses.
 */
export const STARTER_BUDGETS = [
  ['cat-courses', 0.36, 30000],
  ['cat-transport', 0.14, 15000],
  ['cat-restaurants', 0.12, 10000],
  ['cat-loisirs', 0.1, 8000],
  ['cat-shopping', 0.1, 8000],
  ['cat-sante', 0.06, 4000],
  ['cat-cadeaux', 0.04, 4000],
  ['cat-divers', 0.08, 6000],
];

export function emptyAnswers() {
  return {
    couple: false,
    names: ['', ''],
    incomes: [0, 0],
    payDay: 28,
    main: 0, // solde du compte courant (ou joint)
    personal: [null, null], // comptes personnels en couple (solde, ou null si aucun)
    savings: null, // { product, balance } ou null
    vouchers: null, // { owner, count, value, share, day, balance } ou null
    fixed: {}, // { [id]: { amount, day } }
    saving: 0, // virement mensuel vers l'épargne
    budgets: null, // { [categoryId]: montant } ; null = proposition automatique
  };
}

export const totalIncome = (a) => (a.incomes[0] || 0) + (a.couple ? a.incomes[1] || 0 : 0);
export const totalFixed = (a) => Object.values(a.fixed).reduce((s, f) => s + (f?.amount || 0), 0);

/** Budgets proposés : l'argent restant après charges fixes et épargne, réparti par catégorie (arrondi à 10 €). */
export function starterBudgets(answers) {
  const free = Math.max(0, totalIncome(answers) - totalFixed(answers) - (answers.saving || 0));
  const adults = answers.couple ? 2 : 1;
  return Object.fromEntries(
    STARTER_BUDGETS.map(([id, weight, cap]) => [id, Math.floor(Math.min(free * weight, cap * adults) / 1000) * 1000]).filter(([, v]) => v > 0),
  );
}

/** Construit l'état complet de l'application à partir des réponses. */
export function buildSetupState(answers, { today = todayISO(), settings = {} } = {}) {
  const a = answers;
  const s = emptyState();
  s.settings = { ...s.settings, ...settings, onboarded: true, demo: false };
  const now = Date.now();
  const names = [a.names[0]?.trim() || (a.couple ? 'Partenaire 1' : 'Moi'), a.names[1]?.trim() || 'Partenaire 2'];
  s.household = {
    ...s.household,
    enabled: !!a.couple,
    partners: [
      { id: 'p1', name: names[0], income: a.incomes[0] || 0 },
      { id: 'p2', name: a.couple ? names[1] : s.household.partners[1].name, income: a.couple ? a.incomes[1] || 0 : 0 },
    ],
  };

  const account = (fields) => {
    const acc = { id: uid('acc-'), archived: false, includeInTotal: true, createdAt: now + s.accounts.length, owner: 'joint', initialBalance: 0, ...fields };
    s.accounts.push(acc);
    return acc;
  };
  const main = account({ name: a.couple ? 'Compte joint' : 'Compte courant', type: 'courant', initialBalance: a.main || 0 });
  const personal = [0, 1].map((i) =>
    a.couple && a.personal[i] != null ? account({ name: `Compte de ${names[i]}`, type: 'courant', owner: i ? 'p2' : 'p1', initialBalance: a.personal[i] || 0 }) : null,
  );
  const savings = a.savings ? account({ name: a.savings.label || 'Livret A', type: 'epargne', product: a.savings.product || 'livretA', owner: 'p1', initialBalance: a.savings.balance || 0 }) : null;

  const rule = (fields) =>
    s.recurring.push({ id: uid('rec-'), toAccountId: null, frequency: 'monthly', endDate: null, lastDate: null, autoCreate: true, active: true, tags: [], ...fields });

  // Salaires : sur le compte personnel s'il existe, sinon sur le compte principal.
  const payDate = nextCreditDate(a.payDay, today);
  [0, 1].forEach((i) => {
    if (i === 1 && !a.couple) return;
    if (!(a.incomes[i] > 0)) return;
    rule({ type: 'income', amount: a.incomes[i], accountId: (personal[i] || main).id, categoryId: 'cat-salaire', description: a.couple ? `Salaire ${names[i]}` : 'Salaire', startDate: payDate });
  });

  for (const cost of FIXED_COSTS) {
    const f = a.fixed[cost.id];
    if (!(f?.amount > 0)) continue;
    rule({ type: 'expense', amount: f.amount, accountId: main.id, categoryId: cost.categoryId, description: cost.label, startDate: nextCreditDate(f.day || cost.day, today), share: a.couple ? 'shared' : null });
  }
  if (savings && a.saving > 0) {
    rule({ type: 'transfer', amount: a.saving, accountId: main.id, toAccountId: savings.id, categoryId: null, description: 'Épargne automatique', startDate: payDate }); // « payez-vous en premier » : le jour de la paie
  }

  if (a.vouchers && (a.vouchers.count > 0 || a.vouchers.balance > 0)) {
    const v = a.vouchers;
    const owner = a.couple ? v.owner || 'p1' : 'p1';
    const amount = (v.count || 0) * (v.value || 0);
    const tr = account({
      name: `Titres-restaurant${a.couple ? ` ${names[owner === 'p2' ? 1 : 0]}` : ''}`,
      type: 'avantages',
      benefit: 'restaurant',
      owner,
      initialBalance: v.balance || 0,
      credit: amount ? { count: v.count, value: v.value, share: v.share ?? 60, day: v.day || 1, amount } : null,
    });
    if (amount) rule({ id: `rec-avantage-${tr.id}`, type: 'income', amount, accountId: tr.id, categoryId: 'cat-avantages', description: 'Crédit titres-restaurant', startDate: nextCreditDate(v.day || 1, today) });
  }

  const budgets = a.budgets || starterBudgets(a);
  for (const [categoryId, amount] of Object.entries(budgets)) {
    if (amount > 0) s.budgets[categoryId] = { amount, rollover: false, rolloverSince: null };
  }
  return s;
}

/** Étapes de prise en main, affichées sur le tableau de bord tant qu'elles ne sont pas faites. */
export function setupChecklist(state) {
  const realTx = state.transactions.filter((t) => !t.recurringId);
  return [
    { id: 'accounts', label: 'Ajouter vos comptes', done: state.accounts.length > 0, href: '#comptes' },
    { id: 'fixed', label: 'Enregistrer vos revenus et charges fixes', done: state.recurring.length >= 2, href: '#recurrentes' },
    { id: 'budgets', label: 'Fixer vos budgets du mois', done: Object.keys(state.budgets).length >= 3, href: '#budgets' },
    { id: 'tx', label: 'Saisir ou importer vos dépenses', done: realTx.length >= 5, action: 'add-tx' },
    { id: 'goal', label: 'Choisir un objectif d’épargne', done: state.goals.length > 0, href: '#objectifs' },
    { id: 'backup', label: 'Faire une première sauvegarde', done: !!state.settings.lastBackup, action: 'backup' },
  ];
}
