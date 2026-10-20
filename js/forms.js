// Formulaire d'opération (dépense, revenu, virement), partagé par toutes les vues.
import { benefitAccepts, benefitBalances, benefitKind, isBenefit, spentOn } from './benefits.js';
import { FREQUENCIES, descriptionMemory, transactionsByDate } from './calc.js';
import { BENEFITS, MEAL_VOUCHERS } from './defaults.js';
import { deleteTransactions, processRecurring, saveRecurring, saveTransaction, store } from './store.js';
import { accountOptions, categoryOptions, confirmDialog, fieldError, formValues, icon, openModal, options, toast } from './ui.js';
import { centsToInput, formatDate, formatMoney, getMoneyConfig, html, isValidISODate, normalizeText, parseAmount, raw, todayISO } from './utils.js';

export function currencySymbol() {
  const { currency, locale } = getMoneyConfig();
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

export function amountField({ name = 'amount', label = 'Montant', value = null, big = false, required = true, hint = '' } = {}) {
  return html`<label class="field">
    <span>${label}</span>
    <div class="input-with-suffix">
      <input class="input${big ? ' input-amount' : ''}" name="${name}" id="f-${name}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${value != null ? centsToInput(value) : ''}" ${required ? raw('required') : ''}>
      <span class="suffix">${currencySymbol()}</span>
    </div>
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
  </label>`;
}

/* ------------------------------------------------------------------ */
/* Couple : « pour qui » est la dépense                                */
/* ------------------------------------------------------------------ */

/** Part proposée par défaut : commune sur un compte commun ou pour un besoin du foyer, sinon personnelle. */
export function defaultShare(state, accountId, categoryId) {
  const owner = state.accounts.find((a) => a.id === accountId)?.owner;
  if (owner !== 'p1' && owner !== 'p2') return 'shared';
  const cat = state.categories.find((c) => c.id === categoryId);
  return cat?.group === 'needs' || cat?.id === 'cat-enfants' ? 'shared' : owner;
}

/** Sélecteur « Pour qui ? » (affiché seulement si le mode couple est activé). */
export function shareField(state, value, { show = 'expense' } = {}) {
  const h = state.household;
  if (!h?.enabled) return '';
  const choices = [
    ['shared', 'Commun'],
    ['p1', h.partners[0].name],
    ['p2', h.partners[1].name],
  ];
  return html`<div class="field" data-show="${show}">
    <span class="label">Pour qui ?</span>
    <div class="segmented" role="radiogroup" aria-label="Pour qui est cette dépense">
      ${choices.map(([v, label]) => html`<label><input type="radio" name="share" value="${v}" ${value === v ? raw('checked') : ''}><span>${label}</span></label>`)}
    </div>
    <span class="hint" data-payer></span>
  </div>`;
}

/** Met à jour la part par défaut et l'indication « payé par » quand le compte ou la catégorie change. */
export function bindShareField(form, state) {
  if (!form.querySelector('input[name=share]')) return () => {};
  let touched = false;
  const payerHint = form.querySelector('[data-payer]');
  const update = (reset) => {
    const accountId = form.elements.accountId.value;
    const owner = state.accounts.find((a) => a.id === accountId)?.owner;
    const h = state.household;
    payerHint.textContent = owner === 'p1' || owner === 'p2' ? `Payé par ${h.partners[owner === 'p1' ? 0 : 1].name} (compte personnel)` : 'Payé par le compte commun';
    if (reset && !touched) {
      const share = defaultShare(state, accountId, form.elements.categoryId?.value);
      const radio = form.querySelector(`input[name=share][value="${share}"]`);
      if (radio) radio.checked = true;
    }
  };
  form.querySelectorAll('input[name=share]').forEach((r) => r.addEventListener('change', () => (touched = true)));
  form.elements.accountId.addEventListener('change', () => update(true));
  form.elements.categoryId?.addEventListener('change', () => update(true));
  update(false);
  return update;
}

/* ------------------------------------------------------------------ */
/* Titres-restaurant et avantages                                      */
/* ------------------------------------------------------------------ */

function voucherFields(meals) {
  if (!meals.length) return '';
  return html`<div class="voucher-part" data-voucher-part hidden>
    ${amountField({ name: 'voucherPart', label: 'Dont payé en titres-restaurant', required: false })}
    ${meals.length > 1
      ? html`<label class="field"><span>Avec</span><select class="select" name="voucherAccount" id="f-voucherAccount">${options(
          meals.map((m) => ({ value: m.account.id, label: `${m.account.name} (${formatMoney(m.balance)})` })),
          meals[0].account.id,
        )}</select></label>`
      : html`<input type="hidden" name="voucherAccount" value="${meals[0].account.id}">`}
  </div>`;
}

/**
 * Rappels des règles quand on paie avec un avantage (catégories acceptées, 25 € par jour),
 * et champ « dont payé en titres-restaurant » pour un paiement partagé avec la carte bancaire.
 */
function bindBenefitHints(form, state, { editing, txId, meals }) {
  const hint = form.querySelector('[data-benefit-hint]');
  const part = form.querySelector('[data-voucher-part]');
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const update = () => {
    const v = formValues(form);
    const account = accounts.get(v.accountId);
    const date = isValidISODate(v.date) ? v.date : todayISO();
    const amount = parseAmount(v.amount) || 0;
    let text = '';
    let warn = false;
    let showPart = false;
    if (v.type === 'expense' && isBenefit(account)) {
      const kind = benefitKind(account);
      const info = BENEFITS[kind];
      text = `${info.label} : ${info.use}.`;
      if (v.categoryId && !benefitAccepts(kind, v.categoryId, date)) {
        warn = true;
        text = kind === 'restaurant' && v.categoryId === 'cat-courses' ? `Les courses ne sont acceptées en titres-restaurant que jusqu’au ${formatDate(MEAL_VOUCHERS.groceriesUntil)}.` : `Cette dépense n’est en principe pas acceptée (${info.label.toLowerCase()} : ${info.use}).`;
      }
      if (kind === 'restaurant') {
        const already = spentOn(state, account.id, date, txId);
        if (already + amount > MEAL_VOUCHERS.dailyCap) {
          warn = true;
          text += ` Plafond de ${formatMoney(MEAL_VOUCHERS.dailyCap, { decimals: false })} par jour dépassé${already ? ` (${formatMoney(already)} déjà payés ce jour-là)` : ''} : réglez le reste par carte bancaire.`;
        } else text += ` ${formatMoney(MEAL_VOUCHERS.dailyCap, { decimals: false })} maximum par jour.`;
      }
    } else if (part && !editing && v.type === 'expense' && !v.repeat && benefitAccepts('restaurant', v.categoryId, date)) {
      showPart = true;
      const meal = meals.find((m) => m.account.id === v.voucherAccount) || meals[0];
      text = `Titres-restaurant disponibles : ${formatMoney(Math.max(0, meal.balance))}. ${formatMoney(MEAL_VOUCHERS.dailyCap, { decimals: false })} maximum par jour.`;
    }
    hint.textContent = text;
    hint.hidden = !text;
    hint.classList.toggle('hint-warning', warn);
    if (part) part.hidden = !showPart;
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
  return update;
}

/** Catégories les plus utilisées récemment pour ce type d'opération (raccourcis du formulaire). */
function frequentCategories(state, type, limit = 6) {
  const counts = new Map();
  const list = transactionsByDate(state);
  for (let i = list.length - 1, seen = 0; i >= 0 && seen < 400; i--) {
    const tx = list[i];
    if (tx.type !== type || !tx.categoryId) continue;
    seen++;
    counts.set(tx.categoryId, (counts.get(tx.categoryId) || 0) + 1);
  }
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  const ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  // Sans historique : les catégories les plus courantes.
  const fallback = type === 'income' ? ['cat-salaire', 'cat-aides', 'cat-remboursements'] : ['cat-courses', 'cat-restaurants', 'cat-transport', 'cat-loisirs', 'cat-shopping', 'cat-sante'];
  return [...new Set([...ids, ...fallback])].map((id) => cats.get(id)).filter((c) => c && c.type === type).slice(0, limit);
}

/**
 * Ouvre le formulaire d'opération.
 * tx : opération existante (modification) ; defaults : valeurs initiales pour une nouvelle.
 */
export function openTransactionForm({ tx = null, defaults = {} } = {}) {
  const state = store.state;
  const accounts = state.accounts.filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.toAccountId);
  if (!accounts.length) {
    toast("Créez d'abord un compte dans « Comptes ».", { tone: 'error' });
    location.hash = '#comptes';
    return;
  }
  const editing = !!tx;
  const v = {
    type: 'expense',
    amount: null,
    date: todayISO(),
    accountId: accounts[0].id,
    toAccountId: accounts[1]?.id || '',
    categoryId: '',
    description: '',
    notes: '',
    tags: [],
    cleared: false,
    ...defaults,
    ...(tx || {}),
  };
  const memory = descriptionMemory(state);
  const meals = benefitBalances(state).accounts.filter((m) => m.kind === 'restaurant').sort((a, b) => b.balance - a.balance);
  const suggestions = [...memory.values()].slice(-300).map((m) => m.description);

  const body = html`<form class="form" id="tx-form" novalidate>
    <div class="segmented" role="radiogroup" aria-label="Type d'opération">
      ${[
        ['expense', 'Dépense', 'segmented-expense'],
        ['income', 'Revenu', 'segmented-income'],
        ['transfer', 'Virement', ''],
      ].map(
        ([value, label, cls]) => html`<label class="${cls}"><input type="radio" name="type" value="${value}" ${v.type === value ? raw('checked') : ''}><span>${label}</span></label>`,
      )}
    </div>
    ${amountField({ value: v.amount, big: true })}
    <div class="chips cat-chips" data-cat-chips data-show="expense income" role="group" aria-label="Catégories fréquentes"></div>
    <label class="field">
      <span>Libellé</span>
      <input class="input" name="description" id="f-description" list="desc-suggestions" autocomplete="off" maxlength="120" placeholder="Ex. : Supermarché, Loyer, Salaire…" value="${v.description}">
      <datalist id="desc-suggestions">${suggestions.map((s) => html`<option value="${s}"></option>`)}</datalist>
    </label>
    <div class="form-row">
      <label class="field" data-show="expense income">
        <span>Catégorie</span>
        <select class="select" name="categoryId" id="f-categoryId">${categoryOptions(state.categories, v.type === 'income' ? 'income' : 'expense', v.categoryId)}</select>
      </label>
      <label class="field">
        <span>Date</span>
        <input class="input" type="date" name="date" id="f-date" value="${v.date}" required>
      </label>
    </div>
    <div class="form-row">
      <label class="field">
        <span data-label-account>${v.type === 'transfer' ? 'Depuis le compte' : 'Compte'}</span>
        <select class="select" name="accountId" id="f-accountId">${accountOptions(accounts, v.accountId)}</select>
      </label>
      <label class="field" data-show="transfer">
        <span>Vers le compte</span>
        <select class="select" name="toAccountId" id="f-toAccountId">${accountOptions(accounts, v.toAccountId, { placeholder: 'Choisir…' })}</select>
      </label>
    </div>
    <p class="hint benefit-hint" data-benefit-hint hidden></p>
    ${voucherFields(meals)}
    ${shareField(state, v.share || defaultShare(state, v.accountId, v.categoryId))}
    <details class="disclosure more-options" ${(v.tags || []).length || v.notes ? raw('open') : ''}>
      <summary>Plus d’options ${icon('down', { size: 14 })}</summary>
      <div class="stack-v">
        <label class="field">
          <span>Étiquettes</span>
          <input class="input" name="tags" id="f-tags" autocomplete="off" placeholder="vacances, travail… (séparées par des virgules)" value="${(v.tags || []).join(', ')}">
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea class="input" name="notes" id="f-notes" rows="2" maxlength="500">${v.notes}</textarea>
        </label>
        <label class="check"><input type="checkbox" name="cleared" id="f-cleared" ${v.cleared ? raw('checked') : ''}><span>Opération pointée <span class="muted">(vérifiée sur le relevé bancaire)</span></span></label>
        ${editing
          ? ''
          : html`<label class="check"><input type="checkbox" name="repeat" id="f-repeat"><span>Répéter automatiquement cette opération</span></label>
            <label class="field" data-repeat hidden>
              <span>Fréquence</span>
              <select class="select" name="frequency" id="f-frequency">${options(
                Object.entries(FREQUENCIES).map(([value, f]) => ({ value, label: f.label })),
                'monthly',
              )}</select>
            </label>`}
      </div>
    </details>
  </form>`;

  const footer = html`${editing
      ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>
        <button type="button" class="btn btn-ghost" data-duplicate>${icon('copy', { size: 16 })} Dupliquer</button>`
      : ''}
    <button type="button" class="btn btn-ghost" data-close>Annuler</button>
    <button type="submit" form="tx-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Ajouter'}</button>`;

  openModal({
    title: editing ? "Modifier l'opération" : 'Nouvelle opération',
    body,
    footer,
    onMount(el, close) {
      const form = el.querySelector('form');
      const catSelect = form.elements.categoryId;
      let categoryTouched = !!v.categoryId;

      const chips = form.querySelector('[data-cat-chips]');
      const renderChips = (type) => {
        if (type === 'transfer') return;
        chips.innerHTML = String(
          html`${frequentCategories(store.state, type).map(
            (c) => html`<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${catSelect.value === c.id ? 'true' : 'false'}"><span aria-hidden="true">${c.icon}</span> ${c.name}</button>`,
          )}`,
        );
      };
      chips.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-cat]');
        if (!chip) return;
        catSelect.value = chip.dataset.cat;
        catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const applyType = () => {
        const type = formValues(form).type;
        el.querySelectorAll('[data-show]').forEach((node) => {
          node.hidden = !node.dataset.show.split(' ').includes(type);
        });
        el.querySelector('[data-label-account]').textContent = type === 'transfer' ? 'Depuis le compte' : 'Compte';
        if (type !== 'transfer') {
          const current = catSelect.value;
          catSelect.innerHTML = String(categoryOptions(store.state.categories, type, current));
          renderChips(type);
        }
      };
      applyType();
      form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', applyType));
      catSelect.addEventListener('change', () => {
        categoryTouched = true;
        chips.querySelectorAll('[data-cat]').forEach((c) => c.setAttribute('aria-pressed', c.dataset.cat === catSelect.value ? 'true' : 'false'));
      });
      const refreshShare = bindShareField(form, store.state);
      const refreshBenefit = bindBenefitHints(form, store.state, { editing, txId: tx?.id, meals });

      // Libellé déjà connu : on propose la même catégorie et le même compte.
      form.elements.description.addEventListener('change', () => {
        const known = memory.get(normalizeText(form.elements.description.value));
        if (!known || categoryTouched || editing) return;
        const radio = form.querySelector(`input[name=type][value="${known.type}"]`);
        if (radio) radio.checked = true;
        applyType();
        if (known.categoryId) catSelect.value = known.categoryId;
        if (known.accountId && [...form.elements.accountId.options].some((o) => o.value === known.accountId)) form.elements.accountId.value = known.accountId;
        refreshShare(true);
        refreshBenefit();
      });

      const repeat = form.elements.repeat;
      repeat?.addEventListener('change', () => {
        el.querySelector('[data-repeat]').hidden = !repeat.checked;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = formValues(form);
        const amount = parseAmount(values.amount);
        if (amount == null || amount <= 0) return fieldError(form, 'amount', 'Indiquez un montant supérieur à zéro.');
        if (!isValidISODate(values.date)) return fieldError(form, 'date', 'Indiquez une date valide.');
        if (values.type === 'transfer') {
          if (!values.toAccountId) return fieldError(form, 'toAccountId', 'Choisissez le compte de destination.');
          if (values.toAccountId === values.accountId) return fieldError(form, 'toAccountId', 'Choisissez deux comptes différents.');
        }
        const data = {
          id: tx?.id,
          type: values.type,
          amount,
          date: values.date,
          accountId: values.accountId,
          toAccountId: values.type === 'transfer' ? values.toAccountId : null,
          categoryId: values.type === 'transfer' ? null : values.categoryId || null,
          description: values.description.trim(),
          notes: values.notes.trim(),
          tags: values.tags
            .split(',')
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean),
          cleared: values.cleared,
          share: values.type === 'expense' && values.share ? values.share : tx?.share ?? null,
        };
        // Paiement partagé : une partie en titres-restaurant, le reste sur le compte choisi.
        const partBox = form.querySelector('[data-voucher-part]');
        const voucher = partBox && !partBox.hidden && values.voucherPart?.trim() ? parseAmount(values.voucherPart) : 0;
        if (voucher == null || voucher < 0) return fieldError(form, 'voucherPart', 'Montant invalide.');
        if (voucher > amount) return fieldError(form, 'voucherPart', 'La part en titres-restaurant dépasse le montant de l’opération.');
        if (voucher > 0) {
          if (voucher < amount) saveTransaction({ ...data, amount: amount - voucher });
          saveTransaction({ ...data, amount: voucher, accountId: values.voucherAccount, cleared: false });
          toast(voucher < amount ? `Opération ajoutée : ${formatMoney(voucher)} en titres-restaurant, ${formatMoney(amount - voucher)} sur le compte` : 'Opération ajoutée, payée en titres-restaurant');
          close();
          return;
        }
        if (values.repeat) {
          const rule = saveRecurring({
            type: data.type,
            amount: data.amount,
            accountId: data.accountId,
            toAccountId: data.toAccountId,
            categoryId: data.categoryId,
            description: data.description || 'Opération récurrente',
            frequency: values.frequency,
            startDate: data.date,
            endDate: null,
            lastDate: data.date <= todayISO() ? data.date : null,
            autoCreate: true,
            active: true,
            tags: data.tags,
            share: data.share,
          });
          if (data.date <= todayISO()) saveTransaction({ ...data, recurringId: rule.id });
          // Rattrape les échéances passées si la date de départ est ancienne.
          processRecurring();
          toast('Opération récurrente créée');
        } else {
          saveTransaction(data);
          toast(editing ? 'Opération modifiée' : 'Opération ajoutée');
        }
        close();
      });

      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog({ title: "Supprimer l'opération", message: `« ${tx.description || 'Sans libellé'} » sera supprimée.`, confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
        deleteTransactions([tx.id]);
        toast('Opération supprimée', { action: { label: 'Annuler', fn: () => store.undo() } });
      });
      el.querySelector('[data-duplicate]')?.addEventListener('click', () => {
        close();
        const { id, createdAt, recurringId, ...rest } = tx;
        openTransactionForm({ defaults: { ...rest, date: todayISO(), cleared: false } });
      });
    },
  });
}
