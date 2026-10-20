// Comptes : soldes, patrimoine, rapprochement bancaire.
import { accountBalances, balanceSeries, netWorth, totalBalance } from '../calc.js';
import { chartSlot } from '../charts.js';
import { kpi } from '../components.js';
import { benefitExpiry, benefitKind, isBenefit, nextCreditDate, voucherCredit } from '../benefits.js';
import { ACCOUNT_TYPES, BENEFITS, MEAL_VOUCHERS, REFERENCE, SAVINGS_PRODUCTS } from '../defaults.js';
import { amountField } from '../forms.js';
import { adjustBalance, deleteAccount, deleteRecurring, ensureCategory, saveAccount, saveRecurring, setCleared, store } from '../store.js';
import { accountOptions, confirmDialog, emptyState, fieldError, formValues, icon, openModal, options, toast } from '../ui.js';
import {
  capitalize,
  formatDate,
  formatMoney,
  html,
  isValidISODate,
  monthEnd,
  monthKey,
  monthLabel,
  monthRange,
  parseAmount,
  pluralize,
  raw,
  shiftMonth,
  todayISO,
} from '../utils.js';

const ui = { chartAccount: '' };

/** Crédit mensuel d'un compte d'avantages : une récurrence de revenu, créée, modifiée ou supprimée. */
function syncBenefitCredit(account) {
  const id = `rec-avantage-${account.id}`;
  const existing = store.state.recurring.find((r) => r.id === id);
  const credit = account.credit;
  if (!credit?.amount) {
    if (existing) deleteRecurring(id);
    return;
  }
  ensureCategory('cat-avantages');
  const sameDay = existing && Number(existing.startDate.slice(8, 10)) === credit.day;
  saveRecurring({
    id,
    type: 'income',
    amount: credit.amount,
    accountId: account.id,
    toAccountId: null,
    categoryId: 'cat-avantages',
    description: `Crédit ${BENEFITS[benefitKind(account)].label.toLowerCase()}`,
    frequency: 'monthly',
    startDate: sameDay ? existing.startDate : nextCreditDate(credit.day),
    endDate: null,
    lastDate: sameDay ? existing.lastDate : null,
    autoCreate: true,
    active: true,
    tags: [],
  });
}

function benefitFields(v) {
  const kind = BENEFITS[v.benefit] ? v.benefit : 'restaurant';
  const c = v.credit || {};
  const days = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: i === 0 ? 'le 1er' : `le ${i + 1}` }));
  return html`<div class="stack-v benefit-fields" data-benefit ${v.type === 'avantages' ? '' : raw('hidden')}>
    <label class="field"><span>Avantage</span><select class="select" name="benefit" id="a-benefit">${options(
      Object.entries(BENEFITS).map(([value, b]) => ({ value, label: b.label })),
      kind,
    )}</select><span class="hint" data-benefit-use></span></label>
    <div class="form-row" data-voucher>
      <label class="field"><span>Titres par mois</span><input class="input" type="number" name="vCount" id="a-vcount" min="0" max="31" step="1" inputmode="numeric" placeholder="Ex. : 18" value="${c.count ?? ''}"></label>
      ${amountField({ name: 'vValue', label: 'Valeur d’un titre', value: c.value ?? null, required: false })}
    </div>
    <div class="form-row">
      <label class="field" data-voucher><span>Part payée par l’employeur</span><div class="input-with-suffix"><input class="input" type="number" name="vShare" id="a-vshare" min="0" max="100" step="1" value="${c.share ?? 60}"><span class="suffix">%</span></div></label>
      <div data-credit-amount>${amountField({ name: 'creditAmount', label: 'Crédit mensuel', value: kind === 'restaurant' ? null : c.amount ?? null, required: false })}</div>
      <label class="field"><span>Crédité</span><select class="select" name="vDay" id="a-vday">${options(days, c.day || 1)}</select></label>
    </div>
    <p class="small muted" data-credit-summary></p>
  </div>`;
}

