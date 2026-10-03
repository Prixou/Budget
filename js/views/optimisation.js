// Optimisation : score de santé financière, conseils chiffrés, prévision de trésorerie,
// paiements récurrents détectés.
import { chartSlot, meter } from '../charts.js';
import { catBadge, kpi, lookups } from '../components.js';
import { REFERENCE } from '../defaults.js';
import { openTransactionForm } from '../forms.js';
import { HEALTH_LEVELS, baseline, cashForecast, detectRecurring, healthScore, potentialGain, recommendations, ruleFromDetection, unusualExpenses } from '../insights.js';
import { processRecurring, saveGoal, saveRecurring, store, updateSettings } from '../store.js';
import { emptyState, icon, toast } from '../ui.js';
import { capitalize, formatDate, formatMoney, formatNumber, html, monthLabel, todayISO, uid } from '../utils.js';
import { openTool } from './tools.js';

const ui = { showDismissed: false, variableIncome: false };

const SEVERITY = {
  high: { label: 'Prioritaire', cls: 'pill-over', iconName: 'alert' },
  medium: { label: 'Important', cls: 'pill-warning', iconName: 'info' },
  low: { label: 'Conseil', cls: 'pill-accent', iconName: 'sparkle' },
};

const PILLAR_LABELS = { spend: 'Dépenser', save: 'Épargner', borrow: 'Emprunter', plan: 'Planifier' };

function scoreStatus(score) {
  if (score == null) return 'ok';
  return score >= 80 ? 'done' : score >= 40 ? 'warning' : 'over';
}

let cached = { key: null, value: null };

/** Calcul unique partagé par le rendu, les actions et le tableau de bord (mis en cache par version). */
function analyse(state) {
  const key = `${store.revision}|${state === store.state}|${ui.variableIncome}|${todayISO()}`;
  if (cached.key === key) return cached.value;
  cached = { key, value: computeAnalysis(state) };
  return cached.value;
}

function computeAnalysis(state) {
  const today = todayISO();
  const base = baseline(state, today);
  const unusual = unusualExpenses(state, today);
  const exclude = new Set(unusual.map((u) => u.tx.id));
  const forecast = cashForecast(state, today, 90, { exclude, variableIncome: ui.variableIncome });
  const detected = detectRecurring(state, today);
  const tips = recommendations(state, today, base, { unusual, forecast, detected });
  return { today, base, forecast, detected, tips, health: healthScore(state, today, base) };
}

/** Bloc compact pour le tableau de bord. */
export function healthCard(state) {
  const { health, tips } = analyse(state);
  if (health.score == null) return '';
  const level = HEALTH_LEVELS[health.level];
  const visible = tips.filter((t) => !t.dismissed);
  const gain = potentialGain(tips);
  return html`<section class="card">
    <div class="card-header">
      <div><h2>Santé financière</h2><p class="sub">${visible.length} conseil(s) personnalisé(s)${gain ? html` · potentiel <strong class="money">${formatMoney(gain, { decimals: false })}</strong> par an` : ''}</p></div>
      <a class="link-btn" href="#optimisation">Optimiser</a>
    </div>
    <div class="health-mini">
      <div class="health-score-mini"><span class="score-value">${health.score}</span><span class="muted">/ 100</span></div>
      <div class="stack-v" style="flex:1;min-width:0">
        <span class="pill ${level.status === 'ok' ? 'pill-ok' : level.status === 'warning' ? 'pill-warning' : 'pill-over'}">${icon(level.status === 'ok' ? 'check' : 'alert', { size: 13 })} ${level.label}</span>
        ${meter(health.score / 100, scoreStatus(health.score), 'Score de santé financière')}
      </div>
    </div>
    <ul class="tip-mini">${visible.slice(0, 3).map((t) => html`<li><span class="pill ${SEVERITY[t.severity].cls}">${SEVERITY[t.severity].label}</span> ${t.title}</li>`)}</ul>
  </section>`;
}

function tipAction(t) {
  const a = t.action;
  if (!a) return '';
  if (a.type === 'link') return html`<a class="btn btn-sm" href="${a.href}">${a.label}</a>`;
  return html`<button type="button" class="btn btn-sm" data-tip-action="${t.id}">${a.label}</button>`;
}

