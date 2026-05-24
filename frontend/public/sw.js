// EcoTrace Service Worker
// Strategy: Cache-first for app shell, network-first for API
const CACHE     = 'ecotrace-v1';
const APP_SHELL = ['/', '/index.html', '/src/main.jsx'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls — network only (never cache)
  if (url.pathname.startsWith('/api')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline — request queued' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    return;
  }

  // App shell — cache first, fall back to network
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
