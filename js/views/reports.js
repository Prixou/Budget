// Rapports : analyse d'une période, comparaisons, répartition, export.
import {
  PERIODS,
  balanceSeries,
  byCategory,
  byTag,
  change,
  filterTransactions,
  groupSplit,
  monthlyTotals,
  monthsInPeriod,
  periodRange,
  previousPeriod,
  sortTransactions,
  summarize,
} from '../calc.js';
import { chartSlot, hbars, legend, stackedBar } from '../charts.js';
import { catBadge, deltaText, kpi, lookups } from '../components.js';
import { toCSV } from '../csv.js';
import { CATEGORY_GROUPS } from '../defaults.js';
import { accountOptions, emptyState, icon, offerFile, options } from '../ui.js';
import { capitalize, centsToInput, formatDate, formatMoney, formatPercent, html, monthEnd, monthKey, monthLabel, monthRange, sum, todayISO } from '../utils.js';

const ui = { period: 'last-6', from: '', to: '', accountId: '', tab: 'expense' };
const noHistory = html`<span class="kpi-delta">Pas d'historique pour comparer</span>`;

function exportReport(state, range, cats, incomeCats, months) {
  const rows = [['Rapport', `${range.from} → ${range.to}`], [], ['Mois', 'Revenus', 'Dépenses', 'Solde']];
  for (const r of months) rows.push([r.month, centsToInput(r.income) || '0', centsToInput(r.expense) || '0', centsToInput(r.net) || '0']);
  rows.push([], ['Catégorie de dépense', 'Montant', 'Part', 'Opérations']);
  for (const c of cats) rows.push([c.category.name, centsToInput(c.total), (c.share * 100).toFixed(1).replace('.', ',') + ' %', c.count]);
  rows.push([], ['Catégorie de revenu', 'Montant', 'Part', 'Opérations']);
  for (const c of incomeCats) rows.push([c.category.name, centsToInput(c.total), (c.share * 100).toFixed(1).replace('.', ',') + ' %', c.count]);
  offerFile(`rapport-${range.from}-${range.to}.csv`, toCSV(rows), 'text/csv');
}

