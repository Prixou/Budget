// Avantages salariés : titres-restaurant, CESU préfinancés, chèques-vacances, chèques cadeaux.
// Ils sont suivis comme des comptes (type « avantages ») dont le solde ne sert qu'à certaines dépenses.
// Fonctions pures ; règles 2026 dans defaults.js (BENEFITS, MEAL_VOUCHERS), sources dans docs/RECHERCHE.md.
import { accountBalances } from './calc.js';
import { BENEFITS, MEAL_VOUCHERS } from './defaults.js';
import { daysInMonth, sum, todayISO } from './utils.js';

export const isBenefit = (account) => account?.type === 'avantages';

export function benefitKind(account) {
  return BENEFITS[account?.benefit] ? account.benefit : 'restaurant';
}

/**
 * Date limite d'utilisation du solde de l'année.
 * Titres-restaurant : année civile + janvier et février. En janvier-février, c'est le solde
 * de l'année précédente qui arrive à échéance. CESU : 31 janvier de l'année suivante.
 */
export function benefitExpiry(kind, today = todayISO()) {
  const rule = BENEFITS[kind]?.expires;
  if (!rule) return null;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (rule === '02-end') {
    const year = m <= 2 ? y : y + 1;
    return `${year}-02-${daysInMonth(year, 1)}`;
  }
  const [em] = rule.split('-').map(Number);
  const year = m <= em ? y : y + 1;
  return `${year}-${rule}`;
}

/** La dépense peut-elle être réglée avec cet avantage ? */
export function benefitAccepts(kind, categoryId, date = todayISO()) {
  const info = BENEFITS[kind];
  if (!info || !categoryId) return false;
  if (kind === 'restaurant' && categoryId === 'cat-courses') return date <= MEAL_VOUCHERS.groceriesUntil;
  return info.categories.includes(categoryId);
}

/** Soldes des comptes d'avantages actifs. */
export function benefitBalances(state, today = todayISO()) {
  const balances = accountBalances(state, today);
  const accounts = state.accounts
    .filter((a) => !a.archived && isBenefit(a))
    .map((account) => {
      const kind = benefitKind(account);
      return { account, kind, info: BENEFITS[kind], balance: balances.get(account.id) || 0, expires: benefitExpiry(kind, today) };
    });
  const positive = (list) => sum(list, (x) => Math.max(0, x.balance));
  return {
    accounts,
    total: positive(accounts),
    meal: positive(accounts.filter((x) => x.kind === 'restaurant')),
  };
}

/** Montant déjà réglé ce jour-là avec un compte (plafond journalier des titres-restaurant). */
export function spentOn(state, accountId, date, excludeId = null) {
  return sum(
    state.transactions.filter((t) => t.type === 'expense' && t.accountId === accountId && t.date === date && t.id !== excludeId),
    (t) => t.amount,
  );
}

/**
 * Crédit mensuel de titres-restaurant : valeur totale, part de l'employeur (avantage réel)
 * et part du salarié, déjà retenue sur le salaire net.
 */
export function voucherCredit({ count = 0, value = 0, employerShare = 60 } = {}) {
  const total = Math.round(count * value);
  const employer = Math.round((total * employerShare) / 100);
  return { total, employer, employee: total - employer, exempt: employerShare >= MEAL_VOUCHERS.employerShare.min && employerShare <= MEAL_VOUCHERS.employerShare.max && (value * employerShare) / 100 <= MEAL_VOUCHERS.employerExemptionMax };
}

/** Prochaine date de crédit (jour du mois) après aujourd'hui. */
export function nextCreditDate(day, today = todayISO()) {
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const target = Math.min(28, Math.max(1, Number(day) || 1));
  if (target <= d) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
}
