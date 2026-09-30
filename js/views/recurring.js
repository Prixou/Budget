// Opérations récurrentes : salaire, loyer, abonnements, virements d'épargne.
import { FREQUENCIES, dueOccurrences, monthlyEquivalent, nextOccurrence, occurrencesBetween, upcoming } from '../calc.js';
import { catBadge, kpi, lookups, transferBadge } from '../components.js';
import { amountField } from '../forms.js';
import { confirmOccurrence, deleteRecurring, processRecurring, saveRecurring, skipOccurrence, store } from '../store.js';
import { accountOptions, categoryOptions, confirmDialog, emptyState, fieldError, formValues, icon, openModal, options, toast } from '../ui.js';
import { addDays, formatDate, formatMoney, html, isValidISODate, parseAmount, pluralize, raw, sum, todayISO } from '../utils.js';

export function openRecurringForm(rule = null) {
  const state = store.state;
  const accounts = state.accounts.filter((a) => !a.archived || a.id === rule?.accountId);
  if (!accounts.length) {
    toast("Créez d'abord un compte.", { tone: 'error' });
    return;
  }
  const editing = !!rule;
  const v = {
    type: 'expense',
    amount: null,
    description: '',
    categoryId: '',
    accountId: accounts[0].id,
    toAccountId: accounts[1]?.id || '',
    frequency: 'monthly',
    startDate: todayISO(),
    endDate: '',
    autoCreate: true,
    active: true,
    ...(rule || {}),
  };
  openModal({
    title: editing ? 'Modifier la récurrence' : 'Nouvelle opération récurrente',
    body: html`<form class="form" id="rec-form" novalidate>
      <div class="segmented" role="radiogroup" aria-label="Type">
        ${[
          ['expense', 'Dépense', 'segmented-expense'],
          ['income', 'Revenu', 'segmented-income'],
          ['transfer', 'Virement', ''],
        ].map(([value, label, cls]) => html`<label class="${cls}"><input type="radio" name="type" value="${value}" ${v.type === value ? raw('checked') : ''}><span>${label}</span></label>`)}
      </div>
      <div class="form-row">
        ${amountField({ value: v.amount })}
        <label class="field"><span>Libellé</span><input class="input" name="description" id="r-description" maxlength="120" required placeholder="Ex. : Loyer, Salaire, Box internet" value="${v.description}"></label>
      </div>
      <div class="form-row">
        <label class="field" data-show="expense income"><span>Catégorie</span><select class="select" name="categoryId" id="r-category">${categoryOptions(state.categories, v.type === 'income' ? 'income' : 'expense', v.categoryId)}</select></label>
        <label class="field"><span>Fréquence</span><select class="select" name="frequency" id="r-frequency">${options(
          Object.entries(FREQUENCIES).map(([value, f]) => ({ value, label: f.label })),
          v.frequency,
        )}</select></label>
      </div>
      <div class="form-row">
        <label class="field"><span data-label-account>${v.type === 'transfer' ? 'Depuis le compte' : 'Compte'}</span><select class="select" name="accountId" id="r-account">${accountOptions(accounts, v.accountId)}</select></label>
        <label class="field" data-show="transfer"><span>Vers le compte</span><select class="select" name="toAccountId" id="r-to">${accountOptions(accounts, v.toAccountId, { placeholder: 'Choisir…' })}</select></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Première échéance</span><input class="input" type="date" name="startDate" id="r-start" value="${v.startDate}" required></label>
        <label class="field"><span>Dernière échéance <span class="muted">(facultatif)</span></span><input class="input" type="date" name="endDate" id="r-end" value="${v.endDate || ''}"></label>
      </div>
      ${editing ? '' : html`<label class="check" id="r-backfill-wrap" hidden><input type="checkbox" name="backfill" id="r-backfill"><span>Créer aussi les échéances déjà passées</span></label>`}
      <label class="check"><input type="checkbox" name="autoCreate" id="r-auto" ${v.autoCreate ? raw('checked') : ''}><span>Enregistrer automatiquement à chaque échéance <span class="muted">(sinon, vous validez chaque échéance depuis le tableau de bord)</span></span></label>
      ${editing ? html`<label class="check"><input type="checkbox" name="active" id="r-active" ${v.active ? raw('checked') : ''}><span>Active</span></label>` : ''}
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="rec-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const applyType = () => {
        const type = formValues(form).type;
        el.querySelectorAll('[data-show]').forEach((n) => {
          n.hidden = !n.dataset.show.split(' ').includes(type);
        });
        el.querySelector('[data-label-account]').textContent = type === 'transfer' ? 'Depuis le compte' : 'Compte';
        if (type !== 'transfer') {
          const sel = form.elements.categoryId;
          sel.innerHTML = String(categoryOptions(store.state.categories, type, sel.value));
        }
      };
      applyType();
      form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', applyType));
      const backfill = el.querySelector('#r-backfill-wrap');
      const updateBackfill = () => {
        if (backfill) backfill.hidden = !(form.elements.startDate.value && form.elements.startDate.value < todayISO());
      };
      form.elements.startDate.addEventListener('change', updateBackfill);
      updateBackfill();

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(form);
        const amount = parseAmount(f.amount);
        if (amount == null || amount <= 0) return fieldError(form, 'amount', 'Indiquez un montant supérieur à zéro.');
        if (!f.description.trim()) return fieldError(form, 'description', 'Donnez un libellé à cette opération.');
        if (!isValidISODate(f.startDate)) return fieldError(form, 'startDate', 'Date de première échéance invalide.');
        if (f.endDate && (!isValidISODate(f.endDate) || f.endDate < f.startDate)) return fieldError(form, 'endDate', 'La dernière échéance doit suivre la première.');
        if (f.type === 'transfer' && (!f.toAccountId || f.toAccountId === f.accountId)) return fieldError(form, 'toAccountId', 'Choisissez un compte de destination différent.');
        const data = {
          id: rule?.id,
          type: f.type,
          amount,
          description: f.description.trim(),
          categoryId: f.type === 'transfer' ? null : f.categoryId || null,
          accountId: f.accountId,
          toAccountId: f.type === 'transfer' ? f.toAccountId : null,
          frequency: f.frequency,
          startDate: f.startDate,
          endDate: f.endDate || null,
          autoCreate: f.autoCreate,
          active: editing ? f.active : true,
          tags: rule?.tags || [],
          lastDate: rule?.lastDate ?? null,
        };
        if (!editing && !f.backfill && f.startDate < todayISO()) {
          // Sans rattrapage : on considère les échéances passées comme déjà traitées.
          const past = occurrencesBetween({ ...data, lastDate: null }, f.startDate, addDays(todayISO(), -1), 5000);
          data.lastDate = past[past.length - 1] || null;
        }
        saveRecurring(data);
        const created = processRecurring();
        toast(created ? `Récurrence enregistrée · ${pluralize(created, 'opération créée', 'opérations créées')}` : 'Récurrence enregistrée');
        close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog({ title: 'Supprimer la récurrence', message: `« ${rule.description} » ne sera plus générée. Les opérations déjà enregistrées sont conservées.`, confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
        deleteRecurring(rule.id);
        toast('Récurrence supprimée', { action: { label: 'Annuler', fn: () => store.undo() } });
      });
    },
  });
}

function signed(rule) {
  if (rule.type === 'income') return html`<span class="pos money">${formatMoney(rule.amount, { sign: 'always' })}</span>`;
  if (rule.type === 'transfer') return html`<span class="money">${formatMoney(rule.amount)}</span>`;
  return html`<span class="money">${formatMoney(-rule.amount)}</span>`;
}

export default {
  id: 'recurrentes',
  title: 'Récurrences',
  icon: 'repeat',

  actions() {
    return html`<button type="button" class="btn btn-primary" data-new-rule>${icon('plus', { size: 16 })} <span class="desktop-only">Nouvelle récurrence</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-new-rule]')?.addEventListener('click', () => openRecurringForm());
  },

  render({ state }) {
    const today = todayISO();
    const maps = lookups(state);
    const rules = state.recurring;
    if (!rules.length) {
      return html`<section class="card">${emptyState({
        iconName: 'repeat',
        title: 'Aucune opération récurrente',
        text: 'Salaire, loyer, abonnements, virement d’épargne : saisissez-les une fois, elles seront enregistrées à chaque échéance.',
        action: html`<button type="button" class="btn btn-primary" data-new-rule-inline>${icon('plus', { size: 16 })} Ajouter une récurrence</button>`,
      })}</section>`;
    }
    const active = rules.filter((r) => r.active);
    const fixedCosts = sum(active.filter((r) => r.type === 'expense'), monthlyEquivalent);
    const fixedIncome = sum(active.filter((r) => r.type === 'income'), monthlyEquivalent);
    const subs = active.filter((r) => r.type === 'expense' && r.categoryId === 'cat-abonnements');
    const subsCost = sum(subs, monthlyEquivalent);
    const pending = active.filter((r) => !r.autoCreate).map((rule) => ({ rule, dates: dueOccurrences(rule, today) })).filter((p) => p.dates.length);
    const next = upcoming(state, addDays(today, 1), addDays(today, 45));

    const groups = [
      ['income', 'Revenus'],
      ['expense', 'Dépenses'],
      ['transfer', 'Virements'],
    ];

    const ruleItem = (rule) => {
      const nextDate = rule.active ? nextOccurrence(rule) : null;
      const f = FREQUENCIES[rule.frequency];
      const cat = maps.cat.get(rule.categoryId);
      return html`<li class="item item-clickable" data-edit-rule="${rule.id}" tabindex="0">
        ${rule.type === 'transfer' ? transferBadge() : catBadge(cat)}
        <div class="item-body">
          <div class="item-title">${rule.description}
            ${rule.active ? '' : html`<span class="pill">${icon('pause', { size: 12 })} En pause</span>`}
            ${rule.autoCreate ? '' : html`<span class="pill pill-accent">Validation manuelle</span>`}
          </div>
          <div class="item-sub">
            <span>${f?.label || rule.frequency}</span>
            <span>${rule.type === 'transfer' ? `${maps.acc.get(rule.accountId)?.name} → ${maps.acc.get(rule.toAccountId)?.name}` : cat?.name || 'Non catégorisé'}</span>
            <span>${nextDate ? `Prochaine : ${formatDate(nextDate)}` : rule.active ? 'Terminée' : ''}</span>
            ${rule.endDate ? html`<span>Jusqu'au ${formatDate(rule.endDate)}</span>` : ''}
          </div>
        </div>
        <div class="item-side">
          <strong>${signed(rule)}</strong>
          ${rule.frequency !== 'monthly' ? html`<span class="muted small money">≈ ${formatMoney(monthlyEquivalent(rule))} / mois</span>` : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-toggle-rule="${rule.id}">${rule.active ? html`${icon('pause', { size: 14 })} Suspendre` : html`${icon('play', { size: 14 })} Reprendre`}</button>
        </div>
      </li>`;
    };

    return html`
      <section class="kpis kpis-cards">
        ${kpi('Charges fixes / mois', formatMoney(fixedCosts))}
        ${kpi('Revenus fixes / mois', formatMoney(fixedIncome))}
        ${kpi('Reste après charges fixes', html`<span class="${fixedIncome - fixedCosts < 0 ? 'neg' : ''}">${formatMoney(fixedIncome - fixedCosts)}</span>`)}
        ${kpi('Abonnements', formatMoney(subsCost), html`<span class="kpi-delta">${pluralize(subs.length, 'abonnement')} · ${formatMoney(subsCost * 12)} / an</span>`)}
      </section>

      ${pending.length
        ? html`<section class="card card-flush">
            <div class="card-header"><div><h2>À valider</h2><p class="sub">Échéances passées de récurrences en validation manuelle</p></div></div>
            <ul class="item-list">${pending.map(
              ({ rule, dates }) => html`<li class="item">
                ${rule.type === 'transfer' ? transferBadge({ small: true }) : catBadge(maps.cat.get(rule.categoryId), { small: true })}
                <div class="item-body"><div class="item-title">${rule.description}</div><div class="item-sub"><span>Échéance du ${formatDate(dates[0])}</span>${dates.length > 1 ? html`<span>+ ${dates.length - 1} autre(s)</span>` : ''}</div></div>
                <div class="item-side">${signed(rule)}<div class="item-actions"><button type="button" class="btn btn-sm btn-primary" data-confirm-occ="${rule.id}" data-date="${dates[0]}">Valider</button><button type="button" class="btn btn-sm btn-ghost" data-skip-occ="${rule.id}" data-date="${dates[0]}">Ignorer</button></div></div>
              </li>`,
            )}</ul>
          </section>`
        : ''}

      <div class="grid grid-main">
        <div class="stack-v">
          ${groups.map(([type, label]) => {
            const list = rules.filter((r) => r.type === type).sort((a, b) => b.amount - a.amount);
            if (!list.length) return '';
            return html`<section class="card card-flush">
              <div class="card-header"><h2>${label}</h2><span class="muted small">${pluralize(list.length, 'règle')}</span></div>
              <ul class="item-list">${list.map(ruleItem)}</ul>
            </section>`;
          })}
        </div>
        <section class="card card-flush">
          <div class="card-header"><div><h2>Calendrier</h2><p class="sub">45 prochains jours</p></div></div>
          ${next.length
            ? html`<ul class="item-list">${next.map(
                ({ rule, date }) => html`<li class="item">
                  <span class="cat-badge cat-badge-sm" style="--c:#2a78d6"><strong style="font-size:.8rem">${Number(date.slice(8, 10))}</strong></span>
                  <div class="item-body"><div class="item-title">${rule.description}</div><div class="item-sub"><span>${formatDate(date, 'long')}</span></div></div>
                  <div class="item-side">${signed(rule)}</div>
                </li>`,
              )}</ul>`
            : html`<div class="card-pad"><p class="muted">Aucune échéance dans les 45 prochains jours.</p></div>`}
        </section>
      </div>
    `;
  },

  mount(root) {
    const state = store.state;
    root.querySelector('[data-new-rule-inline]')?.addEventListener('click', () => openRecurringForm());
    root.querySelectorAll('[data-edit-rule]').forEach((el) => {
      const open = (e) => {
        if (e.target.closest('button')) return;
        openRecurringForm(state.recurring.find((r) => r.id === el.dataset.editRule));
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
    });
    root.querySelectorAll('[data-toggle-rule]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const rule = state.recurring.find((r) => r.id === btn.dataset.toggleRule);
        const resuming = !rule.active;
        const patch = { ...rule, active: resuming };
        if (resuming) {
          // À la reprise, on ne rattrape pas les échéances de la période de pause.
          const past = occurrencesBetween({ ...rule, active: true }, rule.lastDate ? addDays(rule.lastDate, 1) : rule.startDate, addDays(todayISO(), -1), 5000);
          if (past.length) patch.lastDate = past[past.length - 1];
        }
        saveRecurring(patch);
        processRecurring();
        toast(resuming ? 'Récurrence reprise' : 'Récurrence suspendue');
      }),
    );
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
