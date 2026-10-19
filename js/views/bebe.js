// Bébé : préparer l'arrivée d'un enfant ou de jumeaux (achats, congés, aides, garde, budget).
import { chartSlot, legend, meter } from '../charts.js';
import { kpi } from '../components.js';
import { defaultBabyPlan, FAMILY } from '../defaults.js';
import { amountField } from '../forms.js';
import { assmatMonthly, babyPlan, compareScenarios, crecheHourly } from '../family.js';
import { deleteBabyPlan, saveBabyPlan, saveGoal, saveRecurring, setBabyItem, setBudget, store, updateHousehold } from '../store.js';
import { confirmDialog, fieldError, formValues, icon, openModal, toast } from '../ui.js';
import { capitalize, daysBetween, formatDate, formatMoney, html, isValidISODate, monthKey, monthLabel, parseAmount, raw, shiftMonth, sum, todayISO } from '../utils.js';

const CARE = {
  creche: 'Crèche',
  assmat: 'Assistante maternelle',
  famille: 'Parents ou famille',
};
const FEEDING = { breast: 'Allaitement', mixed: 'Allaitement et biberons', formula: 'Lait infantile' };
const DIAPERS = { store: 'Jetables, marque distributeur', brand: 'Jetables, grande marque', washable: 'Lavables' };
const EQUIPMENT = { new: 'Tout acheter neuf', mixed: 'Neuf et occasion', 'second-hand': 'Surtout d’occasion' };
const CAF_SIMULATOR = 'https://www.caf.fr/allocataires/mes-services-en-ligne/faire-une-simulation';

const money = (v) => formatMoney(v, { decimals: false });
const select = (name, map, value) => html`<select class="select" name="${name}" id="b-${name}">${Object.entries(map).map(([k, label]) => html`<option value="${k}" ${String(value) === k ? raw('selected') : ''}>${label}</option>`)}</select>`;

/* ------------------------------------------------------------------ */
/* Formulaires                                                         */
/* ------------------------------------------------------------------ */

function countValue(plan) {
  return plan.compare ? 'compare' : String(plan.count);
}

function essentials(plan, h) {
  const [a, b] = h.partners;
  return html`
    <label class="field"><span>Date prévue de l’accouchement</span><input class="input" type="date" name="dueDate" id="b-due" required value="${plan.dueDate || ''}"></label>
    <div class="field"><span class="label">Combien de bébés ?</span>
      <div class="segmented" role="radiogroup" aria-label="Nombre de bébés">
        ${[['1', 'Un bébé'], ['2', 'Des jumeaux'], ['compare', 'On ne sait pas encore']].map(([v, label]) => html`<label><input type="radio" name="count" value="${v}" ${countValue(plan) === v ? raw('checked') : ''}><span>${label}</span></label>`)}
      </div>
      <span class="hint">« On ne sait pas encore » compare les deux situations. L’échographie du premier trimestre confirme le nombre de bébés.</span>
    </div>
    <div class="form-row">
      <label class="field"><span>Prénom 1</span><input class="input" name="name1" id="b-name1" maxlength="30" value="${a.name}"></label>
      <label class="field"><span>Prénom 2</span><input class="input" name="name2" id="b-name2" maxlength="30" value="${b.name}"></label>
    </div>
    <div class="form-row">
      ${amountField({ name: 'income1', label: 'Revenus nets mensuels (1)', value: a.income || null, required: false })}
      ${amountField({ name: 'income2', label: 'Revenus nets mensuels (2)', value: b.income || null, required: false })}
    </div>
    <div class="form-row">
      <label class="field"><span>Qui accouche ?</span><select class="select" name="birthParent" id="b-birth">
        <option value="p1" ${plan.birthParent === 'p1' ? raw('selected') : ''}>Prénom 1</option>
        <option value="p2" ${plan.birthParent === 'p2' ? raw('selected') : ''}>Prénom 2</option>
      </select></label>
      <label class="field"><span>Enfants déjà à charge</span>${select('existingChildren', { 0: 'Aucun', 1: '1', 2: '2', 3: '3', 4: '4 ou plus' }, plan.existingChildren)}</label>
    </div>`;
}

