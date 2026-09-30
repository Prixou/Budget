// Budgets mensuels par catégorie, avec report du reste et suggestions.
import { budgetReport, effectiveBudget, filterTransactions, spendIndex, suggestBudgets, summarize } from '../calc.js';
import { meter } from '../charts.js';
import { catBadge, kpi, monthNav, statusPill } from '../components.js';
import { amountField } from '../forms.js';
import { applyBudgetSuggestions, removeBudget, setBudget, store } from '../store.js';
import { categoryOptions, confirmDialog, emptyState, fieldError, formValues, icon, openModal, toast } from '../ui.js';
import { capitalize, formatMoney, formatPercent, html, monthEnd, monthLabel, monthRange, monthStart, parseAmount, raw, shiftMonth, sum } from '../utils.js';

function averageSpend(state, categoryId, month, n = 3) {
  const index = spendIndex(state);
  const months = monthRange(shiftMonth(month, -n), shiftMonth(month, -1));
  return Math.round(sum(months, (m) => index.get(`${m}|${categoryId}`) || 0) / n);
}

function openBudgetForm(state, month, categoryId = null, { preselect = null } = {}) {
  const conf = categoryId ? state.budgets[categoryId] : null;
  const hasOverride = categoryId && state.budgetOverrides?.[month]?.[categoryId] != null;
  const current = categoryId ? effectiveBudget(state, categoryId, month) : null;
  const expenseCats = state.categories.filter((c) => c.type === 'expense');
  const firstFree = expenseCats.find((c) => !state.budgets[c.id])?.id || expenseCats[0]?.id;
  const selected = categoryId || preselect || firstFree;

  openModal({
    title: categoryId ? 'Modifier le budget' : 'Nouveau budget',
    size: 'sm',
    body: html`<form class="form" id="budget-form" novalidate>
      <label class="field"><span>Catégorie</span>
        <select class="select" name="categoryId" id="b-category" ${categoryId ? raw('disabled') : ''}>${categoryOptions(state.categories, 'expense', selected, { placeholder: null })}</select>
      </label>
      ${amountField({ label: 'Plafond mensuel', value: current, hint: '' })}
      <p class="muted small" id="b-average"></p>
      <fieldset class="field" style="border:0;padding:0;margin:0">
        <legend class="label" style="font-size:.84rem;font-weight:600;color:var(--fg-2);margin-bottom:6px">S'applique à</legend>
        <label class="check"><input type="radio" name="scope" value="all" ${hasOverride ? '' : raw('checked')}><span>Tous les mois <span class="muted">(budget habituel)</span></span></label>
        <label class="check"><input type="radio" name="scope" value="month" ${hasOverride ? raw('checked') : ''}><span>${capitalize(monthLabel(month))} uniquement</span></label>
      </fieldset>
      <label class="check"><input type="checkbox" name="rollover" id="b-rollover" ${conf?.rollover ? raw('checked') : ''}><span>Reporter le reste sur le mois suivant <span class="muted">(le dépassement est aussi reporté)</span></span></label>
    </form>`,
    footer: html`${categoryId ? html`<button type="button" class="btn btn-ghost spacer" data-remove>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="budget-form" class="btn btn-primary">Enregistrer</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const avg = el.querySelector('#b-average');
      const updateAvg = () => {
        const id = categoryId || form.elements.categoryId.value;
        const value = averageSpend(store.state, id, month);
        avg.textContent = value ? `Moyenne des 3 mois précédents : ${formatMoney(value)}` : 'Aucune dépense sur les 3 mois précédents.';
      };
      updateAvg();
      form.elements.categoryId.addEventListener('change', updateAvg);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(form);
        const amount = parseAmount(v.amount);
        if (amount == null || amount < 0) return fieldError(form, 'amount', 'Indiquez un montant valide (0 ou plus).');
        setBudget(categoryId || v.categoryId, amount, { scope: v.scope, month, rollover: v.rollover });
        toast('Budget enregistré');
        close();
      });
      el.querySelector('[data-remove]')?.addEventListener('click', async () => {
        close();
        const cat = state.categories.find((c) => c.id === categoryId);
        if (await confirmDialog({ title: 'Supprimer le budget', message: `Le budget « ${cat?.name} » sera supprimé pour tous les mois. Les opérations ne sont pas modifiées.`, confirmLabel: 'Supprimer', danger: true })) {
          removeBudget(categoryId);
          toast('Budget supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
        }
      });
    },
  });
}

