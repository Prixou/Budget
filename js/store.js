// État de l'application, persistance et actions de modification.
import { dueOccurrences, transactionFromRule, accountBalance } from './calc.js';
import { emptyState, defaultCategories } from './defaults.js';
import { buildDemoState } from './demo.js';
import { isValidISODate, todayISO, uid, monthKey } from './utils.js';

export const STORAGE_KEY = 'budget-app-data-v1';

/* ------------------------------------------------------------------ */
/* Stockage (remplaçable, ex. pour un autre support que localStorage)  */
/* ------------------------------------------------------------------ */

let adapter = {
  async load() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  },
  async save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },
};

export function setStorageAdapter(next) {
  adapter = next;
}

/* ------------------------------------------------------------------ */
/* Normalisation / migration                                           */
/* ------------------------------------------------------------------ */

const TX_TYPES = new Set(['expense', 'income', 'transfer']);

function toInt(v, fallback = 0) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

/** Valide et complète des données (sauvegarde importée ou stockage local). */
export function normalizeState(input) {
  if (!input || typeof input !== 'object') throw new Error('Fichier de données invalide.');
  const base = emptyState();
  const state = {
    version: 1,
    settings: { ...base.settings, ...(input.settings || {}) },
    accounts: Array.isArray(input.accounts) ? input.accounts : [],
    categories: Array.isArray(input.categories) && input.categories.length ? input.categories : defaultCategories(),
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    budgets: input.budgets && typeof input.budgets === 'object' ? { ...input.budgets } : {},
    budgetOverrides: {},
    recurring: Array.isArray(input.recurring) ? input.recurring : [],
    goals: Array.isArray(input.goals) ? input.goals : [],
    debts: Array.isArray(input.debts) ? input.debts : [],
  };

  state.accounts = state.accounts
    .filter((a) => a && a.id && a.name)
    .map((a) => ({
      type: 'courant',
      archived: false,
      includeInTotal: true,
      ...a,
      initialBalance: toInt(a.initialBalance),
    }));
  const accountIds = new Set(state.accounts.map((a) => a.id));

  state.categories = state.categories
    .filter((c) => c && c.id && c.name)
    .map((c) => ({
      icon: '📦',
      color: '#6b7280',
      ...c,
      type: c.type === 'income' ? 'income' : 'expense',
      group: c.type === 'income' ? null : ['needs', 'wants', 'savings'].includes(c.group) ? c.group : 'wants',
    }));
  const categoryIds = new Set(state.categories.map((c) => c.id));

  state.transactions = state.transactions
    .filter((t) => t && TX_TYPES.has(t.type) && isValidISODate(t.date) && accountIds.has(t.accountId))
    .map((t) => ({
      id: t.id || uid('tx-'),
      description: '',
      notes: '',
      cleared: false,
      recurringId: null,
      createdAt: Date.now(),
      ...t,
      amount: Math.abs(toInt(t.amount)),
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean).map(String) : [],
      categoryId: t.type === 'transfer' ? null : categoryIds.has(t.categoryId) ? t.categoryId : null,
      toAccountId: t.type === 'transfer' ? t.toAccountId : null,
    }))
    .filter((t) => t.type !== 'transfer' || (accountIds.has(t.toAccountId) && t.toAccountId !== t.accountId));

  if (input.budgetOverrides && typeof input.budgetOverrides === 'object') {
    for (const [month, values] of Object.entries(input.budgetOverrides)) {
      if (!/^\d{4}-\d{2}$/.test(month) || !values || typeof values !== 'object') continue;
      const clean = {};
      for (const [catId, amount] of Object.entries(values)) if (categoryIds.has(catId)) clean[catId] = toInt(amount);
      state.budgetOverrides[month] = clean;
    }
  }

  for (const [catId, conf] of Object.entries(state.budgets)) {
    if (!categoryIds.has(catId) || !conf) delete state.budgets[catId];
    else state.budgets[catId] = { rollover: false, ...conf, amount: toInt(conf.amount) };
  }

  state.recurring = state.recurring
    .filter((r) => r && r.id && TX_TYPES.has(r.type) && isValidISODate(r.startDate))
    .map((r) => ({ active: true, autoCreate: true, lastDate: null, endDate: null, tags: [], frequency: 'monthly', ...r, amount: Math.abs(toInt(r.amount)) }));

  state.goals = state.goals
    .filter((g) => g && g.id && g.name)
    .map((g) => ({
      icon: '🎯',
      deadline: null,
      archived: false,
      ...g,
      target: toInt(g.target),
      contributions: Array.isArray(g.contributions) ? g.contributions.map((c) => ({ ...c, amount: toInt(c.amount) })) : [],
    }));

  state.debts = state.debts
    .filter((d) => d && d.id && isValidISODate(d.startDate))
    .map((d) => ({ kind: 'autre', insurance: 0, ...d, principal: toInt(d.principal), rate: Number(d.rate) || 0, termMonths: toInt(d.termMonths, 12) }));

  return state;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

