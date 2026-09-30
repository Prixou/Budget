// Démarrage : quitter les données d'exemple et créer son premier compte.
import { CURRENCIES } from './defaults.js';
import { amountField } from './forms.js';
import { startFresh, store } from './store.js';
import { fieldError, formValues, icon, openModal, options, toast } from './ui.js';
import { html, parseAmount } from './utils.js';

export function openStartFresh() {
  const demo = store.state.settings.demo;
  openModal({
    title: demo ? 'Commencer avec mes données' : 'Tout effacer',
    size: 'sm',
    body: html`<form class="form" id="fresh-form" novalidate>
      <div class="callout ${demo ? '' : 'callout-danger'}">${icon(demo ? 'info' : 'alert')}<div>${demo
        ? "Les données d'exemple seront effacées. Les catégories par défaut sont conservées."
        : 'Toutes vos données (comptes, opérations, budgets, objectifs) seront effacées. Exportez une sauvegarde avant si besoin.'}</div></div>
      <label class="field"><span>Nom de votre compte principal</span><input class="input" name="accountName" id="fresh-name" value="Compte courant" maxlength="60"></label>
      ${amountField({ name: 'initialBalance', label: 'Solde actuel de ce compte', value: null, required: false, hint: "Le solde affiché aujourd'hui par votre banque." })}
      <label class="field"><span>Devise</span><select class="select" name="currency" id="fresh-currency">${options(
        CURRENCIES.map((c) => ({ value: c.code, label: c.label })),
        store.state.settings.currency,
      )}</select></label>
    </form>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" form="fresh-form" class="btn ${demo ? 'btn-primary' : 'btn-danger'}">${demo ? 'Commencer' : 'Effacer et recommencer'}</button>`,
    onMount(el, close) {
      el.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = formValues(e.target);
        const balance = f.initialBalance.trim() ? parseAmount(f.initialBalance) : 0;
        if (balance == null) return fieldError(e.target, 'initialBalance', 'Montant invalide.');
        startFresh({ accountName: f.accountName.trim() || 'Compte courant', initialBalance: balance, currency: f.currency });
        close();
        location.hash = '#tableau-de-bord';
        toast('C’est parti ! Ajoutez votre première opération avec le bouton +', {
          action: { label: 'Annuler', fn: () => store.undo() },
          duration: 6000,
        });
      });
    },
  });
}