function bindBenefitFields(form) {
  const box = form.querySelector('[data-benefit]');
  const update = () => {
    const v = formValues(form);
    box.hidden = v.type !== 'avantages';
    if (box.hidden) return;
    const meal = v.benefit === 'restaurant';
    box.querySelectorAll('[data-voucher]').forEach((n) => (n.hidden = !meal));
    box.querySelector('[data-credit-amount]').hidden = meal;
    box.querySelector('[data-benefit-use]').textContent = `Utilisable pour : ${BENEFITS[v.benefit].use}.`;
    const summary = box.querySelector('[data-credit-summary]');
    if (!meal) {
      summary.textContent = 'Facultatif : le crédit sera ajouté automatiquement chaque mois.';
      return;
    }
    const value = parseAmount(v.vValue) || 0;
    const c = voucherCredit({ count: Number(v.vCount) || 0, value, employerShare: Number(v.vShare) || 0 });
    summary.textContent = c.total
      ? `Crédit mensuel : ${formatMoney(c.total)}, dont ${formatMoney(c.employer)} payés par l’employeur. Votre part (${formatMoney(c.employee)}) est déjà retenue sur votre salaire net.${c.exempt ? '' : ` L’employeur paie en principe de ${MEAL_VOUCHERS.employerShare.min} à ${MEAL_VOUCHERS.employerShare.max} % du titre.`}`
      : 'Indiquez le nombre de titres et leur valeur (sur votre fiche de paie) : le crédit sera ajouté chaque mois.';
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
}

/** Lit le crédit mensuel saisi ; renvoie undefined (et signale l'erreur) si une valeur est invalide. */
function readCredit(form, v) {
  const day = Number(v.vDay) || 1;
  if (v.benefit === 'restaurant') {
    const count = v.vCount === '' ? 0 : Number(v.vCount);
    if (!Number.isInteger(count) || count < 0 || count > 31) return fieldError(form, 'vCount', 'Nombre de titres invalide (0 à 31).');
    const value = v.vValue.trim() ? parseAmount(v.vValue) : 0;
    if (value == null || value < 0) return fieldError(form, 'vValue', 'Montant invalide.');
    const share = Math.min(100, Math.max(0, Number(v.vShare) || 0));
    return { count, value, share, day, amount: count * value };
  }
  const amount = v.creditAmount.trim() ? parseAmount(v.creditAmount) : 0;
  if (amount == null || amount < 0) return fieldError(form, 'creditAmount', 'Montant invalide.');
  return { amount, day };
}

export function openAccountForm(account = null) {
  const editing = !!account;
  const v = { name: '', type: 'courant', product: '', initialBalance: 0, includeInTotal: true, archived: false, ...(account || {}) };
  openModal({
    title: editing ? 'Modifier le compte' : 'Nouveau compte',
    size: 'sm',
    body: html`<form class="form" id="account-form" novalidate>
      <label class="field"><span>Nom du compte</span><input class="input" name="name" id="a-name" maxlength="60" required placeholder="Ex. : Compte joint, Livret A…" value="${v.name}"></label>
      <label class="field"><span>Type</span><select class="select" name="type" id="a-type">${options(
        Object.entries(ACCOUNT_TYPES).map(([value, t]) => ({ value, label: t.label })),
        v.type,
      )}</select></label>
      <label class="field" data-product ${v.type === 'epargne' ? '' : raw('hidden')}><span>Produit d'épargne</span><select class="select" name="product" id="a-product">${options(
        Object.entries(SAVINGS_PRODUCTS).map(([value, p]) => ({ value, label: `${p.label}${p.rate ? ` · ${String(p.rate).replace('.', ',')} %` : ''}` })),
        v.product,
        { placeholder: 'Non précisé' },
      )}</select><span class="hint">Permet de connaître le taux et le plafond, et d'affiner les conseils. Taux au ${formatDate(REFERENCE.ratesDate)}.</span></label>
      ${benefitFields(v)}
      ${amountField({ name: 'initialBalance', label: 'Solde initial', value: v.initialBalance, required: false, hint: 'Solde du compte avant la première opération saisie (pour une carte de titres : son solde actuel).' })}
      ${store.state.household?.enabled
        ? html`<label class="field"><span>Titulaire</span><select class="select" name="owner" id="a-owner">${options(
            [
              { value: 'joint', label: 'Compte commun' },
              { value: 'p1', label: `${store.state.household.partners[0].name} (personnel)` },
              { value: 'p2', label: `${store.state.household.partners[1].name} (personnel)` },
            ],
            v.owner || 'joint',
          )}</select><span class="hint">Sert à savoir qui a payé une dépense commune.</span></label>`
        : ''}
      <label class="check"><input type="checkbox" name="includeInTotal" id="a-include" ${v.includeInTotal !== false ? raw('checked') : ''}><span>Inclure dans le solde total</span></label>
      ${editing ? html`<label class="check"><input type="checkbox" name="archived" id="a-archived" ${v.archived ? raw('checked') : ''}><span>Compte clôturé (masqué des listes)</span></label>` : ''}
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="account-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer le compte'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      form.elements.type.addEventListener('change', () => {
        el.querySelector('[data-product]').hidden = form.elements.type.value !== 'epargne';
      });
      bindBenefitFields(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = formValues(form);
        if (!values.name.trim()) return fieldError(form, 'name', 'Donnez un nom au compte.');
        const initial = values.initialBalance.trim() === '' ? 0 : parseAmount(values.initialBalance);
        if (initial == null) return fieldError(form, 'initialBalance', 'Montant invalide.');
        const benefit = values.type === 'avantages';
        const credit = benefit ? readCredit(form, values) : null;
        if (credit === undefined) return;
        const saved = saveAccount({
          id: account?.id,
          name: values.name.trim(),
          type: values.type,
          product: values.type === 'epargne' ? values.product || null : null,
          owner: values.owner || account?.owner || 'joint',
          initialBalance: initial,
          includeInTotal: values.includeInTotal,
          archived: !!values.archived,
          benefit: benefit ? values.benefit : null,
          credit,
        });
        if (benefit || account?.credit) syncBenefitCredit(saved);
        toast(editing ? 'Compte modifié' : 'Compte créé');
        close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const count = store.state.transactions.filter((t) => t.accountId === account.id || t.toAccountId === account.id).length;
        const ok = await confirmDialog({
          title: 'Supprimer le compte',
          message: `Le compte « ${account.name} » et ses ${pluralize(count, 'opération')} seront supprimés. Pour conserver l'historique, préférez « Compte clôturé ».`,
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        deleteAccount(account.id);
        toast('Compte supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
      });
    },
  });
}