function openSuggestions(state, month) {
  const suggestions = suggestBudgets(state, 3, monthStart(month));
  const entries = Object.entries(suggestions);
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  if (!entries.length) {
    toast('Pas assez d’historique : il faut des dépenses sur les 3 mois précédents.');
    return;
  }
  openModal({
    title: 'Budgets suggérés',
    body: html`<p class="muted">D'après vos dépenses moyennes des 3 mois précédant ${monthLabel(month)}, arrondies aux 10 unités supérieures. Cochez les budgets à appliquer à tous les mois.</p>
      <ul class="item-list" style="margin-top:10px">
        ${entries.map(([id, amount]) => {
          const cat = cats.get(id);
          const current = state.budgets[id]?.amount;
          return html`<li class="item" style="padding:10px 0">
            <input type="checkbox" data-suggest="${id}" ${current == null ? raw('checked') : ''} aria-label="${cat.name}" style="width:18px;height:18px;accent-color:var(--accent)">
            <div class="item-body"><div class="item-title">${cat.icon} ${cat.name}</div>${current != null ? html`<div class="item-sub">Budget actuel : ${formatMoney(current)}</div>` : ''}</div>
            <div class="item-side"><strong class="money">${formatMoney(amount)}</strong></div>
          </li>`;
        })}
      </ul>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="button" class="btn btn-primary" data-apply>Appliquer</button>`,
    onMount(el, close) {
      el.querySelector('[data-apply]').addEventListener('click', () => {
        const chosen = {};
        el.querySelectorAll('[data-suggest]:checked').forEach((cb) => {
          chosen[cb.dataset.suggest] = suggestions[cb.dataset.suggest];
        });
        if (!Object.keys(chosen).length) return close();
        applyBudgetSuggestions(chosen);
        toast(`${Object.keys(chosen).length} budget(s) appliqué(s)`, { action: { label: 'Annuler', fn: () => store.undo() } });
        close();
      });
    },
  });
}

