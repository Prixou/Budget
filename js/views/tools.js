// Simulateurs : prêt, capacité d'emprunt, épargne, objectif, 50/30/20, fonds d'urgence.
import {
  accountBalances,
  averageMonthlyExpense,
  borrowingCapacity,
  filterTransactions,
  groupSplit,
  loanStatus,
  loanSummary,
  monthlyTotals,
  requiredMonthlySaving,
  savingsProjection,
} from '../calc.js';
import { chartSlot, legend, meter, mountCharts, stackedBar } from '../charts.js';
import { kpi } from '../components.js';
import { DEBT_KINDS, REFERENCE } from '../defaults.js';
import { currencySymbol } from '../forms.js';
import { earlyRepayment, marketMortgageRate } from '../insights.js';
import { store } from '../store.js';
import { formValues, icon, options } from '../ui.js';
import { amortizationTable } from './debts.js';
import { addDays, centsToInput, formatDate, formatMoney, formatNumber, formatPercent, html, monthEnd, monthKey, monthRange, monthStart, parseAmount, shiftMonth, sum, todayISO } from '../utils.js';

const TOOLS = {
  loan: { label: 'Prêt', icon: 'debt' },
  prepay: { label: 'Remboursement anticipé', icon: 'debt' },
  capacity: { label: "Capacité d'emprunt", icon: 'bank' },
  savings: { label: 'Épargne & intérêts', icon: 'chart' },
  goal: { label: 'Objectif', icon: 'target' },
  rule: { label: '50 / 30 / 20', icon: 'pie' },
  emergency: { label: "Fonds d'urgence", icon: 'alert' },
};

const ui = { tool: 'loan', values: {} };

/** Ouvre un simulateur précis, éventuellement prérempli (depuis un conseil). */
export function openTool(tool, { debtId = null, amount = null } = {}) {
  ui.tool = tool;
  if (tool === 'prepay') ui.values.prepay = { ...(ui.values.prepay || {}), ...(debtId ? { debt: debtId } : {}), ...(amount ? { amount: centsToInput(amount) } : {}) };
  if (location.hash === '#simulateurs') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#simulateurs';
}

const RATE_PRESETS = [
  ['Livret A / LDDS', REFERENCE.livretARate],
  ['LEP', REFERENCE.lepRate],
  ['Fonds en euros (moy. 2025)', REFERENCE.fondsEurosRate],
  ['PEL 2026 (brut)', 2],
];

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const money = (v) => parseAmount(v) ?? 0;

function field(name, label, value, { suffix = '', hint = '', type = 'text' } = {}) {
  return html`<label class="field"><span>${label}</span>
    <div class="input-with-suffix"><input class="input" name="${name}" id="t-${name}" type="${type}" inputmode="decimal" autocomplete="off" value="${value}">${suffix ? html`<span class="suffix">${suffix}</span>` : ''}</div>
    ${hint ? html`<span class="hint">${hint}</span>` : ''}</label>`;
}

/** Moyennes des 3 derniers mois complets, pour préremplir les simulateurs. */
function context(state) {
  const today = todayISO();
  const last = shiftMonth(monthKey(today), -1);
  const months = monthRange(shiftMonth(last, -2), last);
  const rows = monthlyTotals(state, months);
  const active = rows.filter((r) => r.income || r.expense);
  const avgIncome = active.length ? Math.round(sum(active, (r) => r.income) / active.length) : 0;
  const avgExpense = averageMonthlyExpense(state, 3, today);
  const debtsMonthly = sum(state.debts, (d) => {
    const s = loanStatus(d, today);
    return s.remaining > 0 ? s.monthly : 0;
  });
  const balances = accountBalances(state, today);
  const savings = sum(state.accounts.filter((a) => a.type === 'epargne' && !a.archived), (a) => Math.max(0, balances.get(a.id) || 0));
  const txs = filterTransactions(state, { from: monthStart(months[0]), to: monthEnd(last) });
  const split = groupSplit(state, txs);
  const n = active.length || 1;
  const emergencyMonths = state.settings?.incomeStability === 'variable' ? REFERENCE.emergencyMonthsVariable : REFERENCE.emergencyMonthsStable;
  return { state, avgIncome, avgExpense, debtsMonthly, savings, emergencyMonths, split: { needs: split.needs / n, wants: split.wants / n, savings: split.savings / n, income: split.income / n } };
}