class Store {
  constructor() {
    this.state = emptyState();
    this.listeners = new Set();
    this.lastSnapshot = null;
    this.saveTimer = null;
    this.saveFailed = false;
  }

  async init() {
    const data = await adapter.load();
    if (data) {
      try {
        this.state = normalizeState(data);
        return 'loaded';
      } catch {
        this.state = emptyState();
      }
    }
    return 'empty';
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(change) {
    for (const fn of this.listeners) fn(this.state, change);
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      const ok = await adapter.save(this.state);
      this.saveFailed = !ok;
    }, 150);
  }

  /** Applique une modification, sauvegarde et notifie. */
  commit(mutator, { snapshot = false, change = null } = {}) {
    if (snapshot) this.lastSnapshot = JSON.stringify(this.state);
    const result = mutator(this.state);
    this.persist();
    this.emit(change);
    return result;
  }

  /** Revient à l'état précédent la dernière action destructive. */
  undo() {
    if (!this.lastSnapshot) return false;
    this.state = JSON.parse(this.lastSnapshot);
    this.lastSnapshot = null;
    this.persist();
    this.emit('undo');
    return true;
  }

  replace(next) {
    this.lastSnapshot = JSON.stringify(this.state);
    this.state = next;
    this.persist();
    this.emit('replace');
  }
}

export const store = new Store();

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const findIndex = (list, id) => list.findIndex((x) => x.id === id);

function upsert(list, item, prefix) {
  if (item.id) {
    const i = findIndex(list, item.id);
    if (i > -1) {
      list[i] = { ...list[i], ...item };
      return list[i];
    }
  }
  const created = { ...item, id: item.id || uid(prefix), createdAt: Date.now() };
  list.push(created);
  return created;
}

// Transactions

export function saveTransaction(tx) {
  return store.commit((s) => {
    const clean = { ...tx };
    if (clean.type === 'transfer') clean.categoryId = null;
    else clean.toAccountId = null;
    return upsert(s.transactions, clean, 'tx-');
  });
}

export function deleteTransactions(ids) {
  const set = new Set(ids);
  return store.commit((s) => {
    const before = s.transactions.length;
    s.transactions = s.transactions.filter((t) => !set.has(t.id));
    return before - s.transactions.length;
  }, { snapshot: true });
}

export function setCleared(ids, cleared) {
  const set = new Set(ids);
  store.commit((s) => {
    for (const t of s.transactions) if (set.has(t.id)) t.cleared = cleared;
  });
}

export function recategorize(ids, categoryId) {
  const set = new Set(ids);
  store.commit((s) => {
    const cat = s.categories.find((c) => c.id === categoryId);
    for (const t of s.transactions) {
      if (set.has(t.id) && t.type !== 'transfer' && (!cat || cat.type === t.type)) t.categoryId = categoryId;
    }
  }, { snapshot: true });
}

