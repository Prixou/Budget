// Intelligence artificielle : Claude (modèle Haiku 5.5), appelé directement depuis le navigateur
// avec la clé API de l'utilisateur. La clé reste sur cet appareil (hors données et sauvegardes).
// Rien n'est envoyé tant que l'utilisateur n'a pas activé l'IA et posé une question ou choisi une capture.
import { TOOLS, runTool, toolInputSchema } from './ai-tools.js';
import { store, updateSettings } from './store.js';
import { monthKey, todayISO } from './utils.js';

export const AI_MODEL = 'claude-haiku-5-5';
export const AI_MODEL_LABEL = 'Claude Haiku 5.5';
// Tarif de Claude Haiku 5.5, en dollars par million de jetons (requêtes de moins de 100 000 jetons).
export const AI_PRICE = { input: 0.1, output: 0.5 };
const KEY_STORAGE = 'pecule-cle-claude';
const SDK = new URL('../vendor/anthropic/anthropic-sdk.js', import.meta.url).href;

/* ------------------------------------------------------------------ */
/* Clé, réglages, coût                                                 */
/* ------------------------------------------------------------------ */

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

export const aiSettings = (state = store.state) => ({ enabled: false, monthlyCap: 100, captures: true, ...(state.settings.ai || {}) });
export const aiReady = (state = store.state) => aiSettings(state).enabled && !!getApiKey();

/** Montant en dollars à partir de centimes, avec assez de décimales pour les petites sommes. */
export function formatDollars(cents) {
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: cents && cents < 1 ? 4 : 2 })} $`;
}

/** Dépense estimée du mois en cours, en centimes de dollar. */
export function monthSpend(state = store.state, today = todayISO()) {
  const usage = state.settings.aiUsage;
  return usage?.month === monthKey(today) ? usage.cost : 0;
}

/** Coût d'une réponse en centimes de dollar, d'après les jetons facturés. */
export function costOf(usage) {
  if (!usage) return 0;
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return ((input * AI_PRICE.input + (usage.output_tokens || 0) * AI_PRICE.output) / 1e6) * 100;
}

function record(usages) {
  const today = todayISO();
  const cost = usages.reduce((t, u) => t + costOf(u), 0);
  const prev = store.state.settings.aiUsage;
  const same = prev?.month === monthKey(today);
  updateSettings({ aiUsage: { month: monthKey(today), cost: (same ? prev.cost : 0) + cost, requests: (same ? prev.requests : 0) + usages.length } });
  return cost;
}

export class AiError extends Error {}

function ensureBudget() {
  const { monthlyCap } = aiSettings();
  if (!getApiKey()) throw new AiError('Ajoutez votre clé API dans Paramètres → Intelligence artificielle.');
  if (monthlyCap > 0 && monthSpend() >= monthlyCap) {
    throw new AiError(`Plafond mensuel atteint (${(monthlyCap / 100).toFixed(2).replace('.', ',')} $). Vous pouvez le relever dans les paramètres.`);
  }
}

let sdkPromise = null;
async function sdk() {
  // Un échec de chargement (hors ligne) n'est pas gardé : la prochaine demande réessaie.
  sdkPromise ||= import(SDK).catch((error) => {
    sdkPromise = null;
    throw new AiError(`Impossible de charger le module Claude : vérifiez votre connexion internet. (${error.message})`);
  });
  return sdkPromise;
}

async function client(apiKey = getApiKey()) {
  const { default: Anthropic } = await sdk();
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/** Message d'erreur compréhensible, d'après les classes d'erreur du SDK. */
export async function explainError(error) {
  if (error instanceof AiError) return error.message;
  const Anthropic = await sdk()
    .then((m) => m.default)
    .catch(() => null);
  if (!Anthropic) return error?.message || 'Erreur inconnue';
  if (error instanceof Anthropic.AuthenticationError) return 'Clé API refusée : vérifiez-la dans les paramètres.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'Cette clé API n’a pas accès à ce modèle.';
  if (error instanceof Anthropic.RateLimitError) return 'Trop de demandes en peu de temps : réessayez dans une minute.';
  if (error instanceof Anthropic.BadRequestError) {
    return /credit|billing|balance/i.test(error.message) ? 'Crédit insuffisant sur votre compte Anthropic : ajoutez du crédit dans la console.' : `Demande refusée par l’API : ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) return 'Pas de connexion au service Claude : vérifiez votre connexion internet.';
  if (error instanceof Anthropic.APIError) return `Erreur du service Claude (${error.status ?? 'inconnue'}). Réessayez plus tard.`;
  return error?.message || 'Erreur inconnue';
}

/** Vérifie une clé sans rien consommer (lecture de la fiche du modèle). */
export async function testApiKey(apiKey) {
  const c = await client(apiKey);
  const model = await c.models.retrieve(AI_MODEL);
  return model.display_name || AI_MODEL_LABEL;
}

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

function systemPrompt(state, today) {
  const h = state.household;
  const who = h?.enabled ? `Le budget est géré à deux par ${h.partners[0].name} et ${h.partners[1].name}.` : `L'utilisateur s'appelle ${h?.partners?.[0]?.name || 'inconnu'}.`;
  return [
    "Tu es l'assistant de Pécule, une application de budget personnel française.",
    `Nous sommes le ${today}. Montants en ${state.settings.currency || 'EUR'}. ${who}`,
    'Pour chaque chiffre, appelle les outils : ils calculent sur les vraies données. N’invente jamais un montant.',
    'Réponds en français, brièvement : une ou deux phrases, ou une courte liste. Cite les montants utiles, arrondis à l’euro.',
    "Tu ne peux rien modifier dans l'application : propose l'action et dis où la faire (Budgets, Objectifs, Récurrences, Comptes…).",
    'Reste prudent : pas de conseil d’investissement personnalisé ; pour les impôts et les aides, renvoie vers les organismes officiels.',
  ].join('\n');
}

