// Objectifs d'épargne : cible, échéance, versements et projection.
import { goalStats } from '../calc.js';
import { meter } from '../charts.js';
import { kpi, statusPill } from '../components.js';
import { EMOJIS } from '../defaults.js';
import { amountField } from '../forms.js';
import { addContribution, deleteContribution, deleteGoal, saveGoal, store } from '../store.js';
import { confirmDialog, emptyState, fieldError, formValues, icon, openModal, toast } from '../ui.js';
import { formatDate, formatMoney, formatPercent, html, isValidISODate, monthLabel, monthKey, parseAmount, sum, todayISO, uid } from '../utils.js';

export function emojiPicker(name, selected) {
  return html`<div class="field"><span class="label">Icône</span>
    <input type="hidden" name="${name}" value="${selected}">
    <div class="emoji-grid" role="group" aria-label="Choisir une icône">
      ${EMOJIS.map((e) => html`<button type="button" data-emoji="${e}" aria-pressed="${e === selected ? 'true' : 'false'}" aria-label="${e}">${e}</button>`)}
    </div></div>`;
}

export function bindEmojiPicker(el, name) {
  const input = el.querySelector(`input[name="${name}"]`);
  el.querySelectorAll('[data-emoji]').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-emoji]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      input.value = b.dataset.emoji;
    }),
  );
}

function openGoalForm(goal = null) {
  const editing = !!goal;
  const v = { name: '', icon: '🎯', target: null, deadline: '', ...(goal || {}) };
  openModal({
    title: editing ? "Modifier l'objectif" : 'Nouvel objectif',
    body: html`<form class="form" id="goal-form" novalidate>
      <label class="field"><span>Nom</span><input class="input" name="name" id="g-name" maxlength="60" required placeholder="Ex. : Fonds d'urgence, Vacances, Apport" value="${v.name}"></label>
      <div class="form-row">
        ${amountField({ name: 'target', label: 'Montant visé', value: v.target })}
        <label class="field"><span>Échéance <span class="muted">(facultatif)</span></span><input class="input" type="date" name="deadline" id="g-deadline" value="${v.deadline || ''}"></label>
      </div>
      ${editing ? '' : amountField({ name: 'initial', label: 'Déjà épargné', value: null, required: false, hint: 'Montant déjà mis de côté pour cet objectif.' })}
      ${emojiPicker('icon', v.icon)}
    </form>`,
    footer: html`${editing ? html`<button type="button" class="btn btn-ghost spacer" data-delete>${icon('trash', { size: 16 })} Supprimer</button>` : ''}
      <button type="button" class="btn btn-ghost" data-close>Annuler</button>
      <button type="submit" form="goal-form" class="btn btn-primary">${editing ? 'Enregistrer' : "Créer l'objectif"}</button>`,
    onMount(el, close) {
      bindEmojiPicker(el, 'icon');
      const form = el.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(form);
        const target = parseAmount(f.target);
        if (!f.name.trim()) return fieldError(form, 'name', "Donnez un nom à l'objectif.");
        if (target == null || target <= 0) return fieldError(form, 'target', 'Indiquez un montant supérieur à zéro.');
        if (f.deadline && !isValidISODate(f.deadline)) return fieldError(form, 'deadline', 'Date invalide.');
        const data = { id: goal?.id, name: f.name.trim(), icon: f.icon, target, deadline: f.deadline || null };
        if (!editing) {
          const initial = f.initial ? parseAmount(f.initial) : 0;
          data.contributions = initial > 0 ? [{ id: uid('ctb-'), date: todayISO(), amount: initial, note: 'Montant de départ' }] : [];
          data.archived = false;
        }
        saveGoal(data);
        toast(editing ? 'Objectif modifié' : 'Objectif créé');
        close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog({ title: "Supprimer l'objectif", message: `« ${goal.name} » et son historique de versements seront supprimés.`, confirmLabel: 'Supprimer', danger: true })) {
          deleteGoal(goal.id);
          toast('Objectif supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
        }
      });
    },
  });
}

function openContribution(goal, withdraw = false) {
  openModal({
    title: withdraw ? `Retirer de « ${goal.name} »` : `Verser sur « ${goal.name} »`,
    size: 'sm',
    body: html`<form class="form" id="ctb-form" novalidate>
      ${amountField({ label: withdraw ? 'Montant retiré' : 'Montant versé', big: true })}
      <label class="field"><span>Date</span><input class="input" type="date" name="date" id="c-date" value="${todayISO()}"></label>
      <label class="field"><span>Note <span class="muted">(facultatif)</span></span><input class="input" name="note" id="c-note" maxlength="100"></label>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="ctb-form" class="btn btn-primary">${withdraw ? 'Retirer' : 'Verser'}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(form);
        const amount = parseAmount(f.amount);
        if (amount == null || amount <= 0) return fieldError(form, 'amount', 'Indiquez un montant supérieur à zéro.');
        if (!isValidISODate(f.date)) return fieldError(form, 'date', 'Date invalide.');
        addContribution(goal.id, { amount: withdraw ? -amount : amount, date: f.date, note: f.note.trim() });
        const stats = goalStats(store.state.goals.find((g) => g.id === goal.id));
        toast(stats.done ? `Bravo, l'objectif « ${goal.name} » est atteint !` : withdraw ? 'Retrait enregistré' : 'Versement enregistré');
        close();
      });
    },
  });
}