function details(plan, h) {
  const [a, b] = h.partners;
  const parent = (p, person) => html`<fieldset class="field fieldset">
    <legend class="label">${person.name}</legend>
    ${amountField({ name: `gross_${p}`, label: 'Salaire brut mensuel', value: plan.grossSalaries?.[p] || null, required: false, hint: 'Sert au calcul des indemnités journalières. Vide : estimé à partir du net.' })}
    <label class="check"><input type="checkbox" name="kept_${p}" id="b-kept-${p}" ${plan.salaryMaintained?.[p] ? raw('checked') : ''}><span>Salaire maintenu par l’employeur pendant le congé (selon la convention collective)</span></label>
    <label class="field"><span>Congé supplémentaire de naissance</span>${select(`extra_${p}`, { 0: 'Non', 1: '1 mois', 2: '2 mois' }, plan.extraLeaveMonths?.[p] || 0)}</label>
  </fieldset>`;
  return html`
    <h3 class="form-section">Congés</h3>
    <div class="form-row">${parent('p1', a)}${parent('p2', b)}</div>
    <h3 class="form-section">Garde après les congés</h3>
    <div class="field"><span class="label">Mode de garde</span>
      <div class="segmented" role="radiogroup" aria-label="Mode de garde">
        ${Object.entries(CARE).map(([v, label]) => html`<label><input type="radio" name="childcare" value="${v}" ${plan.childcare === v ? raw('checked') : ''}><span>${label}</span></label>`)}
      </div>
    </div>
    <div class="form-row">
      <label class="field"><span>Heures de garde par semaine</span><input class="input" type="number" name="hoursPerWeek" id="b-hours" min="0" max="60" step="1" value="${plan.hoursPerWeek}"></label>
      ${amountField({ name: 'assmatHourly', label: 'Salaire horaire de l’assistante maternelle', value: plan.assmatHourly, required: false, hint: 'Salaire net convenu, par enfant.' })}
    </div>
    <label class="field"><span>Début de la garde <span class="muted">(facultatif)</span></span><input class="input" type="date" name="childcareStart" id="b-care-start" value="${plan.childcareStart || ''}"><span class="hint">Vide : le lendemain de la fin des congés.</span></label>
    <h3 class="form-section">Dépenses</h3>
    <div class="form-row">
      <label class="field"><span>Alimentation</span>${select('feeding', FEEDING, plan.feeding)}</label>
      <label class="field"><span>Couches</span>${select('diapers', DIAPERS, plan.diapers)}</label>
    </div>
    <label class="field"><span>Équipement</span>${select('equipmentLevel', EQUIPMENT, plan.equipmentLevel)}</label>
    <h3 class="form-section">Aides de la CAF</h3>
    ${amountField({ name: 'taxIncome', label: 'Revenu fiscal de référence 2024 du foyer', value: plan.taxIncome, required: false, hint: 'Sur l’avis d’impôt reçu en 2025. Vide : estimé à 90 % de vos revenus nets sur 12 mois.' })}`;
}

/** Lit le formulaire ; renvoie { household, plan } ou null après avoir signalé l'erreur. */
function readForm(form, full) {
  const v = formValues(form);
  if (!isValidISODate(v.dueDate)) return fieldError(form, 'dueDate', 'Indiquez la date prévue de l’accouchement.'), null;
  const today = todayISO();
  if (daysBetween(today, v.dueDate) > 300 || daysBetween(v.dueDate, today) > 365) {
    return fieldError(form, 'dueDate', 'La date doit se situer dans les 10 prochains mois (ou dans l’année écoulée).'), null;
  }
  const amount = (name) => (v[name]?.trim() ? parseAmount(v[name]) : null);
  for (const name of ['income1', 'income2', ...(full ? ['gross_p1', 'gross_p2', 'assmatHourly', 'taxIncome'] : [])]) {
    const value = amount(name);
    if (v[name]?.trim() && (value == null || value < 0)) return fieldError(form, name, 'Montant invalide.'), null;
  }
  const h = store.state.household;
  const household = {
    partners: [
      { id: 'p1', name: v.name1.trim() || h.partners[0].name, income: amount('income1') || 0 },
      { id: 'p2', name: v.name2.trim() || h.partners[1].name, income: amount('income2') || 0 },
    ],
  };
  const plan = {
    dueDate: v.dueDate,
    count: v.count === '2' ? 2 : 1,
    compare: v.count === 'compare',
    birthParent: v.birthParent,
    existingChildren: Number(v.existingChildren) || 0,
  };
  if (full) {
    if (v.childcareStart && !isValidISODate(v.childcareStart)) return fieldError(form, 'childcareStart', 'Date invalide.'), null;
    Object.assign(plan, {
      grossSalaries: { p1: amount('gross_p1'), p2: amount('gross_p2') },
      salaryMaintained: { p1: !!v.kept_p1, p2: !!v.kept_p2 },
      extraLeaveMonths: { p1: Number(v.extra_p1) || 0, p2: Number(v.extra_p2) || 0 },
      childcare: v.childcare,
      hoursPerWeek: Math.min(60, Math.max(0, Number(v.hoursPerWeek) || 0)),
      assmatHourly: amount('assmatHourly') ?? store.state.baby?.assmatHourly ?? 550,
      childcareStart: v.childcareStart || null,
      feeding: v.feeding,
      diapers: v.diapers,
      equipmentLevel: v.equipmentLevel,
      taxIncome: amount('taxIncome'),
    });
  }
  return { household, plan };
}

/** Les prénoms saisis remplacent « Prénom 1 / 2 » dans la liste « Qui accouche ? ». */
function bindNames(form) {
  const sync = () => {
    form.querySelector('#b-birth option[value=p1]').textContent = form.elements.name1.value.trim() || 'Prénom 1';
    form.querySelector('#b-birth option[value=p2]').textContent = form.elements.name2.value.trim() || 'Prénom 2';
  };
  form.elements.name1.addEventListener('input', sync);
  form.elements.name2.addEventListener('input', sync);
  sync();
}

