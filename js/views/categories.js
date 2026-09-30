// Catégories de dépenses et de revenus : icône, couleur, groupe 50/30/20.
import { catBadge } from '../components.js';
import { CATEGORY_GROUPS, SWATCHES } from '../defaults.js';
import { deleteCategory, saveCategory, store } from '../store.js';
import { categoryOptions, emptyState, fieldError, formValues, icon, openModal, toast } from '../ui.js';
import { formatMoney, html, monthKey, pluralize, raw, todayISO } from '../utils.js';
import { bindEmojiPicker, emojiPicker } from './goals.js';

const ui = { tab: 'expense' };

function openCategoryForm(category = null, type = 'expense') {
  const editing = !!category;
  const v = { name: '', icon: '📦', color: SWATCHES[0], group: 'wants', type, ...(category || {}) };
  openModal({
    title: editing ? 'Modifier la catégorie' : 'Nouvelle catégorie',
    body: html`<form class="form" id="cat-form" novalidate>
      <label class="field"><span>Nom</span><input class="input" name="name" id="c-name" maxlength="40" required value="${v.name}"></label>
      ${editing
        ? ''
        : html`<div class="segmented" role="radiogroup" aria-label="Type">
            <label class="segmented-expense"><input type="radio" name="type" value="expense" ${v.type === 'expense' ? raw('checked') : ''}><span>Dépense</span></label>
            <label class="segmented-income"><input type="radio" name="type" value="income" ${v.type === 'income' ? raw('checked') : ''}><span>Revenu</span></label>
          </div>`}
      <fieldset class="field" data-group style="border:0;padding:0;margin:0" ${v.type === 'income' ? raw('hidden') : ''}>
        <legend class="label" style="font-size:.84rem;font-weight:600;color:var(--fg-2);margin-bottom:6px">Groupe (règle 50/30/20)</legend>
        ${Object.entries(CATEGORY_GROUPS).map(
          ([key, g]) => html`<label class="check"><input type="radio" name="group" value="${key}" ${v.group === key ? raw('checked') : ''}><span><strong>${g.label}</strong> <span class="muted">· ${g.hint}</span></span></label>`,
        )}
      </fieldset>
      ${emojiPicker('icon', v.icon)}
      <div class="field"><span class="label">Couleur</span>
        <input type="hidden" name="color" value="${v.color}">
        <div class="swatch-grid">${SWATCHES.map((c) => html`<button type="button" data-color="${c}" style="background:${c}" aria-pressed="${c === v.color ? 'true' : 'false'}" aria-label="Couleur ${c}"></button>`)}</div>
      </div>
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="cat-form" class="btn btn-primary">${editing ? 'Enregistrer' : 'Créer'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      bindEmojiPicker(el, 'icon');
      el.querySelectorAll('[data-color]').forEach((b) =>
        b.addEventListener('click', () => {
          el.querySelectorAll('[data-color]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          form.elements.color.value = b.dataset.color;
        }),
      );
      form.querySelectorAll('input[name=type]').forEach((r) =>
        r.addEventListener('change', () => {
          el.querySelector('[data-group]').hidden = formValues(form).type === 'income';
        }),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(form);
        const name = f.name.trim();
        const finalType = editing ? category.type : f.type;
        if (!name) return fieldError(form, 'name', 'Donnez un nom à la catégorie.');
        const duplicate = store.state.categories.some((c) => c.id !== category?.id && c.type === finalType && c.name.toLowerCase() === name.toLowerCase());
        if (duplicate) return fieldError(form, 'name', 'Une catégorie porte déjà ce nom.');
        saveCategory({ id: category?.id, name, icon: f.icon, color: f.color, type: finalType, group: finalType === 'income' ? null : f.group || 'wants' });
        toast(editing ? 'Catégorie modifiée' : 'Catégorie créée');
        close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', () => {
        close();
        openDeleteCategory(category);
      });
    },
  });
}

function openDeleteCategory(category) {
  const count = store.state.transactions.filter((t) => t.categoryId === category.id).length;
  openModal({
    title: `Supprimer « ${category.name} »`,
    size: 'sm',
    body: html`<form class="form" id="del-cat-form">
      <p class="muted">${count ? `${pluralize(count, 'opération utilise', 'opérations utilisent')} cette catégorie. Choisissez où les déplacer.` : 'Aucune opération n’utilise cette catégorie.'} Son budget éventuel sera supprimé.</p>
      ${count
        ? html`<label class="field"><span>Déplacer vers</span><select class="select" name="replacement" id="del-cat-target">${categoryOptions(
            store.state.categories.filter((c) => c.id !== category.id),
            category.type,
            '',
          )}</select></label>`
        : ''}
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="del-cat-form" class="btn btn-danger">Supprimer</button>`,
    onMount(el, close) {
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const replacement = formValues(e.target).replacement || null;
        deleteCategory(category.id, replacement);
        toast('Catégorie supprimée', { action: { label: 'Annuler', fn: () => store.undo() } });
        close();
      });
    },
  });
}

export default {
  id: 'categories',
  title: 'Catégories',
  icon: 'tag',

  actions() {
    return html`<button type="button" class="btn btn-primary" data-new-cat>${icon('plus', { size: 16 })} <span class="desktop-only">Nouvelle catégorie</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-new-cat]')?.addEventListener('click', () => openCategoryForm(null, ui.tab));
  },

  render({ state }) {
    const month = monthKey(todayISO());
    const stats = new Map();
    for (const t of state.transactions) {
      if (!t.categoryId) continue;
      const s = stats.get(t.categoryId) || { count: 0, month: 0 };
      s.count++;
      if (monthKey(t.date) === month) s.month += t.amount;
      stats.set(t.categoryId, s);
    }
    const list = state.categories.filter((c) => c.type === ui.tab).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const groups = ui.tab === 'expense' ? Object.entries(CATEGORY_GROUPS) : [[null, { label: 'Revenus' }]];

    return html`
      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${ui.tab === 'expense' ? 'true' : 'false'}" data-tab="expense">Dépenses (${state.categories.filter((c) => c.type === 'expense').length})</button>
        <button type="button" role="tab" aria-selected="${ui.tab === 'income' ? 'true' : 'false'}" data-tab="income">Revenus (${state.categories.filter((c) => c.type === 'income').length})</button>
      </div>
      ${list.length
        ? groups.map(([key, g]) => {
            const items = list.filter((c) => (key ? c.group === key : true));
            if (!items.length) return '';
            return html`<section class="card card-flush">
              <div class="card-header"><div><h2>${g.label}</h2>${g.hint ? html`<p class="sub">${g.hint}</p>` : ''}</div></div>
              <ul class="item-list">${items.map((c) => {
                const s = stats.get(c.id) || { count: 0, month: 0 };
                return html`<li class="item item-clickable" data-edit-cat="${c.id}" tabindex="0">
                  ${catBadge(c)}
                  <div class="item-body"><div class="item-title">${c.name}</div><div class="item-sub"><span>${pluralize(s.count, 'opération')}</span>${s.count ? html`<a href="#transactions?category=${c.id}&all=1" data-stop>Voir</a>` : ''}</div></div>
                  <div class="item-side"><strong class="money">${formatMoney(s.month)}</strong><span class="muted small">ce mois-ci</span></div>
                </li>`;
              })}</ul>
            </section>`;
          })
        : html`<section class="card">${emptyState({ iconName: 'tag', title: 'Aucune catégorie', action: html`<button type="button" class="btn btn-primary" data-new-cat-inline>Créer une catégorie</button>` })}</section>`}
    `;
  },

  mount(root, { rerender }) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.tab = b.dataset.tab;
        rerender();
      }),
    );
    root.querySelector('[data-new-cat-inline]')?.addEventListener('click', () => openCategoryForm(null, ui.tab));
    root.querySelectorAll('[data-edit-cat]').forEach((el) => {
      const open = (e) => {
        if (e.target.closest('[data-stop]')) return;
        openCategoryForm(store.state.categories.find((c) => c.id === el.dataset.editCat));
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => e.key === 'Enter' && open(e));
    });
  },
};