/**
 * Pose une question à l'assistant. history : échanges précédents [{ role, content: texte }].
 * onStep(libellé) signale chaque calcul demandé par Claude. Renvoie { text, cost, stop }.
 */
export async function askAssistant(question, history = [], { onStep = () => {} } = {}) {
  ensureBudget();
  const { betaTool } = await sdk();
  const c = await client();
  const state = store.state;
  const today = todayISO();
  const tools = TOOLS.map((t) => ({
    ...betaTool({
      name: t.name,
      description: t.description,
      inputSchema: toolInputSchema(t),
      run: async (input) => {
        onStep(t.name);
        return JSON.stringify(runTool(t.name, input, store.state, today));
      },
    }),
    strict: true,
  }));
  const runner = c.beta.messages.toolRunner({
    model: AI_MODEL,
    max_tokens: 8000,
    max_iterations: 8,
    output_config: { effort: 'medium' },
    system: systemPrompt(state, today),
    tools,
    messages: [...history, { role: 'user', content: question }],
  });
  const usages = [];
  for await (const message of runner) usages.push(message.usage);
  const final = await runner.done();
  const cost = record(usages);
  const text = final.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (final.stop_reason === 'refusal') return { text: 'Claude a préféré ne pas répondre à cette question.', cost, stop: 'refusal' };
  if (!text) return { text: 'Je n’ai pas pu terminer le calcul. Reformulez la question, plus simplement.', cost, stop: final.stop_reason };
  return { text: final.stop_reason === 'max_tokens' ? `${text}…` : text, cost, stop: final.stop_reason };
}

/* ------------------------------------------------------------------ */
/* Lecture des captures d'écran                                        */
/* ------------------------------------------------------------------ */

/**
 * Prépare une capture pour l'envoi : morceaux d'au plus deux fois la largeur en hauteur
 * (une longue capture réduite d'un bloc deviendrait illisible), 1 568 px au plus, en JPEG.
 */
async function imageBlocks(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const tileHeight = Math.min(height, width * 2);
  const overlap = Math.round(width * 0.08);
  const blocks = [];
  for (let top = 0; top < height && blocks.length < 6; top += tileHeight - overlap) {
    const h = Math.min(tileHeight, height - top);
    const scale = Math.min(1, 1568 / Math.max(width, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, top, width, h, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    if (top + h >= height) break;
  }
  bitmap.close?.();
  return blocks;
}

function captureSchema(categories) {
  const ids = categories.map((c) => c.id);
  return {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date AAAA-MM-JJ' },
            libelle: { type: 'string', description: 'Libellé tel qu’affiché' },
            montant: { type: 'number', description: 'Montant en euros, toujours positif' },
            sens: { type: 'string', enum: ['depense', 'revenu'] },
            categorie: { anyOf: [{ type: 'string', enum: ids }, { type: 'null' }] },
          },
          required: ['date', 'libelle', 'montant', 'sens', 'categorie'],
          additionalProperties: false,
        },
      },
    },
    required: ['operations'],
    additionalProperties: false,
  };
}

/**
 * Lit les opérations d'une capture avec Claude. Renvoie des lignes au même format que
 * l'analyse locale : { date, description, amount (centimes), type, signGuessed, categoryId }.
 */
export async function readCaptureWithClaude(file, { today = todayISO() } = {}) {
  ensureBudget();
  const { jsonSchemaOutputFormat } = await sdk();
  const c = await client();
  const categories = store.state.categories;
  const images = await imageBlocks(file);
  const list = categories.map((cat) => `${cat.id} = ${cat.name} (${cat.type === 'income' ? 'revenu' : 'dépense'})`).join('\n');
  const response = await c.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low', format: jsonSchemaOutputFormat(captureSchema(categories)) },
    messages: [
      {
        role: 'user',
        content: [
          ...images,
          {
            type: 'text',
            text: [
              `Ces images sont ${images.length > 1 ? 'les morceaux successifs d’une' : 'une'} capture de l'application bancaire de l'utilisateur. Nous sommes le ${today}.`,
              'Liste chaque opération visible, une seule fois même si elle apparaît sur deux morceaux.',
              "Date : les en-têtes (« Aujourd'hui », « Hier », « Lundi 12 octobre ») valent pour les lignes en dessous ; sans année, prends la plus récente qui ne soit pas dans le futur.",
              'Sens : « depense » pour un débit (montant négatif, en rouge…), « revenu » pour un crédit (montant positif, « + », en vert…).',
              'Ignore les soldes, totaux, plafonds et boutons. Catégorie : l’identifiant le plus probable, ou null.',
              `Catégories :\n${list}`,
            ].join('\n'),
          },
        ],
      },
    ],
  });
  record([response.usage]);
  if (response.stop_reason === 'refusal') throw new AiError('Claude n’a pas voulu lire cette image.');
  const ops = response.parsed_output?.operations || [];
  const byId = new Map(categories.map((cat) => [cat.id, cat]));
  return ops
    .map((o) => {
      const type = o.sens === 'revenu' ? 'income' : 'expense';
      const cat = byId.get(o.categorie);
      return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : today,
        description: String(o.libelle || '').trim(),
        amount: Math.round(Math.abs(Number(o.montant) || 0) * 100),
        type,
        signGuessed: false,
        categoryId: cat && cat.type === type ? cat.id : null,
      };
    })
    .filter((r) => r.amount > 0 && r.description);
}
