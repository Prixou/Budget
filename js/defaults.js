// Données par défaut : catégories, types de comptes, devises.

export const ACCOUNT_TYPES = {
  courant: { label: 'Compte courant', icon: 'bank' },
  epargne: { label: 'Épargne', icon: 'piggy' },
  especes: { label: 'Espèces', icon: 'cash' },
  carte: { label: 'Carte de crédit', icon: 'card' },
  investissement: { label: 'Investissement', icon: 'chart' },
  avantages: { label: 'Titres-restaurant, chèques…', icon: 'ticket' },
  autre: { label: 'Autre', icon: 'wallet' },
};

/**
 * Avantages salariés crédités sur une carte ou en titres, utilisables pour certaines dépenses seulement.
 * categories : catégories de dépenses acceptées ; expires : fin de validité du solde de l'année.
 */
export const BENEFITS = {
  restaurant: { label: 'Titres-restaurant', use: 'repas et courses alimentaires', categories: ['cat-restaurants', 'cat-courses'], expires: '02-end' },
  cesu: { label: 'CESU préfinancés', use: 'garde d’enfants, ménage, services à domicile', categories: ['cat-enfants', 'cat-maison'], expires: '01-31' },
  vacances: { label: 'Chèques-vacances', use: 'vacances, loisirs, transport, restaurants', categories: ['cat-voyages', 'cat-loisirs', 'cat-transport', 'cat-restaurants', 'cat-sport'], expires: null },
  cadeaux: { label: 'Chèques ou cartes cadeaux', use: 'achats dans les enseignes acceptées', categories: ['cat-shopping', 'cat-cadeaux', 'cat-loisirs', 'cat-courses'], expires: null },
};

/**
 * Titres-restaurant : règles 2026 (sources dans docs/RECHERCHE.md).
 * Les courses non directement consommables (pâtes, farine…) sont acceptées jusqu'au 31 décembre 2026 ;
 * l'Assemblée a voté le 12 octobre 2026 une prolongation pour 2027, que le Sénat doit encore examiner.
 */
