// Données par défaut : catégories, types de comptes, devises.

export const ACCOUNT_TYPES = {
  courant: { label: 'Compte courant', icon: 'bank' },
  epargne: { label: 'Épargne', icon: 'piggy' },
  especes: { label: 'Espèces', icon: 'cash' },
  carte: { label: 'Carte de crédit', icon: 'card' },
  investissement: { label: 'Investissement', icon: 'chart' },
  autre: { label: 'Autre', icon: 'wallet' },
};

/**
 * Produits d'épargne (pour les comptes de type « épargne »).
 * Taux nets en % au 1er août 2026, plafonds de dépôt en centimes.
 * Sources : Banque de France / ministère de l'Économie (annonce du 15 juillet 2026),
 * rapport ACPR du 30 juin 2026 pour les fonds en euros. Voir docs/RECHERCHE.md.
 */
export const SAVINGS_PRODUCTS = {
  livretA: { label: 'Livret A', rate: 1.7, cap: 2295000, taxFree: true },
  ldds: { label: 'LDDS', rate: 1.7, cap: 1200000, taxFree: true },
  lep: { label: "LEP (Livret d'épargne populaire)", rate: 2.5, cap: 1000000, taxFree: true, meansTested: true },
  livretJeune: { label: 'Livret jeune', rate: 1.7, cap: 160000, taxFree: true },
  cel: { label: "CEL (Compte épargne logement)", rate: 1.25, cap: 1530000, taxFree: false },
  pel: { label: "PEL (ouvert depuis 2026)", rate: 2.0, cap: 6120000, taxFree: false },
  fondsEuros: { label: 'Assurance vie (fonds en euros)', rate: 2.63, cap: null, taxFree: false },
  autre: { label: 'Autre livret / compte rémunéré', rate: 0, cap: null, taxFree: false },
};

/** Repères économiques utilisés par les conseils (France, 2026). */
export const REFERENCE = {
  ratesDate: '2026-08-01',
  livretARate: 1.7,
  lepRate: 2.5,
  fondsEurosRate: 2.63, // rendement moyen 2025 (ACPR, juin 2026)
  inflation: 2.3, // prévision Banque de France pour 2026 (septembre 2026)
  lepIncomeLimitSingle: 2302800, // revenu fiscal de référence 2024, 1 part
  lepIncomeLimitCouple: 3532600, // 2 parts
  bankFeesTraditional: 19190, // moyenne annuelle banque traditionnelle (2026)
  bankFeesOnline: 2000, // 0 à 20 € par an en banque en ligne
  debtRatioMax: 0.35, // HCSF, assurance comprise
  mortgageMaxYears: 25, // 27 ans dans le neuf (VEFA)
  mortgageMarket15y: 3.4, // fourchette de marché 2026 : 3,4 % (15 ans)
  mortgageMarket25y: 4.2, // à 4,2 % (25 ans)
  renegotiationGap: 0.7, // écart de taux minimal pour qu'une renégociation soit rentable
  emergencyMonthsStable: 3,
  emergencyMonthsVariable: 6,
  savingsRateTarget: 0.2,
};

export const CATEGORY_GROUPS = {
  needs: { label: 'Besoins', hint: 'Dépenses essentielles : logement, courses, transport…', target: 0.5 },
  wants: { label: 'Envies', hint: 'Loisirs, restaurants, shopping…', target: 0.3 },
  savings: { label: 'Épargne', hint: 'Épargne, investissements, remboursements anticipés', target: 0.2 },
};

export const DEBT_KINDS = {
  immobilier: 'Crédit immobilier',
  auto: 'Crédit auto',
  conso: 'Crédit à la consommation',
  etudiant: 'Prêt étudiant',
  travaux: 'Prêt travaux',
  autre: 'Autre dette',
};

export const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CHF', label: 'Franc suisse (CHF)' },
  { code: 'USD', label: 'Dollar américain ($)' },
  { code: 'CAD', label: 'Dollar canadien ($ CA)' },
  { code: 'GBP', label: 'Livre sterling (£)' },
  { code: 'XOF', label: 'Franc CFA BCEAO (F CFA)' },
  { code: 'XAF', label: 'Franc CFA BEAC (F CFA)' },
  { code: 'MAD', label: 'Dirham marocain (MAD)' },
  { code: 'TND', label: 'Dinar tunisien (TND)' },
  { code: 'DZD', label: 'Dinar algérien (DZD)' },
];

// Couleurs de pastille des catégories (identité visuelle, pas des séries de graphique).
export const SWATCHES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#0f8b8d', '#8a5a44', '#6b7280', '#b04fc2'];

