// Import par capture d'écran de l'application bancaire : lecture sur l'appareil, aperçu modifiable.
import { aiReady, aiSettings, explainError, readCaptureWithClaude } from './ai.js';
import { guessCategory, mergeCaptures, parseCapture } from './capture.js';
import { learnCategories, markDuplicates } from './csv.js';
import { openImportDialog } from './importer.js';
import { ocrSupported, readImages, releaseOcr } from './ocr.js';
import { importTransactions, store, updateSettings } from './store.js';
import { accountOptions, categoryOptions, icon, openModal, toast } from './ui.js';
import { centsToInput, formatMoney, html, isValidISODate, parseAmount, pluralize, raw, todayISO } from './utils.js';

/** Choix de la source : capture d'écran ou relevé CSV. */
export function openImportChooser() {
  openModal({
    title: 'Importer des opérations',
    size: 'sm',
    body: html`<div class="import-choices">
      <button type="button" class="import-choice" data-choice="capture">${icon('image', { size: 24 })}<span><strong>Capture d’écran</strong><span class="muted small">de la liste des opérations dans l’application de votre banque</span></span></button>
      <button type="button" class="import-choice" data-choice="csv">${icon('upload', { size: 24 })}<span><strong>Relevé CSV</strong><span class="muted small">exporté depuis l’espace client de votre banque, pour tout un historique</span></span></button>
    </div>`,
    onMount(el, close) {
      el.querySelector('[data-choice="capture"]').addEventListener('click', () => {
        close();
        openCaptureImport();
      });
      el.querySelector('[data-choice="csv"]').addEventListener('click', () => {
        close();
        openImportDialog();
      });
    },
  });
}

/** Images d'un presse-papiers ou d'un glisser-déposer. */
export function imagesFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
}

