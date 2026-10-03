// Crédits en cours : capital restant dû, intérêts, tableau d'amortissement.
import { loanPayment, loanStatus, monthlyTotals } from '../calc.js';
import { meter } from '../charts.js';
import { kpi } from '../components.js';
import { DEBT_KINDS } from '../defaults.js';
import { amountField, currencySymbol } from '../forms.js';
import { payoffPlan } from '../insights.js';
import { deleteDebt, saveDebt, store } from '../store.js';
import { confirmDialog, emptyState, fieldError, formValues, icon, openModal, options, toast } from '../ui.js';
import { formatDate, formatMoney, formatNumber, formatPercent, groupBy, html, isValidISODate, monthKey, monthRange, parseAmount, shiftMonth, sum, todayISO } from '../utils.js';

const ui = { extra: 10000 };

/** Comparaison des stratégies de remboursement avec un effort mensuel supplémentaire. */
function strategyCard(active, today) {
  const extra = ui.extra;
  const base = payoffPlan(active, { extra: 0, today, rollover: false });
  const avalanche = payoffPlan(active, { extra, strategy: 'avalanche', today });
  const snowball = payoffPlan(active, { extra, strategy: 'snowball', today });
  const several = active.length > 1;
  const rows = several
    ? [
        ['Sans effort supplémentaire', base, null],
        ['Avalanche : taux le plus élevé d’abord', avalanche, avalanche.order],
        ['Boule de neige : plus petite dette d’abord', snowball, snowball.order],
      ]
    : [
        ['Sans effort supplémentaire', base, null],
        [`Avec ${formatMoney(extra, { decimals: false })} de plus par mois`, avalanche, null],
      ];
  return html`<section class="card">
    <div class="card-header">
      <div><h2>Stratégie de remboursement</h2><p class="sub">Combien de temps et d'intérêts gagnés en remboursant un peu plus chaque mois</p></div>
      <label class="field" style="min-width:180px"><span>Effort supplémentaire / mois</span>
        <div class="input-with-suffix"><input class="input" id="strategy-extra" inputmode="decimal" value="${String(extra / 100).replace('.', ',')}"><span class="suffix">${currencySymbol()}</span></div>
      </label>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Stratégie</th><th>Libre de dettes</th><th class="num">Intérêts restants</th><th class="num">Économie</th></tr></thead>
      <tbody>${rows.map(
        ([label, plan, order]) => html`<tr>
          <td class="wrap"><strong>${label}</strong>${order ? html`<br><span class="muted small">Ordre : ${order.map((o) => o.name).join(' → ')}</span>` : ''}</td>
          <td>${formatDate(plan.freeDate)}<br><span class="muted small">${plan.months} mois</span></td>
          <td class="num money">${formatMoney(plan.interest, { decimals: false })}</td>
          <td class="num money ${plan === base ? '' : 'pos'}">${plan === base ? '—' : formatMoney(base.interest - plan.interest, { decimals: false })}</td>
        </tr>`,
      )}</tbody>
    </table></div>
    <p class="muted small" style="margin-top:10px">${
      several
        ? "L'avalanche coûte toujours le moins d'intérêts. La boule de neige solde plus vite une première dette : selon une étude de la Kellogg School of Management (6 000 personnes endettées), ces « petites victoires » aident davantage à aller au bout. Dans les deux cas, la mensualité d'une dette soldée est reportée sur la suivante."
        : 'Vérifiez auparavant les éventuelles indemnités de remboursement anticipé (simulateur « Remboursement anticipé »).'
    }</p>
  </section>`;
}

