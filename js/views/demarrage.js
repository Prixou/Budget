// Assistant de démarrage : un budget complet en quelques minutes (foyer, comptes, charges fixes, budgets).
import { SAVINGS_PRODUCTS } from '../defaults.js';
import { amountField } from '../forms.js';
import { openMinimalStart } from '../onboarding.js';
import { buildSetupState, emptyAnswers, FIXED_COSTS, starterBudgets, totalFixed, totalIncome } from '../setup.js';
import { processRecurring, requestPersistence, store } from '../store.js';
import { fieldError, formValues, icon, options, toast } from '../ui.js';
import { formatMoney, html, parseAmount, pluralize, raw } from '../utils.js';

const STEPS = ['Votre foyer', 'Vos comptes', 'Charges fixes', 'Budgets', 'C’est prêt'];
const wiz = { step: 0, answers: emptyAnswers() };
const DAYS = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: i === 0 ? 'le 1er' : `le ${i + 1}` }));
const PRODUCTS = ['livretA', 'ldds', 'lep', 'fondsEuros', 'autre'];

const money = (v) => formatMoney(v, { decimals: false });
const name = (i) => wiz.answers.names[i]?.trim() || (i ? 'Partenaire 2' : 'Vous');

/** Lit un montant facultatif : null si invalide (erreur affichée), 0 si vide. */
function amount(form, field) {
  const raw = form.elements[field]?.value?.trim() || '';
  if (!raw) return 0;
  const value = parseAmount(raw);
  if (value == null || value < 0) {
    fieldError(form, field, 'Montant invalide.');
    return null;
  }
  return value;
}

function option(id, label, checked, body) {
  return html`<fieldset class="wiz-option">
    <label class="check"><input type="checkbox" name="${id}" id="w-${id}" data-toggle="${id}" ${checked ? raw('checked') : ''}><span><strong>${label}</strong></span></label>
    <div class="wiz-option-body" data-when="${id}" ${checked ? '' : raw('hidden')}>${body}</div>
  </fieldset>`;
}

/* ------------------------------------------------------------------ */
/* Étapes                                                              */
/* ------------------------------------------------------------------ */