export default {
  id: 'optimisation',
  title: 'Optimisation',
  tabLabel: 'Conseils',
  icon: 'sparkle',

  render({ state }) {
    if (!state.accounts.length || !state.transactions.length) {
      return html`<section class="card">${emptyState({
        iconName: 'sparkle',
        title: 'Pas encore assez de données',
        text: "Les conseils s'appuient sur vos opérations. Ajoutez vos revenus et dépenses (ou importez un relevé) : dès le premier mois complet, Pécule calcule votre score et vos pistes d'économies.",
        action: html`<button type="button" class="btn btn-primary" data-action="add-tx">Ajouter une opération</button>`,
      })}</section>`;
    }
    const { base, forecast, detected, tips, health } = analyse(state);
    const maps = lookups(state);
    const visible = tips.filter((t) => ui.showDismissed || !t.dismissed);
    const dismissedCount = tips.filter((t) => t.dismissed).length;
    const gain = potentialGain(tips);
    const level = health.level ? HEALTH_LEVELS[health.level] : null;
    const activeDetected = detected.filter((d) => d.active);

    return html`
      <section class="card hero hero-health" aria-label="Score de santé financière">
        <div class="hero-balance">
          <span class="hero-label">Score de santé financière</span>
          ${health.score == null
            ? html`<p class="muted">${health.reason}</p>`
            : html`<div class="score-line"><span class="hero-value">${health.score}</span><span class="score-max">/ 100</span>
                <span class="pill ${level.status === 'ok' ? 'pill-ok' : level.status === 'warning' ? 'pill-warning' : 'pill-over'}">${icon(level.status === 'ok' ? 'check' : 'alert', { size: 13 })} ${level.label}</span></div>
              ${meter(health.score / 100, scoreStatus(health.score), 'Score de santé financière')}
              <p class="muted small">Calculé sur vos 3 derniers mois, selon les 4 piliers du FinHealth Score : dépenser, épargner, emprunter, planifier. 80 et plus : en bonne santé ; moins de 40 : vulnérable.</p>`}
        </div>
        <div class="hero-kpis"><div class="kpis">
          ${kpi('Potentiel identifié', html`${formatMoney(gain, { decimals: false })} <span class="kpi-unit">/ an</span>`, html`<span class="kpi-delta">Somme des gains chiffrés ci-dessous</span>`)}
          ${kpi("Taux d'épargne", base.savingsRate == null ? '—' : `${Math.round(base.savingsRate * 100)} %`, html`<span class="kpi-delta">Repère : 20 % (règle 50/30/20)</span>`)}
          ${kpi('Épargne de précaution', base.coverage == null ? '—' : `${formatNumber(base.coverage, 1)} mois`, html`<span class="kpi-delta">Cible : ${base.emergencyMonths} mois de dépenses</span>`)}
          ${kpi('Disponible à dépenser', formatMoney(forecast.available, { decimals: false }), html`<span class="kpi-delta">d'ici la fin du mois, soit ${formatMoney(forecast.perDay, { decimals: false })} par jour</span>`)}
        </div></div>
      </section>

      ${health.pillars.length
        ? html`<div class="pillars">${health.pillars.map(
            (p) => html`<section class="card pillar">
              <div class="row-between"><h3>${p.label}</h3><strong class="pillar-score">${p.score ?? '—'}<span class="muted small"> / 100</span></strong></div>
              ${p.indicators.map(
                (i) => html`<div class="indicator">
                  <div class="row-between small"><span>${i.label}</span><span class="muted">${i.score ?? '—'}</span></div>
                  ${meter((i.score ?? 0) / 100, scoreStatus(i.score), i.label)}
                  <span class="muted small">${i.value}</span>
                </div>`,
              )}
            </section>`,
          )}</div>`
        : ''}

      <section class="card card-flush">
        <div class="card-header">
          <div><h2>Conseils personnalisés</h2><p class="sub">Classés par importance · repères à jour au ${formatDate(REFERENCE.ratesDate)}</p></div>
          ${dismissedCount ? html`<button type="button" class="link-btn" id="toggle-dismissed">${ui.showDismissed ? 'Masquer les conseils écartés' : `Afficher les conseils écartés (${dismissedCount})`}</button>` : ''}
        </div>
        ${visible.length
          ? html`<ul class="item-list tips">${visible.map(
              (t) => html`<li class="tip${t.dismissed ? ' tip-dismissed' : ''}" id="tip-${t.id}">
                <div class="tip-head">
                  <span class="pill ${SEVERITY[t.severity].cls}">${icon(SEVERITY[t.severity].iconName, { size: 13 })} ${SEVERITY[t.severity].label}</span>
                  <span class="pill">${PILLAR_LABELS[t.pillar]}</span>
                  ${t.gain ? html`<span class="pill pill-ok money">+${formatMoney(t.gain, { decimals: false })} / an</span>` : ''}
                </div>
                <h3>${t.title}</h3>
                <p class="tip-text">${t.text}</p>
                <div class="row">
                  ${tipAction(t)}
                  <button type="button" class="btn btn-sm btn-ghost" data-dismiss="${t.id}">${t.dismissed ? 'Rétablir' : 'Écarter'}</button>
                </div>
              </li>`,
            )}</ul>`
          : html`<div class="card-pad">${emptyState({ iconName: 'check', title: 'Rien à signaler', text: 'Aucune piste prioritaire pour le moment. Revenez après avoir saisi de nouvelles opérations.' })}</div>`}
      </section>

      <section class="card">
        <div class="card-header">
          <div><h2>Prévision de trésorerie</h2><p class="sub">Comptes courants, 90 prochains jours : prélèvements prévus et dépenses variables moyennes (${formatMoney(forecast.dailyVariable)} par jour)</p></div>
          <label class="check small"><input type="checkbox" id="fc-income" ${ui.variableIncome ? 'checked' : ''}><span>Inclure les revenus variables</span></label>
        </div>
        ${forecast.accounts.length
          ? html`<div class="kpis" style="margin-bottom:14px">
                ${kpi("Aujourd'hui", formatMoney(forecast.start, { decimals: false }))}
                ${kpi('Point bas', html`<span class="${forecast.min.balance < 0 ? 'neg' : ''}">${formatMoney(forecast.min.balance, { decimals: false })}</span>`, html`<span class="kpi-delta">${formatDate(forecast.min.date)}</span>`)}
                ${kpi('Dans 90 jours', html`<span class="${forecast.end < 0 ? 'neg' : ''}">${formatMoney(forecast.end, { decimals: false })}</span>`)}
              </div>
              ${chartSlot({
                type: 'line',
                height: 240,
                zeroBased: forecast.min.balance < forecast.start * 0.3,
                label: 'Prévision du solde des comptes courants sur 90 jours',
                labels: forecast.points.map((p) => formatDate(p.date, 'day')),
                tipLabels: forecast.points.map((p) => formatDate(p.date, 'long')),
                values: forecast.points.map((p) => p.balance),
                seriesLabel: 'Solde prévu',
              })}
              ${forecast.min.balance < 0
                ? html`<div class="callout callout-danger" style="margin-top:12px">${icon('alert')}<div>Le solde passerait sous zéro le ${formatDate(forecast.min.date, 'long').toLowerCase()}. Anticipez : décalez une dépense, réduisez les dépenses variables ou prévoyez un virement depuis l'épargne.</div></div>`
                : ''}`
          : html`<p class="muted">Ajoutez un compte courant pour obtenir une prévision.</p>`}
      </section>

      <section class="card card-flush" id="detected">
        <div class="card-header"><div><h2>Paiements récurrents détectés</h2><p class="sub">Même marchand, montant stable (±10 %), au moins 3 fois à intervalle régulier, sans récurrence enregistrée</p></div></div>
        ${activeDetected.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th>Libellé</th><th>Fréquence</th><th class="num">Montant</th><th class="num">Par an</th><th>Prochain passage</th><th></th></tr></thead>
              <tbody>${activeDetected.map(
                (d) => html`<tr>
                  <td class="wrap"><span class="row" style="flex-wrap:nowrap">${catBadge(maps.cat.get(d.categoryId), { small: true })} ${d.label}</span></td>
                  <td>${d.cadenceLabel} <span class="muted small">(${d.count} fois)</span></td>
                  <td class="num money">${formatMoney(d.amount)}</td>
                  <td class="num money">${formatMoney(d.yearly, { decimals: false })}</td>
                  <td>${formatDate(d.nextDate)}</td>
                  <td class="num"><div class="item-actions" style="justify-content:flex-end">
                    <button type="button" class="btn btn-sm btn-primary" data-track="${d.key}">Suivre</button>
                    <button type="button" class="btn btn-sm btn-ghost" data-ignore="${d.key}">Ignorer</button>
                  </div></td>
                </tr>`,
              )}</tbody></table></div>`
          : html`<div class="card-pad"><p class="muted">Aucun paiement récurrent non suivi. Vos abonnements connus sont dans « Récurrences ».</p></div>`}
      </section>

      <p class="muted small">Repères utilisés : Livret A et LDDS ${formatNumber(REFERENCE.livretARate, 2)} %, LEP ${formatNumber(REFERENCE.lepRate, 2)} % (taux au ${formatDate(REFERENCE.ratesDate)}) ; fonds en euros ${formatNumber(REFERENCE.fondsEurosRate, 2)} % (moyenne 2025, ACPR) ; inflation ${formatNumber(REFERENCE.inflation, 1)} % (prévision 2026 de la Banque de France) ; frais bancaires moyens ${formatMoney(REFERENCE.bankFeesTraditional, { decimals: false })} par an en banque traditionnelle. Ces conseils sont indicatifs et ne remplacent pas un conseiller financier. Analyse de ${capitalize(monthLabel(base.months[0]))} à ${monthLabel(base.months[base.months.length - 1])}.</p>
    `;
  },

  mount(root, { rerender }) {
    const state = store.state;
    const { tips, detected } = analyse(state);
    root.querySelector('#toggle-dismissed')?.addEventListener('click', () => {
      ui.showDismissed = !ui.showDismissed;
      rerender();
    });
    root.querySelector('#fc-income')?.addEventListener('change', (e) => {
      ui.variableIncome = e.target.checked;
      rerender();
    });
    root.querySelectorAll('[data-dismiss]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.dismiss;
        const current = new Set(store.state.settings.dismissedTips || []);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        updateSettings({ dismissedTips: [...current] });
      }),
    );
    root.querySelectorAll('[data-tip-action]').forEach((b) =>
      b.addEventListener('click', () => {
        const tip = tips.find((t) => t.id === b.dataset.tipAction);
        const a = tip?.action;
        if (!a) return;
        if (a.type === 'anchor') document.getElementById(a.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (a.type === 'create-goal') {
          saveGoal({ ...a.goal, contributions: [], archived: false });
          toast('Objectif créé');
          location.hash = '#objectifs';
        } else if (a.type === 'create-rule') {
          saveRecurring(a.rule);
          processRecurring();
          toast('Virement automatique programmé');
        } else if (a.type === 'transfer') {
          openTransactionForm({ defaults: { type: 'transfer', accountId: a.from, toAccountId: a.to, amount: a.amount, description: 'Mise en épargne' } });
        } else if (a.type === 'edit-tx') {
          const tx = store.state.transactions.find((t) => t.id === a.id);
          if (tx) openTransactionForm({ tx });
        } else if (a.type === 'tool') {
          openTool(a.tool, { debtId: a.debtId, amount: a.amount });
        }
      }),
    );
    root.querySelectorAll('[data-track]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = detected.find((x) => x.key === b.dataset.track);
        if (!d) return;
        saveRecurring({ ...ruleFromDetection(d), id: uid('rec-') });
        toast(`« ${d.label} » ajouté aux récurrences`);
      }),
    );
    root.querySelectorAll('[data-ignore]').forEach((b) =>
      b.addEventListener('click', () => {
        const ignored = new Set(store.state.settings.ignoredRecurring || []);
        ignored.add(b.dataset.ignore);
        updateSettings({ ignoredRecurring: [...ignored] });
        toast('Paiement ignoré');
      }),
    );
  },
};
