// Lecture et écriture de fichiers CSV (relevés bancaires, exports).
import { normalizeText, parseAmount, parseFlexibleDate } from './utils.js';

/** Détecte le séparateur le plus probable sur les premières lignes. */
export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample
      .split('\n')
      .filter(Boolean)
      .map((line) => splitLine(line, d).length);
    if (!counts.length) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = (consistent ? 100 : 0) + counts[0];
    if (counts[0] > 1 && score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitLine(line, delimiter) {
  return parseCSV(line, delimiter)[0] || [];
}

/** Analyse un CSV conforme RFC 4180 (guillemets, retours à la ligne dans les champs). */
export function parseCSV(text, delimiter = null) {
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function escapeField(value, delimiter) {
  const s = value == null ? '' : String(value);
  if (s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows, delimiter = ';') {
  return '﻿' + rows.map((r) => r.map((v) => escapeField(v, delimiter)).join(delimiter)).join('\r\n');
}

const HINTS = {
  date: ['date operation', "date d'operation", 'date', 'date valeur', 'date de valeur', 'jour'],
  description: ['libelle', 'description', 'libelle operation', 'intitule', 'label', 'detail', 'operation', 'nature', 'memo', 'tiers', 'beneficiaire'],
  amount: ['montant', 'amount', 'valeur', 'somme', 'montant eur', 'montant (eur)'],
  debit: ['debit', 'debit eur', 'sortie', 'depense', 'retrait'],
  credit: ['credit', 'credit eur', 'entree', 'recette', 'versement'],
  category: ['categorie', 'category', 'type operation', 'rubrique'],
  notes: ['notes', 'note', 'commentaire', 'remarque'],
};

/** Devine le rôle de chaque colonne d'après l'en-tête. */
export function guessMapping(header) {
  const norm = header.map((h) => normalizeText(h).replace(/[^a-z0-9 ()']/g, ' ').replace(/\s+/g, ' ').trim());
  const mapping = {};
  for (const [role, hints] of Object.entries(HINTS)) {
    let found = -1;
    for (const hint of hints) {
      found = norm.findIndex((h, i) => h === hint && !Object.values(mapping).includes(i));
      if (found > -1) break;
    }
    if (found === -1) {
      for (const hint of hints) {
        found = norm.findIndex((h, i) => h.includes(hint) && !Object.values(mapping).includes(i));
        if (found > -1) break;
      }
    }
    if (found > -1) mapping[role] = found;
  }
  return mapping;
}

/**
 * Convertit les lignes d'un relevé en transactions.
 * mapping : { date, description, amount | debit/credit, category, notes } (indices de colonnes)
 * Retourne { transactions, errors }.
 */
export function rowsToTransactions(rows, mapping, { accountId, categories = [], hasHeader = true } = {}) {
  const body = hasHeader ? rows.slice(1) : rows;
  const byName = new Map(categories.map((c) => [normalizeText(c.name), c]));
  const transactions = [];
  const errors = [];
  body.forEach((row, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const date = parseFlexibleDate(row[mapping.date]);
    if (!date) {
      errors.push(`Ligne ${line} : date illisible « ${row[mapping.date] ?? ''} »`);
      return;
    }
    let amount = null;
    if (mapping.amount != null && row[mapping.amount] != null && row[mapping.amount].trim() !== '') {
      amount = parseAmount(row[mapping.amount]);
    } else {
      const debit = mapping.debit != null ? parseAmount(row[mapping.debit]) : null;
      const credit = mapping.credit != null ? parseAmount(row[mapping.credit]) : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (amount == null || amount === 0) {
      errors.push(`Ligne ${line} : montant illisible`);
      return;
    }
    const type = amount < 0 ? 'expense' : 'income';
    const catName = mapping.category != null ? normalizeText(row[mapping.category]) : '';
    const cat = catName ? byName.get(catName) : null;
    transactions.push({
      type,
      amount: Math.abs(amount),
      date,
      accountId,
      toAccountId: null,
      categoryId: cat && cat.type === type ? cat.id : null,
      description: (row[mapping.description] || '').trim().replace(/\s+/g, ' '),
      notes: mapping.notes != null ? (row[mapping.notes] || '').trim() : '',
      tags: ['import'],
      cleared: true,
      recurringId: null,
    });
  });
  return { transactions, errors };
}

/**
 * Propose une catégorie d'après l'historique : même libellé déjà catégorisé.
 */
export function learnCategories(transactions, history) {
  const memory = new Map();
  for (const t of history) {
    if (!t.categoryId || !t.description) continue;
    memory.set(`${t.type}|${normalizeText(t.description)}`, t.categoryId);
  }
  return transactions.map((t) => {
    if (t.categoryId) return t;
    const known = memory.get(`${t.type}|${normalizeText(t.description)}`);
    return known ? { ...t, categoryId: known } : t;
  });
}

/** Repère les doublons probables (même date, montant, type et compte). */
export function markDuplicates(transactions, existing) {
  const seen = new Set(existing.map((t) => `${t.accountId}|${t.date}|${t.amount}|${t.type}`));
  return transactions.map((t) => ({ ...t, duplicate: seen.has(`${t.accountId}|${t.date}|${t.amount}|${t.type}`) }));
}
