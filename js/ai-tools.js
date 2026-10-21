// Outils de l'assistant IA : des calculs en lecture seule sur les données locales.
// Claude choisit l'outil et ses paramètres ; le calcul se fait dans le navigateur
// et seul son résultat (un petit JSON) lui est envoyé. Fonctions pures, testées.
import { benefitBalances } from './benefits.js';
import {
  accountBalances,
  budgetReport,
  byCategory,
  countedAccounts,
  filterTransactions,
  FREQUENCIES,
  goalStats,
  loanStatus,
  monthlyEquivalent,
  monthlyTotals,
  monthSavings,
  netWorth,
  nextOccurrence,
  plannedMonthlySavings,
  sortTransactions,
  summarize,
} from './calc.js';
import { ACCOUNT_TYPES } from './defaults.js';
import { babyPlan, balanceStatement, coupleLedger, partnerName, splitRatio } from './family.js';
import { cashForecast, recommendations } from './insights.js';
import { isValidISODate, monthEnd, monthKey, monthRange, monthStart, normalizeText, shiftMonth, sum, todayISO } from './utils.js';

const euros = (cents) => Math.round(cents) / 100;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

class ToolInputError extends Error {}

function month(value, today) {
  if (!value) return monthKey(today);
  if (!MONTH_RE.test(value)) throw new ToolInputError(`Mois invalide « ${value} » : format attendu AAAA-MM.`);
  return value;
}

function date(value, fallback) {
  if (!value) return fallback;
  if (!isValidISODate(value)) throw new ToolInputError(`Date invalide « ${value} » : format attendu AAAA-MM-JJ.`);
  return value;
}

function categoryFilter(state, value) {
  if (!value) return undefined;
  const wanted = normalizeText(value);
  const cat = state.categories.find((c) => c.id === value || normalizeText(c.name) === wanted) || state.categories.find((c) => normalizeText(c.name).includes(wanted));
  if (!cat) throw new ToolInputError(`Catégorie inconnue « ${value} ». Catégories : ${state.categories.map((c) => c.name).join(', ')}.`);
  return cat.id;
}

const str = (description) => ({ type: 'string', description });