function defaults(tool, ctx) {
  switch (tool) {
    case 'loan':
      return { principal: '200000', rate: formatNumber(marketMortgageRate(20), 2), years: '20', insurance: '0,30' };
    case 'prepay': {
      const active = ctx.state.debts.find((d) => loanStatus(d, todayISO()).remaining > 0);
      return { debt: active ? active.id : 'manual', amount: '5000', mode: 'duration', remaining: '100000', rate: '4', monthsLeft: '120', kind: 'immobilier', insurance: '0' };
    }
    case 'capacity':
      return { income: centsToInput(ctx.avgIncome) || '3000', charges: centsToInput(ctx.debtsMonthly) || '0', ratio: '35', rate: formatNumber(marketMortgageRate(25), 2), years: '25', insurance: '0,30', downPayment: '20000' };
    case 'savings':
      return { initial: '1000', monthly: '200', rate: formatNumber(REFERENCE.livretARate, 2), years: '15', inflation: formatNumber(REFERENCE.inflation, 2) };
    case 'goal':
      return { target: '10000', current: centsToInput(ctx.savings) || '0', months: '24', rate: '2' };
    case 'rule':
      return { income: centsToInput(ctx.avgIncome) || '2500' };
    case 'emergency':
      return { expense: centsToInput(ctx.avgExpense) || '1800', months: String(ctx.emergencyMonths), current: centsToInput(ctx.savings) || '0' };
    default:
      return {};
  }
}

