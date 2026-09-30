// Liste des opérations : recherche, filtres, actions groupées, import / export.
import { filterTransactions, sortTransactions, summarize } from '../calc.js';
import { groupedTxList, lookups, monthNav } from '../components.js';
import { toCSV } from '../csv.js';
import { deleteTransactions, recategorize, setCleared, store } from '../store.js';
import { accountOptions, confirmDialog, emptyState, icon, offerFile, options, toast } from '../ui.js';
import { centsToInput, formatMoney, html, monthEnd, monthStart, pluralize, raw, todayISO } from '../utils.js';

const PAGE = 100;

const ui = {
  period: 'month',
  from: '',
  to: '',
  type: '',
  accountId: '',
  categoryId: '',
  cleared: '',
  tag: '',
  search: '',
  sort: 'date-desc',
  limit: PAGE,
  showFilters: false,
  selected: new Set(),
};

function currentFilters(session) {
  const f = {
    type: ui.type || undefined,
    accountId: ui.accountId || undefined,
    categoryId: ui.categoryId || undefined,
    cleared: ui.cleared || undefined,
    tag: ui.tag || undefined,
    search: ui.search || undefined,
  };
  if (ui.period === 'month') {
    f.from = monthStart(session.month);
    f.to = monthEnd(session.month);
  } else if (ui.period === 'custom') {
    f.from = ui.from || undefined;
    f.to = ui.to || undefined;
  }
  return f;
}

function activeFilterCount() {
  return ['type', 'accountId', 'categoryId', 'cleared', 'tag'].filter((k) => ui[k]).length;
}

function exportCSV(state, txs) {
  const maps = lookups(state);
  const labels = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' };
  const rows = [['Date', 'Type', 'Montant', 'Compte', 'Compte destination', 'Catégorie', 'Libellé', 'Étiquettes', 'Notes', 'Pointée']];
  for (const t of sortTransactions(txs, 'date-asc')) {
    const signed = t.type === 'expense' ? -t.amount : t.amount;
    rows.push([
      t.date,
      labels[t.type],
      centsToInput(signed) || '0',
      maps.acc.get(t.accountId)?.name || '',
      maps.acc.get(t.toAccountId)?.name || '',
      maps.cat.get(t.categoryId)?.name || '',
      t.description,
      (t.tags || []).join(', '),
      t.notes,
      t.cleared ? 'oui' : 'non',
    ]);
  }
  offerFile(`operations-${todayISO()}.csv`, toCSV(rows), 'text/csv');
}