const steps = [
  {
    render(a) {
      return html`
        <div class="field"><span class="label">Vous gérez ce budget</span>
          <div class="segmented" role="radiogroup" aria-label="Seul ou à deux">
            <label><input type="radio" name="couple" value="0" ${a.couple ? '' : raw('checked')}><span>Seul</span></label>
            <label><input type="radio" name="couple" value="1" ${a.couple ? raw('checked') : ''}><span>À deux</span></label>
          </div>
        </div>
        <div class="form-row">
          <label class="field"><span>Votre prénom</span><input class="input" name="name1" id="w-name1" maxlength="30" autocomplete="given-name" value="${a.names[0]}"></label>
          ${amountField({ name: 'income1', label: 'Vos revenus nets par mois', value: a.incomes[0] || null, required: false })}
        </div>
        <div class="form-row" data-partner ${a.couple ? '' : raw('hidden')}>
          <label class="field"><span>Prénom de l’autre personne</span><input class="input" name="name2" id="w-name2" maxlength="30" value="${a.names[1]}"></label>
          ${amountField({ name: 'income2', label: 'Ses revenus nets par mois', value: a.incomes[1] || null, required: false })}
        </div>
        <label class="field"><span>Les revenus arrivent</span><select class="select" name="payDay" id="w-payday">${options(DAYS, a.payDay)}</select>
          <span class="hint">Salaire, pension, allocations : le montant versé sur le compte chaque mois.</span></label>`;
    },
    mount(form) {
      form.querySelectorAll('input[name=couple]').forEach((r) =>
        r.addEventListener('change', () => (form.querySelector('[data-partner]').hidden = formValues(form).couple !== '1')),
      );
    },
    read(form, a) {
      const v = formValues(form);
      const i1 = amount(form, 'income1');
      if (i1 == null) return false;
      const couple = v.couple === '1';
      const i2 = couple ? amount(form, 'income2') : 0;
      if (i2 == null) return false;
      Object.assign(a, { couple, names: [v.name1.trim(), couple ? v.name2.trim() : ''], incomes: [i1, i2], payDay: Number(v.payDay) || 28 });
      return true;
    },
  },
  {
    render(a) {
      const v = a.vouchers || { owner: 'p1', count: null, value: null, share: 60, balance: null };
      return html`
        ${amountField({ name: 'main', label: a.couple ? 'Solde du compte joint aujourd’hui' : 'Solde de votre compte courant aujourd’hui', value: a.main || null, required: false, hint: 'Le solde affiché par votre banque. Négatif si vous êtes à découvert (ex. : -120).' })}
        ${a.couple
          ? [0, 1].map((i) =>
              option(`perso${i}`, `Compte personnel de ${name(i)}`, a.personal[i] != null, amountField({ name: `personal${i}`, label: 'Solde aujourd’hui', value: a.personal[i] || null, required: false })),
            )
          : ''}
        ${option(
          'savings',
          'Un livret ou une épargne',
          !!a.savings,
          html`<div class="form-row">
            <label class="field"><span>Type</span><select class="select" name="product" id="w-product">${options(
              PRODUCTS.map((p) => ({ value: p, label: SAVINGS_PRODUCTS[p].label })),
              a.savings?.product || 'livretA',
            )}</select></label>
            ${amountField({ name: 'savingsBalance', label: 'Montant épargné', value: a.savings?.balance || null, required: false })}
          </div>`,
        )}
        ${option(
          'vouchers',
          'Des titres-restaurant',
          !!a.vouchers,
          html`${a.couple
              ? html`<label class="field"><span>Pour</span><select class="select" name="vOwner" id="w-vowner">${options(
                  [
                    { value: 'p1', label: name(0) },
                    { value: 'p2', label: name(1) },
                  ],
                  v.owner,
                )}</select></label>`
              : ''}
            <div class="form-row">
              <label class="field"><span>Titres par mois</span><input class="input" type="number" name="vCount" id="w-vcount" min="0" max="31" inputmode="numeric" placeholder="Ex. : 18" value="${v.count ?? ''}"></label>
              ${amountField({ name: 'vValue', label: 'Valeur d’un titre', value: v.value, required: false })}
            </div>
            <div class="form-row">
              <label class="field"><span>Part de l’employeur</span><div class="input-with-suffix"><input class="input" type="number" name="vShare" id="w-vshare" min="0" max="100" value="${v.share ?? 60}"><span class="suffix">%</span></div></label>
              ${amountField({ name: 'vBalance', label: 'Solde de la carte', value: v.balance, required: false })}
            </div>`,
        )}
        <p class="muted small">D’autres comptes (carte de crédit, PEA, espèces…) s’ajoutent ensuite dans « Comptes ».</p>`;
    },
    read(form, a) {
      const v = formValues(form);
      const raw = form.elements.main.value.trim();
      const main = raw ? parseAmount(raw) : 0;
      if (main == null) return fieldError(form, 'main', 'Montant invalide.'), false;
      a.main = main;
      a.personal = [0, 1].map((i) => (a.couple && v[`perso${i}`] ? parseAmount(form.elements[`personal${i}`].value) ?? 0 : null));
      if (v.savings) {
        const balance = amount(form, 'savingsBalance');
        if (balance == null) return false;
        a.savings = { product: v.product, label: SAVINGS_PRODUCTS[v.product].label.replace(/ \(.*\)$/, ''), balance };
      } else a.savings = null;
      if (v.vouchers) {
        const value = amount(form, 'vValue');
        const balance = amount(form, 'vBalance');
        if (value == null || balance == null) return false;
        const count = Math.min(31, Math.max(0, Math.round(Number(v.vCount) || 0)));
        a.vouchers = { owner: v.vOwner || 'p1', count, value, share: Math.min(100, Math.max(0, Number(v.vShare) || 0)), day: 1, balance };
      } else a.vouchers = null;
      return true;
    },
  },
  {
    render(a) {
      return html`
        <p class="muted">Indiquez seulement ce que vous payez chaque mois ; laissez vide le reste. Ces montants seront enregistrés automatiquement à leur date.</p>
        <ul class="fixed-list">
          ${FIXED_COSTS.map((c) => {
            const f = a.fixed[c.id] || {};
            return html`<li class="fixed-row">
              <label for="f-fx-${c.id}"><span aria-hidden="true">${c.icon}</span> ${c.label}</label>
              <div class="input-with-suffix"><input class="input" name="fx-${c.id}" id="f-fx-${c.id}" inputmode="decimal" autocomplete="off" placeholder="0" value="${f.amount ? (f.amount / 100).toFixed(2).replace('.', ',').replace(',00', '') : ''}"><span class="suffix">€</span></div>
              <select class="select" name="day-${c.id}" aria-label="Jour du prélèvement : ${c.label}">${options(DAYS, f.day || c.day)}</select>
            </li>`;
          })}
          ${a.savings
            ? html`<li class="fixed-row fixed-saving">
                <label for="f-fx-saving"><span aria-hidden="true">💰</span> Épargne automatique vers le livret</label>
                <div class="input-with-suffix"><input class="input" name="fx-saving" id="f-fx-saving" inputmode="decimal" autocomplete="off" placeholder="0" value="${a.saving ? (a.saving / 100).toFixed(2).replace('.', ',').replace(',00', '') : ''}"><span class="suffix">€</span></div>
                <span class="muted small">le jour de la paie</span>
              </li>`
            : ''}
        </ul>
        <p class="wiz-total" data-total></p>`;
    },
    mount(form) {
      const total = form.querySelector('[data-total]');
      const update = () => {
        let fixed = 0;
        form.querySelectorAll('input[name^="fx-"]').forEach((i) => (fixed += parseAmount(i.value) > 0 ? parseAmount(i.value) : 0));
        const income = totalIncome(wiz.answers);
        total.textContent = income ? `Charges fixes et épargne : ${money(fixed)} par mois. Il reste ${money(income - fixed)} pour les dépenses courantes.` : `Total : ${money(fixed)} par mois.`;
        total.classList.toggle('neg', income > 0 && fixed > income);
      };
      form.addEventListener('input', update);
      update();
    },
    read(form, a) {
      const fixed = {};
      for (const c of FIXED_COSTS) {
        const value = amount(form, `fx-${c.id}`);
        if (value == null) return false;
        if (value > 0) fixed[c.id] = { amount: value, day: Number(form.elements[`day-${c.id}`].value) || c.day };
      }
      const saving = form.elements['fx-saving'] ? amount(form, 'fx-saving') : 0;
      if (saving == null) return false;
      a.fixed = fixed;
      a.saving = saving;
      a.budgets = null; // recalculés avec les nouvelles charges
      return true;
    },
  },
  {
    render(a, state) {
      const budgets = a.budgets || starterBudgets(a);
      const cats = new Map(state.categories.map((c) => [c.id, c]));
      const free = totalIncome(a) - totalFixed(a) - a.saving;
      return html`
        <p class="muted">Un plafond par poste de dépenses courantes. ${free > 0 ? html`Proposition établie sur les <strong>${money(free)}</strong> qui restent chaque mois après les charges fixes et l’épargne, avec des montants raisonnables par personne.` : 'Indiquez vos revenus à la première étape pour une proposition chiffrée.'} Ajustez librement : Pécule vous dira ensuite où vous en êtes.</p>
        <ul class="fixed-list">
          ${Object.entries(budgets).map(([id, value]) => {
            const c = cats.get(id);
            return html`<li class="fixed-row fixed-row-2">
              <label for="f-bd-${id}"><span aria-hidden="true">${c?.icon}</span> ${c?.name || id}</label>
              <div class="input-with-suffix"><input class="input" name="bd-${id}" id="f-bd-${id}" inputmode="decimal" autocomplete="off" placeholder="0" value="${value ? Math.round(value / 100) : ''}"><span class="suffix">€</span></div>
            </li>`;
          })}
        </ul>
        <p class="wiz-total" data-total></p>
        <label class="check"><input type="checkbox" name="skipBudgets" id="w-skip"><span>Pas de budgets pour l’instant</span></label>`;
    },
    mount(form) {
      const total = form.querySelector('[data-total]');
      const free = totalIncome(wiz.answers) - totalFixed(wiz.answers) - wiz.answers.saving;
      const update = () => {
        let sumBudgets = 0;
        form.querySelectorAll('input[name^="bd-"]').forEach((i) => (sumBudgets += parseAmount(i.value) > 0 ? parseAmount(i.value) : 0));
        total.textContent =
          free > 0
            ? free - sumBudgets >= 0
              ? `Budgets : ${money(sumBudgets)} par mois. Il reste ${money(free - sumBudgets)} : de quoi faire face aux imprévus ou épargner davantage.`
              : `Budgets : ${money(sumBudgets)} par mois, soit ${money(sumBudgets - free)} de plus que ce qui reste après les charges fixes.`
            : `Budgets : ${money(sumBudgets)} par mois.`;
        total.classList.toggle('neg', free > 0 && sumBudgets > free);
      };
      form.addEventListener('input', update);
      update();
    },
    read(form, a) {
      if (form.elements.skipBudgets.checked) {
        a.budgets = {};
        return true;
      }
      const budgets = {};
      for (const input of form.querySelectorAll('input[name^="bd-"]')) {
        const value = amount(form, input.name);
        if (value == null) return false;
        if (value > 0) budgets[input.name.slice(3)] = value;
      }
      a.budgets = budgets;
      return true;
    },
  },
  {
    render(a, state) {
      const fixed = Object.keys(a.fixed).length;
      const accounts = 1 + a.personal.filter((p) => p != null).length + (a.savings ? 1 : 0) + (a.vouchers ? 1 : 0);
      const budgets = Object.keys(a.budgets || starterBudgets(a)).length;
      const hasData = !state.settings.demo && (state.transactions.length || state.accounts.length);
      return html`
        <ul class="recap">
          <li>${icon('users', { size: 18 })}<span>${a.couple ? `Budget à deux : ${name(0)} et ${name(1)}, dépenses communes partagées au prorata des revenus` : `Budget de ${name(0)}`}</span></li>
          <li>${icon('wallet', { size: 18 })}<span>${pluralize(accounts, 'compte')}${a.vouchers ? ', dont une carte de titres-restaurant' : ''}</span></li>
          <li>${icon('repeat', { size: 18 })}<span>${totalIncome(a) ? `${money(totalIncome(a))} de revenus par mois` : 'Revenus à ajouter plus tard'}${fixed ? `, ${pluralize(fixed, 'charge fixe', 'charges fixes')} (${money(totalFixed(a))})` : ''}${a.saving ? `, ${money(a.saving)} d’épargne automatique` : ''}</span></li>
          <li>${icon('pie', { size: 18 })}<span>${budgets ? `${pluralize(budgets, 'budget')} mensuel${budgets > 1 ? 's' : ''}` : 'Pas de budget pour l’instant'}</span></li>
        </ul>
        ${hasData ? html`<div class="callout callout-warning">${icon('alert')}<div>Vos données actuelles seront remplacées. Exportez une sauvegarde avant si besoin (Paramètres).</div></div>` : ''}
        <p class="muted small">Tout reste modifiable ensuite. Pour retrouver vos dernières opérations, importez des captures d’écran de l’application de votre banque, ou un relevé CSV, depuis « Opérations ».</p>`;
    },
    read: () => true,
  },
];

