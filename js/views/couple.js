// Couple : répartition des dépenses communes, équilibre, remboursements, budget commun à venir.
import { chartSlot, hbars, legend, stackedBar } from '../charts.js';
import { kpi, monthNav } from '../components.js';
import { amountField } from '../forms.js';
import { babyPlan, balanceStatement, coupleLedger, sharedForecast, splitRatio } from '../family.js';
import { addSettlement, deleteSettlement, store, updateHousehold } from '../store.js';
import { fieldError, formValues, icon, openModal, toast } from '../ui.js';
import { capitalize, formatDate, formatMoney, formatPercent, html, isValidISODate, monthEnd, monthLabel, monthStart, parseAmount, raw, todayISO } from '../utils.js';

const SPLITS = {
  income: { label: 'Au prorata des revenus', hint: 'Chacun participe selon ce qu’il gagne. Recommandé quand les revenus sont différents.' },
  equal: { label: '50 / 50', hint: 'Chacun paie la moitié des dépenses communes.' },
  custom: { label: 'Pourcentage choisi', hint: 'Vous fixez vous-mêmes la part de chacun.' },
};

function settingsForm(h) {
  return html`<form class="form" id="couple-form" novalidate>
    <div class="form-row">
      <label class="field"><span>Prénom 1</span><input class="input" name="name1" id="c-name1" maxlength="30" value="${h.partners[0].name}"></label>
      <label class="field"><span>Prénom 2</span><input class="input" name="name2" id="c-name2" maxlength="30" value="${h.partners[1].name}"></label>
    </div>
    <div class="form-row">
      ${amountField({ name: 'income1', label: 'Revenus nets mensuels (1)', value: h.partners[0].income || null, required: false })}
      ${amountField({ name: 'income2', label: 'Revenus nets mensuels (2)', value: h.partners[1].income || null, required: false })}
    </div>
    <fieldset class="field fieldset">
      <legend class="label">Répartition des dépenses communes</legend>
      ${Object.entries(SPLITS).map(
        ([key, s]) => html`<label class="check"><input type="radio" name="split" value="${key}" ${h.split === key ? raw('checked') : ''}><span><strong>${s.label}</strong> <span class="muted">· ${s.hint}</span></span></label>`,
      )}
    </fieldset>
    <label class="field" data-custom ${h.split === 'custom' ? '' : raw('hidden')}><span>Part du prénom 1</span>
      <div class="input-with-suffix"><input class="input" name="customShare" id="c-share" type="number" min="0" max="100" step="5" value="${h.customShare}"><span class="suffix">%</span></div>
    </label>
    <p class="muted small">En France, 36 % des personnes en couple partagent à 50/50 et 24 % au prorata des revenus. Avec des revenus différents, le 50/50 empêche souvent celui qui gagne le moins d’épargner.</p>
  </form>`;
}

function bindSettings(el, onSave) {
  const form = el.querySelector('form');
  form.querySelectorAll('input[name=split]').forEach((r) =>
    r.addEventListener('change', () => {
      el.querySelector('[data-custom]').hidden = formValues(form).split !== 'custom';
    }),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(form);
    const i1 = v.income1.trim() ? parseAmount(v.income1) : 0;
    const i2 = v.income2.trim() ? parseAmount(v.income2) : 0;
    if (i1 == null || i1 < 0) return fieldError(form, 'income1', 'Montant invalide.');
    if (i2 == null || i2 < 0) return fieldError(form, 'income2', 'Montant invalide.');
    onSave({
      partners: [
        { id: 'p1', name: v.name1.trim() || 'Partenaire 1', income: i1 },
        { id: 'p2', name: v.name2.trim() || 'Partenaire 2', income: i2 },
      ],
      split: v.split,
      customShare: Number(v.customShare) || 50,
    });
  });
}

function openCoupleSettings() {
  const h = store.state.household;
  openModal({
    title: 'Réglages du couple',
    body: settingsForm(h),
    footer: html`<button type="button" class="btn btn-ghost spacer" data-disable>Désactiver le mode couple</button>
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="couple-form" class="btn btn-primary">Enregistrer</button>`,
    onMount(el, close) {
      bindSettings(el, (patch) => {
        updateHousehold(patch);
        toast('Réglages du couple enregistrés');
        close();
      });
      el.querySelector('[data-disable]').addEventListener('click', () => {
        updateHousehold({ enabled: false });
        toast('Mode couple désactivé (les données sont conservées)');
        close();
      });
    },
  });
}