function openPlanSettings() {
  const plan = store.state.baby;
  const h = store.state.household;
  openModal({
    title: 'Affiner le plan bébé',
    size: 'lg',
    body: html`<form class="form" id="baby-form" novalidate>${essentials(plan, h)}${details(plan, h)}</form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="baby-form" class="btn btn-primary">Enregistrer</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      bindNames(form);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const result = readForm(form, true);
        if (!result) return;
        updateHousehold(result.household);
        saveBabyPlan(result.plan);
        toast('Plan mis à jour');
        close();
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Calculs d'affichage                                                 */
/* ------------------------------------------------------------------ */

/** Chiffres de la première année (de la naissance aux 1 an), achats compris. */
function firstYear(p) {
  const dueMonth = monthKey(p.due);
  const end = shiftMonth(dueMonth, 12);
  const year = p.months.filter((r) => r.month >= dueMonth && r.month < end);
  const rows = {
    equipment: sum(p.months.filter((r) => r.month < end), (r) => r.equipment),
    living: sum(year, (r) => r.living),
    childcare: sum(year, (r) => r.childcare),
    loss: p.totals.firstYearLoss,
    aids: p.totals.firstYearAids,
  };
  return { ...rows, net: rows.equipment + rows.living + rows.childcare + rows.loss - rows.aids };
}

function careOptions(plan, p) {
  const resources = Math.round(p.rights.income / 12);
  const hours = p.childcare.hoursPerMonth;
  const hourly = crecheHourly(resources, p.rights.children);
  const crecheCost = hourly * hours * p.count;
  const assmat = assmatMonthly({ hourly: plan.assmatHourly || 0, hoursPerMonth: hours, children: p.rights.children, monthlyResources: resources, babies: p.count });
  const credit = (net) => Math.round((Math.min(net * 12, FAMILY.childcareCredit.cap * p.count) * FAMILY.childcareCredit.rate) / 12);
  return [
    { id: 'creche', detail: `${formatMoney(hourly)} de l’heure selon vos revenus (barème national de la CAF)`, cost: crecheCost, aid: 0, credit: credit(crecheCost) },
    { id: 'assmat', detail: `${formatMoney(plan.assmatHourly || 0)} de l’heure ; la CAF verse le complément de mode de garde (CMG)`, cost: assmat.cost, aid: assmat.cmg, credit: credit(assmat.net) },
    { id: 'famille', detail: 'Pas de frais de garde. Si l’un de vous réduit son activité, la PreParE peut compenser une partie de la perte (non calculée ici).', cost: 0, aid: 0, credit: 0 },
  ].map((o) => ({ ...o, net: o.cost - o.aid - o.credit }));
}

function mainAccount(state) {
  const open = state.accounts.filter((a) => !a.archived);
  return open.find((a) => a.type === 'courant' && (a.owner || 'joint') === 'joint') || open.find((a) => a.type === 'courant') || open[0] || null;
}

/* ------------------------------------------------------------------ */
/* Blocs de la page                                                    */
/* ------------------------------------------------------------------ */

function comparison(plans) {
  const [one, two] = plans.map((p) => ({ p, y: firstYear(p) }));
  const row = (label, key, { sign = 1, hint = '' } = {}) => {
    const get = (x) => (typeof key === 'function' ? key(x.p) : x.y[key]);
    const a = get(one);
    const b = get(two);
    return html`<tr><td>${label}${hint ? html`<br><span class="muted small">${hint}</span>` : ''}</td>
      <td class="num money">${sign < 0 && a ? '− ' : ''}${money(a)}</td><td class="num money">${sign < 0 && b ? '− ' : ''}${money(b)}</td>
      <td class="num money muted col-diff">${b - a ? `${(b - a) * sign > 0 ? '+' : '−'} ${money(Math.abs(b - a))}` : '='}</td></tr>`;
  };
  return html`<section class="card">
    <div class="card-header"><div><h2>Un bébé ou des jumeaux ?</h2><p class="sub">Première année, de la naissance aux 1 an, achats compris</p></div></div>
    <div class="table-wrap"><table class="table table-compare">
      <thead><tr><th></th><th class="num">1 bébé</th><th class="num">Jumeaux</th><th class="num col-diff">Écart</th></tr></thead>
      <tbody>
        ${row('Achats d’équipement', 'equipment')}
        ${row('Dépenses courantes', 'living', { hint: 'Couches, lait, soins, vêtements, repas' })}
        ${row('Frais de garde', 'childcare')}
        ${row('Baisse de revenus pendant les congés', 'loss')}
        ${row('Aides de la CAF', 'aids', { sign: -1 })}
      </tbody>
      <tfoot>
        ${row('Coût net de la première année', 'net')}
        ${row('À épargner avant la naissance', (p) => p.savingsTarget)}
        ${row('Ensuite, chaque mois', (p) => p.steadyMonthly.net, { hint: 'Garde comprise, aides déduites' })}
      </tfoot>
    </table></div>
    <ul class="facts">
      <li>Congé maternité : <strong>${one.p.leave.weeks[0] + one.p.leave.weeks[1]} semaines</strong> pour un bébé, <strong>${two.p.leave.weeks[0] + two.p.leave.weeks[1]} semaines</strong> pour des jumeaux.</li>
      <li>Congé de paternité : <strong>${FAMILY.paternityDays.single} jours</strong>, ou <strong>${FAMILY.paternityDays.multiple} jours</strong> pour des jumeaux.</li>
      <li>Prime à la naissance et allocation de base : versées <strong>pour chaque enfant</strong> en cas de jumeaux.</li>
      <li>Les jumeaux naissent souvent avant le terme : prévoyez les achats plus tôt.</li>
      ${two.y.aids > one.y.aids * 2 + 100000
        ? html`<li>Les plafonds de ressources de la CAF augmentent avec le nombre d’enfants : avec des jumeaux, votre foyer passerait en dessous et toucherait des aides auxquelles il n’aurait pas droit avec un seul bébé.</li>`
        : ''}
    </ul>
  </section>`;
}

function leavesCard(p, name) {
  const duration = (l) => (l.weeks ? `${l.weeks} semaines (${l.before} avant, ${l.after} après)` : l.days ? `${l.days} jours` : '1 mois');
  return html`<section class="card">
    <div class="card-header"><div><h2>Congés et revenus</h2><p class="sub">Baisse de revenus estimée : ${money(p.leave.totalLoss)} au total</p></div></div>
    <ul class="aid-list">${p.leave.leaves.map((l) => {
      const loss = Math.round(l.dailyLoss * (daysBetween(l.start, l.end) + 1));
      return html`<li class="aid">
        <div class="aid-body"><strong>${name(l.parent)} · ${l.label}</strong>
          <span class="muted small">${formatDate(l.start)} → ${formatDate(l.end)} · ${duration(l)}</span>
          <span class="muted small">${l.rate ? `Indemnité : ${Math.round(l.rate * 100)} % du salaire net` : `Indemnités journalières : ${formatMoney(l.daily)} par jour`}</span></div>
        <div class="aid-side">${loss ? html`<strong class="money neg">− ${money(loss)}</strong>` : html`<span class="pill pill-ok">Sans perte</span>`}</div>
      </li>`;
    })}</ul>
    <p class="muted small" style="margin-top:10px">L’Assurance maladie verse des indemnités journalières égales à environ 79 % du salaire brut, plafonnées à ${formatMoney(FAMILY.dailyAllowanceMax)} par jour en 2026. Beaucoup de conventions collectives maintiennent le salaire : vérifiez la vôtre, puis cochez-le dans les réglages. Depuis juillet 2026, chaque parent peut aussi prendre un <strong>congé supplémentaire de naissance</strong> de 1 ou 2 mois, indemnisé 70 % du salaire net le premier mois et 60 % le second.</p>
  </section>`;
}

function aidsCard(p, plan) {
  const r = p.rights;
  const babies = p.count > 1 ? ' (pour chaque bébé)' : '';
  const line = (title, condition, amount, ok) => html`<li class="aid">
    <div class="aid-body"><strong>${title}</strong><span class="muted small">${condition}</span></div>
    <div class="aid-side">${ok ? html`<strong class="money pos">${amount}</strong>` : html`<span class="pill">${amount}</span>`}</div>
  </li>`;
  const care = p.childcare;
  return html`<section class="card">
    <div class="card-header"><div><h2>Aides et avantages</h2><p class="sub">Revenu fiscal de référence 2024 : ${money(r.income)}${r.estimated ? ' (estimé)' : ''}</p></div></div>
    <ul class="aid-list">
      ${line(`Prime à la naissance${babies}`, `Versée par la CAF avant la naissance, si le revenu de 2024 ne dépasse pas ${money(r.partialCeiling)}.`, r.premiumEligible ? money(r.premium) : 'Revenus trop élevés', r.premiumEligible)}
      ${line(`Allocation de base${babies}`, r.baseRate ? `Taux ${r.baseRate === 'full' ? 'plein' : 'partiel'}, chaque mois jusqu’aux 3 ans (plafond : ${money(r.partialCeiling)}).` : `Plafond de revenus : ${money(r.partialCeiling)}.`, r.baseMonthly ? `${money(r.baseMonthly)} / mois` : 'Revenus trop élevés', !!r.baseMonthly)}
      ${line('Allocations familiales', r.children >= 2 ? `${r.children} enfants à charge : montant selon vos revenus.` : 'À partir de 2 enfants à charge.', r.familyAllowance ? `+ ${money(r.familyAllowance)} / mois` : r.children >= 2 ? 'Déjà perçues' : 'Pas encore', !!r.familyAllowance)}
      ${line('Complément de mode de garde (CMG)', 'Pour une assistante maternelle ou une garde à domicile, jusqu’aux 6 ans.', care.mode === 'assmat' ? `${money(care.cmg)} / mois` : 'Si assistante maternelle', care.mode === 'assmat' && care.cmg > 0)}
      ${line('Crédit d’impôt pour frais de garde', `50 % des frais restant à votre charge, dans la limite de ${money(FAMILY.childcareCredit.cap)} par enfant et par an.`, p.totals.taxCredit ? `${money(p.totals.taxCredit)} / an` : 'Sans frais de garde', !!p.totals.taxCredit)}
      ${line('Quotient familial', `${r.halfParts} demi-part${r.halfParts > 1 ? 's' : ''} en plus pour l’impôt sur le revenu, dès l’année de naissance.`, `jusqu’à ${money(r.taxAdvantageMax)} / an`, true)}
    </ul>
    <p class="muted small" style="margin-top:10px">Estimations établies avec les barèmes 2026. Seule la CAF peut confirmer vos droits : <a href="${CAF_SIMULATOR}" target="_blank" rel="noopener">faire une simulation sur caf.fr</a>. Déclarez la grossesse avant la fin du 3e mois pour en bénéficier.${r.estimated ? html` <button type="button" class="link-btn" data-settings>Indiquer votre revenu fiscal exact</button>` : ''}</p>
  </section>`;
}

function careCard(plan, p) {
  const opts = careOptions(plan, p);
  return html`<section class="card">
    <div class="card-header"><div><h2>Mode de garde</h2><p class="sub">${p.childcare.hoursPerMonth} h par mois${p.count > 1 ? ' pour chaque bébé' : ''}, à partir du ${formatDate(p.childcare.start)}</p></div></div>
    <ul class="care-list">${opts.map(
      (o) => html`<li class="care${plan.childcare === o.id ? ' is-chosen' : ''}">
        <div class="care-head"><strong>${CARE[o.id]}</strong>${plan.childcare === o.id ? html`<span class="pill pill-ok">${icon('check', { size: 12 })} Choisi</span>` : html`<button type="button" class="btn btn-sm" data-care="${o.id}">Choisir</button>`}</div>
        <p class="muted small">${o.detail}</p>
        ${o.id === 'famille'
          ? ''
          : html`<dl class="care-figures">
              <div><dt>Coût</dt><dd class="money">${money(o.cost)}</dd></div>
              <div><dt>Aide CAF</dt><dd class="money">${o.aid ? `− ${money(o.aid)}` : '—'}</dd></div>
              <div><dt>Crédit d’impôt</dt><dd class="money">${o.credit ? `− ${money(o.credit)}` : '—'}</dd></div>
              <div><dt>Reste par mois</dt><dd class="money"><strong>${money(o.net)}</strong></dd></div>
            </dl>`}
      </li>`,
    )}</ul>
    <p class="muted small" style="margin-top:10px">Les places en crèche sont rares : inscrivez-vous auprès de votre mairie dès la déclaration de grossesse. Le crédit d’impôt est versé l’année suivante.</p>
  </section>`;
}

function checklist(p) {
  const bought = p.equipment.filter((i) => i.bought);
  return html`<section class="card card-flush">
    <div class="card-header"><div><h2>Liste d’achats</h2><p class="sub">${bought.length} sur ${p.equipment.length} achetés · reste ${money(p.equipmentLeft)} à prévoir sur ${money(p.equipmentTotal)}</p></div></div>
    <div class="card-pad" style="padding-top:0">${meter(p.equipmentTotal ? (p.equipmentTotal - p.equipmentLeft) / p.equipmentTotal : 0, 'ok', 'Part des achats effectués')}</div>
    <ul class="item-list checklist">${p.equipment.map(
      (i) => html`<li class="item${i.bought ? ' is-done' : ''}">
        <label class="check"><input type="checkbox" id="buy-${i.id}" data-buy="${i.id}" ${i.bought ? raw('checked') : ''}><span class="sr-only">Acheté</span></label>
        <div class="item-body"><div class="item-title">${i.label}${i.qty > 1 && Number.isInteger(i.qty) ? html` <span class="muted">× ${i.qty}</span>` : ''}</div>
          ${i.note || (p.count > 1 && i.twinsNote) ? html`<div class="item-sub"><span>${p.count > 1 && i.twinsNote ? i.twinsNote : i.note}</span></div>` : ''}</div>
        <div class="item-side">${i.bought
          ? html`<div class="input-with-suffix input-price"><input class="input input-sm" id="paid-${i.id}" data-paid="${i.id}" inputmode="decimal" aria-label="Prix payé pour ${i.label}" placeholder="${(i.amount / 100).toFixed(0)}" value="${i.actual != null ? (i.actual / 100).toFixed(2).replace('.', ',') : ''}"><span class="suffix">€</span></div>`
          : html`<strong class="money">${money(i.amount)}</strong>`}</div>
      </li>`,
    )}</ul>
  </section>`;
}

function actionsCard(state, plan, p) {
  const goal = state.goals.find((g) => g.id === 'goal-bebe');
  const account = mainAccount(state);
  const aids = p.rights.baseMonthly + p.rights.familyAllowance;
  const care = state.recurring.find((r) => r.id === 'rec-bebe-garde');
  const caf = state.recurring.find((r) => r.id === 'rec-bebe-caf');
  const budget = state.budgets['cat-enfants'];
  const living = p.steadyMonthly.costs;
  // Créé trop tôt, ce budget resterait inutilisé des mois : on le propose à l'approche de la naissance.
  const budgetSoon = monthKey(todayISO()) >= shiftMonth(monthKey(p.due), -1);
  const item = (title, text, button) => html`<li class="item item-2"><div class="item-body"><div class="item-title">${title}</div><div class="item-sub"><span>${text}</span></div></div><div class="item-side">${button}</div></li>`;
  return html`<section class="card card-flush" id="bebe-actions">
    <div class="card-header"><div><h2>Intégrer au budget</h2><p class="sub">Pécule suivra ces montants avec le reste de vos finances</p></div></div>
    <ul class="item-list">
      ${item('Objectif d’épargne', `${money(p.savingsTarget)} d’ici le ${formatDate(p.due)}, soit environ ${money(p.monthlySaving)} par mois.`, p.savingsTarget ? html`<button type="button" class="btn btn-sm${goal ? '' : ' btn-primary'}" data-act="goal">${goal ? 'Mettre à jour' : 'Créer'}</button>` : html`<span class="muted small">Rien à épargner</span>`)}
      ${account && aids ? item('Aides mensuelles de la CAF', `${money(aids)} par mois à partir de ${monthLabel(shiftMonth(monthKey(p.due), 1))}, à valider chaque mois.`, html`<button type="button" class="btn btn-sm" data-act="caf">${caf ? 'Mettre à jour' : 'Ajouter'}</button>`) : ''}
      ${account && p.childcare.mode !== 'famille' && p.childcare.net ? item('Frais de garde', `${money(p.childcare.net)} par mois${p.childcare.cmg ? ' (CMG déduit)' : ''} à partir du ${formatDate(p.childcare.start)}.`, html`<button type="button" class="btn btn-sm" data-act="care">${care ? 'Mettre à jour' : 'Ajouter'}</button>`) : ''}
      ${item(
        'Budget « Enfants »',
        `${money(living)} par mois après la naissance (garde comprise)${budget ? `, contre ${money(budget.amount)} aujourd’hui` : ''}.${budgetSoon ? '' : ` À créer en ${monthLabel(shiftMonth(monthKey(p.due), -1))}.`}`,
        budgetSoon ? html`<button type="button" class="btn btn-sm" data-act="budget">${budget ? 'Ajuster' : 'Créer'}</button>` : '',
      )}
    </ul>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Vue                                                                 */
/* ------------------------------------------------------------------ */

export default {
  id: 'bebe',
  title: 'Bébé',
  icon: 'baby',

  actions({ state }) {
    if (!state.baby?.dueDate) return '';
    return html`<button type="button" class="btn btn-ghost" data-baby-settings>${icon('settings', { size: 16 })} <span class="desktop-only">Affiner</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-baby-settings]')?.addEventListener('click', openPlanSettings);
  },

  render({ state }) {
    const h = state.household;
    const plan = state.baby;
    if (!plan?.dueDate) {
      const draft = plan || defaultBabyPlan(todayISO());
      return html`<section class="card stack-v">
        <div><h2>Préparer l’arrivée de bébé</h2>
        <p class="muted" style="margin-top:6px">Pécule estime ce qu’il faut prévoir : achats, congés et baisse de revenus, aides de la CAF, frais de garde et budget des premiers mois. Vous ne savez pas encore s’il y aura un bébé ou des jumeaux ? Les deux situations sont comparées.</p></div>
        <form class="form" id="baby-setup" novalidate>${essentials(draft, h)}
          <div class="row"><button type="submit" class="btn btn-primary">${icon('baby', { size: 16 })} Calculer notre plan</button></div>
        </form>
        <p class="muted small">Estimations établies avec les règles et barèmes français de 2026. Vos données restent dans ce navigateur.</p>
      </section>`;
    }

    const today = todayISO();
    const name = (p) => h.partners[p === 'p1' ? 0 : 1].name;
    const plans = plan.compare ? compareScenarios(plan, h, today) : null;
    const p = plans ? plans[plan.count - 1] : babyPlan(plan, h, { count: plan.count, today });
    const year = firstYear(p);
    const days = daysBetween(today, p.due);
    const dueMonth = monthKey(p.due);
    const chartMonths = p.months.filter((r) => r.month >= shiftMonth(dueMonth, -3) && r.month <= shiftMonth(dueMonth, 12));
    const noIncome = !h.partners[0].income && !h.partners[1].income;
    const label = p.count > 1 ? 'des jumeaux' : 'de bébé';

    return html`
      ${noIncome
        ? html`<div class="callout callout-warning">${icon('alert')}<div>Indiquez vos revenus pour estimer la baisse de revenus pendant les congés et vos droits aux aides. <button type="button" class="link-btn" data-settings>Compléter</button></div></div>`
        : ''}
      ${plan.compare
        ? html`<div class="row-between scenario-bar">
            <div class="segmented" role="radiogroup" aria-label="Scénario affiché">
              ${[[1, '1 bébé'], [2, 'Jumeaux']].map(([v, l]) => html`<label><input type="radio" name="scenario" value="${v}" ${plan.count === v ? raw('checked') : ''}><span>${l}</span></label>`)}
            </div>
            <span class="muted small">Scénario affiché ci-dessous</span>
          </div>`
        : ''}

      <section class="card hero" aria-label="Résumé du plan">
        <div class="hero-balance">
          <span class="hero-label">À mettre de côté d’ici la naissance</span>
          <span class="hero-value money">${money(p.savingsTarget)}</span>
          <p class="balance-line">${days > 0 ? html`Arrivée ${label} prévue le <strong>${formatDate(p.due, 'long').toLowerCase()}</strong>, dans ${days >= 14 ? `${Math.round(days / 7)} semaines` : `${days} jours`}. Soit environ <strong>${money(p.monthlySaving)} par mois</strong>.` : html`Naissance prévue le <strong>${formatDate(p.due)}</strong>.`}</p>
          <p class="muted small">Achats, dépenses courantes et baisse de revenus jusqu’à la reprise du travail, aides déduites.</p>
        </div>
        <div class="hero-kpis"><div class="kpis">
          ${kpi('Coût net la 1re année', money(year.net), html`<span class="kpi-delta">aides déduites, achats compris</span>`)}
          ${kpi('Ensuite, chaque mois', money(p.steadyMonthly.net), html`<span class="kpi-delta">${p.childcare.mode === 'famille' ? 'sans frais de garde' : 'garde comprise'}, aides déduites</span>`)}
          ${kpi('Aides la 1re année', money(year.aids), html`<span class="kpi-delta">CAF${p.childcare.cmg ? ', CMG compris' : ''}</span>`)}
          ${kpi('Baisse de revenus', money(p.leave.totalLoss), html`<span class="kpi-delta">pendant les congés</span>`)}
        </div></div>
      </section>

      ${plans ? comparison(plans) : ''}

      <div class="grid grid-2">
        <section class="card">
          <div class="card-header"><div><h2>Calendrier</h2><p class="sub">Les dates clés autour de la naissance</p></div></div>
          <ol class="timeline">${p.timeline.map(
            (e) => html`<li class="tl tl-${e.kind}${e.date < today ? ' is-past' : ''}">
              <span class="tl-date">${formatDate(e.date)}</span>
              <span class="tl-body"><strong>${e.label}</strong>${e.parent ? html` · ${name(e.parent)}` : ''}${e.end ? html`<span class="muted small"> jusqu’au ${formatDate(e.end)}</span>` : ''}</span>
              ${e.amount ? html`<span class="money pos">+ ${money(e.amount)}</span>` : ''}
            </li>`,
          )}</ol>
          ${h.enabled ? html`<p class="muted small" style="margin-top:12px">Ces montants sont intégrés au <a href="#couple">budget commun du couple</a>.</p>` : ''}
        </section>

        <section class="card">
          <div class="card-header">
            <div><h2>Mois par mois</h2><p class="sub">Dépenses, baisse de revenus et aides</p></div>
            ${legend([
              { label: 'Dépenses', color: '--series-1' },
              { label: 'Baisse de revenus', color: '--series-2' },
              { label: 'Aides', color: '--series-3' },
            ])}
          </div>
          ${chartSlot({
            type: 'columns',
            height: 230,
            label: 'Dépenses, baisse de revenus et aides liées à bébé par mois',
            labels: chartMonths.map((r) => capitalize(monthLabel(r.month, { short: true, year: false }))),
            tipLabels: chartMonths.map((r) => capitalize(monthLabel(r.month))),
            series: [
              { label: 'Dépenses', color: '--series-1', values: chartMonths.map((r) => r.costs) },
              { label: 'Baisse de revenus', color: '--series-2', values: chartMonths.map((r) => r.incomeLoss) },
              { label: 'Aides', color: '--series-3', values: chartMonths.map((r) => r.aids) },
            ],
          })}
          <details class="disclosure" style="margin-top:12px"><summary>Détail mois par mois ${icon('down', { size: 14 })}</summary>
            <div class="table-wrap"><table class="table table-stack">
              <thead><tr><th>Mois</th><th class="num">Achats</th><th class="num">Courant</th><th class="num">Garde</th><th class="num">Revenus</th><th class="num">Aides</th><th class="num">Impact</th></tr></thead>
              <tbody>${p.months.filter((r) => r.month <= shiftMonth(dueMonth, 12)).map(
                (r) => html`<tr${r.month === dueMonth ? raw(' class="row-birth"') : ''}>
                  <td>${capitalize(monthLabel(r.month, { short: true }))}</td>
                  <td data-label="Achats" class="num money">${r.equipment ? money(r.equipment) : '—'}</td>
                  <td data-label="Dépenses courantes" class="num money">${r.living ? money(r.living) : '—'}</td>
                  <td data-label="Garde" class="num money">${r.childcare ? money(r.childcare) : '—'}</td>
                  <td data-label="Baisse de revenus" class="num money">${r.incomeLoss ? `− ${money(r.incomeLoss)}` : '—'}</td>
                  <td data-label="Aides" class="num money">${r.aids ? `+ ${money(r.aids)}` : '—'}</td>
                  <td data-label="Impact net" class="num money ${r.net > 0 ? 'neg' : 'pos'}">${r.net > 0 ? `− ${money(r.net)}` : `+ ${money(-r.net)}`}</td>
                </tr>`,
              )}</tbody>
            </table></div>
          </details>
        </section>
      </div>

      ${actionsCard(state, plan, p)}

      <div class="grid grid-2">
        ${leavesCard(p, name)}
        ${aidsCard(p, plan)}
      </div>

      <div class="grid grid-2">
        ${careCard(plan, p)}
        ${checklist(p)}
      </div>

      <section class="card card-muted">
        <p class="small muted">Plan établi avec : ${FEEDING[plan.feeding].toLowerCase()}, couches ${DIAPERS[plan.diapers].toLowerCase()}, ${EQUIPMENT[plan.equipmentLevel].toLowerCase()}, garde : ${CARE[plan.childcare].toLowerCase()}. Ces montants sont des estimations à partir des barèmes 2026 de la CAF, de l’Assurance maladie et de service-public.fr ; vérifiez vos droits auprès de la CAF et de votre employeur.</p>
        <div class="row" style="margin-top:12px">
          <button type="button" class="btn btn-sm" data-settings>${icon('settings', { size: 14 })} Affiner le plan</button>
          <button type="button" class="btn btn-ghost btn-sm" data-delete-plan>${icon('trash', { size: 14 })} Supprimer le plan</button>
        </div>
      </section>
    `;
  },

  mount(root) {
    const setup = root.querySelector('#baby-setup');
    if (setup) {
      bindNames(setup);
      setup.addEventListener('submit', (e) => {
        e.preventDefault();
        const result = readForm(setup, false);
        if (!result) return;
        updateHousehold(result.household);
        saveBabyPlan(result.plan);
        toast('Plan bébé créé');
      });
      return;
    }
    const state = store.state;
    const plan = state.baby;
    root.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', openPlanSettings));
    root.querySelectorAll('input[name=scenario]').forEach((r) => r.addEventListener('change', () => saveBabyPlan({ count: Number(r.value) })));
    root.querySelectorAll('[data-care]').forEach((b) => b.addEventListener('click', () => saveBabyPlan({ childcare: b.dataset.care })));
    root.querySelectorAll('[data-buy]').forEach((c) => c.addEventListener('change', () => setBabyItem(c.dataset.buy, { bought: c.checked })));
    root.querySelectorAll('[data-paid]').forEach((input) =>
      input.addEventListener('change', () => {
        const value = input.value.trim() ? parseAmount(input.value) : null;
        if (input.value.trim() && (value == null || value < 0)) {
          toast('Montant invalide', { tone: 'error' });
          return;
        }
        setBabyItem(input.dataset.paid, { actual: value });
      }),
    );
    root.querySelector('[data-delete-plan]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Supprimer le plan bébé ?', message: 'Les réglages et la liste d’achats seront effacés. Les objectifs, budgets et récurrences déjà créés sont conservés.', confirmLabel: 'Supprimer', danger: true });
      if (!ok) return;
      deleteBabyPlan();
      toast('Plan supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
    });

    root.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = babyPlan(plan, state.household, { count: plan.count });
        const account = mainAccount(state);
        const dueMonth = monthKey(p.due);
        const twins = p.count > 1;
        switch (b.dataset.act) {
          case 'goal':
            saveGoal({ id: 'goal-bebe', name: twins ? 'Arrivée des jumeaux' : 'Arrivée de bébé', icon: '👶', target: p.savingsTarget, deadline: p.due, archived: false });
            toast('Objectif d’épargne enregistré', { action: { label: 'Voir', fn: () => (location.hash = '#objectifs') } });
            break;
          case 'caf':
            saveRecurring({
              id: 'rec-bebe-caf', type: 'income', amount: p.rights.baseMonthly + p.rights.familyAllowance, accountId: account.id, toAccountId: null, categoryId: 'cat-aides',
              description: 'Allocations CAF (estimation)', frequency: 'monthly', startDate: `${shiftMonth(dueMonth, 1)}-05`, endDate: null, lastDate: null, autoCreate: false, active: true, tags: ['bébé'],
            });
            toast('Aides ajoutées aux récurrences, à valider chaque mois');
            break;
          case 'care':
            saveRecurring({
              id: 'rec-bebe-garde', type: 'expense', amount: p.childcare.net, accountId: account.id, toAccountId: null, categoryId: 'cat-enfants', share: 'shared',
              description: p.childcare.mode === 'creche' ? 'Crèche' : 'Assistante maternelle', frequency: 'monthly', startDate: p.childcare.start, endDate: null, lastDate: null, autoCreate: false, active: true, tags: ['bébé'],
            });
            toast('Frais de garde ajoutés aux récurrences');
            break;
          case 'budget':
            setBudget('cat-enfants', p.steadyMonthly.costs, { scope: 'all' });
            toast('Budget « Enfants » enregistré', { action: { label: 'Voir', fn: () => (location.hash = '#budgets') } });
            break;
        }
      }),
    );
  },
};
