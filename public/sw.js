// IntelliRX Service Worker
const CACHE_NAME = 'intellirx-cache-v2';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Install — pre-cache static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests over http/https
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Always fetch navigation requests (HTML) fresh from network — never serve
  // from cache. This keeps Angular's client-side routing working correctly
  // and prevents stale index.html from breaking route changes.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        // If offline and no network, return a minimal offline response
        new Response('Offline — please check your connection.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );
    return;
  }

  // Skip Firebase, Google APIs, and other external origins
  // (except Google Fonts which we can cache)
  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (url.origin !== location.origin && !isGoogleFont) {
    return; // let browser handle external requests natively
  }

  // For same-origin static assets (JS, CSS, images) and Google Fonts:
  // network-first, fall back to cache. Always return a valid Response.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() =>
        // Fall back to cache; if nothing cached, return a 503 (never undefined)
        caches.match(event.request).then(
          (cached) =>
            cached ||
            new Response('Resource unavailable offline.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' },
            })
        )
      )
  );
});

