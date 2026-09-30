// Paramètres : préférences, sauvegarde, restauration, remise à zéro.
import { CURRENCIES } from '../defaults.js';
import { openImportDialog } from '../importer.js';
import { exportData, importData, loadDemo, store, updateSettings } from '../store.js';
import { confirmDialog, icon, offerFile, options, pickFile, toast } from '../ui.js';
import { formatNumber, html, pluralize, raw, todayISO } from '../utils.js';
import { openStartFresh } from '../onboarding.js';

export default {
  id: 'parametres',
  title: 'Paramètres',
  icon: 'settings',

  render({ state }) {
    const s = state.settings;
    const size = new Blob([JSON.stringify(state)]).size;
    return html`
      <div class="grid grid-2">
        <section class="card stack-v">
          <h2>Préférences</h2>
          <label class="field"><span>Devise</span><select class="select" id="set-currency">${options(
            CURRENCIES.map((c) => ({ value: c.code, label: c.label })),
            s.currency,
          )}</select><span class="hint">Change uniquement l'affichage : les montants ne sont pas convertis.</span></label>
          <label class="field"><span>Thème</span><select class="select" id="set-theme">${options(
            [
              { value: 'auto', label: 'Automatique (selon le système)' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ],
            s.theme,
          )}</select></label>
          <label class="field"><span>Alerte de budget à partir de</span>
            <div class="input-with-suffix"><input class="input" id="set-alert" type="number" min="50" max="100" step="5" value="${s.budgetAlert}"><span class="suffix">%</span></div>
            <span class="hint">Un budget passe en « bientôt atteint » au-delà de ce seuil.</span>
          </label>
          <label class="check"><input type="checkbox" id="set-privacy" ${s.privacy ? raw('checked') : ''}><span>Mode discret <span class="muted">(montants floutés, visibles au survol)</span></span></label>
        </section>

        <section class="card stack-v">
          <h2>Sauvegarde et données</h2>
          <p class="muted small">Vos données sont enregistrées uniquement dans ce navigateur (${formatNumber(size / 1024, 1)} Ko, ${pluralize(state.transactions.length, 'opération')}). Exportez régulièrement une sauvegarde pour ne rien perdre et pour les transférer sur un autre appareil.</p>
          <div class="row">
            <button type="button" class="btn btn-primary" id="set-backup">${icon('download', { size: 16 })} Exporter une sauvegarde</button>
            <button type="button" class="btn" id="set-restore">${icon('upload', { size: 16 })} Restaurer</button>
          </div>
          <div class="row">
            <button type="button" class="btn" id="set-import-csv">${icon('upload', { size: 16 })} Importer un relevé CSV</button>
            <a class="btn" href="#transactions?all=1">${icon('download', { size: 16 })} Exporter les opérations (CSV)</a>
          </div>
          <hr style="border:0;border-top:1px solid var(--border);margin:6px 0">
          <div class="row">
            <button type="button" class="btn" id="set-demo">${icon('sparkle', { size: 16 })} Charger l'exemple</button>
            <button type="button" class="btn btn-danger" id="set-reset">${icon('trash', { size: 16 })} Tout effacer</button>
          </div>
        </section>
      </div>

      <section class="card stack-v">
        <h2>Raccourcis clavier</h2>
        <div class="table-wrap"><table class="table">
          <tbody>
            <tr><td><kbd>N</kbd></td><td class="wrap">Nouvelle opération</td></tr>
            <tr><td><kbd>/</kbd></td><td class="wrap">Rechercher dans les opérations</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td class="wrap">Mois précédent / suivant (tableau de bord, budgets, opérations)</td></tr>
            <tr><td><kbd>G</kbd> puis <kbd>T</kbd>, <kbd>O</kbd>, <kbd>B</kbd>, <kbd>C</kbd>, <kbd>R</kbd></td><td class="wrap">Aller au tableau de bord, aux opérations, aux budgets, aux comptes, aux rapports</td></tr>
          </tbody>
        </table></div>
      </section>`;
  },

  mount(root) {
    root.querySelector('#set-currency').addEventListener('change', (e) => updateSettings({ currency: e.target.value }));
    root.querySelector('#set-theme').addEventListener('change', (e) => updateSettings({ theme: e.target.value }));
    root.querySelector('#set-alert').addEventListener('change', (e) => {
      const v = Math.min(100, Math.max(50, Number(e.target.value) || 80));
      updateSettings({ budgetAlert: v });
    });
    root.querySelector('#set-privacy').addEventListener('change', (e) => updateSettings({ privacy: e.target.checked }));
    root.querySelector('#set-backup').addEventListener('click', () => offerFile(`budget-sauvegarde-${todayISO()}.json`, exportData(), 'application/json'));
    root.querySelector('#set-restore').addEventListener('click', async () => {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      let data;
      try {
        data = JSON.parse(file.text);
      } catch {
        toast("Ce fichier n'est pas une sauvegarde valide (JSON illisible).", { tone: 'error' });
        return;
      }
      const ok = await confirmDialog({
        title: 'Restaurer la sauvegarde',
        message: `Les données actuelles seront remplacées par celles de « ${file.name} ».`,
        confirmLabel: 'Restaurer',
        danger: true,
      });
      if (!ok) return;
      try {
        importData(data);
        toast('Sauvegarde restaurée', { action: { label: 'Annuler', fn: () => store.undo() } });
      } catch (err) {
        toast(err.message || 'Sauvegarde invalide', { tone: 'error' });
      }
    });
    root.querySelector('#set-import-csv').addEventListener('click', () => openImportDialog());
    root.querySelector('#set-demo').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: "Charger l'exemple", message: "Vos données actuelles seront remplacées par un jeu d'exemple. Pensez à exporter une sauvegarde avant.", confirmLabel: 'Charger', danger: true });
      if (!ok) return;
      loadDemo();
      toast("Données d'exemple chargées", { action: { label: 'Annuler', fn: () => store.undo() } });
    });
    root.querySelector('#set-reset').addEventListener('click', () => openStartFresh());
  },
};