export function openCaptureImport(initialFiles = []) {
  const state = store.state;
  const accounts = state.accounts.filter((a) => !a.archived);
  if (!accounts.length) {
    toast("Créez d'abord un compte.", { tone: 'error' });
    return;
  }
  if (!ocrSupported() && !aiReady()) {
    toast('Ce navigateur ne permet pas de lire les images. Utilisez un navigateur récent, ou importez un relevé CSV.', { tone: 'error' });
    return;
  }
  let accountId = (accounts.find((a) => a.type === 'courant') || accounts[0]).id;
  const parsed = []; // opérations lues, par capture
  const texts = [];
  let rows = []; // { include, date, description, amount (centimes signés), categoryId, signGuessed, duplicate }
  let busy = false;

  openModal({
    title: 'Importer une capture d’écran',
    size: 'lg',
    body: html`<div class="form capture">
      <label class="dropzone" for="cap-files" data-drop>
        ${icon('image', { size: 28 })}
        <strong data-pick-label>Choisir une ou plusieurs captures</strong>
        <span class="muted small">La liste des opérations dans l’application de votre banque. Vous pouvez aussi coller une image (Ctrl+V) ou la glisser ici.</span>
        <input type="file" id="cap-files" accept="image/*" multiple class="sr-only">
      </label>
      ${aiReady()
        ? html`<label class="check"><input type="checkbox" id="cap-ai" ${aiSettings().captures ? raw('checked') : ''}><span>Lire avec Claude <span class="muted">(plus fiable, environ 0,05 centime par capture)</span></span></label>`
        : ''}
      <p class="muted small privacy-note" data-privacy></p>
      <div class="capture-progress" data-progress hidden>
        <p class="small" data-progress-label>Préparation…</p>
        <div class="meter meter-ok" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Lecture des captures"><span class="meter-fill" data-progress-bar style="width:0%"></span></div>
      </div>
      <div data-result></div>
    </div>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="button" class="btn btn-primary" id="cap-go" disabled>${icon('check', { size: 16 })} <span>Ajouter</span></button>`,
    onClose: () => releaseOcr(),
    onMount(el, close) {
      const result = el.querySelector('[data-result]');
      const progress = el.querySelector('[data-progress]');
      const go = el.querySelector('#cap-go');
      const input = el.querySelector('#cap-files');

      const toRow = (r) => ({
        include: true,
        date: r.date,
        description: r.description,
        amount: r.type === 'income' ? r.amount : -r.amount,
        categoryId: r.categoryId ?? null,
        signGuessed: r.signGuessed,
        fresh: true,
      });

      // Catégories : d'abord l'historique (même libellé), puis les mots-clés ; doublons sur le compte choisi.
      // Une opération déjà saisie est décochée ; les autres choix de l'utilisateur sont conservés.
      const refresh = () => {
        const asTx = rows.map((r) => ({ type: r.amount < 0 ? 'expense' : 'income', amount: Math.abs(r.amount), date: r.date, description: r.description, accountId, categoryId: r.categoryId }));
        const learned = learnCategories(asTx, store.state.transactions);
        const marked = markDuplicates(learned, store.state.transactions);
        rows = rows.map((r, i) => {
          const duplicate = marked[i].duplicate;
          const categoryId = r.categoryId || marked[i].categoryId || guessCategory(r.description, marked[i].type);
          const include = r.fresh || r.duplicate !== duplicate ? !duplicate : r.include;
          return { ...r, categoryId, duplicate, include, fresh: false };
        });
      };

      const render = () => {
        const focused = document.activeElement?.id;
        const selected = rows.filter((r) => r.include && r.amount);
        go.disabled = busy || !selected.length;
        go.querySelector('span').textContent = selected.length ? `Ajouter ${pluralize(selected.length, 'opération')}` : 'Ajouter';
        if (!texts.length) {
          result.innerHTML = '';
          return;
        }
        const total = selected.reduce((s, r) => s + r.amount, 0);
        const dups = rows.filter((r) => r.duplicate).length;
        result.innerHTML = String(html`
          ${rows.length
            ? html`<div class="capture-head">
                <label class="field"><span>Ajouter dans le compte</span><select class="select" id="cap-account">${accountOptions(store.state.accounts, accountId)}</select></label>
                <p class="small"><strong>${pluralize(rows.length, 'opération trouvée', 'opérations trouvées')}</strong>${dups ? html` · ${pluralize(dups, 'déjà saisie', 'déjà saisies')} (décochée${dups > 1 ? 's' : ''})` : ''} · total sélectionné <strong class="money">${formatMoney(total, { sign: 'always' })}</strong></p>
              </div>
              <div class="table-wrap"><table class="table table-stack capture-table">
                <thead><tr><th>Libellé</th><th>Date</th><th>Catégorie</th><th class="num">Montant</th></tr></thead>
                <tbody>${rows.map(
                  (r, i) => html`<tr class="${r.include ? '' : 'is-off'}${r.duplicate ? ' dup' : ''}">
                    <td><div class="capture-label"><input type="checkbox" id="cap-inc-${i}" data-i="${i}" data-f="include" aria-label="Importer cette opération" ${r.include ? raw('checked') : ''}>
                      <input class="input input-sm" id="cap-desc-${i}" data-i="${i}" data-f="description" value="${r.description}" aria-label="Libellé">
                      ${r.duplicate ? html`<span class="pill pill-warning" title="Une opération de même date et même montant existe déjà">déjà saisie ?</span>` : ''}</div></td>
                    <td data-label="Date"><input class="input input-sm" type="date" id="cap-date-${i}" data-i="${i}" data-f="date" value="${r.date}"></td>
                    <td data-label="Catégorie"><select class="select input-sm" id="cap-cat-${i}" data-i="${i}" data-f="categoryId">${categoryOptions(store.state.categories, r.amount < 0 ? 'expense' : 'income', r.categoryId)}</select></td>
                    <td data-label="Montant" class="num"><div class="input-with-suffix capture-amount${r.signGuessed ? ' is-guessed' : ''}"><input class="input input-sm" id="cap-amt-${i}" data-i="${i}" data-f="amount" inputmode="decimal" value="${(r.amount < 0 ? '-' : '+') + centsToInput(Math.abs(r.amount))}" aria-label="Montant (négatif pour une dépense)" title="${r.signGuessed ? 'Signe non lu sur la capture : vérifiez (− dépense, + revenu)' : ''}"><span class="suffix">€</span></div></td>
                  </tr>`,
                )}</tbody>
              </table></div>
              <p class="muted small">Vérifiez les montants et les dates : la lecture automatique peut se tromper. Montant négatif = dépense, positif = revenu.${rows.some((r) => r.signGuessed) ? ' Les montants encadrés n’avaient pas de signe lisible : dépense par défaut, sauf salaire, remboursement, virement reçu…' : ''}</p>`
            : html`<div class="callout callout-warning">${icon('alert')}<div>Aucune opération reconnue. Essayez une capture plus nette, recadrée sur la liste des opérations (dates, libellés et montants visibles).</div></div>`}
          <details class="disclosure"><summary>Détail de la lecture ${icon('down', { size: 14 })}</summary><pre class="ocr-text">${texts.join('\n\n— — —\n\n')}</pre></details>
        `);
        if (focused) document.getElementById(focused)?.focus();
      };

      const run = async (files) => {
        if (!files.length || busy) return;
        busy = true;
        progress.hidden = false;
        const label = el.querySelector('[data-progress-label]');
        const bar = el.querySelector('[data-progress-bar]');
        render();
        const today = todayISO();
        const onDevice = async (list, offset = 0, count = list.length) => {
          const read = await readImages(list, ({ label: what, progress: p, index, reading }) => {
            const n = offset + index;
            label.textContent = `${count > 1 ? `Capture ${n + 1} sur ${count} : ` : ''}${what}${reading ? ` (${Math.round(p * 100)} %)` : '…'}`;
            bar.style.width = `${Math.round(((n + (reading ? p : 0)) / count) * 100)}%`;
          });
          return read.map((text) => ({ text, rows: parseCapture(text, { today }).rows }));
        };
        try {
          let results = [];
          if (el.querySelector('#cap-ai')?.checked) {
            // Lecture par Claude ; en cas d'échec, lecture sur l'appareil pour cette capture.
            for (let i = 0; i < files.length; i++) {
              label.textContent = `${files.length > 1 ? `Capture ${i + 1} sur ${files.length} : ` : ''}lecture par Claude…`;
              bar.style.width = `${Math.round(((i + 0.3) / files.length) * 100)}%`;
              try {
                const found = await readCaptureWithClaude(files[i], { today });
                const lines = found.map((r) => `${r.date}  ${r.description}  ${r.type === 'income' ? '+' : '-'}${(r.amount / 100).toFixed(2)} €`);
                results.push({ text: [`Lu par Claude : ${pluralize(found.length, 'opération')}`, ...lines].join('\n'), rows: found });
              } catch (error) {
                toast(`${await explainError(error)} Lecture sur l’appareil à la place.`, { tone: 'error', duration: 8000 });
                results.push(...(await onDevice([files[i]], i, files.length)));
              }
            }
          } else results = await onDevice(files);
          for (const r of results) {
            texts.push(r.text);
            parsed.push(r.rows);
          }
          // Les captures qui se chevauchent ne créent pas de doublons ; les choix déjà faits sont conservés.
          const merged = mergeCaptures(parsed);
          const known = new Map(rows.map((r) => [`${r.date}|${Math.abs(r.amount)}|${r.description}`, r]));
          rows = merged.map((r) => known.get(`${r.date}|${r.amount}|${r.description}`) || toRow(r));
          refresh();
          el.querySelector('[data-pick-label]').textContent = 'Ajouter une autre capture';
          // Une fois les opérations lues, la zone de dépôt se fait discrète : place à l'aperçu.
          el.querySelector('[data-drop]').classList.add('dropzone-compact');
          el.querySelector('.privacy-note').hidden = true;
        } catch (error) {
          console.error(error);
          toast('La lecture de la capture a échoué. Vérifiez votre connexion pour le premier chargement, puis réessayez.', { tone: 'error' });
        } finally {
          busy = false;
          progress.hidden = true;
          render();
        }
      };

      // Où l'image est lue : sur l'appareil, ou par Claude si l'option est cochée.
      const privacy = el.querySelector('[data-privacy]');
      const aiBox = el.querySelector('#cap-ai');
      const showPrivacy = () => {
        privacy.innerHTML = String(
          aiBox?.checked
            ? html`${icon('info', { size: 14 })} L’image est envoyée à Claude (Anthropic) pour être lue, puis vous vérifiez le résultat avant l’ajout.`
            : html`${icon('eye-off', { size: 14 })} L’image est lue sur votre appareil : elle n’est envoyée nulle part. La première lecture télécharge le moteur de lecture (environ 5 Mo), gardé ensuite en mémoire.`,
        );
      };
      aiBox?.addEventListener('change', () => {
        showPrivacy();
        updateSettings({ ai: { ...aiSettings(), captures: aiBox.checked } });
      });
      showPrivacy();

      input.addEventListener('change', () => {
        run([...input.files]);
        input.value = '';
      });
      el.addEventListener('paste', (e) => {
        const images = imagesFrom(e.clipboardData);
        if (images.length) {
          e.preventDefault();
          run(images);
        }
      });
      const drop = el.querySelector('[data-drop]');
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('is-over');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
        run(imagesFrom(e.dataTransfer));
      });

      result.addEventListener('change', (e) => {
        const t = e.target;
        if (t.id === 'cap-account') {
          accountId = t.value;
          refresh();
          return render();
        }
        const i = Number(t.dataset.i);
        const row = rows[i];
        if (!row) return;
        const field = t.dataset.f;
        if (field === 'include') row.include = t.checked;
        else if (field === 'description') row.description = t.value.trim();
        else if (field === 'date' && isValidISODate(t.value)) row.date = t.value;
        else if (field === 'categoryId') row.categoryId = t.value || null;
        else if (field === 'amount') {
          const value = parseAmount(t.value);
          if (value == null) return toast('Montant invalide', { tone: 'error' });
          // Sans signe saisi, on garde le sens d'origine.
          const signed = /^\s*[+-]/.test(t.value) ? value : Math.sign(row.amount || -1) * Math.abs(value);
          if (Math.sign(signed) !== Math.sign(row.amount)) row.categoryId = null;
          row.amount = signed;
          row.signGuessed = false;
          refresh();
        }
        render();
      });

      go.addEventListener('click', () => {
        const list = rows
          .filter((r) => r.include && r.amount)
          .map((r) => ({
            type: r.amount < 0 ? 'expense' : 'income',
            amount: Math.abs(r.amount),
            date: r.date,
            accountId,
            categoryId: r.categoryId,
            description: r.description,
            notes: '',
            tags: [],
            cleared: false,
          }));
        if (!list.length) return;
        importTransactions(list);
        close();
        toast(`${pluralize(list.length, 'opération ajoutée', 'opérations ajoutées')} depuis la capture`, { action: { label: 'Annuler', fn: () => store.undo() } });
      });

      if (initialFiles.length) run(initialFiles);
    },
  });
}