export default {
  id: 'rapports',
  title: 'Rapports',
  icon: 'chart',

  actions() {
    return html`<button type="button" class="btn" data-export-report>${icon('download', { size: 16 })} <span class="desktop-only">Exporter</span></button>`;
  },

  topbarMount(bar, ctx) {
    bar.querySelector('[data-export-report]')?.addEventListener('click', () => {
      const d = compute(ctx.state);
      exportReport(ctx.state, d.range, d.expenseCats, d.incomeCats, d.months);
    });
  },

  render({ state }) {
    const d = compute(state);
    const { range, cur, prev, expenseCats, incomeCats, months, txs, n, comparable } = d;
    const maps = lookups(state);
    const top = sortTransactions(txs.filter((t) => t.type === 'expense'), 'amount-desc').slice(0, 10);
    const split = groupSplit(state, txs);
    const tags = byTag(txs, 'expense');
    const prevCats = new Map(byCategory(state, filterTransactions(state, { ...previousPeriod(range.from, range.to), accountId: ui.accountId || undefined }), 'expense').map((c) => [c.category.id, c.total]));
    const balanceDates = months.map((m) => (m.month === monthKey(todayISO()) ? todayISO() : monthEnd(m.month)));
    const balances = balanceSeries(state, balanceDates, ui.accountId || null);
    const showMonthly = months.length > 1;
    const catRows = (ui.tab === 'expense' ? expenseCats : incomeCats).map((c) => ({ label: c.category.name, icon: c.category.icon, value: c.total, share: c.share }));

    return html`
      <section class="card">
        <div class="filters">
          <label class="field"><span>Période</span><select class="select" id="rp-period">${options(Object.entries(PERIODS).map(([value, label]) => ({ value, label })), ui.period)}</select></label>
          ${ui.period === 'custom'
            ? html`<label class="field"><span>Du</span><input class="input" type="date" id="rp-from" value="${range.from}"></label>
              <label class="field"><span>Au</span><input class="input" type="date" id="rp-to" value="${range.to}"></label>`
            : ''}
          <label class="field"><span>Compte</span><select class="select" id="rp-account">${accountOptions(state.accounts, ui.accountId, { includeArchived: true, placeholder: 'Tous les comptes' })}</select></label>
        </div>
        <p class="muted small" style="margin-top:10px">Du ${formatDate(range.from)} au ${formatDate(range.to)} · comparaison avec la période précédente de même durée. Les virements entre comptes sont exclus.</p>
      </section>

      <section class="kpis kpis-cards">
        ${kpi('Revenus', formatMoney(cur.income), comparable ? deltaText(change(cur.income, prev.income)) : noHistory)}
        ${kpi('Dépenses', formatMoney(cur.expense), comparable ? deltaText(change(cur.expense, prev.expense), { goodWhenUp: false }) : noHistory)}
        ${kpi('Solde', html`<span class="${cur.net < 0 ? 'neg' : ''}">${formatMoney(cur.net, { sign: 'always' })}</span>`, comparable ? html`<span class="kpi-delta">${formatMoney(prev.net, { sign: 'always' })} sur la période précédente</span>` : noHistory)}
        ${kpi("Taux d'épargne", cur.savingsRate == null ? '—' : formatPercent(cur.savingsRate), html`<span class="kpi-delta">${prev.savingsRate == null || !comparable ? 'Part des revenus non dépensée' : `${formatPercent(prev.savingsRate)} auparavant`}</span>`)}
        ${kpi('Dépenses moyennes / mois', formatMoney(Math.round(cur.expense / n)))}
      </section>

      ${!txs.length
        ? html`<section class="card">${emptyState({ iconName: 'chart', title: 'Aucune opération sur cette période', text: 'Choisissez une autre période ou un autre compte.' })}</section>`
        : html`
          ${showMonthly
            ? html`<div class="grid grid-2">
                <section class="card">
                  <div class="card-header"><div><h2>Revenus et dépenses par mois</h2></div>${legend([
                    { label: 'Revenus', color: '--series-1' },
                    { label: 'Dépenses', color: '--series-2' },
                  ])}</div>
                  ${chartSlot({
                    type: 'columns',
                    height: 250,
                    label: 'Revenus et dépenses par mois',
                    labels: months.map((m) => capitalize(monthLabel(m.month, { short: true, year: months.length > 12 }))),
                    tipLabels: months.map((m) => capitalize(monthLabel(m.month))),
                    series: [
                      { label: 'Revenus', color: '--series-1', values: months.map((m) => m.income) },
                      { label: 'Dépenses', color: '--series-2', values: months.map((m) => m.expense) },
                    ],
                  })}
                </section>
                <section class="card">
                  <div class="card-header"><div><h2>Solde mensuel</h2><p class="sub">Revenus − dépenses : excédent au-dessus de zéro, déficit en dessous</p></div></div>
                  ${chartSlot({
                    type: 'diverging',
                    height: 250,
                    label: 'Solde mensuel',
                    labels: months.map((m) => capitalize(monthLabel(m.month, { short: true, year: months.length > 12 }))),
                    tipLabels: months.map((m) => capitalize(monthLabel(m.month))),
                    values: months.map((m) => m.net),
                    seriesLabel: 'Solde du mois',
                  })}
                </section>
              </div>
              <section class="card">
                <div class="card-header"><div><h2>Évolution du solde des comptes</h2><p class="sub">${ui.accountId ? maps.acc.get(ui.accountId)?.name : 'Tous les comptes inclus dans le total'}, en fin de mois</p></div></div>
                ${chartSlot({
                  type: 'line',
                  height: 230,
                  label: 'Évolution du solde',
                  labels: months.map((m) => capitalize(monthLabel(m.month, { short: true, year: months.length > 12 }))),
                  tipLabels: balanceDates.map((d) => `Au ${formatDate(d)}`),
                  values: balances.map((b) => b.balance),
                  seriesLabel: 'Solde',
                })}
              </section>`
            : ''}

          <div class="grid grid-main">
            <section class="card">
              <div class="card-header">
                <h2>Répartition par catégorie</h2>
                <div class="tabs" role="tablist">
                  <button type="button" role="tab" aria-selected="${ui.tab === 'expense' ? 'true' : 'false'}" data-tab="expense">Dépenses</button>
                  <button type="button" role="tab" aria-selected="${ui.tab === 'income' ? 'true' : 'false'}" data-tab="income">Revenus</button>
                </div>
              </div>
              ${catRows.length ? hbars(catRows) : html`<p class="muted">Aucune opération.</p>`}
            </section>
            <section class="card">
              <div class="card-header"><div><h2>Règle 50 / 30 / 20</h2><p class="sub">Part des revenus consacrée aux besoins, aux envies et à l'épargne</p></div></div>
              ${split.income
                ? stackedBar(
                    [
                      { label: CATEGORY_GROUPS.needs.label, value: split.needs, color: '--series-1', target: 0.5 },
                      { label: CATEGORY_GROUPS.wants.label, value: split.wants, color: '--series-2', target: 0.3 },
                      { label: `${CATEGORY_GROUPS.savings.label} (reste)`, value: split.savings, color: '--series-3', target: 0.2 },
                    ],
                    { total: Math.max(split.income, split.needs + split.wants) },
                  )
                : html`<p class="muted">Aucun revenu sur la période.</p>`}
              <p class="muted small" style="margin-top:12px">Le groupe de chaque catégorie se règle dans « Catégories ».</p>
            </section>
          </div>

          <section class="card card-flush">
            <div class="card-header"><div><h2>Détail des dépenses par catégorie</h2><p class="sub">${comparable ? 'Comparées à la période précédente' : "Historique insuffisant pour comparer avec la période précédente"}</p></div></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Catégorie</th><th class="num">Montant</th><th class="num">Part</th><th class="num">Moy. / mois</th><th class="num">Opérations</th><th class="num">Évolution</th></tr></thead>
              <tbody>${expenseCats.map((c) => {
                const before = prevCats.get(c.category.id) || 0;
                const ch = change(c.total, before);
                return html`<tr>
                  <td><span class="row" style="flex-wrap:nowrap">${catBadge(c.category, { small: true })} ${c.category.id ? html`<a href="#transactions?category=${c.category.id}&all=1">${c.category.name}</a>` : c.category.name}</span></td>
                  <td class="num money">${formatMoney(c.total)}</td>
                  <td class="num">${formatPercent(c.share, 1)}</td>
                  <td class="num money">${formatMoney(Math.round(c.total / n))}</td>
                  <td class="num">${c.count}</td>
                  <td class="num">${!comparable ? html`<span class="muted">—</span>` : ch == null ? html`<span class="muted">nouveau</span>` : html`<span class="${ch > 0.05 ? 'delta-bad' : ch < -0.05 ? 'delta-good' : 'muted'}">${ch > 0 ? '+' : ''}${formatPercent(ch)}</span>`}</td>
                </tr>`;
              })}</tbody>
              <tfoot><tr><td>Total</td><td class="num money">${formatMoney(cur.expense)}</td><td class="num">100 %</td><td class="num money">${formatMoney(Math.round(cur.expense / n))}</td><td class="num">${sum(expenseCats, (c) => c.count)}</td><td></td></tr></tfoot>
            </table></div>
          </section>

          <div class="grid grid-2">
            <section class="card card-flush">
              <div class="card-header"><h2>Plus grosses dépenses</h2></div>
              <div class="table-wrap"><table class="table"><tbody>${top.map(
                (t) => html`<tr data-tx="${t.id}" style="cursor:pointer">
                  <td>${formatDate(t.date, 'short')}</td>
                  <td class="wrap">${t.description || maps.cat.get(t.categoryId)?.name || '—'}</td>
                  <td class="muted">${maps.cat.get(t.categoryId)?.name || 'Non catégorisé'}</td>
                  <td class="num money">${formatMoney(-t.amount)}</td>
                </tr>`,
              )}</tbody></table></div>
            </section>
            <section class="card card-flush">
              <div class="card-header"><h2>Par étiquette</h2></div>
              ${tags.length
                ? html`<div class="table-wrap"><table class="table"><tbody>${tags.map(
                    (t) => html`<tr><td><a href="#transactions?tag=${encodeURIComponent(t.tag)}&all=1">#${t.tag}</a></td><td class="num">${t.count} op.</td><td class="num money">${formatMoney(t.total)}</td></tr>`,
                  )}</tbody></table></div>`
                : html`<div class="card-pad"><p class="muted">Ajoutez des étiquettes (#vacances, #travail…) à vos opérations pour suivre des projets transversaux.</p></div>`}
            </section>
          </div>

          ${showMonthly
            ? html`<section class="card card-flush">
                <div class="card-header"><h2>Tableau mensuel</h2></div>
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Mois</th><th class="num">Revenus</th><th class="num">Dépenses</th><th class="num">Solde</th><th class="num">Taux d'épargne</th></tr></thead>
                  <tbody>${months.map(
                    (m) => html`<tr><td>${capitalize(monthLabel(m.month))}</td><td class="num money">${formatMoney(m.income)}</td><td class="num money">${formatMoney(m.expense)}</td><td class="num money ${m.net < 0 ? 'neg' : ''}">${formatMoney(m.net, { sign: 'always' })}</td><td class="num">${m.income ? formatPercent(m.net / m.income) : '—'}</td></tr>`,
                  )}</tbody>
                </table></div>
              </section>`
            : ''}
        `}
    `;
  },

  mount(root, { rerender }) {
    root.querySelector('#rp-period')?.addEventListener('change', (e) => {
      ui.period = e.target.value;
      rerender();
    });
    root.querySelector('#rp-from')?.addEventListener('change', (e) => {
      ui.from = e.target.value;
      rerender();
    });
    root.querySelector('#rp-to')?.addEventListener('change', (e) => {
      ui.to = e.target.value;
      rerender();
    });
    root.querySelector('#rp-account')?.addEventListener('change', (e) => {
      ui.accountId = e.target.value;
      rerender();
    });
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.tab = b.dataset.tab;
        rerender();
      }),
    );
  },
};

function compute(state) {
  const range = periodRange(ui.period, state, todayISO(), { from: ui.from, to: ui.to });
  if (range.from > range.to) [range.from, range.to] = [range.to, range.from];
  const filters = { from: range.from, to: range.to, accountId: ui.accountId || undefined };
  const txs = filterTransactions(state, filters);
  const prevRange = previousPeriod(range.from, range.to);
  const prevTxs = filterTransactions(state, { ...prevRange, accountId: ui.accountId || undefined });
  const cur = summarize(txs);
  const prev = summarize(prevTxs);
  const firstDate = state.transactions.reduce((min, t) => (!min || t.date < min ? t.date : min), null);
  const comparable = !!firstDate && firstDate <= prevRange.from;
  const monthKeys = monthRange(monthKey(range.from), monthKey(range.to));
  const months = monthlyTotals(state, monthKeys, { accountId: ui.accountId || null });
  return {
    range,
    comparable,
    txs,
    cur,
    prev,
    months,
    n: monthsInPeriod(range.from, range.to),
    expenseCats: byCategory(state, txs, 'expense'),
    incomeCats: byCategory(state, txs, 'income'),
  };
}
