// IntelliRX Service Worker
const CACHE_NAME = 'intellirx-cache-v1';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Install — pre-cache shell assets
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

// Fetch — network-first strategy (good for a data-heavy app like IntelliRX)
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and Firebase/API calls
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Don't cache Firebase, Google APIs, or external resources
  if (
    url.origin !== location.origin &&
    !url.hostname.includes('fonts.googleapis.com') &&
    !url.hostname.includes('fonts.gstatic.com')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fall back to cache if network fails
        return caches.match(event.request);
      })
  );
});
