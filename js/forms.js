// Formulaire d'opération (dépense, revenu, virement), partagé par toutes les vues.
import { FREQUENCIES, descriptionMemory } from './calc.js';
import { deleteTransactions, processRecurring, saveRecurring, saveTransaction, store } from './store.js';
import { accountOptions, categoryOptions, confirmDialog, fieldError, formValues, icon, openModal, options, toast } from './ui.js';
import { centsToInput, getMoneyConfig, html, isValidISODate, normalizeText, parseAmount, raw, todayISO } from './utils.js';

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

      const applyType = () => {
        const type = formValues(form).type;
        el.querySelectorAll('[data-show]').forEach((node) => {
          node.hidden = !node.dataset.show.split(' ').includes(type);
        });
        el.querySelector('[data-label-account]').textContent = type === 'transfer' ? 'Depuis le compte' : 'Compte';
        if (type !== 'transfer') {
          const current = catSelect.value;
          catSelect.innerHTML = String(categoryOptions(store.state.categories, type, current));
        }
      };
      applyType();
      form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', applyType));
      catSelect.addEventListener('change', () => {
        categoryTouched = true;
      });

      // Libellé déjà connu : on propose la même catégorie et le même compte.
      form.elements.description.addEventListener('change', () => {
        const known = memory.get(normalizeText(form.elements.description.value));
        if (!known || categoryTouched || editing) return;
        const radio = form.querySelector(`input[name=type][value="${known.type}"]`);
        if (radio) radio.checked = true;
        applyType();
        if (known.categoryId) catSelect.value = known.categoryId;
        if (known.accountId && [...form.elements.accountId.options].some((o) => o.value === known.accountId)) form.elements.accountId.value = known.accountId;
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
        };
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