function openReconcile(account) {
  const today = todayISO();
  openModal({
    title: `Rapprocher « ${account.name} »`,
    size: 'sm',
    body: html`<form class="form" id="rec-form" novalidate>
      <p class="muted">Saisissez le solde affiché sur votre relevé ou votre application bancaire. L'écart éventuel sera corrigé par une opération d'ajustement.</p>
      ${amountField({ name: 'actual', label: 'Solde réel', value: null })}
      <label class="field"><span>À la date du</span><input class="input" type="date" name="date" id="r-date" value="${today}"></label>
      <p class="small" id="rec-diff"></p>
      <label class="check"><input type="checkbox" name="markCleared" id="r-mark" checked><span>Pointer toutes les opérations jusqu'à cette date</span></label>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="rec-form" class="btn btn-primary">Valider</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const diffEl = el.querySelector('#rec-diff');
      const update = () => {
        const v = formValues(form);
        const actual = parseAmount(v.actual);
        const date = isValidISODate(v.date) ? v.date : today;
        const current = accountBalances(store.state, date).get(account.id) || 0;
        if (actual == null) {
          diffEl.textContent = `Solde calculé au ${formatDate(date)} : ${formatMoney(current)}`;
          return;
        }
        const diff = actual - current;
        diffEl.textContent = diff === 0 ? 'Les soldes correspondent. Aucun ajustement nécessaire.' : `Solde calculé : ${formatMoney(current)}. Un ajustement de ${formatMoney(diff, { sign: 'always' })} sera créé.`;
      };
      form.addEventListener('input', update);
      update();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const actual = parseAmount(v.actual);
        if (actual == null) return fieldError(form, 'actual', 'Indiquez le solde de votre relevé.');
        const date = isValidISODate(v.date) ? v.date : today;
        if (v.markCleared) {
          const ids = store.state.transactions.filter((t) => (t.accountId === account.id || t.toAccountId === account.id) && t.date <= date).map((t) => t.id);
          setCleared(ids, true);
        }
        const tx = adjustBalance(account.id, actual, date);
        toast(tx ? 'Ajustement créé, compte rapproché' : 'Compte rapproché');
        close();
      });
    },
  });
}

export default {
  id: 'comptes',
  title: 'Comptes',
  icon: 'wallet',

  actions() {
    return html`<button type="button" class="btn btn-primary" data-new-account>${icon('plus', { size: 16 })} <span class="desktop-only">Nouveau compte</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-new-account]')?.addEventListener('click', () => openAccountForm());
  },

  render({ state }) {
    const today = todayISO();
    if (!state.accounts.length) {
      return html`<section class="card">${emptyState({
        iconName: 'wallet',
        title: 'Aucun compte',
        text: 'Créez vos comptes : compte courant, livrets, espèces, carte de crédit, placements…',
        action: html`<button type="button" class="btn btn-primary" data-new-account-inline>${icon('plus', { size: 16 })} Créer un compte</button>`,
      })}</section>`;
    }
    const balances = accountBalances(state, today);
    const cleared = accountBalances(state, today, { clearedOnly: true });
    const future = accountBalances(state, null);
    const worth = netWorth(state, today);
    const active = state.accounts.filter((a) => !a.archived);
    const archived = state.accounts.filter((a) => a.archived);
    const counts = new Map();
    const month = monthKey(today);
    for (const t of state.transactions) {
      if (monthKey(t.date) !== month) continue;
      counts.set(t.accountId, (counts.get(t.accountId) || 0) + 1);
      if (t.toAccountId) counts.set(t.toAccountId, (counts.get(t.toAccountId) || 0) + 1);
    }
    if (ui.chartAccount && !state.accounts.some((a) => a.id === ui.chartAccount)) ui.chartAccount = '';
    const months = monthRange(shiftMonth(month, -11), month);
    const dates = months.map((m) => (m === month ? today : monthEnd(m)));
    const series = balanceSeries(state, dates, ui.chartAccount || null);

    const card = (a) => {
      const bal = balances.get(a.id) || 0;
      const pending = (future.get(a.id) || 0) - bal;
      const product = a.type === 'epargne' ? SAVINGS_PRODUCTS[a.product] : null;
      const benefit = isBenefit(a) ? BENEFITS[benefitKind(a)] : null;
      const expires = benefit ? benefitExpiry(benefitKind(a), today) : null;
      return html`<article class="card tile">
        <div class="tile-head">
          <span class="acct-icon">${icon(ACCOUNT_TYPES[a.type]?.icon || 'wallet', { size: 20 })}</span>
          <div class="grow">
            <h3>${a.name}</h3>
            <p class="muted small">${product ? product.label : benefit ? benefit.label : ACCOUNT_TYPES[a.type]?.label || 'Compte'}${state.household?.enabled ? ` · ${a.owner === 'p1' || a.owner === 'p2' ? state.household.partners[a.owner === 'p1' ? 0 : 1].name : 'commun'}` : ''}${a.includeInTotal === false ? ' · hors total' : ''}${a.archived ? ' · clôturé' : ''}</p>
          </div>
          <button type="button" class="icon-btn icon-btn-sm" data-edit-account="${a.id}" aria-label="Modifier ${a.name}">${icon('edit', { size: 16 })}</button>
        </div>
        <div class="tile-value money ${bal < 0 ? 'neg' : ''}">${formatMoney(bal)}</div>
        <dl class="stat-list">
          <div><dt>Solde pointé</dt><dd class="money">${formatMoney(cleared.get(a.id) || 0)}</dd></div>
          <div><dt>Opérations ce mois</dt><dd>${counts.get(a.id) || 0}</dd></div>
          ${pending ? html`<div><dt>Opérations futures</dt><dd class="money">${formatMoney(pending, { sign: 'always' })}</dd></div>` : ''}
          ${product?.rate ? html`<div><dt>Intérêts estimés / an</dt><dd class="money">${formatMoney(Math.round((Math.max(0, bal) * product.rate) / 100))} <span class="muted small">à ${String(product.rate).replace('.', ',')} %</span></dd></div>` : ''}
          ${benefit ? html`<div><dt>Utilisable pour</dt><dd>${benefit.use}</dd></div>` : ''}
          ${benefit && benefitKind(a) === 'restaurant'
            ? html`<div><dt>Plafond</dt><dd class="money">${formatMoney(MEAL_VOUCHERS.dailyCap, { decimals: false })} par jour</dd></div>
                <div><dt>Courses alimentaires</dt><dd>${today <= MEAL_VOUCHERS.groceriesUntil ? `acceptées jusqu’au ${formatDate(MEAL_VOUCHERS.groceriesUntil)}` : 'plus acceptées'}</dd></div>`
            : ''}
          ${benefit && a.credit?.amount ? html`<div><dt>Crédit mensuel</dt><dd class="money">${formatMoney(a.credit.amount)}${a.credit.share ? html` <span class="muted small">dont ${formatMoney(voucherCredit({ count: a.credit.count, value: a.credit.value, employerShare: a.credit.share }).employer)} employeur</span>` : ''}</dd></div>` : ''}
          ${expires && bal > 0 ? html`<div><dt>Solde à utiliser avant le</dt><dd>${formatDate(expires)}</dd></div>` : ''}
          ${product?.cap ? html`<div><dt>Plafond de dépôt</dt><dd class="money">${formatMoney(product.cap, { decimals: false })} <span class="muted small">(${Math.min(100, Math.round((Math.max(0, bal) / product.cap) * 100))} %)</span></dd></div>` : ''}
        </dl>
        <div class="row">
          <a class="btn btn-sm" href="#transactions?account=${a.id}&all=1">${icon('list', { size: 14 })} Opérations</a>
          <button type="button" class="btn btn-sm" data-reconcile="${a.id}">${icon('check', { size: 14 })} Rapprocher</button>
        </div>
      </article>`;
    };

    return html`
      <section class="kpis kpis-cards">
        ${kpi('Solde total', formatMoney(totalBalance(state, today)))}
        ${kpi('Actifs', formatMoney(worth.assets))}
        ${kpi('Dettes et découverts', formatMoney(worth.liabilities))}
        ${kpi('Patrimoine net', html`<span class="${worth.net < 0 ? 'neg' : ''}">${formatMoney(worth.net)}</span>`)}
      </section>

      <section class="card">
        <div class="card-header">
          <div><h2>Évolution du solde</h2><p class="sub">12 derniers mois, solde en fin de mois</p></div>
          <label class="field" style="min-width:200px"><span class="sr-only">Compte affiché</span><select class="select" id="chart-account">${accountOptions(state.accounts, ui.chartAccount, { includeArchived: true, placeholder: 'Tous les comptes (hors exclus)' })}</select></label>
        </div>
        ${chartSlot({
          type: 'line',
          height: 240,
          label: 'Évolution du solde sur 12 mois',
          labels: months.map((m) => capitalize(monthLabel(m, { short: true, year: false }))),
          tipLabels: months.map((m, i) => (m === month ? `Aujourd'hui (${formatDate(today)})` : `Fin ${monthLabel(m)}`)),
          values: series.map((p) => p.balance),
          seriesLabel: 'Solde',
        })}
      </section>

      <div class="cards">${active.map(card)}</div>

      ${archived.length
        ? html`<details class="card disclosure"><summary>Comptes clôturés (${archived.length}) ${icon('down', { size: 14 })}</summary><div class="cards" style="margin-top:14px">${archived.map(card)}</div></details>`
        : ''}
    `;
  },

  mount(root, { rerender }) {
    const state = store.state;
    root.querySelectorAll('[data-edit-account]').forEach((b) => b.addEventListener('click', () => openAccountForm(state.accounts.find((a) => a.id === b.dataset.editAccount))));
    root.querySelectorAll('[data-reconcile]').forEach((b) => b.addEventListener('click', () => openReconcile(state.accounts.find((a) => a.id === b.dataset.reconcile))));
    root.querySelector('[data-new-account-inline]')?.addEventListener('click', () => openAccountForm());
    root.querySelector('#chart-account')?.addEventListener('change', (e) => {
      ui.chartAccount = e.target.value;
      rerender();
    });
  },
};