function openSettlement(debtor, amount) {
  const h = store.state.household;
  const name = (p) => h.partners[p === 'p1' ? 0 : 1].name;
  openModal({
    title: 'Enregistrer un remboursement',
    size: 'sm',
    body: html`<form class="form" id="settle-form" novalidate>
      <label class="field"><span>Qui rembourse ?</span><select class="select" name="from" id="s-from">
        <option value="p1" ${debtor === 'p1' ? raw('selected') : ''}>${name('p1')} rembourse ${name('p2')}</option>
        <option value="p2" ${debtor === 'p2' ? raw('selected') : ''}>${name('p2')} rembourse ${name('p1')}</option>
      </select></label>
      ${amountField({ label: 'Montant', value: amount || null, big: true })}
      <label class="field"><span>Date</span><input class="input" type="date" name="date" id="s-date" value="${todayISO()}"></label>
      <label class="field"><span>Note <span class="muted">(facultatif)</span></span><input class="input" name="note" id="s-note" maxlength="80" placeholder="Virement, espèces…"></label>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="settle-form" class="btn btn-primary">Enregistrer</button>`,
    onMount(el, close) {
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = formValues(e.target);
        const value = parseAmount(v.amount);
        if (!value || value <= 0) return fieldError(e.target, 'amount', 'Indiquez un montant supérieur à zéro.');
        if (!isValidISODate(v.date)) return fieldError(e.target, 'date', 'Date invalide.');
        addSettlement({ from: v.from, amount: value, date: v.date, note: v.note.trim() });
        toast('Remboursement enregistré');
        close();
      });
    },
  });
}

