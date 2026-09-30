// Import d'un relevé bancaire CSV : correspondance des colonnes, aperçu, doublons.
import { guessMapping, learnCategories, markDuplicates, parseCSV, rowsToTransactions } from './csv.js';
import { importTransactions, store } from './store.js';
import { accountOptions, icon, openModal, pickTextFile, toast } from './ui.js';
import { formatDate, formatMoney, html, pluralize, raw } from './utils.js';

const ROLES = [
  ['date', 'Date', true],
  ['description', 'Libellé', true],
  ['amount', 'Montant (signé)', false],
  ['debit', 'Débit', false],
  ['credit', 'Crédit', false],
  ['category', 'Catégorie', false],
  ['notes', 'Notes', false],
];

export async function openImportDialog() {
  const state = store.state;
  if (!state.accounts.length) {
    toast("Créez d'abord un compte.", { tone: 'error' });
    return;
  }
  const file = await pickTextFile('.csv,text/csv,.txt');
  if (!file) return;
  const rows = parseCSV(file.text);
  if (rows.length < 2) {
    toast('Le fichier ne contient pas de lignes exploitables.', { tone: 'error' });
    return;
  }
  const header = rows[0];
  const mapping = guessMapping(header);
  let hasHeader = true;
  let accountId = state.accounts.find((a) => !a.archived)?.id;
  let skipDuplicates = true;

  const columnSelect = (role, label) => html`<label class="field"><span>${label}</span><select class="select" data-role="${role}" id="imp-${role}">
      <option value="">—</option>
      ${header.map((h, i) => html`<option value="${i}" ${mapping[role] === i ? raw('selected') : ''}>${h || `Colonne ${i + 1}`}</option>`)}
    </select></label>`;

  const body = html`<div class="form">
    <p class="muted">Fichier <strong>${file.name}</strong> : ${pluralize(rows.length - 1, 'ligne')}. Vérifiez la correspondance des colonnes. Les montants négatifs sont des dépenses, les positifs des revenus.</p>
    <div class="form-row">
      <label class="field"><span>Importer dans le compte</span><select class="select" id="imp-account">${accountOptions(state.accounts, accountId)}</select></label>
      <div class="field"><span class="label">Options</span>
        <label class="check"><input type="checkbox" id="imp-header" checked><span>La 1re ligne contient les titres</span></label>
        <label class="check"><input type="checkbox" id="imp-dups" checked><span>Ignorer les doublons probables</span></label>
      </div>
    </div>
    <div class="form-row form-row-3">
      ${ROLES.map(([role, label]) => columnSelect(role, label))}
    </div>
    <div id="imp-preview"></div>
  </div>`;

  openModal({
    title: 'Importer un relevé CSV',
    size: 'lg',
    body,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="button" class="btn btn-primary" id="imp-go">${icon('upload', { size: 16 })} Importer</button>`,
    onMount(el, close) {
      const preview = el.querySelector('#imp-preview');
      const go = el.querySelector('#imp-go');
      let result = { transactions: [], errors: [] };

      const compute = () => {
        const converted = rowsToTransactions(rows, mapping, { accountId, categories: store.state.categories, hasHeader });
        const learned = learnCategories(converted.transactions, store.state.transactions);
        const marked = markDuplicates(learned, store.state.transactions);
        result = { transactions: marked, errors: converted.errors };
        const toImport = marked.filter((t) => !(skipDuplicates && t.duplicate));
        const dupCount = marked.filter((t) => t.duplicate).length;
        const cats = new Map(store.state.categories.map((c) => [c.id, c]));
        go.disabled = !toImport.length;
        go.lastChild.textContent = ` Importer ${toImport.length}`;
        const missing = mapping.date == null || (mapping.amount == null && mapping.debit == null && mapping.credit == null);
        preview.innerHTML = String(html`
          ${missing ? html`<div class="callout callout-warning">${icon('alert')}<div>Indiquez au minimum la colonne de date et celle du montant (ou débit / crédit).</div></div>` : ''}
          <div class="tx-summary" style="margin:6px 0 10px">
            <span><strong>${pluralize(toImport.length, 'opération')}</strong> à importer</span>
            ${dupCount ? html`<span>${pluralize(dupCount, 'doublon probable', 'doublons probables')}${skipDuplicates ? ' (ignorés)' : ''}</span>` : ''}
            ${result.errors.length ? html`<span class="neg">${pluralize(result.errors.length, 'ligne ignorée', 'lignes ignorées')}</span>` : ''}
          </div>
          <div class="preview-table"><table class="table">
            <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th class="num">Montant</th></tr></thead>
            <tbody>${marked.slice(0, 50).map(
              (t) => html`<tr class="${t.duplicate ? 'dup' : ''}" title="${t.duplicate ? 'Doublon probable' : ''}">
                <td>${formatDate(t.date, 'short')}</td>
                <td class="wrap">${t.description}</td>
                <td>${cats.get(t.categoryId)?.name || '—'}</td>
                <td class="num ${t.type === 'income' ? 'pos' : ''}">${t.type === 'income' ? formatMoney(t.amount, { sign: 'always' }) : formatMoney(-t.amount)}</td>
              </tr>`,
            )}</tbody>
          </table></div>
          ${marked.length > 50 ? html`<p class="muted small" style="margin-top:6px">Aperçu limité aux 50 premières lignes.</p>` : ''}
          ${result.errors.length ? html`<details class="disclosure" style="margin-top:10px"><summary>Voir les lignes ignorées ${icon('down', { size: 14 })}</summary><ul class="small muted">${result.errors.slice(0, 30).map((e) => html`<li>${e}</li>`)}</ul></details>` : ''}
        `);
      };

      el.querySelectorAll('[data-role]').forEach((sel) =>
        sel.addEventListener('change', () => {
          const role = sel.dataset.role;
          if (sel.value === '') delete mapping[role];
          else mapping[role] = Number(sel.value);
          compute();
        }),
      );
      el.querySelector('#imp-account').addEventListener('change', (e) => {
        accountId = e.target.value;
        compute();
      });
      el.querySelector('#imp-header').addEventListener('change', (e) => {
        hasHeader = e.target.checked;
        compute();
      });
      el.querySelector('#imp-dups').addEventListener('change', (e) => {
        skipDuplicates = e.target.checked;
        compute();
      });
      go.addEventListener('click', () => {
        const list = result.transactions.filter((t) => !(skipDuplicates && t.duplicate)).map(({ duplicate, ...t }) => t);
        if (!list.length) return;
        importTransactions(list);
        close();
        toast(`${pluralize(list.length, 'opération importée', 'opérations importées')}`, { action: { label: 'Annuler', fn: () => store.undo() } });
      });
      compute();
    },
  });
}