/** Définitions envoyées à Claude (schémas stricts) et calculs correspondants. */
export const TOOLS = [
  {
    name: 'resume_du_mois',
    description: "Synthèse d'un mois : revenus, dépenses, épargne versée, reste à vivre, taux d'épargne, principales catégories de dépenses et comparaison avec le mois précédent. À utiliser pour toute question générale sur un mois.",
    schema: { mois: str('Mois au format AAAA-MM ; chaîne vide pour le mois en cours.') },
    run(state, input, today) {
      const m = month(input.mois, today);
      const sumUp = (mm) => {
        const txs = filterTransactions(state, { from: monthStart(mm), to: monthEnd(mm) });
        const s = summarize(txs);
        const saved = monthSavings(state, mm, today).done;
        return { txs, revenus: euros(s.income), depenses: euros(s.expense), epargne_versee: euros(saved), reste_a_vivre: euros(s.net - saved), nombre_operations: s.count };
      };
      const cur = sumUp(m);
      const prev = sumUp(shiftMonth(m, -1));
      return {
        mois: m,
        mois_en_cours: m === monthKey(today),
        revenus: cur.revenus,
        depenses: cur.depenses,
        epargne_versee: cur.epargne_versee,
        reste_a_vivre: cur.reste_a_vivre,
        taux_epargne_pct: cur.revenus > 0 ? Math.round(((cur.revenus - cur.depenses) / cur.revenus) * 100) : null,
        nombre_operations: cur.nombre_operations,
        principales_depenses: byCategory(state, cur.txs, 'expense')
          .slice(0, 6)
          .map((c) => ({ categorie: c.category.name, montant: euros(c.total), part_pct: Math.round(c.share * 100) })),
        mois_precedent: { revenus: prev.revenus, depenses: prev.depenses, reste_a_vivre: prev.reste_a_vivre },
      };
    },
  },
  {
    name: 'depenses_par_categorie',
    description: 'Total des dépenses (ou des revenus) par catégorie entre deux dates, avec le nombre d’opérations.',
    schema: {
      du: str('Date de début AAAA-MM-JJ ; chaîne vide pour le début du mois en cours.'),
      au: str('Date de fin AAAA-MM-JJ ; chaîne vide pour aujourd’hui.'),
      sens: { type: 'string', enum: ['depense', 'revenu'], description: 'Dépenses ou revenus.' },
    },
    run(state, input, today) {
      const from = date(input.du, monthStart(monthKey(today)));
      const to = date(input.au, today);
      const type = input.sens === 'revenu' ? 'income' : 'expense';
      const txs = filterTransactions(state, { from, to });
      const rows = byCategory(state, txs, type);
      return { du: from, au: to, total: euros(sum(rows, (r) => r.total)), categories: rows.map((c) => ({ categorie: c.category.name, montant: euros(c.total), operations: c.count })) };
    },
  },
  {
    name: 'rechercher_operations',
    description: "Recherche d'opérations par mot du libellé, catégorie, période et type. Renvoie le total et au plus 40 opérations (les plus récentes).",
    schema: {
      texte: str('Mot ou partie du libellé (ex. « carrefour ») ; chaîne vide pour tout.'),
      categorie: str('Nom de catégorie (ex. « Courses ») ; chaîne vide pour toutes.'),
      du: str('Date de début AAAA-MM-JJ ; chaîne vide pour sans limite.'),
      au: str('Date de fin AAAA-MM-JJ ; chaîne vide pour aujourd’hui.'),
      type: { type: 'string', enum: ['tous', 'depense', 'revenu', 'virement'], description: "Type d'opération." },
    },
    run(state, input, today) {
      const types = { depense: 'expense', revenu: 'income', virement: 'transfer' };
      const filters = {
        search: input.texte || undefined,
        categoryId: categoryFilter(state, input.categorie),
        from: input.du ? date(input.du) : undefined,
        to: date(input.au, today),
        type: types[input.type] || undefined,
      };
      const found = sortTransactions(filterTransactions(state, filters), 'date-desc');
      const accounts = new Map(state.accounts.map((a) => [a.id, a.name]));
      const cats = new Map(state.categories.map((c) => [c.id, c.name]));
      const signed = (t) => (t.type === 'expense' ? -t.amount : t.type === 'income' ? t.amount : 0);
      return {
        nombre: found.length,
        total_depenses: euros(sum(found.filter((t) => t.type === 'expense'), (t) => t.amount)),
        total_revenus: euros(sum(found.filter((t) => t.type === 'income'), (t) => t.amount)),
        operations: found.slice(0, 40).map((t) => ({
          date: t.date,
          libelle: t.description,
          montant: t.type === 'transfer' ? euros(t.amount) : euros(signed(t)),
          type: t.type === 'transfer' ? `virement vers ${accounts.get(t.toAccountId) || '?'}` : t.type === 'expense' ? 'dépense' : 'revenu',
          categorie: cats.get(t.categoryId) || null,
          compte: accounts.get(t.accountId) || null,
        })),
      };
    },
  },
  {
    name: 'evolution_mensuelle',
    description: 'Revenus, dépenses et solde de chacun des derniers mois (mois en cours compris).',
    schema: { nombre_de_mois: { type: 'integer', description: 'Nombre de mois, de 1 à 24.' } },
    run(state, input, today) {
      const n = Math.min(24, Math.max(1, Math.round(Number(input.nombre_de_mois) || 6)));
      const end = monthKey(today);
      return { mois: monthlyTotals(state, monthRange(shiftMonth(end, -(n - 1)), end)).map((r) => ({ mois: r.month, revenus: euros(r.income), depenses: euros(r.expense), solde: euros(r.net) })) };
    },
  },
  {
    name: 'budgets_du_mois',
    description: 'Budgets par catégorie pour un mois : montant prévu, dépensé, reste, état (ok, bientôt atteint, dépassé), et dépenses sans budget.',
    schema: { mois: str('Mois AAAA-MM ; chaîne vide pour le mois en cours.') },
    run(state, input, today) {
      const m = month(input.mois, today);
      const report = budgetReport(state, m, { alertThreshold: state.settings.budgetAlert });
      const status = { ok: 'dans le budget', warning: 'bientôt atteint', full: 'consommé', over: 'dépassé', none: 'sans budget' };
      return {
        mois: m,
        total_prevu: euros(report.totals.available),
        total_depense: euros(report.totals.spent),
        budgets: report.rows.map((r) => ({ categorie: r.category.name, prevu: euros(r.available), depense: euros(r.spent), reste: euros(r.remaining), etat: status[r.status] || r.status })),
      };
    },
  },
  {
    name: 'situation_des_comptes',
    description: "Soldes des comptes, patrimoine net, argent disponible d'ici la fin du mois, titres-restaurant, et prévision de trésorerie sur 90 jours (point le plus bas).",
    schema: {},
    run(state, _input, today) {
      const balances = accountBalances(state, today);
      const worth = netWorth(state, today);
      const forecast = cashForecast(state, today, 90);
      return {
        comptes: state.accounts
          .filter((a) => !a.archived)
          .map((a) => ({ nom: a.name, type: ACCOUNT_TYPES[a.type]?.label || a.type, solde: euros(balances.get(a.id) || 0), compte_dans_le_total: a.includeInTotal !== false })),
        solde_total: euros(sum(countedAccounts(state), (a) => balances.get(a.id) || 0)),
        patrimoine_net: euros(worth.net),
        credits_restants: euros(worth.debts),
        disponible_jusqu_a_fin_du_mois: euros(forecast.available),
        titres_et_avantages: euros(benefitBalances(state, today).total),
        point_bas_90_jours: { date: forecast.min.date, solde: euros(forecast.min.balance) },
      };
    },
  },
  {
    name: 'charges_fixes',
    description: 'Revenus fixes, charges fixes, épargne programmée et reste à vivre mensuel, avec la liste des opérations récurrentes (prochaine échéance).',
    schema: {},
    run(state) {
      const active = state.recurring.filter((r) => r.active);
      const income = sum(active.filter((r) => r.type === 'income'), monthlyEquivalent);
      const costs = sum(active.filter((r) => r.type === 'expense'), monthlyEquivalent);
      const saving = plannedMonthlySavings(state);
      const cats = new Map(state.categories.map((c) => [c.id, c.name]));
      return {
        revenus_fixes_par_mois: euros(income),
        charges_fixes_par_mois: euros(costs),
        epargne_programmee_par_mois: euros(saving),
        reste_a_vivre_par_mois: euros(income - costs - saving),
        recurrences: active.map((r) => ({
          libelle: r.description,
          type: r.type === 'income' ? 'revenu' : r.type === 'expense' ? 'dépense' : 'virement',
          montant: euros(r.amount),
          frequence: FREQUENCIES[r.frequency]?.label || r.frequency,
          categorie: cats.get(r.categoryId) || null,
          prochaine_echeance: nextOccurrence(r),
        })),
      };
    },
  },
  {
    name: 'objectifs_et_credits',
    description: "Objectifs d'épargne (montant visé, épargné, effort mensuel nécessaire, échéance) et crédits en cours (capital restant, mensualité, fin).",
    schema: {},
    run(state, _input, today) {
      return {
        objectifs: state.goals
          .filter((g) => !g.archived)
          .map((g) => {
            const st = goalStats(g, today);
            return { nom: g.name, vise: euros(g.target), epargne: euros(st.saved), reste: euros(st.remaining), echeance: g.deadline, effort_mensuel_necessaire: st.monthlyNeeded ? euros(st.monthlyNeeded) : null, atteint: st.done };
          }),
        credits: state.debts.map((d) => {
          const st = loanStatus(d, today);
          return { nom: d.name, capital_restant: euros(st.remaining), mensualite: euros(st.monthly), fin: st.endDate, taux_pct: d.rate };
        }),
      };
    },
  },
  {
    name: 'famille',
    description: "Budget à deux (règle de partage, qui doit combien à qui) et plan d'arrivée de bébé s'il existe (date, somme à épargner, coût de la première année, aides).",
    schema: {},
    run(state, _input, today) {
      const h = state.household;
      const out = { mode_couple: !!h?.enabled };
      if (h?.enabled) {
        const ratio = splitRatio(h);
        const balance = balanceStatement(h, coupleLedger(state).net);
        out.couple = {
          personnes: h.partners.map((p) => ({ prenom: p.name, revenus_nets_mensuels: euros(p.income) })),
          partage: h.split === 'equal' ? '50/50' : `${Math.round(ratio.p1 * 100)} / ${Math.round(ratio.p2 * 100)}`,
          equilibre: balance.amount ? `${partnerName(h, balance.debtor)} doit ${euros(balance.amount)} € à ${partnerName(h, balance.creditor)}` : "à l'équilibre",
        };
      }
      const plan = state.baby?.dueDate ? babyPlan(state.baby, h, { today }) : null;
      if (plan) {
        out.bebe = {
          naissance_prevue: plan.due,
          nombre: plan.count,
          a_epargner_avant_la_naissance: euros(plan.savingsTarget),
          epargne_mensuelle_conseillee: euros(plan.monthlySaving),
          cout_net_premiere_annee: euros(plan.totals.firstYearCosts + plan.totals.firstYearLoss - plan.totals.firstYearAids),
          aides_premiere_annee: euros(plan.totals.firstYearAids),
          cout_mensuel_ensuite: euros(plan.steadyMonthly.net),
        };
      }
      return out;
    },
  },
  {
    name: 'conseils_d_optimisation',
    description: "Conseils déjà calculés par l'application (rubrique Optimisation) : priorité, titre, explication, gain annuel estimé.",
    schema: {},
    run(state, _input, today) {
      return {
        conseils: recommendations(state, today)
          .filter((t) => !t.dismissed)
          .slice(0, 10)
          .map((t) => ({ priorite: { high: 'haute', medium: 'moyenne', low: 'basse' }[t.severity], titre: t.title, explication: t.text, gain_annuel: t.gain ? euros(t.gain) : null })),
      };
    },
  },
];

/** Schéma JSON strict d'un outil : toutes les propriétés sont requises (chaîne vide = non précisé). */
export function toolInputSchema(tool) {
  return { type: 'object', properties: tool.schema, required: Object.keys(tool.schema), additionalProperties: false };
}

/** Exécute un outil ; une erreur de saisie est renvoyée à Claude pour qu'il corrige sa demande. */
export function runTool(name, input, state, today = todayISO()) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { erreur: `Outil inconnu : ${name}` };
  try {
    return tool.run(state, input || {}, today);
  } catch (error) {
    if (error instanceof ToolInputError) return { erreur: error.message };
    throw error;
  }
}

export const TOOL_LABELS = {
  resume_du_mois: 'synthèse du mois',
  depenses_par_categorie: 'dépenses par catégorie',
  rechercher_operations: 'recherche dans les opérations',
  evolution_mensuelle: 'évolution sur plusieurs mois',
  budgets_du_mois: 'budgets',
  situation_des_comptes: 'soldes et prévision',
  charges_fixes: 'charges fixes',
  objectifs_et_credits: 'objectifs et crédits',
  famille: 'couple et bébé',
  conseils_d_optimisation: 'conseils',
};