export function importTransactions(list) {
  return store.commit((s) => {
    const now = Date.now();
    list.forEach((t, i) => s.transactions.push({ ...t, id: uid('tx-'), createdAt: now + i }));
    return list.length;
  }, { snapshot: true });
}

// Comptes

export function saveAccount(account) {
  return store.commit((s) => upsert(s.accounts, account, 'acc-'));
}

export function deleteAccount(id) {
  store.commit((s) => {
    s.accounts = s.accounts.filter((a) => a.id !== id);
    s.transactions = s.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id);
    s.recurring = s.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id);
  }, { snapshot: true });
}

/** Crée une opération d'ajustement pour aligner le solde sur le relevé bancaire. */
export function adjustBalance(accountId, actual, date = todayISO()) {
  const current = accountBalance(store.state, accountId, date);
  const diff = actual - current;
  if (diff === 0) return null;
  return saveTransaction({
    type: diff > 0 ? 'income' : 'expense',
    amount: Math.abs(diff),
    date,
    accountId,
    categoryId: null,
    description: 'Ajustement de solde',
    notes: 'Écart constaté lors du rapprochement bancaire',
    tags: [],
    cleared: true,
  });
}

// Catégories

export function saveCategory(category) {
  return store.commit((s) => upsert(s.categories, category, 'cat-'));
}

export function deleteCategory(id, replacementId = null) {
  store.commit((s) => {
    s.categories = s.categories.filter((c) => c.id !== id);
    for (const t of s.transactions) if (t.categoryId === id) t.categoryId = replacementId;
    for (const r of s.recurring) if (r.categoryId === id) r.categoryId = replacementId;
    delete s.budgets[id];
    for (const month of Object.values(s.budgetOverrides)) delete month[id];
  }, { snapshot: true });
}

// Budgets

/**
 * Définit le budget d'une catégorie.
 * scope 'all' : budget par défaut pour tous les mois ; 'month' : uniquement pour `month`.
 */
export function setBudget(categoryId, amount, { scope = 'all', month, rollover = false } = {}) {
  store.commit((s) => {
    const current = s.budgets[categoryId];
    if (scope === 'month') {
      s.budgetOverrides[month] = { ...(s.budgetOverrides[month] || {}), [categoryId]: amount };
      // Le report nécessite une configuration par catégorie, même sans budget par défaut.
      if (!current && rollover) s.budgets[categoryId] = { amount: 0, rollover: false, rolloverSince: null };
    } else {
      s.budgets[categoryId] = { ...(current || {}), amount };
      // Un budget par défaut remplace les ajustements des mois à venir.
      for (const [m, values] of Object.entries(s.budgetOverrides)) {
        if (month && m >= month) delete values[categoryId];
      }
    }
    const conf = s.budgets[categoryId];
    if (!conf) return;
    if (rollover && !conf.rollover) conf.rolloverSince = month || monthKey(todayISO());
    conf.rollover = rollover;
    if (!rollover) conf.rolloverSince = null;
  });
}

export function removeBudget(categoryId) {
  store.commit((s) => {
    delete s.budgets[categoryId];
    for (const values of Object.values(s.budgetOverrides)) delete values[categoryId];
  }, { snapshot: true });
}

export function applyBudgetSuggestions(map) {
  store.commit((s) => {
    for (const [catId, amount] of Object.entries(map)) {
      s.budgets[catId] = { rollover: false, rolloverSince: null, ...(s.budgets[catId] || {}), amount };
    }
  }, { snapshot: true });
}

// Opérations récurrentes

export function saveRecurring(rule) {
  return store.commit((s) => {
    const clean = { ...rule };
    if (clean.type === 'transfer') clean.categoryId = null;
    else clean.toAccountId = null;
    return upsert(s.recurring, clean, 'rec-');
  });
}

export function deleteRecurring(id) {
  store.commit((s) => {
    s.recurring = s.recurring.filter((r) => r.id !== id);
  }, { snapshot: true });
}

