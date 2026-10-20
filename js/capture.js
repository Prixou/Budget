// Lecture d'une capture d'écran d'application bancaire : du texte reconnu (OCR) aux opérations.
// Fonctions pures, testées. Le moteur de reconnaissance lui-même est dans ocr.js.
import { addDays, normalizeText, todayISO } from './utils.js';

const MONTHS = [
  ['janv', 1],
  ['jan', 1],
  ['fev', 2],
  ['mars', 3],
  ['mar', 3],
  ['avr', 4],
  ['mai', 5],
  ['juin', 6],
  ['juil', 7],
  ['aout', 8],
  ['sept', 9],
  ['sep', 9],
  ['oct', 10],
  ['nov', 11],
  ['dec', 12],
];
const MONTH_RE = '(janv(?:ier)?|jan|fevr?(?:ier)?|mars|mar|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept?(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)';
const WEEKDAY_RE = '(?:(?:lun|mar|mer|jeu|ven|sam|dim)[a-z]*\\.?\\s+)?';
const TEXT_DATE = new RegExp(`\\b${WEEKDAY_RE}(\\d{1,2})(?:er)?\\s+${MONTH_RE}\\.?(?:\\s+(\\d{4}))?(?![a-z])`, 'g');
const NUM_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b|\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g;
const RELATIVE = /\b(aujourd'? ?hui|avant-hier|hier)\b/g;
// Montant : signe facultatif, milliers séparés par espace ou point, deux décimales, devise facultative.
const AMOUNT = /([+-]\s?)?(€\s?)?(\d{1,3}(?:[ .]\d{3})+|\d+)\s?[,.]\s?(\d{2})(?!\d)(\s?(?:€|eur\b))?/g;
// Libellés qui signalent un revenu quand le signe n'a pas été lu.
const INCOME_HINTS = /\b(vir(ement)?s?\b.*\b(recu|de|emis par|inst)|salaire|paie|remboursement|remb\b|caf\b|cpam|allocation|prime|dividende|interets|avoir)/;
// Lignes de synthèse, pas des opérations.
const SUMMARY = /\b(solde|total|plafond|disponible|encours|a venir|rechercher)\b/;

/** Minuscules sans accents, même longueur que le texte d'origine (les positions restent valables). */
function fold(s) {
  let out = '';
  for (const c of s) out += c.length === 1 ? c.normalize('NFD')[0].toLowerCase()[0] : c;
  return out;
}

/** Corrige les confusions courantes de l'OCR avant l'analyse. */
export function cleanLine(line) {
  return String(line)
    .replace(/[−–—]/g, '-') // signes moins typographiques
    .replace(/[  \t]/g, ' ')
    .replace(/[’`]/g, "'")
    // « O » lu à la place d'un zéro dans un montant (2O,5O → 20,50).
    .replace(/(?<![A-Za-z])[\dOo][\dOo .]*[,.][\dOo]{2}(?![A-Za-z\d])/g, (m) => (/\d/.test(m) ? m.replace(/[oO]/g, '0') : m))
    .replace(/\s+/g, ' ')
    .trim();
}

function monthNumber(word) {
  return MONTHS.find(([prefix]) => word.startsWith(prefix))?.[1] ?? null;
}

/** Date complète : l'année manquante est déduite (pas plus de quelques jours dans le futur). */
function makeDate(day, month, year, today) {
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12)) return null;
  let y = year ? (year < 100 ? 2000 + year : year) : Number(today.slice(0, 4));
  const iso = (yy) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!year && iso(y) > addDays(today, 3)) y -= 1;
  const date = iso(y);
  const d = new Date(`${date}T12:00:00`);
  return d.getMonth() + 1 === month ? date : null;
}

/** Dates présentes dans une ligne : [{ date, start, end }]. */
export function findDates(line, today = todayISO()) {
  const f = fold(line);
  const found = [];
  for (const m of f.matchAll(RELATIVE)) {
    const word = m[1];
    found.push({ date: word === 'hier' ? addDays(today, -1) : word === 'avant-hier' ? addDays(today, -2) : today, start: m.index, end: m.index + m[0].length });
  }
  for (const m of f.matchAll(TEXT_DATE)) {
    const date = makeDate(Number(m[1]), monthNumber(m[2]), m[3] ? Number(m[3]) : null, today);
    if (date) found.push({ date, start: m.index, end: m.index + m[0].length });
  }
  for (const m of f.matchAll(NUM_DATE)) {
    const [day, month, year] = m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
    const date = makeDate(Number(day), Number(month), year ? Number(year) : null, today);
    if (date) found.push({ date, start: m.index, end: m.index + m[0].length });
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Montant de la ligne : le dernier avec une devise, sinon le dernier en fin de ligne. */
export function findAmount(line) {
  const f = fold(line);
  const all = [...f.matchAll(AMOUNT)].map((m) => ({
    cents: Number(m[3].replace(/[ .]/g, '')) * 100 + Number(m[4]),
    sign: m[1] ? m[1].trim() : null,
    currency: !!(m[2] || m[5]),
    start: m.index,
    end: m.index + m[0].length,
  }));
  const withCurrency = all.filter((a) => a.currency);
  if (withCurrency.length) return withCurrency[withCurrency.length - 1];
  const last = all[all.length - 1];
  return last && !/[a-z0-9]/.test(f.slice(last.end)) ? last : null;
}

function tidyLabel(text) {
  return text
    .replace(/€|\beur\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–·•|:,.]+|[\s\-–·•|:,]+$/g, '')
    .trim();
}

const letters = (s) => (s.match(/[a-zA-ZÀ-ÿ]/g) || []).length;

/**
 * Analyse le texte reconnu sur une capture : en-têtes de date, libellés, montants.
 * Renvoie { rows: [{ date, description, amount, type, signGuessed, line }], ignored: [lignes] }.
 * Montants en centimes, toujours positifs ; le type dit si c'est une dépense ou un revenu.
 */
export function parseCapture(text, { today = todayISO() } = {}) {
  const rows = [];
  const ignored = [];
  let currentDate = null;
  let pending = []; // lignes de texte sans montant depuis la dernière opération
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const folded = fold(line);
    const amount = findAmount(line);
    const dates = findDates(line, today);

    if (!amount) {
      // En-tête de date (« Lundi 19 octobre », « Hier ») : presque rien d'autre sur la ligne.
      if (dates.length) {
        let rest = line;
        for (const d of [...dates].reverse()) rest = rest.slice(0, d.start) + rest.slice(d.end);
        if (letters(rest) <= 3) {
          currentDate = dates[0].date;
          pending = [];
          continue;
        }
      }
      if (letters(line) >= 2 && !SUMMARY.test(folded)) pending.push(line);
      else ignored.push(line);
      continue;
    }
    if (SUMMARY.test(folded)) {
      ignored.push(line);
      pending = [];
      continue;
    }

    // Libellé : la ligne sans le montant ni les dates ; sinon le texte lu juste avant.
    let label = line.slice(0, amount.start) + ' ' + line.slice(amount.end);
    const inline = findDates(label, today);
    for (const d of [...inline].reverse()) label = label.slice(0, d.start) + label.slice(d.end);
    label = tidyLabel(label);
    const ownLabel = letters(label) >= 2;
    if (!ownLabel && pending.length) label = tidyLabel(pending[0]);
    pending = [];
    // Montant seul en haut de l'écran, avant toute date : c'est le solde du compte, pas une opération.
    if (letters(label) < 2 || !amount.cents || (!ownLabel && !currentDate && !inline.length)) {
      ignored.push(line);
      continue;
    }

    let type;
    let signGuessed = false;
    if (amount.sign === '-') type = 'expense';
    else if (amount.sign === '+') type = 'income';
    else {
      signGuessed = true;
      type = INCOME_HINTS.test(normalizeText(label)) ? 'income' : 'expense';
    }
    rows.push({ date: inline[0]?.date || currentDate || today, description: label, amount: amount.cents, type, signGuessed, line });
  }
  return { rows, ignored };
}

// Catégorie probable d'après des mots-clés du libellé (quand l'historique ne la connaît pas encore).
const KEYWORDS = [
  ['expense', 'cat-courses', /carrefour|leclerc|auchan|lid[l1i!|]|aldi|intermarche|super ?u\b|hyper ?u\b|monoprix|franprix|casino|picard|biocoop|naturalia|netto|grand frais|supermarche|epicerie|marche\b/],
  ['expense', 'cat-restaurants', /restau|mcdo|mc ?donald|burger|kfc|subway|pizza|sushi|boulangerie|patisserie|cafe\b|starbucks|uber ?eats|deliveroo|just ?eat|brasserie|bistro/],
  ['expense', 'cat-transport', /sncf|ouigo|ratp|navigo|uber\b|bolt|blablacar|essence|carburant|total ?energies|esso|\bbp\b|shell|avia|peage|autoroute|parking|indigo|vinci|velib|lime/],
  ['expense', 'cat-abonnements', /netflix|spotify|deezer|disney|canal ?\+|prime video|amazon prime|apple\.com|icloud|google (one|play)|youtube|chatgpt|openai|gemini|audible/],
  ['expense', 'cat-telecom', /\bfree\b|free mobile|\bsfr\b|orange|bouygues|sosh|red by|b&you|la poste mobile/],
  ['expense', 'cat-factures', /\bedf\b|engie|total ?energies elec|veolia|suez|eau de|gaz\b|electricite/],
  ['expense', 'cat-sante', /pharmacie|docteur|\bdr\b|medecin|dentiste|kine|osteo|laboratoire|hopital|clinique|opticien/],
  ['expense', 'cat-shopping', /amazon|fnac|darty|zara|h&m|primark|decathlon|kiabi|uniqlo|sephora|ikea|leroy merlin|castorama|boulanger|cdiscount|vinted|shein|action\b/],
  ['expense', 'cat-loisirs', /cinema|ugc|pathe|gaumont|theatre|concert|musee|steam|playstation|nintendo|xbox|fnac spectacle/],
  ['expense', 'cat-logement', /loyer|syndic|foncia|nexity|charges? (locatives|copro)/],
  ['expense', 'cat-assurances', /assurance|maif|macif|matmut|axa|allianz|groupama|gmf|mma/],
  ['expense', 'cat-banque', /frais|cotisation carte|commission|agios/],
  ['expense', 'cat-sport', /basic.fit|fitness|salle de sport|keep cool|neoness|on air|piscine/],
  ['income', 'cat-salaire', /salaire|paie|remuneration/],
  ['income', 'cat-aides', /\bcaf\b|allocation|pole emploi|france travail|prime d.activite|apl\b/],
  ['income', 'cat-remboursements', /remboursement|remb\b|cpam|ameli|mutuelle|avoir/],
];

export function guessCategory(description, type) {
  const text = normalizeText(description);
  return KEYWORDS.find(([t, , re]) => t === type && re.test(text))?.[1] ?? null;
}

/** Fusionne les opérations de plusieurs captures (une même opération peut figurer sur deux captures). */
export function mergeCaptures(lists) {
  const seen = new Set();
  const out = [];
  for (const row of lists.flat()) {
    const key = `${row.date}|${row.amount}|${row.type}|${normalizeText(row.description)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
