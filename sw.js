// Service worker : fonctionnement hors ligne (réseau d'abord, cache en secours).
const CACHE = 'pecule-v1';
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
  'js/views/recurring.js',
  'js/views/reports.js',
  'js/views/settings.js',
  'js/views/tools.js',
  'js/views/transactions.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Polices Google : cache d'abord.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Application : réseau d'abord pour rester à jour, cache si hors ligne.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
