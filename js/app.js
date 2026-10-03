// Point d'entrée : structure de la page, navigation, raccourcis clavier.
import { dueOccurrences } from './calc.js';
import { installTooltipHandlers, mountCharts, resetCharts } from './charts.js';
import { openTransactionForm } from './forms.js';
import { openImportDialog } from './importer.js';
import { openStartFresh } from './onboarding.js';
import { exportData, loadDemo, processRecurring, requestPersistence, store, updateSettings } from './store.js';
import { icon, offerFile, openModal, toast } from './ui.js';
import { currentMonth, daysBetween, html, raw, setMoneyConfig, shiftMonth, todayISO } from './utils.js';
import accounts from './views/accounts.js';
import budgets from './views/budgets.js';
import categories from './views/categories.js';
import dashboard from './views/dashboard.js';
import debts from './views/debts.js';
import goals from './views/goals.js';
import optimisation from './views/optimisation.js';
import recurring from './views/recurring.js';
import reports from './views/reports.js';
import settings from './views/settings.js';
import tools from './views/tools.js';
import transactions from './views/transactions.js';

const VIEWS = [dashboard, transactions, budgets, accounts, recurring, goals, debts, optimisation, reports, tools, categories, settings];
const BY_ID = new Map(VIEWS.map((v) => [v.id, v]));
const NAV = [
  ['Suivi', ['tableau-de-bord', 'transactions', 'budgets', 'comptes']],
  ['Planifier', ['recurrentes', 'objectifs', 'dettes']],
  ['Analyser', ['optimisation', 'rapports', 'simulateurs']],
  ['Réglages', ['categories', 'parametres']],
];
const TABS = ['tableau-de-bord', 'transactions', 'budgets', 'optimisation'];
const MONTH_VIEWS = new Set(['tableau-de-bord', 'budgets', 'transactions']);

const session = { month: currentMonth() };
let current = { view: dashboard, params: {} };
let storageOk = true;

/* ------------------------------------------------------------------ */
/* Routage                                                             */
/* ------------------------------------------------------------------ */

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [id, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { id: BY_ID.has(id) ? id : 'tableau-de-bord', params };
}

function navigate() {
  const { id, params } = parseHash();
  current = { view: BY_ID.get(id), params };
  current.view.enter?.(ctx());
  renderShell();
  renderView({ resetScroll: true });
}