export const MEAL_VOUCHERS = {
  date: '2026-10-20',
  dailyCap: 2500, // 25 € par jour
  groceriesUntil: '2026-12-31',
  employerShare: { min: 50, max: 60 }, // part de l'employeur, en % de la valeur du titre
  employerExemptionMax: 732, // part patronale exonérée de cotisations, par titre (2026)
  carryOverRequest: '03-15', // report du solde sur carte : à demander au plus tard le 15 mars
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

/**
 * Repères « famille » 2026 (montants en centimes, au 1er avril 2026 sauf mention).
 * Sources : barèmes CAF, service-public.fr, ameli.fr, info.gouv.fr, Code de la sécurité sociale.
 * Détail et liens dans docs/RECHERCHE.md. À revoir chaque 1er avril (revalorisation CAF).
 */
export const FAMILY = {
  date: '2026-04-01',
  birthPremium: 109311, // prime à la naissance, par enfant, versée au 7e mois de grossesse
  baseAllowanceFull: 19817, // allocation de base PAJE, taux plein, par mois
  baseAllowancePartial: 9909, // taux partiel
  // Plafonds de revenu fiscal de référence 2024, pour un premier enfant (majorés par enfant supplémentaire)
  ceilingPartial: { one: 3711800, two: 4905400, step: 890800 },
  ceilingFull: { one: 3106600, two: 4105500, step: 745500 },
  familyAllowance: {
    two: [15225, 7613, 3806], // 2 enfants, selon les 3 tranches de ressources
    three: [34732, 17366, 8683],
    extra: [19507, 9753, 4877], // par enfant au-delà de 3
    ceilings: [7998000, 10660400], // pour 2 enfants
    step: 666400, // par enfant supplémentaire
  },
  maternityWeeks: { first: [6, 10], third: [8, 18], twins: [12, 22] }, // [avant, après] la naissance
  paternityDays: { single: 25, multiple: 32 },
  dailyAllowanceMax: 10402, // indemnité journalière maximale (maternité, paternité), 2026
  dailyAllowanceRate: 0.79, // 79 % du salaire journalier de base (3 derniers salaires bruts / 91,25)
  birthLeave: { first: 0.7, second: 0.6, cap: 400500 }, // congé supplémentaire de naissance (depuis le 1er juillet 2026)
  psu: { floor: 81462, ceiling: 850000, rates: [0.000619, 0.000516, 0.000413, 0.00031] }, // crèche : taux d'effort horaire
  cmg: { hourlyCap: 800, monthlyMax: 82516 }, // complément de mode de garde, assistante maternelle
  childcareCredit: { rate: 0.5, cap: 350000 }, // crédit d'impôt garde (enfant de moins de 6 ans), par enfant et par an
  quotientCap: 180700, // avantage maximal par demi-part de quotient familial (revenus 2025)
};

/** Liste d'équipement de départ. price : prix neuf courant (centimes) ; twins : quantité pour des jumeaux. */
export const BABY_EQUIPMENT = [
  { id: 'siege-auto', label: 'Siège auto / coque', price: 18000, twins: 2, usedOk: false, note: 'à acheter neuf (sécurité)' },
  { id: 'poussette', label: 'Poussette', price: 45000, twins: 1.65, usedOk: true, twinsNote: 'poussette double' },
  { id: 'lit', label: 'Lit et matelas', price: 22000, twins: 2, usedOk: true, note: 'matelas neuf conseillé' },
  { id: 'berceau', label: 'Berceau ou couffin', price: 12000, twins: 2, usedOk: true },
  { id: 'langer', label: 'Table ou matelas à langer', price: 9000, twins: 1, usedOk: true },
  { id: 'bain', label: 'Baignoire et accessoires de bain', price: 4000, twins: 1, usedOk: true },
  { id: 'porte-bebe', label: 'Porte-bébé ou écharpe', price: 7000, twins: 1.5, usedOk: true },
  { id: 'transat', label: 'Transat', price: 6000, twins: 2, usedOk: true },
  { id: 'chaise-haute', label: 'Chaise haute', price: 12000, twins: 2, usedOk: true },
  { id: 'babyphone', label: 'Babyphone', price: 6000, twins: 1, usedOk: true },
  { id: 'repas', label: 'Biberons, stérilisateur, chauffe-biberon', price: 9000, twins: 1.5, usedOk: true },
  { id: 'gigoteuses', label: 'Gigoteuses', price: 8000, twins: 2, usedOk: true },
  { id: 'vetements', label: 'Vêtements 0-6 mois', price: 25000, twins: 2, usedOk: true },
  { id: 'linge', label: 'Linge (draps, langes, serviettes)', price: 8000, twins: 1.6, usedOk: true },
  { id: 'soins', label: 'Soins et pharmacie (thermomètre, mouche-bébé…)', price: 6000, twins: 1.2, usedOk: false },
  { id: 'sac', label: 'Sac à langer', price: 5000, twins: 1, usedOk: true },
];

/** Dépenses mensuelles par enfant la première année (centimes). */
export const BABY_MONTHLY = {
  diapers: { store: 5500, brand: 9000, washable: 1500 }, // lavables : lessive (le kit est compté à part)
  washableKit: 40000,
  feeding: { breast: 0, mixed: 5000, formula: 10000 },
  hygiene: 2500,
  clothes: 3000,
  health: 1500,
  food: 4000, // diversification alimentaire à partir de 6 mois
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
    ['cat-avantages', 'Titres-restaurant & avantages', '🎟️', '#eb6834'],
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

export function emptyHousehold() {
  return {
    enabled: false,
    partners: [
      { id: 'p1', name: 'Moi', income: 0 },
      { id: 'p2', name: 'Mon conjoint', income: 0 },
    ],
    split: 'income', // 'income' (au prorata des revenus), 'equal' (50/50) ou 'custom'
    customShare: 50, // part de p1 en % si split = 'custom'
    settlements: [],
  };
}

export function defaultBabyPlan(today) {
  return {
    enabled: true,
    dueDate: null,
    count: 1,
    compare: true,
    existingChildren: 0,
    birthParent: 'p1',
    grossSalaries: { p1: null, p2: null },
    salaryMaintained: { p1: false, p2: false },
    extraLeaveMonths: { p1: 0, p2: 0 },
    childcare: 'creche',
    hoursPerWeek: 40,
    assmatHourly: 550,
    feeding: 'mixed',
    diapers: 'store',
    equipmentLevel: 'mixed',
    taxIncome: null,
    checklist: {},
    createdAt: today,
  };
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
      setupDismissed: false, // liste « Pour bien démarrer » masquée
      dismissedTips: [],
      ignoredRecurring: [],
    },
    household: emptyHousehold(),
    baby: null,
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
