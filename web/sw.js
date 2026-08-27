// App-Shell-Cache für die PWA — Netzwerk zuerst, Cache nur als Rückfall-
// ebene für den Offline-Fall. Wichtig: NICHT "Cache first", sonst bekommen
// Nutzer:innen nie automatisch die neueste Version, auch nicht nach einem
// harten Browser-Reload — ein Service Worker sitzt vor dem normalen
// HTTP-Cache und wird von "Cache umgehen"-Reloads nicht mit erfasst.
// Bewusst KEIN Caching der /api/status-Antworten — die Daten sollen bei
// jedem Öffnen frisch vom Proxy kommen.

const CACHE = 'heute-schule-v4';
// Impressum/Datenschutz/Über sind bewusst mit drin: Es sind Seiten mit
// gesetzlicher Vorhaltepflicht, und ohne Vorab-Caching wären sie offline nur
// erreichbar, wenn sie vorher schon einmal geöffnet wurden.
const SHELL = [
  './', './index.html', './theme.css', './manifest.webmanifest', './icon.svg',
  './impressum.html', './datenschutz.html', './ueber.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // API-Calls immer live vom Netzwerk, nie aus dem Cache.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        // Erfolgreiche Antwort zusätzlich im Cache ablegen, für den
        // Offline-Fall — aber nie statt der frischen Antwort ausliefern.
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
