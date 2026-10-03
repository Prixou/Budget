// Service worker : démarrage instantané depuis le cache, y compris hors ligne.
// Stratégie (web.dev, « Update » des PWA) : les fichiers de l'application sont
// précachés à l'installation ; une nouvelle version s'installe en arrière-plan
// et l'application propose de recharger, sans interrompre une saisie en cours.
// VERSION est remplacée par l'identifiant du commit lors du déploiement.
const VERSION = 'dev';
const CACHE = `pecule-${VERSION}`;
const FONTS = 'pecule-polices';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/calc.js',
  'js/charts.js',
  'js/components.js',
  'js/csv.js',
  'js/defaults.js',
  'js/demo.js',
  'js/forms.js',
  'js/importer.js',
  'js/insights.js',
  'js/onboarding.js',
  'js/store.js',
  'js/ui.js',
  'js/utils.js',
  'js/views/accounts.js',
  'js/views/budgets.js',
  'js/views/categories.js',
  'js/views/dashboard.js',
  'js/views/debts.js',
  'js/views/goals.js',
  'js/views/optimisation.js',
  'js/views/recurring.js',
  'js/views/reports.js',
  'js/views/settings.js',
  'js/views/tools.js',
  'js/views/transactions.js',
];

self.addEventListener('install', (event) => {
  // « reload » contourne le cache HTTP pour ne pas précacher d'anciens fichiers.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// L'application demande l'activation quand l'utilisateur accepte la mise à jour.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Polices Google : cache d'abord (elles ne changent pas).
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Fichiers de l'application : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() => (request.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    }),
  );
});
