// Fragments d'interface réutilisés par plusieurs vues.
import { UNCATEGORIZED } from './calc.js';
import { icon } from './ui.js';
import { capitalize, formatDate, formatMoney, formatPercent, groupBy, html, monthLabel, relativeDayLabel, sum } from './utils.js';

export function catBadge(cat, { small = false } = {}) {
  const c = cat || UNCATEGORIZED;
  return html`<span class="cat-badge${small ? ' cat-badge-sm' : ''}" style="--c:${c.color}" aria-hidden="true">${c.icon}</span>`;
}

export function transferBadge({ small = false } = {}) {
  return html`<span class="cat-badge${small ? ' cat-badge-sm' : ''}" style="--c:#6b7280" aria-hidden="true">${icon('swap', { size: small ? 15 : 18 })}</span>`;
}

/** Montant signé et coloré selon le type d'opération. */
export function txAmount(tx, { accountId = null } = {}) {
  if (tx.type === 'transfer') {
    if (accountId && tx.toAccountId === accountId) return html`<span class="pos money">${formatMoney(tx.amount, { sign: 'always' })}</span>`;
    if (accountId && tx.accountId === accountId) return html`<span class="money">${formatMoney(-tx.amount)}</span>`;
    return html`<span class="muted money">${formatMoney(tx.amount)}</span>`;
  }
  if (tx.type === 'income') return html`<span class="pos money">${formatMoney(tx.amount, { sign: 'always' })}</span>`;
  return html`<span class="money">${formatMoney(-tx.amount)}</span>`;
}

export function lookups(state) {
  return {
    cat: new Map(state.categories.map((c) => [c.id, c])),
    acc: new Map(state.accounts.map((a) => [a.id, a])),
  };
}

export function txRow(tx, maps, { selectable = false, selectedSet = null, accountId = null, showDate = false } = {}) {
  const selected = !!selectedSet?.has(tx.id);
  const cat = maps.cat.get(tx.categoryId);
  const acc = maps.acc.get(tx.accountId);
  const to = maps.acc.get(tx.toAccountId);
  const title = tx.description || (tx.type === 'transfer' ? 'Virement' : cat?.name || 'Sans libellé');
  const meta =
    tx.type === 'transfer'
      ? html`<span>${acc?.name || '?'} → ${to?.name || '?'}</span>`
      : html`<span>${cat?.name || UNCATEGORIZED.name}</span><span>${acc?.name || ''}</span>`;
  return html`<li class="tx-row${selectable ? '' : ' no-select'}" data-tx="${tx.id}">
    ${selectable ? html`<input type="checkbox" data-select="${tx.id}" aria-label="Sélectionner ${title}" ${selected ? 'checked' : ''}>` : ''}
    ${tx.type === 'transfer' ? transferBadge() : catBadge(cat)}
    <div class="tx-main">
      <div class="tx-title">${title}</div>
      <div class="tx-meta">
        ${showDate ? html`<span>${formatDate(tx.date, 'day')}</span>` : ''}
        ${meta}
        ${tx.recurringId ? html`<span title="Opération récurrente">${icon('repeat', { size: 12 })}</span>` : ''}
        ${(tx.tags || []).map((t) => html`<span class="tag">#${t}</span>`)}
      </div>
    </div>
    <div class="tx-amount">${txAmount(tx, { accountId })}${tx.cleared ? html`<span class="cleared">${icon('check', { size: 11 })} pointée</span>` : ''}</div>
  </li>`;
}

/** Liste groupée par jour, avec le solde du jour. */
export function groupedTxList(txs, maps, options = {}) {
  const groups = groupBy(txs, (t) => t.date);
  return html`${[...groups.entries()].map(([date, list]) => {
    const net = sum(list, (t) => (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0));
    return html`<section class="day-group">
      <div class="day-header"><span>${relativeDayLabel(date)}</span><span class="money">${net ? formatMoney(net, { sign: 'always' }) : ''}</span></div>
      <ul class="tx-list">${list.map((t) => txRow(t, maps, options))}</ul>
    </section>`;
  })}`;
}

export function monthNav(month, { id = 'month' } = {}) {
  return html`<div class="month-nav" role="group" aria-label="Choix du mois">
    <button type="button" class="icon-btn" data-month-shift="-1" aria-label="Mois précédent">${icon('left')}</button>
    <span class="label" id="${id}-label">${capitalize(monthLabel(month))}</span>
    <button type="button" class="icon-btn" data-month-shift="1" aria-label="Mois suivant">${icon('right')}</button>
  </div>`;
}

/** Variation colorée : goodWhenUp indique si une hausse est favorable. */
export function deltaText(ratio, { goodWhenUp = true, suffix = 'vs période précédente' } = {}) {
  if (ratio == null || !Number.isFinite(ratio)) return html`<span class="kpi-delta">${suffix ? `— ${suffix}` : '—'}</span>`;
  const up = ratio > 0;
  const good = ratio === 0 ? null : up === goodWhenUp;
  const cls = good == null ? '' : good ? 'delta-good' : 'delta-bad';
  const arrow = ratio === 0 ? '=' : up ? '▲' : '▼';
  return html`<span class="kpi-delta"><span class="${cls}">${arrow} ${formatPercent(Math.abs(ratio))}</span> ${suffix}</span>`;
}

export function kpi(label, value, extra = '') {
  return html`<div class="kpi"><span class="kpi-label">${label}</span><span class="kpi-value money">${value}</span>${extra}</div>`;
}

export function statusPill(status) {
  if (status === 'over') return html`<span class="pill pill-over">${icon('alert', { size: 13 })} Dépassé</span>`;
  if (status === 'warning') return html`<span class="pill pill-warning">${icon('alert', { size: 13 })} Bientôt atteint</span>`;
  if (status === 'done') return html`<span class="pill pill-done">${icon('check', { size: 13 })} Atteint</span>`;
  if (status === 'none') return html`<span class="pill">Sans budget</span>`;
  if (status === 'full') return html`<span class="pill pill-accent">${icon('check', { size: 13 })} Budget consommé</span>`;
  return html`<span class="pill pill-ok">${icon('check', { size: 13 })} Dans le budget</span>`;
}
