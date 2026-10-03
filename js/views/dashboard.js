// Tableau de bord : vue d'ensemble du mois choisi.
import {
  accountBalances,
  budgetReport,
  byCategory,
  change,
  countedAccounts,
  dueOccurrences,
  endOfMonthForecast,
  filterTransactions,
  goalStats,
  monthPace,
  firstTransactionDate,
  monthlyTotals,
  netWorth,
  summarize,
  transactionsByDate,
  upcoming,
} from '../calc.js';
import { chartSlot, hbars, legend, meter } from '../charts.js';
import { catBadge, deltaText, groupedTxList, kpi, lookups, monthNav, statusPill, transferBadge } from '../components.js';
import { cashForecast } from '../insights.js';
import { confirmOccurrence, skipOccurrence } from '../store.js';
import { healthCard } from './optimisation.js';
import { emptyState, icon, toast } from '../ui.js';
import {
  addDays,
  capitalize,
  daysInMonth,
  formatDate,
  formatMoney,
  formatPercent,
  html,
  monthEnd,
  monthKey,
  monthLabel,
  monthRange,
  monthStart,
  shiftMonth,
  sum,
  todayISO,
} from '../utils.js';

export default {
  id: 'tableau-de-bord',
  title: 'Tableau de bord',
  icon: 'home',

  render({ state, session }) {
    const today = todayISO();
    const month = session.month;
    const maps = lookups(state);

    if (!state.accounts.length) {
      return html`<div class="card">${emptyState({
        iconName: 'wallet',
        title: 'Aucun compte pour le moment',
        text: 'Ajoutez votre premier compte (compte courant, livret, espèces…) pour commencer à suivre votre budget.',
        action: html`<a class="btn btn-primary" href="#comptes">${icon('plus', { size: 16 })} Ajouter un compte</a>`,
      })}</div>`;
    }

    const txs = filterTransactions(state, { from: monthStart(month), to: monthEnd(month) });
    const prevMonth = shiftMonth(month, -1);
    const inProgress = month === monthKey(today);
    // Mois en cours : comparaison avec la même période du mois précédent (du 1er au même jour).
    const [py, pm] = prevMonth.split('-').map(Number);
    const prevTo = inProgress ? `${prevMonth}-${String(Math.min(Number(today.slice(8, 10)), daysInMonth(py, pm - 1))).padStart(2, '0')}` : monthEnd(prevMonth);
    const prevTxs = filterTransactions(state, { from: monthStart(prevMonth), to: prevTo });
    const versus = inProgress ? 'vs même période du mois dernier' : 'vs mois précédent';
    const cur = summarize(txs);
    const prev = summarize(prevTxs);
    const expectedIncome = inProgress ? sum(upcoming(state, addDays(today, 1), monthEnd(month)).filter((u) => u.rule.type === 'income'), (u) => u.rule.amount) : 0;
    const savingsPending = expectedIncome > 0 && cur.income < cur.expense;
    const worth = netWorth(state, today);
    const forecast = endOfMonthForecast(state, today);
    const cash = cashForecast(state, today, 31);
    const isCurrent = month === monthKey(today);
    const pace = monthPace(state, month, today);

    const budgets = budgetReport(state, month, { alertThreshold: state.settings.budgetAlert });
    const overBudgets = budgets.rows.filter((r) => r.status === 'over');
    const balances = accountBalances(state, today);
    const negativeAccounts = countedAccounts(state).filter((a) => (balances.get(a.id) || 0) < 0 && a.type !== 'carte');

    const pending = state.recurring
      .filter((r) => r.active && !r.autoCreate)
      .map((rule) => ({ rule, dates: dueOccurrences(rule, today) }))
      .filter((p) => p.dates.length);
    const nextItems = upcoming(state, addDays(today, 1), addDays(today, 30)).slice(0, 6);
    const firstDate = firstTransactionDate(state) || today;
    const comparable = firstDate <= monthStart(prevMonth);

    const months = monthRange(shiftMonth(month, -5), month);
    const series = monthlyTotals(state, months);
    const cats = byCategory(state, txs, 'expense');
    const topCats = cats.slice(0, 6);
    const rest = cats.slice(6);
    const catRows = topCats.map((c) => ({ label: c.category.name, icon: c.category.icon, value: c.total, share: c.share }));
    if (rest.length) catRows.push({ label: `Autres (${rest.length})`, icon: '·', value: sum(rest, (c) => c.total), share: sum(rest, (c) => c.share) });

    const byDate = transactionsByDate(state);
    const recent = [];
    for (let i = byDate.length - 1; i >= 0 && recent.length < 7; i--) if (byDate[i].date <= today) recent.push(byDate[i]);
    const goals = state.goals.filter((g) => !g.archived).slice(0, 4);

    const alerts = [];
    if (overBudgets.length) {
      alerts.push(html`<div class="callout callout-danger">${icon('alert')}<div><strong>${overBudgets.length === 1 ? '1 budget dépassé' : `${overBudgets.length} budgets dépassés`}</strong> en ${monthLabel(month)} : ${overBudgets
        .slice(0, 3)
        .map((r) => `${r.category.name} (${formatMoney(-r.remaining)} de trop)`)
        .join(', ')}. <a href="#budgets">Voir les budgets</a></div></div>`);
    }
    if (negativeAccounts.length) {
      alerts.push(html`<div class="callout callout-warning">${icon('alert')}<div><strong>Solde négatif</strong> : ${negativeAccounts
        .map((a) => `${a.name} (${formatMoney(balances.get(a.id))})`)
        .join(', ')}.</div></div>`);
    }
    if (isCurrent && forecast.forecast < 0) {
      alerts.push(html`<div class="callout callout-warning">${icon('alert')}<div><strong>Attention</strong> : avec les prélèvements prévus, votre solde total pourrait passer à ${formatMoney(forecast.forecast)} d'ici la fin du mois.</div></div>`);
    }

    return html`
      <div class="row-between">
        ${monthNav(month)}
        <button type="button" class="btn btn-primary desktop-only-btn" data-action="add-tx">${icon('plus', { size: 16 })} Nouvelle opération</button>
      </div>

      <section class="card hero" aria-label="Synthèse">
        <div class="hero-balance">
          <span class="hero-label">Solde total des comptes</span>
          <span class="hero-value money">${formatMoney(worth.assets - worth.liabilities + worth.debts)}</span>
          <div class="hero-meta">
            <span>Fin de mois prévue : <strong class="money">${formatMoney(forecast.forecast)}</strong></span>
            ${cash.accounts.length ? html`<span>Disponible à dépenser : <strong class="money">${formatMoney(cash.available, { decimals: false })}</strong> (${formatMoney(cash.perDay, { decimals: false })} / jour)</span>` : ''}
            ${worth.debts ? html`<span>Crédits restants : <strong class="money">${formatMoney(worth.debts)}</strong></span>` : ''}
            ${worth.debts ? html`<span>Patrimoine net : <strong class="money">${formatMoney(worth.net)}</strong></span>` : ''}
          </div>
        </div>
        <div class="hero-kpis"><div class="kpis">
          ${kpi('Revenus du mois', formatMoney(cur.income), deltaText(comparable ? change(cur.income, prev.income) : null, { suffix: versus }))}
          ${kpi('Dépenses du mois', formatMoney(cur.expense), deltaText(comparable ? change(cur.expense, prev.expense) : null, { goodWhenUp: false, suffix: versus }))}
          ${kpi('Reste à vivre', html`<span class="${cur.net < 0 ? 'neg' : ''}">${formatMoney(cur.net, { sign: 'always' })}</span>`, html`<span class="kpi-delta">Revenus − dépenses</span>`)}
          ${kpi(
            "Taux d'épargne",
            savingsPending || cur.savingsRate == null ? '—' : cur.savingsRate < -1 ? '< −100 %' : formatPercent(cur.savingsRate),
            html`<span class="kpi-delta">${
              savingsPending
                ? `${formatMoney(expectedIncome, { decimals: false })} de revenus encore attendus ce mois-ci`
                : prev.savingsRate == null || !comparable
                  ? 'Part des revenus non dépensée'
                  : `${formatPercent(prev.savingsRate)} ${inProgress ? 'à la même date le mois dernier' : 'le mois précédent'}`
            }</span>`,
          )}
        </div></div>
      </section>

      ${alerts.length ? html`<div class="stack-v">${alerts}</div>` : ''}

      ${isCurrent ? html`<div id="health-slot" class="health-slot"></div>` : ''}

      <div class="grid grid-main">
        <section class="card">
          <div class="card-header">
            <div><h2>Revenus et dépenses</h2><p class="sub">6 derniers mois</p></div>
            ${legend([
              { label: 'Revenus', color: '--series-1' },
              { label: 'Dépenses', color: '--series-2' },
            ])}
          </div>
          ${chartSlot({
            type: 'columns',
            height: 240,
            label: 'Revenus et dépenses des 6 derniers mois',
            labels: months.map((m) => capitalize(monthLabel(m, { short: true, year: false }))),
            tipLabels: months.map((m) => capitalize(monthLabel(m))),
            series: [
              { label: 'Revenus', color: '--series-1', values: series.map((r) => r.income) },
              { label: 'Dépenses', color: '--series-2', values: series.map((r) => r.expense) },
            ],
          })}
        </section>
        <section class="card">
          <div class="card-header">
            <div><h2>Dépenses par catégorie</h2><p class="sub">${capitalize(monthLabel(month))}</p></div>
            <a class="link-btn" href="#rapports">Détails</a>
          </div>
          ${catRows.length ? hbars(catRows) : emptyState({ iconName: 'pie', title: 'Aucune dépense ce mois-ci', text: 'Vos dépenses apparaîtront ici, classées par catégorie.' })}
        </section>
      </div>

      ${isCurrent
        ? html`<section class="card">
            <div class="card-header"><div><h2>Rythme des dépenses</h2><p class="sub">Jour ${pace.elapsed} sur ${pace.total}</p></div></div>
            <div class="kpis">
              ${kpi('Dépensé à ce jour', formatMoney(pace.expense))}
              ${kpi('Moyenne par jour', formatMoney(Math.round(pace.daily)))}
              ${kpi('Projection fin de mois', formatMoney(pace.projected), budgets.totals.available ? html`<span class="kpi-delta">Budgets du mois : ${formatMoney(budgets.totals.available)}</span>` : '')}
              ${kpi('Reste à dépenser (budgets)', html`<span class="${budgets.totals.remaining < 0 ? 'neg' : ''}">${formatMoney(budgets.totals.remaining)}</span>`, html`<span class="kpi-delta">${formatMoney(Math.max(0, Math.round(budgets.totals.remaining / Math.max(1, pace.total - pace.elapsed + 1))))} par jour restant</span>`)}
            </div>
          </section>`
        : ''}

      <div class="grid grid-2">
        <section class="card card-flush">
          <div class="card-header"><div><h2>Budgets</h2><p class="sub">${budgets.totals.available ? `${formatMoney(budgets.totals.spent)} dépensés sur ${formatMoney(budgets.totals.available)}` : 'Aucun budget défini'}</p></div><a class="link-btn" href="#budgets">Gérer</a></div>
          ${budgets.rows.filter((r) => r.status !== 'none').length
            ? html`<ul class="item-list">${budgets.rows
                .filter((r) => r.status !== 'none')
                .slice(0, 5)
                .map(
                  (r) => html`<li class="item">
                    ${catBadge(r.category, { small: true })}
                    <div class="item-body">
                      <div class="item-title">${r.category.name} ${r.status === 'over' || r.status === 'warning' ? statusPill(r.status) : ''}</div>
                      ${meter(r.ratio, r.status, r.category.name)}
                    </div>
                    <div class="item-side"><strong class="money">${formatMoney(r.spent)}</strong><span class="muted small money">sur ${formatMoney(r.available)}</span></div>
                  </li>`,
                )}</ul>`
            : html`<div class="card-pad">${emptyState({ iconName: 'pie', title: 'Pas encore de budget', text: 'Fixez un plafond par catégorie pour savoir où vous en êtes.', action: html`<a class="btn" href="#budgets">Créer un budget</a>` })}</div>`}
        </section>

        <section class="card card-flush">
          <div class="card-header"><div><h2>À venir</h2><p class="sub">Opérations récurrentes des 30 prochains jours</p></div><a class="link-btn" href="#recurrentes">Gérer</a></div>
          ${pending.length || nextItems.length
            ? html`<ul class="item-list">
                ${pending.map(
                  ({ rule, dates }) => html`<li class="item">
                    ${rule.type === 'transfer' ? transferBadge({ small: true }) : catBadge(maps.cat.get(rule.categoryId), { small: true })}
                    <div class="item-body">
                      <div class="item-title">${rule.description} <span class="pill pill-warning">${icon('alert', { size: 13 })} À valider</span></div>
                      <div class="item-sub"><span>Échéance du ${formatDate(dates[0])}</span>${dates.length > 1 ? html`<span>+ ${dates.length - 1} autre${dates.length > 2 ? 's' : ''}</span>` : ''}</div>
                    </div>
                    <div class="item-side">
                      <strong class="money">${rule.type === 'income' ? formatMoney(rule.amount, { sign: 'always' }) : formatMoney(-rule.amount)}</strong>
                      <div class="item-actions">
                        <button type="button" class="btn btn-sm btn-primary" data-confirm-occ="${rule.id}" data-date="${dates[0]}">Valider</button>
                        <button type="button" class="btn btn-sm btn-ghost" data-skip-occ="${rule.id}" data-date="${dates[0]}">Ignorer</button>
                      </div>
                    </div>
                  </li>`,
                )}
                ${nextItems.map(
                  ({ rule, date }) => html`<li class="item">
                    ${rule.type === 'transfer' ? transferBadge({ small: true }) : catBadge(maps.cat.get(rule.categoryId), { small: true })}
                    <div class="item-body">
                      <div class="item-title">${rule.description}</div>
                      <div class="item-sub"><span>${formatDate(date, 'long')}</span>${rule.autoCreate ? '' : html`<span>à valider</span>`}</div>
                    </div>
                    <div class="item-side"><strong class="money ${rule.type === 'income' ? 'pos' : ''}">${rule.type === 'income' ? formatMoney(rule.amount, { sign: 'always' }) : rule.type === 'transfer' ? formatMoney(rule.amount) : formatMoney(-rule.amount)}</strong></div>
                  </li>`,
                )}
              </ul>`
            : html`<div class="card-pad">${emptyState({ iconName: 'repeat', title: 'Rien de prévu', text: 'Ajoutez vos opérations récurrentes (loyer, salaire, abonnements) pour anticiper votre solde.', action: html`<a class="btn" href="#recurrentes">Ajouter une récurrence</a>` })}</div>`}
        </section>
      </div>

      <div class="grid grid-2">
        <section class="card card-flush">
          <div class="card-header"><div><h2>Dernières opérations</h2></div><a class="link-btn" href="#transactions">Tout voir</a></div>
          ${recent.length ? groupedTxList(recent, maps) : html`<div class="card-pad">${emptyState({ iconName: 'list', title: 'Aucune opération', text: 'Ajoutez votre première dépense ou votre premier revenu.', action: html`<button type="button" class="btn btn-primary" data-action="add-tx">Ajouter une opération</button>` })}</div>`}
        </section>

        <section class="card card-flush">
          <div class="card-header"><div><h2>Objectifs d'épargne</h2></div><a class="link-btn" href="#objectifs">Gérer</a></div>
          ${goals.length
            ? html`<ul class="item-list">${goals.map((g) => {
                const s = goalStats(g, today);
                return html`<li class="item">
                  <span class="cat-badge cat-badge-sm" style="--c:#1baf7a" aria-hidden="true">${g.icon}</span>
                  <div class="item-body">
                    <div class="item-title">${g.name} ${s.done ? statusPill('done') : ''}</div>
                    ${meter(s.ratio, s.done ? 'done' : 'ok', g.name)}
                    <div class="item-sub">${s.monthlyNeeded ? html`<span>${formatMoney(s.monthlyNeeded)} / mois pour tenir l'échéance</span>` : ''}${s.overdue ? html`<span>Échéance dépassée</span>` : ''}</div>
                  </div>
                  <div class="item-side"><strong class="money">${formatMoney(s.saved)}</strong><span class="muted small money">sur ${formatMoney(g.target)}</span></div>
                </li>`;
              })}</ul>`
            : html`<div class="card-pad">${emptyState({ iconName: 'target', title: 'Aucun objectif', text: 'Vacances, fonds d’urgence, apport immobilier : fixez un cap et suivez vos progrès.', action: html`<a class="btn" href="#objectifs">Créer un objectif</a>` })}</div>`}
        </section>
      </div>
    `;
  },

  mount(root, { state }) {
    // Les conseils sont calculés après l'affichage, pendant un temps mort : l'écran répond tout de suite.
    const slot = root.querySelector('#health-slot');
    if (slot) {
      const fill = () => {
        if (!slot.isConnected) return;
        slot.outerHTML = String(healthCard(state));
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(fill, { timeout: 800 });
      else setTimeout(fill, 0);
    }
    root.querySelectorAll('[data-confirm-occ]').forEach((btn) =>
      btn.addEventListener('click', () => {
        confirmOccurrence(btn.dataset.confirmOcc, btn.dataset.date);
        toast('Opération enregistrée');
      }),
    );
    root.querySelectorAll('[data-skip-occ]').forEach((btn) =>
      btn.addEventListener('click', () => {
        skipOccurrence(btn.dataset.skipOcc, btn.dataset.date);
        toast('Échéance ignorée');
      }),
    );
  },
};