export default {
  id: 'couple',
  title: 'Couple',
  icon: 'users',

  actions({ state }) {
    if (!state.household?.enabled) return '';
    return html`<button type="button" class="btn btn-ghost" data-couple-settings>${icon('settings', { size: 16 })} <span class="desktop-only">Réglages</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-couple-settings]')?.addEventListener('click', openCoupleSettings);
  },

  render({ state, session }) {
    const h = state.household;
    if (!h?.enabled) {
      return html`<section class="card stack-v">
        <div><h2>Gérer le budget à deux</h2>
        <p class="muted" style="margin-top:6px">Indiquez vos prénoms, vos revenus et votre règle de partage. Pécule calcule ensuite qui doit combien à qui, la contribution de chacun au budget commun et son évolution avec l’arrivée de bébé.</p></div>
        <ol class="steps">
          <li><strong>Comptes</strong> : précisez pour chaque compte s’il est commun ou personnel.</li>
          <li><strong>Opérations</strong> : à chaque dépense, choisissez « Commun » ou le prénom de la personne concernée.</li>
          <li><strong>Équilibre</strong> : Pécule indique qui doit rembourser l’autre, et combien.</li>
        </ol>
        ${settingsForm(h)}
        <div class="row"><button type="submit" form="couple-form" class="btn btn-primary">${icon('users', { size: 16 })} Activer le mode couple</button></div>
      </section>`;
    }
    const month = session.month;
    const today = todayISO();
    const name = (p) => h.partners[p === 'p1' ? 0 : 1].name;
    const ratio = splitRatio(h);
    const total = coupleLedger(state);
    const monthLedger = coupleLedger(state, { from: monthStart(month), to: monthEnd(month) });
    const balance = balanceStatement(h, total.net);
    const plan = state.baby?.dueDate ? babyPlan(state.baby, h, { count: state.baby.count, today }) : null;
    const forecast = sharedForecast(state, { months: 12, today, plan });
    const owners = new Set(state.accounts.map((a) => a.owner || 'joint'));
    // Prénoms des parents en congé de naissance pendant le mois.
    const onLeave = (m) => [...new Set((plan?.leave.leaves || []).filter((l) => l.start <= monthEnd(m) && l.end >= monthStart(m)).map((l) => name(l.parent)))];
    const cats = [...monthLedger.byCategory.values()].sort((a, b) => b.total - a.total);
    const settlements = [...h.settlements].sort((a, b) => (a.date < b.date ? 1 : -1));

    return html`
      ${!owners.has('p1') && !owners.has('p2')
        ? html`<div class="callout">${icon('info')}<div>Tous vos comptes sont considérés comme communs. Si l’un de vous paie des dépenses communes depuis un compte personnel, ajoutez ce compte dans « Comptes » avec son titulaire : l’équilibre sera calculé automatiquement.</div></div>`
        : ''}

      <section class="card hero" aria-label="Équilibre du couple">
        <div class="hero-balance">
          <span class="hero-label">Équilibre depuis le début</span>
          ${balance.amount
            ? html`<span class="hero-value money">${formatMoney(balance.amount)}</span>
                <p class="balance-line"><strong>${name(balance.debtor)}</strong> doit cette somme à <strong>${name(balance.creditor)}</strong></p>
                <div class="row"><button type="button" class="btn btn-primary" data-settle="${balance.debtor}" data-amount="${balance.amount}">${icon('check', { size: 16 })} Enregistrer le remboursement</button></div>`
            : html`<span class="hero-value">À l’équilibre</span><p class="muted">Personne ne doit rien à l’autre.</p>
                <div class="row"><button type="button" class="btn" data-settle="p1" data-amount="0">Enregistrer un remboursement</button></div>`}
          <p class="muted small">Chaque dépense commune est partagée selon votre règle ; le compte joint est supposé alimenté dans les mêmes proportions. Une dépense personnelle payée par le compte joint, ou une dépense commune payée par l’un de vous, crée l’écart.</p>
        </div>
        <div class="hero-kpis"><div class="kpis">
          ${kpi('Règle de partage', h.split === 'equal' ? '50 / 50' : `${Math.round(ratio.p1 * 100)} / ${Math.round(ratio.p2 * 100)}`, html`<span class="kpi-delta">${SPLITS[h.split].label}</span>`)}
          ${kpi(`Part de ${name('p1')}`, formatMoney(total.fair.p1, { decimals: false }), html`<span class="kpi-delta">des dépenses communes enregistrées</span>`)}
          ${kpi(`Part de ${name('p2')}`, formatMoney(total.fair.p2, { decimals: false }), html`<span class="kpi-delta">des dépenses communes enregistrées</span>`)}
          ${kpi('Remboursements', formatMoney(total.settled, { decimals: false }), html`<span class="kpi-delta">${h.settlements.length} enregistré(s)</span>`)}
        </div></div>
      </section>

      <div class="row-between">${monthNav(month)}</div>

      <section class="kpis kpis-cards">
        ${kpi('Dépenses communes', formatMoney(monthLedger.shared), html`<span class="kpi-delta">${capitalize(monthLabel(month))}</span>`)}
        ${kpi(`Part de ${name('p1')}`, formatMoney(monthLedger.fair.p1), html`<span class="kpi-delta">${formatPercent(ratio.p1)} des dépenses communes</span>`)}
        ${kpi(`Part de ${name('p2')}`, formatMoney(monthLedger.fair.p2), html`<span class="kpi-delta">${formatPercent(ratio.p2)} des dépenses communes</span>`)}
        ${kpi('Dépenses personnelles', html`${formatMoney(monthLedger.personal.p1, { decimals: false })} · ${formatMoney(monthLedger.personal.p2, { decimals: false })}`, html`<span class="kpi-delta"><a href="#transactions?share=p1&month=${month}">${name('p1')}</a> · <a href="#transactions?share=p2&month=${month}">${name('p2')}</a></span>`)}
      </section>

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><div><h2>Qui a payé les dépenses communes</h2><p class="sub">${capitalize(monthLabel(month))}</p></div></div>
          ${monthLedger.shared
            ? stackedBar([
                { label: 'Compte commun', value: Math.round(monthLedger.paidShared.joint), color: '--series-1' },
                { label: name('p1'), value: Math.round(monthLedger.paidShared.p1), color: '--series-2' },
                { label: name('p2'), value: Math.round(monthLedger.paidShared.p2), color: '--series-3' },
              ])
            : html`<p class="muted">Aucune dépense commune ce mois-ci.</p>`}
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Dépenses communes par catégorie</h2><p class="sub">${capitalize(monthLabel(month))}</p></div><a class="link-btn" href="#transactions?share=shared&month=${month}">Voir les opérations</a></div>
          ${cats.length ? hbars(cats.slice(0, 8).map((c) => ({ label: c.category?.name || 'Non catégorisé', icon: c.category?.icon || '❔', value: c.total, share: c.total / monthLedger.shared }))) : html`<p class="muted">Aucune dépense commune ce mois-ci.</p>`}
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <div><h2>Anticiper : budget commun des 12 prochains mois</h2><p class="sub">Dépenses communes habituelles (moyenne des 3 derniers mois)${plan ? ' et arrivée de bébé, aides déduites' : ''}</p></div>
          ${plan ? legend([
            { label: 'Dépenses habituelles', color: '--series-1' },
            { label: 'Bébé (net des aides)', color: '--series-2' },
          ]) : ''}
        </div>
        ${chartSlot({
          type: 'columns',
          height: 230,
          label: 'Budget commun prévu sur 12 mois',
          labels: forecast.map((r) => capitalize(monthLabel(r.month, { short: true, year: false }))),
          tipLabels: forecast.map((r) => capitalize(monthLabel(r.month))),
          series: plan
            ? [
                { label: 'Dépenses habituelles', color: '--series-1', values: forecast.map((r) => r.base) },
                { label: 'Bébé (net des aides)', color: '--series-2', values: forecast.map((r) => Math.max(0, r.baby)) },
              ]
            : [{ label: 'Budget commun', color: '--series-1', values: forecast.map((r) => r.total) }],
        })}
        <div class="table-wrap" style="margin-top:14px"><table class="table table-stack table-stack-lead">
          <thead><tr><th>Mois</th><th class="num">Budget commun</th><th class="num">Versement ${name('p1')}</th><th class="num">Versement ${name('p2')}</th><th class="num">Reste pour ${name('p1')}</th><th class="num">Reste pour ${name('p2')}</th></tr></thead>
          <tbody>${forecast.map((r) => {
            const away = onLeave(r.month);
            return html`<tr${away.length ? raw(' class="row-leave"') : ''}>
              <td>${capitalize(monthLabel(r.month))}${away.length ? html` <span class="pill pill-accent">congé ${away.join(', ')}</span>` : ''}</td>
              <td data-label="Budget commun" class="num money">${formatMoney(r.total, { decimals: false })}</td>
              <td data-label="Versement ${name('p1')}" class="num money">${formatMoney(r.contribution.p1, { decimals: false })}</td>
              <td data-label="Versement ${name('p2')}" class="num money">${formatMoney(r.contribution.p2, { decimals: false })}</td>
              <td data-label="Reste pour ${name('p1')}" class="num money ${r.left.p1 < 0 ? 'neg' : ''}">${formatMoney(r.left.p1, { decimals: false })}</td>
              <td data-label="Reste pour ${name('p2')}" class="num money ${r.left.p2 < 0 ? 'neg' : ''}">${formatMoney(r.left.p2, { decimals: false })}</td>
            </tr>`;
          })}</tbody>
        </table></div>
        <p class="muted small" style="margin-top:10px">${
          h.split === 'income'
            ? 'Au prorata, la part de chacun est recalculée les mois où un congé lié à la naissance réduit les revenus.'
            : 'La part de chacun reste fixe, même pendant les congés liés à la naissance : vérifiez que le « reste pour soi » reste suffisant.'
        }${plan ? '' : html` <a href="#bebe">Préparer l’arrivée de bébé</a> pour l’intégrer à cette prévision.`}</p>
      </section>

      <section class="card card-flush">
        <div class="card-header"><div><h2>Remboursements</h2><p class="sub">Ils remettent l’équilibre à zéro</p></div></div>
        ${settlements.length
          ? html`<ul class="item-list">${settlements.map(
              (s) => html`<li class="item">
                <span class="cat-badge cat-badge-sm" style="--c:#1baf7a">${icon('swap', { size: 15 })}</span>
                <div class="item-body"><div class="item-title">${name(s.from)} → ${name(s.to)}</div><div class="item-sub"><span>${formatDate(s.date)}</span>${s.note ? html`<span>${s.note}</span>` : ''}</div></div>
                <div class="item-side"><strong class="money">${formatMoney(s.amount)}</strong><button type="button" class="icon-btn icon-btn-sm" data-del-settle="${s.id}" aria-label="Supprimer ce remboursement">${icon('trash', { size: 14 })}</button></div>
              </li>`,
            )}</ul>`
          : html`<div class="card-pad"><p class="muted">Aucun remboursement enregistré.</p></div>`}
      </section>
    `;
  },

  mount(root) {
    const setup = root.querySelector('#couple-form');
    if (setup && !store.state.household?.enabled) {
      bindSettings(root, (patch) => {
        updateHousehold({ ...patch, enabled: true });
        toast('Mode couple activé');
      });
    }
    root.querySelectorAll('[data-settle]').forEach((b) => b.addEventListener('click', () => openSettlement(b.dataset.settle, Number(b.dataset.amount) || 0)));
    root.querySelectorAll('[data-del-settle]').forEach((b) =>
      b.addEventListener('click', () => {
        deleteSettlement(b.dataset.delSettle);
        toast('Remboursement supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
      }),
    );
  },
};