export const EMOJIS = [
  '🏠', '🛒', '🚗', '⛽', '🚆', '💊', '🩺', '⚡', '💧', '📱', '🌐', '🛡️',
  '🍽️', '☕', '🍺', '🎮', '🎬', '🎵', '📚', '🎓', '🧸', '🐾', '🎁', '💝',
  '🛍️', '👕', '💇', '🏋️', '✈️', '🏖️', '🧾', '🏦', '📺', '💻', '🔧', '🌱',
  '💼', '🎉', '🤝', '🏘️', '📈', '↩️', '🏷️', '💰', '🪙', '➕', '📦', '❤️',
];

export function defaultCategories() {
  const expense = [
    ['cat-logement', 'Logement', '🏠', '#2a78d6', 'needs'],
    ['cat-courses', 'Courses', '🛒', '#1baf7a', 'needs'],
    ['cat-transport', 'Transport', '🚗', '#eb6834', 'needs'],
    ['cat-factures', 'Factures & énergie', '⚡', '#eda100', 'needs'],
    ['cat-telecom', 'Téléphone & internet', '📱', '#4a3aa7', 'needs'],
    ['cat-assurances', 'Assurances', '🛡️', '#0f8b8d', 'needs'],
    ['cat-sante', 'Santé', '💊', '#e34948', 'needs'],
    ['cat-enfants', 'Enfants', '🧸', '#e87ba4', 'needs'],
    ['cat-education', 'Éducation', '📚', '#008300', 'needs'],
    ['cat-impots', 'Impôts & taxes', '🧾', '#6b7280', 'needs'],
    ['cat-banque', 'Frais bancaires', '🏦', '#8a5a44', 'needs'],
    ['cat-restaurants', 'Restaurants & sorties', '🍽️', '#eb6834', 'wants'],
    ['cat-loisirs', 'Loisirs & culture', '🎬', '#b04fc2', 'wants'],
    ['cat-shopping', 'Shopping & vêtements', '🛍️', '#e87ba4', 'wants'],
    ['cat-abonnements', 'Abonnements', '📺', '#4a3aa7', 'wants'],
    ['cat-voyages', 'Voyages & vacances', '✈️', '#2a78d6', 'wants'],
    ['cat-sport', 'Sport & bien-être', '🏋️', '#1baf7a', 'wants'],
    ['cat-cadeaux', 'Cadeaux & dons', '🎁', '#e34948', 'wants'],
    ['cat-animaux', 'Animaux', '🐾', '#8a5a44', 'wants'],
    ['cat-maison', 'Maison & équipement', '🔧', '#0f8b8d', 'wants'],
    ['cat-divers', 'Divers', '📦', '#6b7280', 'wants'],
    ['cat-epargne', 'Épargne & placements', '💰', '#008300', 'savings'],
  ];
  const income = [
    ['cat-salaire', 'Salaire', '💼', '#2a78d6'],
    ['cat-primes', 'Primes', '🎉', '#eda100'],
    ['cat-freelance', 'Activité indépendante', '💻', '#4a3aa7'],
    ['cat-aides', 'Aides & allocations', '🤝', '#1baf7a'],
    ['cat-locatif', 'Revenus locatifs', '🏘️', '#0f8b8d'],
    ['cat-placements', 'Intérêts & dividendes', '📈', '#008300'],
    ['cat-remboursements', 'Remboursements', '↩️', '#eb6834'],
    ['cat-ventes', 'Ventes', '🏷️', '#e87ba4'],
    ['cat-autres-revenus', 'Autres revenus', '➕', '#6b7280'],
  ];
  return [
    ...expense.map(([id, name, icon, color, group]) => ({ id, name, icon, color, type: 'expense', group })),
    ...income.map(([id, name, icon, color]) => ({ id, name, icon, color, type: 'income', group: null })),
  ];
}

export function emptyState() {
  return {
    version: 1,
    settings: {
      currency: 'EUR',
      locale: 'fr-FR',
      theme: 'auto',
      budgetAlert: 80,
      privacy: false,
      demo: false,
      onboarded: false,
      incomeStability: 'stable', // 'stable' (CDI, retraite) ou 'variable' (indépendant, intérim)
      lepEligible: 'unknown', // 'yes' | 'no' | 'unknown'
      lastBackup: null,
      backupSnoozedUntil: null,
      dismissedTips: [],
      ignoredRecurring: [],
    },
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    budgets: {},
    budgetOverrides: {},
    recurring: [],
    goals: [],
    debts: [],
  };
}