export default {
  id: 'transactions',
  title: 'Opérations',
  icon: 'list',

  enter({ params, session }) {
    ui.selected.clear();
    ui.limit = PAGE;
    if (params.account || params.category || params.tag || params.search) {
      Object.assign(ui, { type: '', accountId: '', categoryId: '', cleared: '', tag: '', search: '' });
      if (params.account) ui.accountId = params.account;
      if (params.category) ui.categoryId = params.category;
      if (params.tag) ui.tag = params.tag;
      if (params.search) ui.search = params.search;
      ui.showFilters = true;
    }
    if (params.month) {
      ui.period = 'month';
      session.month = params.month;
    }
    if (params.all) ui.period = 'all';
  },

  actions() {
    return html`<button type="button" class="icon-btn" data-import title="Importer un relevé CSV" aria-label="Importer un relevé CSV">${icon('upload')}</button>
      <button type="button" class="icon-btn" data-export title="Exporter en CSV" aria-label="Exporter en CSV">${icon('download')}</button>
      <button type="button" class="btn btn-primary desktop-only" data-action="add-tx">${icon('plus', { size: 16 })} Ajouter</button>`;
  },

  render({ state, session }) {
    const maps = lookups(state);
    const filters = currentFilters(session);
    const all = sortTransactions(filterTransactions(state, filters), ui.sort);
    const shown = all.slice(0, ui.limit);
    const stats = summarize(all);
    const transfers = all.filter((t) => t.type === 'transfer').length;
    for (const id of ui.selected) if (!all.some((t) => t.id === id)) ui.selected.delete(id);
    const tags = [...new Set(state.transactions.flatMap((t) => t.tags || []))].sort((a, b) => a.localeCompare(b, 'fr'));
    const catList = [...state.categories].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'fr'));
    const count = activeFilterCount();

    return html`
      <section class="card stack-v">
        <div class="filters">
          <label class="field field-search">
            <span class="sr-only">Rechercher</span>
            <div class="search-box">${icon('search', { size: 18 })}<input class="input" type="search" id="tx-search" placeholder="Rechercher un libellé, une note, un montant…" value="${ui.search}"></div>
          </label>
          <label class="field">
            <span class="sr-only">Période</span>
            <select class="select" id="tx-period">${options(
              [
                { value: 'month', label: 'Par mois' },
                { value: 'all', label: 'Toutes les dates' },
                { value: 'custom', label: 'Période personnalisée' },
              ],
              ui.period,
            )}</select>
          </label>
          <button type="button" class="btn" id="tx-toggle-filters" aria-expanded="${ui.showFilters ? 'true' : 'false'}">${icon('filter', { size: 16 })} Filtres${count ? ` (${count})` : ''}</button>
        </div>
        ${ui.period === 'month' ? html`<div>${monthNav(session.month)}</div>` : ''}
        ${ui.period === 'custom'
          ? html`<div class="form-row">
              <label class="field"><span>Du</span><input class="input" type="date" id="tx-from" value="${ui.from}"></label>
              <label class="field"><span>Au</span><input class="input" type="date" id="tx-to" value="${ui.to}"></label>
            </div>`
          : ''}
        <div class="filters" ${ui.showFilters ? '' : raw('hidden')} id="tx-more-filters">
          <label class="field"><span>Type</span><select class="select" data-filter="type" id="tx-f-type">${options(
            [
              { value: 'expense', label: 'Dépenses' },
              { value: 'income', label: 'Revenus' },
              { value: 'transfer', label: 'Virements' },
            ],
            ui.type,
            { placeholder: 'Tous' },
          )}</select></label>
          <label class="field"><span>Compte</span><select class="select" data-filter="accountId" id="tx-f-account">${accountOptions(state.accounts, ui.accountId, { includeArchived: true, placeholder: 'Tous' })}</select></label>
          <label class="field"><span>Catégorie</span><select class="select" data-filter="categoryId" id="tx-f-category">
            <option value="">Toutes</option>
            <option value="none" ${ui.categoryId === 'none' ? raw('selected') : ''}>Non catégorisé</option>
            ${catList.map((c) => html`<option value="${c.id}" ${ui.categoryId === c.id ? raw('selected') : ''}>${c.icon} ${c.name}${c.type === 'income' ? ' (revenu)' : ''}</option>`)}
          </select></label>
          <label class="field"><span>Pointage</span><select class="select" data-filter="cleared" id="tx-f-cleared">${options(
            [
              { value: 'yes', label: 'Pointées' },
              { value: 'no', label: 'Non pointées' },
            ],
            ui.cleared,
            { placeholder: 'Toutes' },
          )}</select></label>
          ${tags.length ? html`<label class="field"><span>Étiquette</span><select class="select" data-filter="tag" id="tx-f-tag">${options(tags.map((t) => ({ value: t, label: `#${t}` })), ui.tag, { placeholder: 'Toutes' })}</select></label>` : ''}
          <label class="field"><span>Tri</span><select class="select" data-filter="sort" id="tx-f-sort">${options(
            [
              { value: 'date-desc', label: 'Plus récentes' },
              { value: 'date-asc', label: 'Plus anciennes' },
              { value: 'amount-desc', label: 'Montant décroissant' },
              { value: 'amount-asc', label: 'Montant croissant' },
            ],
            ui.sort,
          )}</select></label>
          ${count || ui.search ? html`<button type="button" class="btn btn-ghost" id="tx-reset">Réinitialiser</button>` : ''}
        </div>
        <div class="tx-summary">
          <span><strong>${pluralize(stats.count + transfers, 'opération')}</strong></span>
          <span>Revenus <strong class="pos money">${formatMoney(stats.income, { sign: 'always' })}</strong></span>
          <span>Dépenses <strong class="money">${formatMoney(-stats.expense)}</strong></span>
          <span>Solde <strong class="money ${stats.net < 0 ? 'neg' : ''}">${formatMoney(stats.net, { sign: 'always' })}</strong></span>
        </div>
      </section>

      ${ui.selected.size
        ? html`<div class="bulk-bar" role="region" aria-label="Actions groupées">
            <strong>${pluralize(ui.selected.size, 'sélectionnée', 'sélectionnées')}</strong>
            <button type="button" class="btn btn-sm" data-bulk="clear">${icon('check', { size: 14 })} Pointer</button>
            <button type="button" class="btn btn-sm" data-bulk="unclear">Dépointer</button>
            <select class="select" id="bulk-category" aria-label="Changer la catégorie">
              <option value="">Changer la catégorie…</option>
              ${state.categories.map((c) => html`<option value="${c.id}">${c.icon} ${c.name}</option>`)}
            </select>
            <button type="button" class="btn btn-sm" data-bulk="delete">${icon('trash', { size: 14 })} Supprimer</button>
            <button type="button" class="btn btn-sm" data-bulk="none">Désélectionner</button>
          </div>`
        : ''}

      <section class="card card-flush">
        ${all.length
          ? html`<div class="day-header"><label class="check small"><input type="checkbox" id="tx-select-all" ${ui.selected.size && ui.selected.size === shown.length ? raw('checked') : ''}><span>Tout sélectionner (${shown.length})</span></label><span></span></div>
            ${groupedTxList(shown, maps, { selectable: true, selectedSet: ui.selected })}
            ${all.length > shown.length ? html`<div class="load-more"><button type="button" class="btn" id="tx-more">Afficher plus (${all.length - shown.length} restantes)</button></div>` : ''}`
          : emptyState({
              iconName: 'search',
              title: state.transactions.length ? 'Aucune opération ne correspond' : 'Aucune opération',
              text: state.transactions.length ? 'Modifiez la période ou les filtres pour élargir la recherche.' : 'Ajoutez une opération ou importez un relevé bancaire au format CSV.',
              action: html`<div class="row"><button type="button" class="btn btn-primary" data-action="add-tx">Ajouter une opération</button><button type="button" class="btn" data-import>Importer un CSV</button></div>`,
            })}
      </section>`;
  },

  mount(root, ctx) {
    const { rerender, session } = ctx;
    const search = root.querySelector('#tx-search');
    let timer;
    search?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        ui.search = search.value;
        ui.limit = PAGE;
        rerender();
      }, 180);
    });
    root.querySelector('#tx-period')?.addEventListener('change', (e) => {
      ui.period = e.target.value;
      if (ui.period === 'custom' && !ui.from) {
        ui.from = monthStart(session.month);
        ui.to = monthEnd(session.month);
      }
      rerender();
    });
    root.querySelector('#tx-from')?.addEventListener('change', (e) => {
      ui.from = e.target.value;
      rerender();
    });
    root.querySelector('#tx-to')?.addEventListener('change', (e) => {
      ui.to = e.target.value;
      rerender();
    });
    root.querySelector('#tx-toggle-filters')?.addEventListener('click', () => {
      ui.showFilters = !ui.showFilters;
      rerender();
    });
    root.querySelectorAll('[data-filter]').forEach((sel) =>
      sel.addEventListener('change', () => {
        ui[sel.dataset.filter] = sel.value;
        ui.limit = PAGE;
        rerender();
      }),
    );
    root.querySelector('#tx-reset')?.addEventListener('click', () => {
      Object.assign(ui, { type: '', accountId: '', categoryId: '', cleared: '', tag: '', search: '', sort: 'date-desc' });
      rerender();
    });
    root.querySelector('#tx-more')?.addEventListener('click', () => {
      ui.limit += PAGE;
      rerender();
    });

    // Sélection
    root.addEventListener('change', (e) => {
      const id = e.target.dataset?.select;
      if (id) {
        if (e.target.checked) ui.selected.add(id);
        else ui.selected.delete(id);
        rerender();
      }
    });
    root.querySelector('#tx-select-all')?.addEventListener('change', (e) => {
      const ids = [...root.querySelectorAll('[data-select]')].map((i) => i.dataset.select);
      if (e.target.checked) ids.forEach((id) => ui.selected.add(id));
      else ui.selected.clear();
      rerender();
    });
    root.querySelectorAll('[data-bulk]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const ids = [...ui.selected];
        const action = btn.dataset.bulk;
        if (action === 'clear' || action === 'unclear') {
          setCleared(ids, action === 'clear');
          toast(action === 'clear' ? 'Opérations pointées' : 'Pointage retiré');
        } else if (action === 'none') {
          ui.selected.clear();
          rerender();
        } else if (action === 'delete') {
          const ok = await confirmDialog({ title: 'Supprimer les opérations', message: `${pluralize(ids.length, 'opération sera supprimée', 'opérations seront supprimées')}.`, confirmLabel: 'Supprimer', danger: true });
          if (!ok) return;
          ui.selected.clear();
          deleteTransactions(ids);
          toast(`${pluralize(ids.length, 'opération supprimée', 'opérations supprimées')}`, { action: { label: 'Annuler', fn: () => store.undo() } });
        }
      }),
    );
    root.querySelector('#bulk-category')?.addEventListener('change', (e) => {
      if (!e.target.value) return;
      recategorize([...ui.selected], e.target.value);
      toast('Catégorie mise à jour (types compatibles uniquement)', { action: { label: 'Annuler', fn: () => store.undo() } });
    });
  },

  topbarMount(bar, ctx) {
    bar.querySelector('[data-export]')?.addEventListener('click', () => {
      const txs = filterTransactions(ctx.state, currentFilters(ctx.session));
      if (!txs.length) return toast('Aucune opération à exporter');
      exportCSV(ctx.state, txs);
    });
  },
};