function forms(tool, v, ctx) {
  const cur = currencySymbol();
  switch (tool) {
    case 'prepay': {
      const debts = ctx.state.debts.filter((d) => loanStatus(d, todayISO()).remaining > 0);
      return html`<label class="field"><span>Crédit</span><select class="select" name="debt" id="t-debt">${options(
          [...debts.map((d) => ({ value: d.id, label: `${d.name} (${formatNumber(d.rate, 2)} %)` })), { value: 'manual', label: 'Saisie manuelle' }],
          v.debt,
        )}</select></label>
        <div class="stack-v" data-manual ${v.debt === 'manual' ? '' : 'hidden'}>
          ${field('remaining', 'Capital restant dû', v.remaining, { suffix: cur })}
          ${field('rate', 'Taux nominal annuel', v.rate, { suffix: '%' })}
          ${field('monthsLeft', 'Mensualités restantes', v.monthsLeft, { suffix: 'mois' })}
          <label class="field"><span>Type de crédit</span><select class="select" name="kind" id="t-kind">${options(Object.entries(DEBT_KINDS).map(([value, label]) => ({ value, label })), v.kind)}</select></label>
          ${field('insurance', 'Assurance mensuelle', v.insurance, { suffix: cur })}
        </div>
        ${field('amount', 'Somme remboursée par anticipation', v.amount, { suffix: cur })}
        <label class="field"><span>Ensuite</span><select class="select" name="mode" id="t-mode">${options(
          [
            { value: 'duration', label: 'Garder la mensualité, raccourcir la durée' },
            { value: 'payment', label: 'Garder la durée, baisser la mensualité' },
          ],
          v.mode,
        )}</select></label>`;
    }
    case 'loan':
      return html`${field('principal', 'Montant emprunté', v.principal, { suffix: cur })}
        ${field('rate', 'Taux nominal annuel', v.rate, { suffix: '%', hint: `Taux moyens 2026 : ${formatNumber(REFERENCE.mortgageMarket15y, 1)} % sur 15 ans à ${formatNumber(REFERENCE.mortgageMarket25y, 1)} % sur 25 ans.` })}
        ${field('years', 'Durée', v.years, { suffix: 'ans' })}
        ${field('insurance', 'Assurance emprunteur', v.insurance, { suffix: '%', hint: 'Taux annuel appliqué au capital emprunté (souvent 0,10 à 0,40 %).' })}`;
    case 'capacity':
      return html`${field('income', 'Revenus nets mensuels du foyer', v.income, { suffix: cur, hint: 'Prérempli avec vos revenus moyens des 3 derniers mois.' })}
        ${field('charges', 'Mensualités de crédits en cours', v.charges, { suffix: cur })}
        ${field('ratio', "Taux d'endettement maximal", v.ratio, { suffix: '%', hint: 'Les banques françaises appliquent 35 % assurance comprise (recommandation HCSF).' })}
        ${field('rate', 'Taux du crédit', v.rate, { suffix: '%' })}
        ${field('years', 'Durée', v.years, { suffix: 'ans', hint: '25 ans maximum (27 ans dans le neuf), selon les normes du HCSF.' })}
        ${field('insurance', 'Assurance emprunteur', v.insurance, { suffix: '%' })}
        ${field('downPayment', 'Apport personnel', v.downPayment, { suffix: cur })}`;
    case 'savings':
      return html`${field('initial', 'Capital de départ', v.initial, { suffix: cur })}
        ${field('monthly', 'Versement mensuel', v.monthly, { suffix: cur })}
        ${field('rate', 'Rendement annuel', v.rate, { suffix: '%', hint: `Taux au ${formatDate(REFERENCE.ratesDate)}. Les livrets réglementés sont nets d'impôt ; fonds en euros et PEL avant prélèvements.` })}
        <div class="chips" role="group" aria-label="Taux de référence">${RATE_PRESETS.map(([label, rate]) => html`<button type="button" class="chip" data-preset-rate="${formatNumber(rate, 2)}">${label} · ${formatNumber(rate, 2)} %</button>`)}</div>
        ${field('years', 'Durée', v.years, { suffix: 'ans' })}
        ${field('inflation', 'Inflation annuelle', v.inflation, { suffix: '%', hint: `Prévision 2026 de la Banque de France : ${formatNumber(REFERENCE.inflation, 1)} %.` })}`;
    case 'goal':
      return html`${field('target', 'Montant à atteindre', v.target, { suffix: cur })}
        ${field('current', 'Déjà épargné', v.current, { suffix: cur })}
        ${field('months', 'Délai', v.months, { suffix: 'mois' })}
        ${field('rate', 'Rendement annuel', v.rate, { suffix: '%' })}`;
    case 'rule':
      return html`${field('income', 'Revenus nets mensuels', v.income, { suffix: cur, hint: 'Prérempli avec votre moyenne des 3 derniers mois.' })}`;
    case 'emergency':
      return html`${field('expense', 'Dépenses mensuelles', v.expense, { suffix: cur, hint: 'Prérempli avec votre moyenne des 3 derniers mois.' })}
        <label class="field"><span>Mois de dépenses à couvrir</span><select class="select" name="months" id="t-months">${options(
          [3, 4, 6, 9, 12].map((m) => ({ value: m, label: `${m} mois` })),
          v.months,
        )}</select><span class="hint">3 mois pour un salarié en CDI, 6 à 12 pour un indépendant.</span></label>
        ${field('current', 'Épargne de précaution actuelle', v.current, { suffix: cur, hint: 'Préremplie avec le solde de vos comptes épargne.' })}`;
    default:
      return '';
  }
}

function results(tool, v, ctx) {
  switch (tool) {
    case 'prepay': {
      const today = todayISO();
      let debt = ctx.state.debts.find((d) => d.id === v.debt);
      if (!debt) {
        const months = Math.round(num(v.monthsLeft));
        if (!money(v.remaining) || months <= 0) return hintBox();
        debt = { id: 'manuel', name: 'Crédit', kind: v.kind, principal: money(v.remaining), rate: num(v.rate), termMonths: months, startDate: addDays(today, 1), insurance: money(v.insurance) };
      }
      const amount = money(v.amount);
      if (!amount) return hintBox();
      const r = earlyRepayment(debt, { amount, mode: v.mode, today });
      const immo = debt.kind === 'immobilier';
      return html`<div class="stack-v">
        <div><span class="hero-label">Gain net du remboursement</span><div class="result-big money ${r.gain < 0 ? 'neg' : ''}">${formatMoney(r.gain, { decimals: false })}</div></div>
        <div class="kpis">
          ${kpi('Intérêts économisés', formatMoney(r.interestSaved, { decimals: false }))}
          ${kpi('Assurance économisée', formatMoney(r.insuranceSaved, { decimals: false }))}
          ${kpi('Indemnités (IRA)', formatMoney(r.penalty, { decimals: false }), html`<span class="kpi-delta">plafond légal</span>`)}
          ${v.mode === 'payment'
            ? kpi('Nouvelle mensualité', formatMoney(r.newPayment), html`<span class="kpi-delta">au lieu de ${formatMoney(r.payment)}</span>`)
            : kpi('Fin du crédit', r.newMonths ? formatDate(r.newEndDate) : 'Soldé', html`<span class="kpi-delta">${r.monthsLeft - r.newMonths} mensualité(s) en moins</span>`)}
        </div>
        <div class="callout ${r.worthIt ? 'callout-good' : 'callout-warning'}">${icon(r.worthIt ? 'check' : 'info')}<div>${
          r.worthIt
            ? html`<strong>Rembourser est plus intéressant</strong> que de garder ${formatMoney(r.amount, { decimals: false })} sur un Livret A (environ ${formatMoney(r.placementGain, { decimals: false })} d'intérêts sur la même durée). Gardez toutefois votre épargne de précaution intacte.`
            : html`<strong>Mieux vaut épargner</strong> : sur un Livret A à ${formatNumber(REFERENCE.livretARate, 2)} %, cette somme rapporterait environ ${formatMoney(r.placementGain, { decimals: false })}, plus que le gain du remboursement.`
        }</div></div>
        <p class="muted small">${
          immo
            ? "Crédit immobilier : indemnités plafonnées à 6 mois d'intérêts sur la somme remboursée et à 3 % du capital restant dû (art. L313-47 du Code de la consommation). Elles ne sont pas dues si le logement est vendu à la suite d'un changement de lieu de travail ou d'une cessation forcée d'activité, ni en cas de décès."
            : "Crédit à la consommation : aucune indemnité jusqu'à 10 000 € remboursés sur 12 mois ; au-delà, 1 % de la somme (0,5 % s'il reste moins d'un an), sans dépasser les intérêts restants (art. L312-34)."
        } Réduire la durée économise plus d'intérêts que réduire la mensualité.</p>
      </div>`;
    }
    case 'loan': {
      const principal = money(v.principal);
      const months = Math.round(num(v.years) * 12);
      if (!principal || months <= 0) return hintBox();
      const insurance = Math.round((principal * num(v.insurance)) / 100 / 12);
      const s = loanSummary({ principal, rate: num(v.rate), months, insurance });
      const years = [];
      for (let y = 0; y <= Math.ceil(months / 12); y++) {
        const row = s.rows[Math.min(s.rows.length - 1, y * 12 - 1)];
        years.push({ y, balance: y === 0 ? principal : row?.balance ?? 0 });
      }
      return html`<div class="kpis">
          ${kpi('Mensualité', formatMoney(s.monthly), html`<span class="kpi-delta">dont ${formatMoney(insurance)} d'assurance</span>`)}
          ${kpi('Coût des intérêts', formatMoney(s.interest))}
          ${kpi("Coût de l'assurance", formatMoney(s.insurance))}
          ${kpi('Coût total du crédit', formatMoney(s.totalCost), html`<span class="kpi-delta">${formatPercent(s.totalCost / principal, 1)} du montant emprunté</span>`)}
        </div>
        <div><h3 style="margin:18px 0 8px">Capital restant dû</h3>
        ${chartSlot({ type: 'line', height: 220, label: 'Capital restant dû par année', labels: years.map((r) => (r.y === 0 ? 'Début' : `${r.y} an${r.y > 1 ? 's' : ''}`)), tipLabels: years.map((r) => (r.y === 0 ? 'Au départ' : `Après ${r.y} an${r.y > 1 ? 's' : ''}`)), values: years.map((r) => r.balance), seriesLabel: 'Capital restant', zeroBased: true })}</div>
        <details class="disclosure" style="margin-top:12px"><summary>Tableau d'amortissement annuel ${icon('down', { size: 14 })}</summary>${amortizationTable(s.rows, insurance)}</details>`;
    }
    case 'capacity': {
      const income = money(v.income);
      const months = Math.round(num(v.years) * 12);
      if (!income || months <= 0) return hintBox();
      const r = borrowingCapacity({ income, charges: money(v.charges), maxRatio: num(v.ratio), rate: num(v.rate), months, insuranceRate: num(v.insurance) });
      const down = money(v.downPayment);
      return html`<div class="stack-v">
        <div><span class="hero-label">Capital empruntable</span><div class="result-big money">${formatMoney(r.capital, { decimals: false })}</div></div>
        <div class="kpis">
          ${kpi('Mensualité maximale', formatMoney(r.maxPayment), html`<span class="kpi-delta">assurance comprise</span>`)}
          ${kpi('Budget total du projet', formatMoney(r.capital + down, { decimals: false }), html`<span class="kpi-delta">avec l'apport, hors frais de notaire</span>`)}
          ${kpi("Endettement actuel", formatPercent(r.currentRatio, 1))}
        </div>
        ${r.maxPayment <= 0 ? html`<div class="callout callout-danger">${icon('alert')}<div>Vos charges de crédit dépassent déjà le taux d'endettement maximal.</div></div>` : ''}
        <div class="callout">${icon('info')}<div>Prévoyez environ 7 à 8 % du prix pour les frais de notaire dans l'ancien (2 à 3 % dans le neuf). Les banques examinent aussi votre reste à vivre et votre épargne.</div></div>
      </div>`;
    }
    case 'savings': {
      const years = num(v.years);
      if (years <= 0) return hintBox();
      const rows = savingsProjection({ initial: money(v.initial), monthly: money(v.monthly), rate: num(v.rate), years, inflation: num(v.inflation) });
      const last = rows[rows.length - 1];
      return html`<div class="kpis">
          ${kpi('Capital final', formatMoney(last.balance, { decimals: false }))}
          ${kpi('Total versé', formatMoney(last.contributed, { decimals: false }))}
          ${kpi('Intérêts gagnés', formatMoney(last.interest, { decimals: false }))}
          ${kpi("En pouvoir d'achat d'aujourd'hui", formatMoney(last.real, { decimals: false }))}
        </div>
        <div class="row-between" style="margin:18px 0 8px"><h3>Croissance du capital</h3>${legend([
          { label: 'Capital', color: '--series-1', line: true },
          { label: 'Versements cumulés', color: '--series-2', line: true },
        ])}</div>
        ${chartSlot({
          type: 'line',
          height: 240,
          label: 'Croissance du capital',
          zeroBased: true,
          labels: rows.map((r) => `${formatNumber(r.year, 1)} an${r.year > 1 ? 's' : ''}`),
          tipLabels: rows.map((r) => `Après ${formatNumber(r.year, 1)} an${r.year > 1 ? 's' : ''}`),
          series: [
            { label: 'Capital', color: '--series-1', values: rows.map((r) => r.balance) },
            { label: 'Versements cumulés', color: '--series-2', values: rows.map((r) => r.contributed) },
          ],
        })}`;
    }
    case 'goal': {
      const target = money(v.target);
      const months = Math.round(num(v.months));
      if (!target || months <= 0) return hintBox();
      const current = money(v.current);
      const monthly = requiredMonthlySaving({ target, current, rate: num(v.rate), months });
      const contributed = current + monthly * months;
      return html`<div class="stack-v">
        <div><span class="hero-label">À épargner chaque mois</span><div class="result-big money">${formatMoney(monthly)}</div></div>
        <div class="kpis">
          ${kpi('Total de vos versements', formatMoney(contributed))}
          ${kpi('Intérêts estimés', formatMoney(Math.max(0, target - contributed)))}
          ${kpi('Part de vos revenus', ctx.avgIncome ? formatPercent(monthly / ctx.avgIncome, 1) : '—', html`<span class="kpi-delta">sur la base de vos revenus moyens</span>`)}
        </div>
        ${current >= target ? html`<div class="callout callout-good">${icon('check')}<div>Objectif déjà atteint avec votre épargne actuelle.</div></div>` : ''}
      </div>`;
    }
    case 'rule': {
      const income = money(v.income);
      if (!income) return hintBox();
      const actual = ctx.split;
      const rows = [
        ['Besoins', 0.5, actual.needs, 'Logement, courses, transport, factures, assurances, santé'],
        ['Envies', 0.3, actual.wants, 'Restaurants, loisirs, shopping, voyages, abonnements'],
        ['Épargne', 0.2, actual.savings, 'Épargne de précaution, placements, remboursements anticipés'],
      ];
      return html`${stackedBar([
          { label: 'Besoins', value: Math.round(income * 0.5), color: '--series-1', target: 0.5 },
          { label: 'Envies', value: Math.round(income * 0.3), color: '--series-2', target: 0.3 },
          { label: 'Épargne', value: Math.round(income * 0.2), color: '--series-3', target: 0.2 },
        ])}
        <h3 style="margin:20px 0 8px">Comparaison avec vos 3 derniers mois</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Poste</th><th class="num">Recommandé</th><th class="num">Réel (moy.)</th><th class="num">Écart</th></tr></thead>
          <tbody>${rows.map(([label, share, real, hint]) => {
            const recommended = Math.round(income * share);
            const diff = Math.round(real) - recommended;
            const good = label === 'Épargne' ? diff >= 0 : diff <= 0;
            return html`<tr><td class="wrap"><strong>${label}</strong> <span class="muted">${formatPercent(share)}</span><br><span class="muted small">${hint}</span></td>
              <td class="num money">${formatMoney(recommended)}</td>
              <td class="num money">${actual.income ? formatMoney(Math.round(real)) : '—'}</td>
              <td class="num">${actual.income ? html`<span class="${good ? 'delta-good' : 'delta-bad'}">${formatMoney(diff, { sign: 'always' })}</span>` : '—'}</td></tr>`;
          })}</tbody>
        </table></div>
        <p class="muted small" style="margin-top:10px">Le classement « besoins / envies / épargne » de chaque catégorie se modifie dans « Catégories ».</p>`;
    }
    case 'emergency': {
      const expense = money(v.expense);
      const months = num(v.months) || 6;
      if (!expense) return hintBox();
      const target = expense * months;
      const current = money(v.current);
      const coverage = current / expense;
      const missing = Math.max(0, target - current);
      const done = current >= target;
      return html`<div class="stack-v">
        <div><span class="hero-label">Épargne de précaution conseillée</span><div class="result-big money">${formatMoney(target, { decimals: false })}</div></div>
        ${meter(target ? current / target : 0, done ? 'done' : 'ok', 'Couverture')}
        <div class="kpis">
          ${kpi('Couverture actuelle', `${formatNumber(coverage, 1)} mois`)}
          ${kpi('Reste à constituer', formatMoney(missing))}
          ${kpi('En 12 mois, il faut', `${formatMoney(Math.ceil(missing / 12))} / mois`)}
        </div>
        <div class="callout ${done ? 'callout-good' : ''}">${icon(done ? 'check' : 'info')}<div>${done ? 'Votre épargne de précaution est constituée. Le surplus peut être placé sur des supports plus rémunérateurs.' : 'Placez cette réserve sur un support disponible à tout moment et sans risque (livret réglementé, par exemple).'}</div></div>
      </div>`;
    }
    default:
      return '';
  }
}

function hintBox() {
  return html`<div class="callout">${icon('info')}<div>Renseignez les champs pour lancer le calcul.</div></div>`;
}

export default {
  id: 'simulateurs',
  title: 'Simulateurs',
  icon: 'calculator',

  render({ state }) {
    const ctx = context(state);
    const v = { ...defaults(ui.tool, ctx), ...(ui.values[ui.tool] || {}) };
    return html`
      <div class="tabs" role="tablist" aria-label="Simulateurs">
        ${Object.entries(TOOLS).map(([id, t]) => html`<button type="button" role="tab" aria-selected="${ui.tool === id ? 'true' : 'false'}" data-tool="${id}">${t.label}</button>`)}
      </div>
      <div class="grid grid-tool">
        <section class="card">
          <div class="card-header"><h2>${TOOLS[ui.tool].label}</h2><button type="button" class="link-btn" data-reset-tool>Réinitialiser</button></div>
          <form class="form" id="tool-form" novalidate>${forms(ui.tool, v, ctx)}</form>
        </section>
        <section class="card" id="tool-results" aria-live="polite">${results(ui.tool, v, ctx)}</section>
      </div>`;
  },

  mount(root, { rerender }) {
    root.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.tool = b.dataset.tool;
        rerender();
      }),
    );
    root.querySelector('[data-reset-tool]')?.addEventListener('click', () => {
      delete ui.values[ui.tool];
      rerender();
    });
    const form = root.querySelector('#tool-form');
    const out = root.querySelector('#tool-results');
    const update = () => {
      ui.values[ui.tool] = formValues(form);
      const ctx = context(store.state);
      out.innerHTML = String(results(ui.tool, { ...defaults(ui.tool, ctx), ...ui.values[ui.tool] }, ctx));
      mountCharts(out);
      form.querySelector('[data-manual]')?.toggleAttribute('hidden', ui.values[ui.tool].debt !== 'manual');
    };
    form?.addEventListener('input', update);
    form?.addEventListener('change', update);
    root.querySelectorAll('[data-preset-rate]').forEach((b) =>
      b.addEventListener('click', () => {
        form.elements.rate.value = b.dataset.presetRate;
        update();
      }),
    );
  },
};
