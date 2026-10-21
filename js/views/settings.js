// Paramètres : préférences, sauvegarde, restauration, remise à zéro.
import { CURRENCIES, REFERENCE } from '../defaults.js';
import { openImportDialog } from '../importer.js';
import { exportData, importData, loadDemo, requestPersistence, storageInfo, store, updateSettings } from '../store.js';
import { confirmDialog, icon, offerFile, options, pickFile, toast } from '../ui.js';
import { formatDate, formatMoney, formatNumber, html, pluralize, raw, todayISO } from '../utils.js';
import { openStartFresh } from '../onboarding.js';
import { AI_MODEL_LABEL, aiSettings, explainError, formatDollars as dollars, getApiKey, monthSpend, setApiKey, testApiKey } from '../ai.js';

function aiCard(state) {
  const ai = aiSettings(state);
  const key = getApiKey();
  const usage = state.settings.aiUsage;
  return html`<section class="card stack-v" id="ai-settings">
    <h2>Intelligence artificielle</h2>
    <p class="muted small">L’assistant et la lecture des captures utilisent ${AI_MODEL_LABEL}, le modèle le plus économique d’Anthropic, avec votre propre clé API, facturée à l’usage par Anthropic : environ 0,2 centime par question. Rien n’est envoyé tant que vous ne posez pas de question.</p>
    <label class="check"><input type="checkbox" id="ai-enabled" ${ai.enabled ? raw('checked') : ''}><span>Activer l’intelligence artificielle</span></label>
    <div class="field"><span class="label">Clé API Anthropic</span>
      <div class="row key-row">
        <input class="input" type="password" id="ai-key" autocomplete="off" spellcheck="false" placeholder="${key ? `Clé enregistrée (…${key.slice(-4)})` : 'sk-ant-…'}">
        <button type="button" class="btn" id="ai-key-save">${icon('check', { size: 16 })} ${key ? 'Remplacer' : 'Enregistrer'}</button>
        ${key ? html`<button type="button" class="btn btn-ghost" id="ai-key-remove">Retirer</button>` : ''}
      </div>
      <span class="hint">À créer sur <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (menu « API Keys »). Elle reste dans ce navigateur, n’est jamais incluse dans vos sauvegardes, et n’est envoyée qu’à Anthropic.</span>
    </div>
    <label class="field"><span>Plafond de dépense par mois</span>
      <div class="input-with-suffix"><input class="input" id="ai-cap" type="number" min="0" step="0.5" value="${ai.monthlyCap / 100}"><span class="suffix">$</span></div>
      <span class="hint">Pécule bloque les demandes au-delà (0 = sans plafond). Fixez aussi une limite dans la console Anthropic, qui seule fait foi.</span>
    </label>
    <label class="check"><input type="checkbox" id="ai-captures" ${ai.captures ? raw('checked') : ''}><span>Lire les captures d’écran avec Claude <span class="muted">(sinon, lecture gratuite sur l’appareil)</span></span></label>
    <p class="small">Ce mois-ci : <strong>${dollars(monthSpend(state))}</strong>${usage?.requests && usage.month === todayISO().slice(0, 7) ? ` (${pluralize(usage.requests, 'demande')})` : ''}${ai.monthlyCap > 0 ? ` sur ${dollars(ai.monthlyCap)} de plafond` : ''}.</p>
    <details class="disclosure"><summary>Ce qui est envoyé à Anthropic ${icon('down', { size: 14 })}</summary>
      <p class="small muted" style="margin-top:8px">Pour l’assistant : votre question, le prénom du foyer, et les résultats des calculs dont la réponse a besoin (totaux, budgets, et au plus 40 opérations pour une recherche). Pour la lecture : l’image de la capture. Par défaut, Anthropic n’utilise pas les données envoyées à son API pour entraîner ses modèles ; elles sont conservées un temps limité, notamment pour la sécurité. La conversation n’est pas enregistrée dans Pécule.</p>
    </details>
  </section>`;
}

