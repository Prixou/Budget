// Composants d'interface : icônes, fenêtres modales, notifications, formulaires.
import { html, raw } from './utils.js';

/* ------------------------------------------------------------------ */
/* Icônes (traits 24×24)                                               */
/* ------------------------------------------------------------------ */

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5z"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  debt: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h.01M12 18h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  bank: '<path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3l9 5H3z"/>',
  piggy: '<path d="M19 9.5c1 .5 2 1.5 2 2.5M5 11a7 6 0 0 1 12-2.5h1.5L20 7v4l-1.5 1.5a7 6 0 0 1-2.5 3V18h-3v-1.5a8 8 0 0 1-3 0V18H7v-2.5A6 6 0 0 1 5 11z"/><circle cx="15.5" cy="10.5" r=".5"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  swap: '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  scale: '<path d="M12 3v18M5 21h14M3 7h18M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

export function icon(name, { size = 20, label = '' } = {}) {
  const body = PATHS[name] || PATHS.info;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return raw(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`,
  );
}

/* ------------------------------------------------------------------ */
/* Fenêtre modale                                                      */
/* ------------------------------------------------------------------ */

let modalCounter = 0;

/**
 * Ouvre une fenêtre modale.
 * options : { title, body (SafeHTML), footer (SafeHTML), size: 'sm'|'md'|'lg', onMount(el, close) }
 * Retourne la fonction de fermeture.
 */
export function openModal({ title, body, footer = '', size = 'md', onMount, onClose }) {
  const id = `modal-${++modalCounter}`;
  const dialog = document.createElement('dialog');
  dialog.className = `modal modal-${size}`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = String(html`
    <div class="modal-inner">
      <header class="modal-header">
        <h2 id="${id}-title">${title}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('x')}</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? html`<footer class="modal-footer">${footer}</footer>` : ''}
    </div>`);
  document.body.appendChild(dialog);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    onClose?.();
  };
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    // Clic sur le fond (hors du contenu)
    if (e.target === dialog) close();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.showModal();
  onMount?.(dialog, close);
  const first = dialog.querySelector('[autofocus], .modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  return close;
}

/** Confirmation (remplace window.confirm). */
export function confirmDialog({ title = 'Confirmer', message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      size: 'sm',
      body: html`<p class="confirm-message">${message}</p>`,
      footer: html`<button type="button" class="btn btn-ghost" data-close>Annuler</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmLabel}</button>`,
      onMount(el, close) {
        el.querySelector('[data-confirm]').addEventListener('click', () => {
          answered = true;
          resolve(true);
          close();
        });
        el.querySelector('[data-confirm]').focus();
      },
      onClose() {
        if (!answered) resolve(false);
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export function toast(message, { action = null, duration = 4500, tone = 'default' } = {}) {
  let region = document.getElementById('toasts');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toasts';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.fn();
      el.remove();
    });
    el.appendChild(btn);
  }
  region.appendChild(el);
  // Trois notifications au plus : les plus anciennes laissent la place.
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), duration);
}

/* ------------------------------------------------------------------ */
/* Formulaires                                                         */
/* ------------------------------------------------------------------ */

/** Valeurs d'un formulaire sous forme d'objet (cases à cocher → booléens). */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

export function fieldError(form, name, message) {
  const input = form.elements[name];
  const field = input?.closest?.('.field') || input?.[0]?.closest?.('.field');
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  if (!field) {
    toast(message, { tone: 'error' });
    return;
  }
  const err = document.createElement('p');
  err.className = 'field-error';
  err.textContent = message;
  field.appendChild(err);
  if (input.setAttribute) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

export function options(list, selected, { placeholder = null } = {}) {
  return html`${placeholder != null ? html`<option value="">${placeholder}</option>` : ''}${list.map(
    (o) => html`<option value="${o.value}" ${String(o.value) === String(selected ?? '') ? raw('selected') : ''}>${o.label}</option>`,
  )}`;
}

export function categoryOptions(categories, type, selected, { placeholder = 'Non catégorisé' } = {}) {
  const list = categories
    .filter((c) => c.type === type)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  return options(list, selected, { placeholder });
}

export function accountOptions(accounts, selected, { includeArchived = false, placeholder = null } = {}) {
  const list = accounts.filter((a) => includeArchived || !a.archived || a.id === selected).map((a) => ({ value: a.id, label: a.name }));
  return options(list, selected, { placeholder });
}

/* ------------------------------------------------------------------ */
/* Export de fichiers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Propose un fichier : téléchargement direct et, en secours, le contenu à copier
 * (certains navigateurs intégrés bloquent les téléchargements).
 */
export function offerFile(filename, content, mime = 'text/plain') {
  let downloaded = false;
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    downloaded = true;
  } catch {
    downloaded = false;
  }
  openModal({
    title: 'Exporter',
    size: 'md',
    body: html`<p class="muted">${downloaded ? html`Le fichier <strong>${filename}</strong> a été proposé au téléchargement. S'il n'apparaît pas, copiez son contenu ci-dessous.` : html`Copiez le contenu ci-dessous et enregistrez-le sous le nom <strong>${filename}</strong>.`}</p>
      <textarea class="export-text" readonly rows="10" id="export-text">${content.length > 400000 ? content.slice(0, 400000) + '\n…' : content}</textarea>`,
    footer: html`<button type="button" class="btn btn-ghost" data-close>Fermer</button><button type="button" class="btn btn-primary" data-copy>${icon('copy', { size: 16 })} Copier</button>`,
    onMount(el) {
      el.querySelector('[data-copy]').addEventListener('click', async () => {
        const area = el.querySelector('textarea');
        try {
          await navigator.clipboard.writeText(content);
          toast('Contenu copié dans le presse-papiers');
        } catch {
          area.select();
          toast('Sélectionné : utilisez Ctrl+C / Cmd+C pour copier');
        }
      });
    },
  });
}

/** Lit un fichier choisi par l'utilisateur. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

/** Détecte l'encodage Windows-1252 courant dans les exports bancaires. */
export function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
      resolve({ name: file.name, text });
    });
    input.click();
  });
}

export function emptyState({ iconName = 'info', title, text, action = '' }) {
  return html`<div class="empty">
    <span class="empty-icon">${icon(iconName, { size: 28 })}</span>
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ''}
    ${action}
  </div>`;
}