function ctx() {
  return { state: store.state, params: current.params, session, rerender: () => renderView() };
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

function pendingCount() {
  const today = todayISO();
  return store.state.recurring.filter((r) => r.active && !r.autoCreate && dueOccurrences(r, today).length).length;
}

function navLink(id, { tab = false } = {}) {
  const view = BY_ID.get(id);
  const active = current.view.id === id;
  const badge = id === 'recurrentes' ? pendingCount() : 0;
  if (tab) {
    return html`<a class="tab" href="#${id}" ${active ? raw('aria-current="page"') : ''}>${icon(view.icon, { size: 22 })}<span>${view.tabLabel || shortTitle(view)}</span></a>`;
  }
  return html`<a class="nav-link" href="#${id}" ${active ? raw('aria-current="page"') : ''}>${icon(view.icon)}<span>${view.title}</span>${badge ? html`<span class="nav-badge" aria-label="${badge} à valider">${badge}</span>` : ''}</a>`;
}

function shortTitle(view) {
  return { 'tableau-de-bord': 'Accueil', transactions: 'Opérations' }[view.id] || view.title;
}

function renderShell() {
  const sidebar = document.getElementById('sidebar-nav');
  sidebar.innerHTML = String(html`${NAV.map(([label, ids]) => html`<p class="nav-section">${label}</p>${ids.map((id) => navLink(id))}`)}`);
  const tabbar = document.getElementById('tabbar');
  const inMore = !TABS.includes(current.view.id);
  tabbar.innerHTML = String(html`${TABS.map((id) => navLink(id, { tab: true }))}
    <button type="button" class="tab" id="tab-more" ${inMore ? raw('aria-current="page"') : ''}>${icon('menu', { size: 22 })}<span>${inMore ? shortTitle(current.view) : 'Plus'}</span></button>`);
  const privacy = store.state.settings.privacy;
  document.getElementById('privacy-toggle').innerHTML = String(icon(privacy ? 'eye-off' : 'eye'));
  document.getElementById('privacy-toggle').setAttribute('aria-pressed', privacy ? 'true' : 'false');
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  document.getElementById('theme-toggle').innerHTML = String(icon(dark ? 'sun' : 'moon'));
}

function renderBanners() {
  const el = document.getElementById('banners');
  const s = store.state.settings;
  el.innerHTML = String(html`
    ${!storageOk
      ? html`<div class="banner banner-warning">${icon('alert')}<p>Ce navigateur ne permet pas d'enregistrer vos données (navigation privée ?). Elles seront perdues à la fermeture : exportez une sauvegarde depuis les paramètres.</p></div>`
      : ''}
    ${store.saveFailed && storageOk
      ? html`<div class="banner banner-warning">${icon('alert')}<p>Le dernier enregistrement a échoué (espace de stockage plein ?). Exportez une sauvegarde depuis les paramètres pour ne rien perdre.</p></div>`
      : ''}
    ${s.demo
      ? html`<div class="banner" role="status">${icon('sparkle')}<p><strong>Données d'exemple.</strong> Explorez librement l'application : tout ce que vous voyez est fictif.</p><button type="button" class="btn btn-primary btn-sm" id="banner-start">Commencer avec mes données</button></div>`
      : backupDue(s)
        ? html`<div class="banner" role="status">${icon('download')}<p><strong>${s.lastBackup ? `Dernière sauvegarde il y a ${daysBetween(s.lastBackup, todayISO())} jours.` : 'Aucune sauvegarde de vos données.'}</strong> Elles ne sont enregistrées que dans ce navigateur : une sauvegarde régulière évite de tout perdre.</p><button type="button" class="btn btn-primary btn-sm" id="banner-backup">Sauvegarder</button><button type="button" class="btn btn-ghost btn-sm" id="banner-later">Plus tard</button></div>`
        : ''}`);
  el.hidden = !el.innerHTML.trim();
  el.querySelector('#banner-start')?.addEventListener('click', () => openStartFresh());
  el.querySelector('#banner-backup')?.addEventListener('click', () => {
    offerFile(`budget-sauvegarde-${todayISO()}.json`, exportData(), 'application/json');
    updateSettings({ lastBackup: todayISO() });
  });
  el.querySelector('#banner-later')?.addEventListener('click', () => updateSettings({ backupSnoozedUntil: shiftDate(todayISO(), 7) }));
}

/** Rappel de sauvegarde : tous les 30 jours dès qu'il y a de vraies données. */
function backupDue(s) {
  const today = todayISO();
  if (store.state.transactions.length < 20) return false;
  if (s.backupSnoozedUntil && s.backupSnoozedUntil > today) return false;
  return !s.lastBackup || daysBetween(s.lastBackup, today) >= 30;
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderView({ resetScroll = false } = {}) {
  const view = current.view;
  const context = ctx();
  const active = document.activeElement;
  const focusId = active && active.id && document.getElementById('view').contains(active) ? active.id : null;
  const caret = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  resetCharts();
  document.title = `${view.title} · Pécule`;
  document.getElementById('page-title').textContent = view.title;
  const bar = document.getElementById('topbar-actions');
  bar.innerHTML = String(view.actions?.(context) || '');
  view.topbarMount?.(bar, context);

  // Un nouvel élément à chaque rendu : les écouteurs de l'ancien disparaissent avec lui.
  const old = document.getElementById('view');
  const fresh = old.cloneNode(false);
  fresh.innerHTML = String(view.render(context));
  old.replaceWith(fresh);
  view.mount?.(fresh, context);
  mountCharts(fresh);
  renderBanners();

  if (resetScroll) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(caret[0], caret[1]);
        } catch {
          /* type de champ sans sélection */
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Thème et préférences                                                */
/* ------------------------------------------------------------------ */

let themeApplied = false;

function applySettings() {
  const s = store.state.settings;
  setMoneyConfig({ currency: s.currency, locale: s.locale });
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') {
    root.dataset.theme = s.theme;
    themeApplied = true;
  } else if (themeApplied) {
    // On ne retire que l'attribut posé par l'application.
    delete root.dataset.theme;
    themeApplied = false;
  }
  document.body.classList.toggle('privacy', !!s.privacy);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

/* ------------------------------------------------------------------ */
/* Événements globaux                                                  */
/* ------------------------------------------------------------------ */

function openMoreSheet() {
  const ids = VIEWS.map((v) => v.id).filter((id) => !TABS.includes(id));
  openModal({
    title: 'Toutes les rubriques',
    size: 'sm',
    body: html`<nav class="more-sheet">${ids.map((id) => {
      const v = BY_ID.get(id);
      return html`<a href="#${id}" data-close ${current.view.id === id ? raw('aria-current="page"') : ''}>${icon(v.icon, { size: 22 })}<span>${v.title}</span></a>`;
    })}</nav>`,
  });
}

function shiftSessionMonth(delta) {
  session.month = shiftMonth(session.month, delta);
  renderView();
}

function installGlobalHandlers() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-action="add-tx"]')) {
      e.preventDefault();
      const defaults = {};
      if (current.view.id === 'transactions' && current.params.account) defaults.accountId = current.params.account;
      openTransactionForm({ defaults });
      return;
    }
    if (t.closest('[data-import]')) {
      openImportDialog();
      return;
    }
    const shift = t.closest('[data-month-shift]');
    if (shift) {
      shiftSessionMonth(Number(shift.dataset.monthShift));
      return;
    }
    if (t.closest('#tab-more')) {
      openMoreSheet();
      return;
    }
    // Clic sur une ligne d'opération : modification.
    const row = t.closest('[data-tx]');
    if (row && !t.closest('input, button, a, label')) {
      const tx = store.state.transactions.find((x) => x.id === row.dataset.tx);
      if (tx) openTransactionForm({ tx });
    }
  });

  document.getElementById('privacy-toggle').addEventListener('click', () => updateSettings({ privacy: !store.state.settings.privacy }));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    updateSettings({ theme: dark ? 'light' : 'dark' });
  });

  let goPrefix = false;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if (goPrefix) {
      goPrefix = false;
      const map = { t: 'tableau-de-bord', o: 'transactions', b: 'budgets', c: 'comptes', r: 'rapports' };
      if (map[key]) {
        location.hash = `#${map[key]}`;
        e.preventDefault();
      }
      return;
    }
    if (key === 'g') {
      goPrefix = true;
      setTimeout(() => (goPrefix = false), 1200);
    } else if (key === 'n') {
      e.preventDefault();
      openTransactionForm();
    } else if (key === '/') {
      e.preventDefault();
      if (current.view.id !== 'transactions') location.hash = '#transactions';
      setTimeout(() => document.getElementById('tx-search')?.focus(), 50);
    } else if ((key === 'arrowleft' || key === 'arrowright') && MONTH_VIEWS.has(current.view.id) && !e.target.closest('.chart')) {
      shiftSessionMonth(key === 'arrowleft' ? -1 : 1);
    }
  });

  window.addEventListener('hashchange', navigate);
  document.addEventListener('visibilitychange', () => {
    // En arrière-plan, on enregistre tout de suite : un onglet mobile peut être fermé sans prévenir.
    if (document.visibilityState === 'hidden') {
      store.flush();
      return;
    }
    if (processRecurring() === 0) renderView();
  });
  window.addEventListener('pagehide', () => store.flush());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    applySettings();
    renderShell();
  });
}

