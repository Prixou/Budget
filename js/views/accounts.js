// Comptes : soldes, patrimoine, rapprochement bancaire.
import { accountBalances, balanceSeries, netWorth, totalBalance } from '../calc.js';
import { chartSlot } from '../charts.js';
import { kpi } from '../components.js';
import { ACCOUNT_TYPES } from '../defaults.js';
import { amountField } from '../forms.js';
import { adjustBalance, deleteAccount, saveAccount, setCleared, store } from '../store.js';
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

export function openAccountForm(account = null) {
  const editing = !!account;
  const v = { name: '', type: 'courant', initialBalance: 0, includeInTotal: true, archived: false, ...(account || {}) };
  openModal({
    title: editing ? 'Modifier le compte' : 'Nouveau compte',
    size: 'sm',
    body: html`<form class="form" id="account-form" novalidate>
      <label class="field"><span>Nom du compte</span><input class="input" name="name" id="a-name" maxlength="60" required placeholder="Ex. : Compte joint, Livret A…" value="${v.name}"></label>
      <label class="field"><span>Type</span><select class="select" name="type" id="a-type">${options(
        Object.entries(ACCOUNT_TYPES).map(([value, t]) => ({ value, label: t.label })),
        v.type,
      )}</select></label>
      ${amountField({ name: 'initialBalance', label: 'Solde initial', value: v.initialBalance, required: false, hint: 'Solde du compte avant la première opération saisie. Peut être négatif.' })}
      <label class="check"><input type="checkbox" name="includeInTotal" id="a-include" ${v.includeInTotal !== false ? raw('checked') : ''}><span>Inclure dans le solde total</span></label>
      ${editing ? html`<label class="check"><input type="checkbox" name="archived" id="a-archived" ${v.archived ? raw('checked') : ''}><span>Compte clôturé (masqué des listes)</span></label>` : ''}
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="account-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer le compte'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = formValues(form);
        if (!values.name.trim()) return fieldError(form, 'name', 'Donnez un nom au compte.');
        const initial = values.initialBalance.trim() === '' ? 0 : parseAmount(values.initialBalance);
        if (initial == null) return fieldError(form, 'initialBalance', 'Montant invalide.');
        saveAccount({
          id: account?.id,
          name: values.name.trim(),
          type: values.type,
          initialBalance: initial,
          includeInTotal: values.includeInTotal,
          archived: !!values.archived,
        });
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
      return html`<article class="card tile">
        <div class="tile-head">
          <span class="acct-icon">${icon(ACCOUNT_TYPES[a.type]?.icon || 'wallet', { size: 20 })}</span>
          <div class="grow">
            <h3>${a.name}</h3>
            <p class="muted small">${ACCOUNT_TYPES[a.type]?.label || 'Compte'}${a.includeInTotal === false ? ' · hors total' : ''}${a.archived ? ' · clôturé' : ''}</p>
          </div>
          <button type="button" class="icon-btn icon-btn-sm" data-edit-account="${a.id}" aria-label="Modifier ${a.name}">${icon('edit', { size: 16 })}</button>
        </div>
        <div class="tile-value money ${bal < 0 ? 'neg' : ''}">${formatMoney(bal)}</div>
        <dl class="stat-list">
          <div><dt>Solde pointé</dt><dd class="money">${formatMoney(cleared.get(a.id) || 0)}</dd></div>
          <div><dt>Opérations ce mois</dt><dd>${counts.get(a.id) || 0}</dd></div>
          ${pending ? html`<div><dt>Opérations futures</dt><dd class="money">${formatMoney(pending, { sign: 'always' })}</dd></div>` : ''}
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