export default {
  id: 'objectifs',
  title: "Objectifs d'épargne",
  icon: 'target',

  actions() {
    return html`<button type="button" class="btn btn-primary" data-new-goal>${icon('plus', { size: 16 })} <span class="desktop-only">Nouvel objectif</span></button>`;
  },

  topbarMount(bar) {
    bar.querySelector('[data-new-goal]')?.addEventListener('click', () => openGoalForm());
  },

  render({ state }) {
    const today = todayISO();
    const goals = state.goals;
    if (!goals.length) {
      return html`<section class="card">${emptyState({
        iconName: 'target',
        title: "Aucun objectif d'épargne",
        text: 'Fonds d’urgence, vacances, apport immobilier… Fixez un montant et une échéance : on calcule ce qu’il faut mettre de côté chaque mois.',
        action: html`<button type="button" class="btn btn-primary" data-new-goal-inline>${icon('plus', { size: 16 })} Créer un objectif</button>`,
      })}</section>`;
    }
    const stats = new Map(goals.map((g) => [g.id, goalStats(g, today)]));
    const totalSaved = sum(goals, (g) => stats.get(g.id).saved);
    const totalTarget = sum(goals, (g) => g.target);
    const monthlyNeeded = sum(goals, (g) => stats.get(g.id).monthlyNeeded || 0);
    const done = goals.filter((g) => stats.get(g.id).done).length;

    return html`
      <section class="kpis kpis-cards">
        ${kpi('Épargné au total', formatMoney(totalSaved), html`<span class="kpi-delta">${formatPercent(totalTarget ? totalSaved / totalTarget : 0)} de ${formatMoney(totalTarget)}</span>`)}
        ${kpi('Effort mensuel nécessaire', formatMoney(monthlyNeeded), html`<span class="kpi-delta">Pour tenir toutes les échéances</span>`)}
        ${kpi('Objectifs atteints', `${done} / ${goals.length}`)}
      </section>
      <div class="cards">
        ${goals.map((g) => {
          const s = stats.get(g.id);
          const history = [...g.contributions].sort((a, b) => (a.date < b.date ? 1 : -1));
          return html`<article class="card tile">
            <div class="tile-head">
              <span class="cat-badge" style="--c:#1baf7a" aria-hidden="true">${g.icon}</span>
              <div class="grow"><h3>${g.name}</h3><p class="muted small">${g.deadline ? `Échéance : ${formatDate(g.deadline)}` : 'Sans échéance'}</p></div>
              <button type="button" class="icon-btn icon-btn-sm" data-edit-goal="${g.id}" aria-label="Modifier ${g.name}">${icon('edit', { size: 16 })}</button>
            </div>
            <div class="row-between"><span class="tile-value money">${formatMoney(s.saved)}</span><span class="muted money">sur ${formatMoney(g.target)}</span></div>
            ${meter(s.ratio, s.done ? 'done' : s.overdue ? 'warning' : 'ok', g.name)}
            <div class="row">${s.done ? statusPill('done') : html`<span class="pill">${formatPercent(s.ratio)}</span>`}${s.overdue ? html`<span class="pill pill-warning">${icon('alert', { size: 12 })} Échéance dépassée</span>` : ''}</div>
            <dl class="stat-list">
              <div><dt>Reste à épargner</dt><dd class="money">${formatMoney(s.remaining)}</dd></div>
              <div><dt>Par mois</dt><dd class="money">${s.monthlyNeeded ? formatMoney(s.monthlyNeeded) : '—'}</dd></div>
              <div><dt>Mois restants</dt><dd>${s.monthsLeft ?? '—'}</dd></div>
              <div><dt>Au rythme actuel</dt><dd>${s.done ? 'Atteint' : s.projectedDate ? monthLabel(monthKey(s.projectedDate)) : '—'}</dd></div>
            </dl>
            <div class="row">
              <button type="button" class="btn btn-sm btn-primary" data-contribute="${g.id}">${icon('plus', { size: 14 })} Verser</button>
              <button type="button" class="btn btn-sm" data-withdraw="${g.id}">${icon('minus', { size: 14 })} Retirer</button>
            </div>
            ${history.length
              ? html`<details class="disclosure"><summary>Historique (${history.length}) ${icon('down', { size: 14 })}</summary>
                  <div class="table-wrap"><table class="table"><tbody>${history.map(
                    (c) => html`<tr><td>${formatDate(c.date, 'short')}</td><td class="wrap muted">${c.note || ''}</td><td class="num ${c.amount < 0 ? 'neg' : ''}">${formatMoney(c.amount, { sign: 'always' })}</td>
                      <td class="num"><button type="button" class="icon-btn icon-btn-sm" data-del-ctb="${g.id}|${c.id}" aria-label="Supprimer ce versement">${icon('trash', { size: 14 })}</button></td></tr>`,
                  )}</tbody></table></div></details>`
              : ''}
          </article>`;
        })}
      </div>`;
  },

  mount(root) {
    const find = (id) => store.state.goals.find((g) => g.id === id);
    root.querySelector('[data-new-goal-inline]')?.addEventListener('click', () => openGoalForm());
    root.querySelectorAll('[data-edit-goal]').forEach((b) => b.addEventListener('click', () => openGoalForm(find(b.dataset.editGoal))));
    root.querySelectorAll('[data-contribute]').forEach((b) => b.addEventListener('click', () => openContribution(find(b.dataset.contribute))));
    root.querySelectorAll('[data-withdraw]').forEach((b) => b.addEventListener('click', () => openContribution(find(b.dataset.withdraw), true)));
    root.querySelectorAll('[data-del-ctb]').forEach((b) =>
      b.addEventListener('click', () => {
        const [goalId, ctbId] = b.dataset.delCtb.split('|');
        deleteContribution(goalId, ctbId);
        toast('Versement supprimé', { action: { label: 'Annuler', fn: () => store.undo() } });
      }),
    );
  },
};