function checkStorage() {
  try {
    const key = '__budget_test__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

async function boot() {
  await store.init();
  storageOk = store.storageKind === 'indexedDB' || checkStorage();
  // Première visite : on montre un exemple réaliste, clairement signalé.
  if (!store.state.settings.onboarded) loadDemo();
  applySettings();
  processRecurring();
  // Données réelles : on demande au navigateur de ne pas les effacer en cas de manque de place.
  if (!store.state.settings.demo) requestPersistence();

  store.subscribe((state, change) => {
    applySettings();
    renderShell();
    renderView();
  });

  installTooltipHandlers();
  installGlobalHandlers();
  navigate();
  document.getElementById('app').removeAttribute('aria-busy');

  registerServiceWorker();
}

/** Hors ligne et mises à jour : la nouvelle version est proposée, jamais imposée en pleine saisie. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http') || window.self !== window.top) return;
  // En développement local, on veut toujours les fichiers les plus récents.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const hadController = !!navigator.serviceWorker.controller;
  const offer = (worker) =>
    toast('Une nouvelle version de Pécule est disponible.', {
      action: { label: 'Mettre à jour', fn: () => worker.postMessage('SKIP_WAITING') },
      duration: 60000,
    });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && hadController) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    store.flush().finally(() => location.reload());
  });
}

boot();