function parseRate(value) {
  const n = parseFloat(String(value).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}

function openDebtForm(debt = null) {
  const editing = !!debt;
  const v = { name: '', kind: 'conso', lender: '', principal: null, rate: '', termMonths: 60, startDate: todayISO(), insurance: 0, notes: '', ...(debt || {}) };
  openModal({
    title: editing ? 'Modifier le crédit' : 'Nouveau crédit',
    body: html`<form class="form" id="debt-form" novalidate>
      <div class="form-row">
        <label class="field"><span>Nom</span><input class="input" name="name" id="d-name" maxlength="60" required placeholder="Ex. : Prêt immobilier" value="${v.name}"></label>
        <label class="field"><span>Type</span><select class="select" name="kind" id="d-kind">${options(Object.entries(DEBT_KINDS).map(([value, label]) => ({ value, label })), v.kind)}</select></label>
      </div>
      <div class="form-row">
        ${amountField({ name: 'principal', label: 'Montant emprunté', value: v.principal })}
        <label class="field"><span>Taux nominal annuel</span><div class="input-with-suffix"><input class="input" name="rate" id="d-rate" inputmode="decimal" placeholder="3,5" value="${String(v.rate).replace('.', ',')}"><span class="suffix">%</span></div></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Durée</span><div class="input-with-suffix"><input class="input" name="termMonths" id="d-term" inputmode="numeric" value="${v.termMonths}"><span class="suffix">mois</span></div><span class="hint" id="d-term-hint"></span></label>
        <label class="field"><span>Première mensualité</span><input class="input" type="date" name="startDate" id="d-start" value="${v.startDate}"></label>
      </div>
      <div class="form-row">
        ${amountField({ name: 'insurance', label: 'Assurance mensuelle', value: v.insurance, required: false })}
        <label class="field"><span>Organisme prêteur <span class="muted">(facultatif)</span></span><input class="input" name="lender" id="d-lender" maxlength="60" value="${v.lender || ''}"></label>
      </div>
      <div class="callout" id="d-preview">${icon('calculator')}<div></div></div>
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="debt-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter le crédit'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const preview = el.querySelector('#d-preview div');
      const hint = el.querySelector('#d-term-hint');
      const update = () => {
        const f = formValues(form);
        const principal = parseAmount(f.principal);
        const rate = parseRate(f.rate);
        const months = parseInt(f.termMonths, 10);
        hint.textContent = months > 0 ? `soit ${formatNumber(months / 12, 1)} ans` : '';
        if (!principal || rate == null || !(months > 0)) {
          preview.textContent = 'Renseignez le montant, le taux et la durée pour calculer la mensualité.';
          return;
        }
        const monthly = Math.round(loanPayment(principal, rate, months));
        const insurance = parseAmount(f.insurance) || 0;
        const interest = monthly * months - principal;
        preview.textContent = `Mensualité : ${formatMoney(monthly + insurance)}${insurance ? ` (dont ${formatMoney(insurance)} d'assurance)` : ''} · coût des intérêts : ${formatMoney(interest)}`;
      };
      form.addEventListener('input', update);
      update();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(form);
        const principal = parseAmount(f.principal);
        const rate = parseRate(f.rate);
        const months = parseInt(f.termMonths, 10);
        if (!f.name.trim()) return fieldError(form, 'name', 'Donnez un nom au crédit.');
        if (!principal || principal <= 0) return fieldError(form, 'principal', 'Indiquez le montant emprunté.');
        if (rate == null) return fieldError(form, 'rate', 'Indiquez un taux entre 0 et 100 %.');
        if (!(months > 0 && months <= 600)) return fieldError(form, 'termMonths', 'Durée entre 1 et 600 mois.');
        if (!isValidISODate(f.startDate)) return fieldError(form, 'startDate', 'Date invalide.');
        saveDebt({ id: debt?.id, name: f.name.trim(), kind: f.kind, lender: f.lender.trim(), principal, rate, termMonths: months, startDate: f.startDate, insurance: parseAmount(f.insurance) || 0, notes: debt?.notes || '' });
        toast(editing ? 'Crédit modifié' : 'Crédit ajouté');
        close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog({ title: 'Supprimer le crédit', message: `« ${debt.name} » ne sera plus suivi.`, confirmLabel: 'Supprimer', danger: true })) {
          deleteDebt(debt.id);
          toast('Crédit supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
        }
      });
    },
  });
}

/** Tableau d'amortissement agrégé par année. */
export function amortizationTable(rows, insurance = 0) {
  const byYear = groupBy(rows, (r) => (r.date ? r.date.slice(0, 4) : String(Math.ceil(r.n / 12))));
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Année</th><th class="num">Mensualités</th><th class="num">Capital remboursé</th><th class="num">Intérêts</th>${insurance ? html`<th class="num">Assurance</th>` : ''}<th class="num">Capital restant</th></tr></thead>
    <tbody>${[...byYear.entries()].map(
      ([year, list]) => html`<tr>
        <td>${year}</td>
        <td class="num">${list.length}</td>
        <td class="num">${formatMoney(sum(list, (r) => r.principal))}</td>
        <td class="num">${formatMoney(sum(list, (r) => r.interest))}</td>
        ${insurance ? html`<td class="num">${formatMoney(sum(list, (r) => r.insurance))}</td>` : ''}
        <td class="num">${formatMoney(list[list.length - 1].balance)}</td>
      </tr>`,
    )}</tbody>
  </table></div>`;
}

export default {
  id: 'dettes',
  title: 'Crédits',
  icon: 'debt',

  actions() {
    return html`<button type="button" class="btn btn-primary" data-new-debt>${icon('plus', { size: 16 })} <span class="desktop-only">Nouveau crédit</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-new-debt]')?.addEventListener('click', () => openDebtForm());
  },

  render({ state }) {
    const today = todayISO();
    if (!state.debts.length) {
      return html`<section class="card">${emptyState({
        iconName: 'debt',
        title: 'Aucun crédit suivi',
        text: 'Ajoutez vos prêts (immobilier, auto, consommation) pour suivre le capital restant dû et le coût des intérêts.',
        action: html`<button type="button" class="btn btn-primary" data-new-debt-inline>${icon('plus', { size: 16 })} Ajouter un crédit</button>`,
      })}</section>`;
    }
    const statuses = new Map(state.debts.map((d) => [d.id, loanStatus(d, today)]));
    const active = state.debts.filter((d) => statuses.get(d.id).remaining > 0);
    const remaining = sum(state.debts, (d) => statuses.get(d.id).remaining);
    const monthly = sum(active, (d) => statuses.get(d.id).monthly);
    const interestLeft = sum(state.debts, (d) => statuses.get(d.id).interestLeft);
    const last = shiftMonth(monthKey(today), -1);
    const incomeRows = monthlyTotals(state, monthRange(shiftMonth(last, -2), last));
    const avgIncome = sum(incomeRows, (r) => r.income) / 3;
    const ratio = avgIncome > 0 ? monthly / avgIncome : null;

    return html`
      <section class="kpis kpis-cards">
        ${kpi('Capital restant dû', formatMoney(remaining))}
        ${kpi('Mensualités', formatMoney(monthly), html`<span class="kpi-delta">${formatMoney(monthly * 12)} par an</span>`)}
        ${kpi('Intérêts restant à payer', formatMoney(interestLeft))}
        ${kpi(
          "Taux d'endettement",
          ratio == null ? '—' : formatPercent(ratio, 1),
          html`<span class="kpi-delta">${ratio == null ? 'Revenus des 3 derniers mois requis' : ratio > 0.35 ? html`<span class="delta-bad">Au-delà des 35 % recommandés</span>` : 'Seuil recommandé : 35 %'}</span>`,
        )}
      </section>
      ${active.length ? strategyCard(active, today) : ''}
      <div class="cards">
        ${state.debts.map((d) => {
          const s = statuses.get(d.id);
          const finished = s.remaining <= 0;
          return html`<article class="card tile">
            <div class="tile-head">
              <span class="acct-icon">${icon('debt', { size: 20 })}</span>
              <div class="grow"><h3>${d.name}</h3><p class="muted small">${DEBT_KINDS[d.kind] || 'Crédit'}${d.lender ? ` · ${d.lender}` : ''} · ${formatNumber(d.rate, 2)} %</p></div>
              <button type="button" class="icon-btn icon-btn-sm" data-edit-debt="${d.id}" aria-label="Modifier ${d.name}">${icon('edit', { size: 16 })}</button>
            </div>
            <div class="row-between"><span class="tile-value money">${formatMoney(s.remaining)}</span><span class="muted small">restant dû</span></div>
            ${meter(s.ratio, finished ? 'done' : 'ok', `${d.name} remboursé`)}
            <p class="small muted">${formatPercent(s.ratio)} remboursé · ${s.paymentsMade} / ${s.rows.length} mensualités</p>
            <dl class="stat-list">
              <div><dt>Mensualité</dt><dd class="money">${formatMoney(s.monthly)}</dd></div>
              <div><dt>Fin du crédit</dt><dd>${formatDate(s.endDate)}</dd></div>
              <div><dt>Intérêts payés</dt><dd class="money">${formatMoney(s.interestPaid)}</dd></div>
              <div><dt>Intérêts restants</dt><dd class="money">${formatMoney(s.interestLeft)}</dd></div>
              <div><dt>Coût total du crédit</dt><dd class="money">${formatMoney(s.totalInterest + (d.insurance || 0) * s.rows.length)}</dd></div>
              <div><dt>Prochaine échéance</dt><dd>${s.next ? formatDate(s.next.date) : '—'}</dd></div>
            </dl>
            <details class="disclosure"><summary>Tableau d'amortissement ${icon('down', { size: 14 })}</summary>${amortizationTable(s.rows, d.insurance)}</details>
          </article>`;
        })}
      </div>`;
  },

  mount(root, { rerender }) {
    const extraInput = root.querySelector('#strategy-extra');
    extraInput?.addEventListener('change', () => {
      const v = parseAmount(extraInput.value);
      ui.extra = v != null && v >= 0 ? v : 0;
      rerender();
    });
    root.querySelector('[data-new-debt-inline]')?.addEventListener('click', () => openDebtForm());
    root.querySelectorAll('[data-edit-debt]').forEach((b) => b.addEventListener('click', () => openDebtForm(store.state.debts.find((d) => d.id === b.dataset.editDebt))));
  },
};