export default {
  id: 'budgets',
  title: 'Budgets',
  icon: 'pie',

  actions() {
    return html`<button type="button" class="btn btn-ghost" data-suggest-budgets>${icon('sparkle', { size: 16 })} <span class="desktop-only">Suggérer</span></button>
      <button type="button" class="btn btn-primary" data-new-budget>${icon('plus', { size: 16 })} <span class="desktop-only">Nouveau budget</span></button>`;
  },

  topbarMount(bar, { state, session }) {
    bar.querySelector('[data-new-budget]')?.addEventListener('click', () => openBudgetForm(state, session.month));
    bar.querySelector('[data-suggest-budgets]')?.addEventListener('click', () => openSuggestions(state, session.month));
  },

  render({ state, session }) {
    const month = session.month;
    const report = budgetReport(state, month, { alertThreshold: state.settings.budgetAlert });
    const budgeted = report.rows.filter((r) => r.status !== 'none');
    const unbudgeted = report.rows.filter((r) => r.status === 'none');
    const income = summarize(filterTransactions(state, { from: monthStart(month), to: monthEnd(month) })).income;
    const toAssign = income - report.totals.available;
    const t = report.totals;
    const overallRatio = t.available > 0 ? t.spent / t.available : 0;
    const overallStatus = t.remaining < 0 ? 'over' : overallRatio * 100 >= state.settings.budgetAlert ? 'warning' : 'ok';

    return html`
      <div class="row-between">${monthNav(month)}</div>
      <section class="card stack-v">
        <div class="kpis">
          ${kpi('Budgété', formatMoney(t.available))}
          ${kpi('Dépensé', formatMoney(t.spent), html`<span class="kpi-delta">${t.available ? `${formatPercent(overallRatio)} du budget` : ''}</span>`)}
          ${kpi('Reste', html`<span class="${t.remaining < 0 ? 'neg' : ''}">${formatMoney(t.remaining)}</span>`)}
          ${kpi('Dépenses hors budget', formatMoney(t.unbudgetedSpent))}
        </div>
        ${t.available ? meter(overallRatio, overallStatus, 'Budget global') : ''}
        ${income
          ? html`<div class="callout ${toAssign < 0 ? 'callout-warning' : ''}">${icon('info')}<div>Revenus du mois : <strong class="money">${formatMoney(income)}</strong>. ${
              toAssign >= 0
                ? html`Il reste <strong class="money">${formatMoney(toAssign)}</strong> non affectés à un budget (épargne possible).`
                : html`Vos budgets dépassent vos revenus de <strong class="money">${formatMoney(-toAssign)}</strong>.`
            }</div></div>`
          : ''}
      </section>

      <section class="card card-flush">
        <div class="card-header"><div><h2>Budgets de ${monthLabel(month)}</h2><p class="sub">Cliquez sur un budget pour le modifier</p></div></div>
        ${budgeted.length
          ? html`<ul class="item-list">${budgeted.map(
              (r) => html`<li class="item item-clickable" data-edit-budget="${r.category.id}" tabindex="0">
                ${catBadge(r.category)}
                <div class="item-body">
                  <div class="item-title">${r.category.name} ${r.status !== 'ok' ? statusPill(r.status) : ''} ${r.rollover ? html`<span class="pill pill-accent">${icon('repeat', { size: 12 })} Report</span>` : ''}</div>
                  ${meter(r.ratio, r.status, r.category.name)}
                  <div class="item-sub">
                    <span class="money">${formatMoney(r.spent)} sur ${formatMoney(r.available)}</span>
                    ${r.carry ? html`<span class="money">dont report ${formatMoney(r.carry, { sign: 'always' })}</span>` : ''}
                    <a href="#transactions?category=${r.category.id}&month=${month}" data-stop>Voir les opérations</a>
                  </div>
                </div>
                <div class="item-side">
                  <strong class="money ${r.remaining < 0 ? 'neg' : ''}">${formatMoney(r.remaining)}</strong>
                  <span class="muted small">${r.remaining < 0 ? 'de dépassement' : 'restant'}</span>
                </div>
              </li>`,
            )}</ul>`
          : emptyState({
              iconName: 'pie',
              title: 'Aucun budget défini',
              text: 'Fixez un plafond de dépenses par catégorie. Vous pouvez aussi partir de vos dépenses moyennes.',
              action: html`<div class="row"><button type="button" class="btn btn-primary" data-new-budget-inline>Créer un budget</button><button type="button" class="btn" data-suggest-inline>${icon('sparkle', { size: 16 })} Suggérer</button></div>`,
            })}
      </section>

      ${unbudgeted.length
        ? html`<section class="card card-flush">
            <div class="card-header"><div><h2>Dépenses sans budget</h2><p class="sub">${formatMoney(t.unbudgetedSpent - t.uncategorized)} ce mois-ci${t.uncategorized ? ` · ${formatMoney(t.uncategorized)} non catégorisés` : ''}</p></div></div>
            <ul class="item-list">${unbudgeted.map(
              (r) => html`<li class="item">
                ${catBadge(r.category, { small: true })}
                <div class="item-body"><div class="item-title">${r.category.name}</div></div>
                <div class="item-side"><strong class="money">${formatMoney(r.spent)}</strong><button type="button" class="link-btn" data-edit-budget="${r.category.id}" data-new="1">Définir un budget</button></div>
              </li>`,
            )}</ul>
          </section>`
        : ''}
    `;
  },

  mount(root, { state, session }) {
    root.querySelectorAll('[data-edit-budget]').forEach((el) => {
      const open = (e) => {
        if (e.target.closest('[data-stop]')) return;
        const id = el.dataset.editBudget;
        if (el.dataset.new) openBudgetForm(state, session.month, null, { preselect: id });
        else openBudgetForm(state, session.month, id);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') open(e);
      });
    });
    root.querySelector('[data-new-budget-inline]')?.addEventListener('click', () => openBudgetForm(state, session.month));
    root.querySelector('[data-suggest-inline]')?.addEventListener('click', () => openSuggestions(state, session.month));
  },
};
