// App-shell cache for the PWA — network first, cache only as a fallback
// layer for the offline case. Important: NOT "cache first", or users
// never automatically get the newest version, not even after a hard
// browser reload — a service worker sits in front of the normal HTTP
// cache and isn't caught by "bypass cache" reloads.
// Deliberately NO caching of /api/status responses — that data should
// come fresh from the proxy on every open.

const CACHE = 'heute-schule-v4';
// Impressum/Datenschutz/Über are deliberately included: they're pages
// with a legal obligation to be available, and without pre-caching they'd
// only be reachable offline if they'd already been opened once before.
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
  // API calls always live from the network, never from the cache.
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        // Also store a successful response in the cache, for the offline
        // case — but never serve it instead of a fresh response.
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