/** Génère les opérations automatiques échues. Retourne le nombre créé. */
export function processRecurring(today = todayISO()) {
  let created = 0;
  const pending = [];
  for (const rule of store.state.recurring) {
    if (!rule.active || !rule.autoCreate) continue;
    const dates = dueOccurrences(rule, today);
    if (dates.length) pending.push({ rule, dates });
  }
  if (!pending.length) return 0;
  store.commit((s) => {
    const now = Date.now();
    for (const { rule, dates } of pending) {
      const target = s.recurring.find((r) => r.id === rule.id);
      for (const date of dates) {
        s.transactions.push({ ...transactionFromRule(target, date), id: uid('tx-'), createdAt: now + created });
        created++;
      }
      target.lastDate = dates[dates.length - 1];
    }
  });
  return created;
}

/** Valide une occurrence d'une règle manuelle. */
export function confirmOccurrence(ruleId, date, overrides = {}) {
  store.commit((s) => {
    const rule = s.recurring.find((r) => r.id === ruleId);
    if (!rule) return;
    s.transactions.push({ ...transactionFromRule(rule, date), ...overrides, id: uid('tx-'), createdAt: Date.now() });
    if (!rule.lastDate || date > rule.lastDate) rule.lastDate = date;
  });
}

export function skipOccurrence(ruleId, date) {
  store.commit((s) => {
    const rule = s.recurring.find((r) => r.id === ruleId);
    if (rule && (!rule.lastDate || date > rule.lastDate)) rule.lastDate = date;
  });
}

// Objectifs

export function saveGoal(goal) {
  return store.commit((s) => upsert(s.goals, { contributions: [], ...goal }, 'goal-'));
}

export function deleteGoal(id) {
  store.commit((s) => {
    s.goals = s.goals.filter((g) => g.id !== id);
  }, { snapshot: true });
}

export function addContribution(goalId, contribution) {
  store.commit((s) => {
    const goal = s.goals.find((g) => g.id === goalId);
    if (goal) goal.contributions.push({ id: uid('ctb-'), ...contribution });
  });
}

export function deleteContribution(goalId, contributionId) {
  store.commit((s) => {
    const goal = s.goals.find((g) => g.id === goalId);
    if (goal) goal.contributions = goal.contributions.filter((c) => c.id !== contributionId);
  }, { snapshot: true });
}

// Dettes

export function saveDebt(debt) {
  return store.commit((s) => upsert(s.debts, debt, 'debt-'));
}

export function deleteDebt(id) {
  store.commit((s) => {
    s.debts = s.debts.filter((d) => d.id !== id);
  }, { snapshot: true });
}

// Réglages et données

export function updateSettings(patch) {
  store.commit((s) => {
    s.settings = { ...s.settings, ...patch };
  }, { change: 'settings' });
}

export function exportData() {
  return JSON.stringify({ ...store.state, exportedAt: new Date().toISOString(), app: 'budget' }, null, 2);
}

export function importData(text) {
  const data = typeof text === 'string' ? JSON.parse(text) : text;
  const next = normalizeState(data);
  next.settings.onboarded = true;
  next.settings.demo = false;
  store.replace(next);
}

export function loadDemo(today = todayISO()) {
  const demo = buildDemoState(today);
  store.replace(normalizeState(demo));
}

/** Efface tout et repart avec un compte courant et les catégories par défaut. */
export function startFresh({ accountName = 'Compte courant', initialBalance = 0, currency } = {}) {
  const next = emptyState();
  next.settings.onboarded = true;
  next.settings.theme = store.state.settings?.theme || 'auto';
  if (currency) next.settings.currency = currency;
  next.accounts.push({
    id: uid('acc-'),
    name: accountName,
    type: 'courant',
    initialBalance,
    archived: false,
    includeInTotal: true,
    createdAt: Date.now(),
  });
  store.replace(next);
}