/* ------------------------------------------------------------------ */
/* Vue                                                                 */
/* ------------------------------------------------------------------ */

function finish() {
  const s = store.state.settings;
  store.replace(buildSetupState(wiz.answers, { settings: { theme: s.theme, currency: s.currency, locale: s.locale } }));
  processRecurring();
  requestPersistence();
  const couple = wiz.answers.couple;
  Object.assign(wiz, { step: 0, answers: emptyAnswers() });
  location.hash = '#tableau-de-bord';
  toast(couple ? 'Votre budget à deux est prêt' : 'Votre budget est prêt', { action: { label: 'Annuler', fn: () => store.undo() }, duration: 6000 });
}

export default {
  id: 'demarrage',
  title: 'Démarrage rapide',
  icon: 'sparkle',
  hidden: true,

  render({ state }) {
    const step = steps[wiz.step];
    const last = wiz.step === STEPS.length - 1;
    return html`<div class="wizard">
      <ol class="wizard-steps" aria-label="Étapes">
        ${STEPS.map((label, i) => html`<li class="${i < wiz.step ? 'is-done' : i === wiz.step ? 'is-current' : ''}" ${i === wiz.step ? raw('aria-current="step"') : ''}><span class="wizard-dot">${i < wiz.step ? icon('check', { size: 12 }) : i + 1}</span><span class="wizard-label">${label}</span></li>`)}
      </ol>
      <section class="card stack-v">
        <div><p class="muted small">Étape ${wiz.step + 1} sur ${STEPS.length}</p><h2>${STEPS[wiz.step]}</h2></div>
        <form class="form" id="wiz-form" novalidate>${step.render(wiz.answers, state)}</form>
        <div class="row-between wizard-nav">
          ${wiz.step ? html`<button type="button" class="btn btn-ghost" data-back>${icon('left', { size: 16 })} Retour</button>` : html`<button type="button" class="link-btn" data-minimal>Juste un compte courant, sans assistant</button>`}
          <button type="submit" form="wiz-form" class="btn btn-primary">${last ? html`${icon('check', { size: 16 })} Créer mon budget` : html`Suivant ${icon('right', { size: 16 })}`}</button>
        </div>
      </section>
    </div>`;
  },

  mount(root, { rerender }) {
    const form = root.querySelector('#wiz-form');
    const step = steps[wiz.step];
    form.querySelectorAll('[data-toggle]').forEach((c) =>
      c.addEventListener('change', () => (form.querySelector(`[data-when="${c.dataset.toggle}"]`).hidden = !c.checked)),
    );
    step.mount?.(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!step.read(form, wiz.answers)) return;
      if (wiz.step === STEPS.length - 1) return finish();
      wiz.step++;
      rerender();
      window.scrollTo(0, 0);
    });
    root.querySelector('[data-back]')?.addEventListener('click', () => {
      wiz.step--;
      rerender();
    });
    root.querySelector('[data-minimal]')?.addEventListener('click', () => openMinimalStart());
  },
};