export default {
  id: 'parametres',
  title: 'Paramètres',
  icon: 'settings',

  render({ state }) {
    const s = state.settings;
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
          <div class="row"><a class="btn" href="#categories">${icon('tag', { size: 16 })} Gérer les catégories</a></div>
        </section>

        <section class="card stack-v">
          <h2>Profil financier</h2>
          <p class="muted small">Ces réponses affinent les conseils de la rubrique « Optimisation ».</p>
          <label class="field"><span>Vos revenus sont</span><select class="select" id="set-stability">${options(
            [
              { value: 'stable', label: 'Réguliers (CDI, fonctionnaire, retraite)' },
              { value: 'variable', label: 'Variables (indépendant, intérim, CDD)' },
            ],
            s.incomeStability,
          )}</select><span class="hint">Épargne de précaution conseillée : ${REFERENCE.emergencyMonthsStable} mois de dépenses avec des revenus réguliers, ${REFERENCE.emergencyMonthsVariable} avec des revenus variables.</span></label>
          <label class="field"><span>Éligible au LEP ?</span><select class="select" id="set-lep">${options(
            [
              { value: 'unknown', label: 'Je ne sais pas' },
              { value: 'yes', label: 'Oui' },
              { value: 'no', label: 'Non' },
            ],
            s.lepEligible,
          )}</select><span class="hint">Revenu fiscal de référence 2024 inférieur ou égal à ${formatMoney(REFERENCE.lepIncomeLimitSingle, { decimals: false })} pour une part, ${formatMoney(REFERENCE.lepIncomeLimitCouple, { decimals: false })} pour un couple (plafonds 2026). Il figure sur votre avis d'imposition.</span></label>
        </section>

        ${aiCard(state)}

        <section class="card stack-v">
          <h2>Sauvegarde et données</h2>
          <p class="muted small">Vos données (${pluralize(state.transactions.length, 'opération')}) sont enregistrées uniquement dans ce navigateur. Exportez régulièrement une sauvegarde pour ne rien perdre et pour les transférer sur un autre appareil.${s.lastBackup ? ` Dernière sauvegarde : ${formatDate(s.lastBackup)}.` : ' Aucune sauvegarde pour le moment.'}</p>
          <div class="callout small" id="storage-status">${icon('info')}<div>Vérification du stockage…</div></div>
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
    root.querySelector('#set-stability').addEventListener('change', (e) => updateSettings({ incomeStability: e.target.value }));
    root.querySelector('#set-lep').addEventListener('change', (e) => updateSettings({ lepEligible: e.target.value }));
    root.querySelector('#set-backup').addEventListener('click', () => {
      offerFile(`budget-sauvegarde-${todayISO()}.json`, exportData(), 'application/json');
      updateSettings({ lastBackup: todayISO() });
    });
    // État du stockage (asynchrone) : support utilisé, protection contre l'effacement, espace occupé.
    const status = root.querySelector('#storage-status div');
    storageInfo().then((info) => {
      if (!status.isConnected) return;
      const where = info.kind === 'indexedDB' ? 'IndexedDB' : info.kind === 'localStorage' ? 'stockage local (limité à environ 5 Mo)' : 'inconnu';
      const used = info.usage != null ? ` · ${info.usage < 1048576 ? `${formatNumber(Math.max(1, info.usage / 1024))} Ko` : `${formatNumber(info.usage / 1048576, 1)} Mo`} utilisés` : '';
      const persisted =
        info.persisted === true
          ? 'Stockage persistant : le navigateur ne l’effacera pas pour libérer de la place.'
          : 'Stockage non garanti : le navigateur peut l’effacer s’il manque de place.';
      status.replaceChildren();
      const p1 = document.createElement('p');
      p1.textContent = `Enregistrement : ${where}${used}. ${persisted}`;
      const p2 = document.createElement('p');
      p2.textContent = "Sur iPhone et iPad, Safari efface les données d'un site non ouvert pendant 7 jours : ajoutez Pécule à l'écran d'accueil (Partager → Sur l'écran d'accueil) pour éviter cette suppression.";
      p2.className = 'muted';
      status.append(p1, p2);
      if (info.persisted === false && navigator.storage?.persist) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm';
        btn.textContent = 'Protéger mes données';
        btn.addEventListener('click', async () => {
          const ok = await requestPersistence();
          toast(ok ? 'Stockage protégé contre l’effacement automatique' : 'Le navigateur a refusé : installez l’application ou ajoutez-la à vos favoris, puis réessayez.');
        });
        status.append(btn);
      }
    });
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

    // Intelligence artificielle
    const ai = () => aiSettings(store.state);
    root.querySelector('#ai-enabled').addEventListener('change', (e) => {
      updateSettings({ ai: { ...ai(), enabled: e.target.checked } });
      if (e.target.checked && !getApiKey()) toast('Ajoutez maintenant votre clé API pour utiliser l’assistant.');
    });
    root.querySelector('#ai-captures').addEventListener('change', (e) => updateSettings({ ai: { ...ai(), captures: e.target.checked } }));
    root.querySelector('#ai-cap').addEventListener('change', (e) => {
      const value = Math.max(0, Number(String(e.target.value).replace(',', '.')) || 0);
      updateSettings({ ai: { ...ai(), monthlyCap: Math.round(value * 100) } });
    });
    const keyInput = root.querySelector('#ai-key');
    const saveKey = async () => {
      const key = keyInput.value.trim();
      if (!key) return toast('Collez d’abord votre clé API.', { tone: 'error' });
      const button = root.querySelector('#ai-key-save');
      button.disabled = true;
      button.textContent = 'Vérification…';
      try {
        const model = await testApiKey(key);
        if (!setApiKey(key)) return toast('Ce navigateur ne permet pas d’enregistrer la clé (navigation privée ?).', { tone: 'error' });
        updateSettings({ ai: { ...ai(), enabled: true } });
        toast(`Clé valide : ${model} est prêt. Essayez l’assistant !`, { action: { label: 'Ouvrir', fn: () => (location.hash = '#assistant') } });
      } catch (error) {
        toast(await explainError(error), { tone: 'error', duration: 8000 });
        button.disabled = false;
        button.textContent = 'Réessayer';
      }
    };
    root.querySelector('#ai-key-save').addEventListener('click', saveKey);
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveKey();
    });
    root.querySelector('#ai-key-remove')?.addEventListener('click', () => {
      setApiKey('');
      updateSettings({ ai: { ...ai(), enabled: false } });
      toast('Clé retirée de ce navigateur');
    });
  },
};

