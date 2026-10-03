// Utilitaires partagés : HTML sûr, montants (en centimes), dates ISO locales.

/* ------------------------------------------------------------------ */
/* Identifiants                                                        */
/* ------------------------------------------------------------------ */

export function uid(prefix = '') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

/* ------------------------------------------------------------------ */
/* HTML échappé par défaut                                             */
/* ------------------------------------------------------------------ */

export class SafeHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Marque une chaîne comme HTML de confiance (ne sera pas échappée). */
export function raw(value) {
  return new SafeHTML(String(value ?? ''));
}

function renderValue(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join('');
  return escapeHtml(value);
}

/** Gabarit étiqueté : toutes les valeurs interpolées sont échappées sauf SafeHTML. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += renderValue(values[i]) + strings[i + 1];
  }
  return new SafeHTML(out);
}

/* ------------------------------------------------------------------ */
/* Montants : toujours stockés en centimes entiers                     */
/* ------------------------------------------------------------------ */

/**
 * Convertit une saisie utilisateur en centimes.
 * Accepte « 1 234,56 », « 1234.56 », « -12 », « 1.234,56 », « 12€ ».
 * Retourne null si la saisie n'est pas un nombre.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  if (input == null) return null;
  let s = String(input)
    .trim()
    .replace(/[\s  ']/g, '')
    .replace(/[€$£]|EUR|USD|CHF|GBP|CAD|FCFA/gi, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Le dernier séparateur est le séparateur décimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length > 2 ? parts.join('') : s.replace(',', '.');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    // « 1.234.567 » : points de milliers
    if (parts.length > 2) s = parts.join('');
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return null;
  const cents = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

let moneyConfig = { currency: 'EUR', locale: 'fr-FR' };
const formatterCache = new Map();

export function setMoneyConfig({ currency, locale }) {
  moneyConfig = { currency: currency || 'EUR', locale: locale || 'fr-FR' };
  formatterCache.clear();
}

export function getMoneyConfig() {
  return { ...moneyConfig };
}

function formatter(key, options) {
  const cacheKey = `${moneyConfig.locale}|${moneyConfig.currency}|${key}`;
  if (!formatterCache.has(cacheKey)) {
    let fmt;
    try {
      fmt = new Intl.NumberFormat(moneyConfig.locale, { style: 'currency', currency: moneyConfig.currency, ...options });
    } catch {
      fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', ...options });
    }
    formatterCache.set(cacheKey, fmt);
  }
  return formatterCache.get(cacheKey);
}

/**
 * Formate des centimes en devise.
 * options.sign : 'auto' | 'always' (affiche + pour les positifs)
 * options.compact : notation compacte (12,9 k€)
 * options.decimals : false pour arrondir à l'unité
 */
export function formatMoney(cents, options = {}) {
  const value = (cents || 0) / 100;
  let text;
  if (options.compact && Math.abs(value) >= 10000) {
    text = formatter('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } else if (options.decimals === false) {
    text = formatter('int', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(value);
  } else {
    text = formatter('std', {}).format(value);
  }
  if (options.sign === 'always' && value > 0) text = `+${text}`;
  return text.replace(/-/, '−');
}

/** Valeur éditable dans un champ (« 1234,56 »). */
export function centsToInput(cents) {
  if (cents == null || cents === '') return '';
  const value = cents / 100;
  return value.toFixed(2).replace('.', ',').replace(/,00$/, '');
}

export function formatPercent(ratio, digits = 0) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(ratio);
}

export function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}

/* ------------------------------------------------------------------ */
/* Dates : chaînes « YYYY-MM-DD » en heure locale                      */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export function isValidISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseISODate(iso);
  return toISODate(d) === iso;
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Ajoute n mois en ramenant le jour à la fin du mois si nécessaire (31 janv. + 1 → 28/29 févr.). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const day = Math.min(d, daysInMonth(year, month));
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function currentMonth() {
  return monthKey(todayISO());
}

export function shiftMonth(month, n) {
  return monthKey(addMonths(`${month}-01`, n));
}

export function monthStart(month) {
  return `${month}-01`;
}

export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(daysInMonth(y, m - 1))}`;
}

/** Nombre de mois entre deux clés « YYYY-MM » (b − a). */
export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Liste des mois de `from` à `to` inclus. */
export function monthRange(from, to) {
  const out = [];
  const n = monthDiff(from, to);
  for (let i = 0; i <= n; i++) out.push(shiftMonth(from, i));
  return out;
}

export function daysBetween(a, b) {
  const ms = parseISODate(b) - parseISODate(a);
  return Math.round(ms / 86400000);
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function monthLabel(month, { short = false, year = true } = {}) {
  const [y, m] = month.split('-').map(Number);
  const name = (short ? MONTHS_SHORT : MONTHS)[m - 1];
  return year ? `${name} ${y}` : name;
}

export function formatDate(iso, style = 'medium') {
  if (!iso) return '';
  const d = parseISODate(iso);
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  if (style === 'short') return `${pad(day)}/${pad(month + 1)}/${year}`;
  // En français, le premier jour du mois s'écrit « 1er ».
  const dayText = day === 1 ? '1er' : String(day);
  if (style === 'day') return `${dayText} ${MONTHS_SHORT[month]}`;
  if (style === 'long') return `${capitalize(WEEKDAYS[d.getDay()])} ${dayText} ${MONTHS[month]} ${year}`;
  return `${dayText} ${MONTHS_SHORT[month]} ${year}`;
}

/** « Aujourd'hui », « Hier », « Demain » ou la date longue. */
export function relativeDayLabel(iso, today = todayISO()) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Aujourd'hui";
  if (diff === -1) return 'Hier';
  if (diff === 1) return 'Demain';
  return formatDate(iso, 'long');
}

/**
 * Lit une date saisie dans un fichier bancaire.
 * Formats : 2026-09-30, 30/09/2026, 30-09-2026, 30.09.26, 09/30/2026 (si non ambigu).
 */
export function parseFlexibleDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return isValidISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    let day = +a;
    let month = +b;
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const iso = `${y}-${pad(month)}-${pad(day)}`;
    return isValidISODate(iso) ? iso : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export const sum = (arr, fn = (x) => x) => arr.reduce((acc, x) => acc + fn(x), 0);

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Normalise un texte pour la recherche (sans accents, minuscules). */
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function pluralize(n, singular, plural = `${singular}s`) {
  return `${formatNumber(n)} ${Math.abs(n) > 1 ? plural : singular}`;
}
