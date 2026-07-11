// Service Worker for Thai RPG PWA
// BUILD_VERSION: 2026-07-11-01 — SW cache reliability fix + diagnostics
const CACHE_NAME = 'thai-rpg-2026-07-11-01';
const CONTENT_CACHE_NAME = 'thai-rpg-content-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// In-memory stats for diagnostics (reset on SW restart)
const swStats = {
  cacheHits: 0,
  cacheMisses: 0,
  networkFetches: 0,
  cacheWriteErrors: 0,
  cacheWrites: 0,
  fetchErrors: 0,
  lastError: null,
};

// Install event: cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event, cache:', CACHE_NAME);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching', STATIC_ASSETS.length, 'static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.error('[SW] Cache addAll failed:', err);
        swStats.lastError = 'install: ' + err.message;
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('thai-rpg-') && name !== CACHE_NAME && name !== CONTENT_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Helper: try to cache a response, with error handling
async function tryCachePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    swStats.cacheWrites++;
    return true;
  } catch (err) {
    swStats.cacheWriteErrors++;
    swStats.lastError = 'cachePut: ' + err.message;
    console.error('[SW] cache.put failed for', request.url, ':', err.message);
    return false;
  }
}

// Helper: check if a response is cacheable
function isCacheable(response) {
  if (!response) return false;
  // Status 0 = opaque response (cross-origin, no CORS headers)
  // Status 200 = OK
  // We accept both — opaque responses can still be displayed in <img> tags
  if (response.status === 0 || response.status === 200) return true;
  return false;
}

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Handle content caching for CMS JSON data (Cache API)
  if (url.pathname.endsWith('.json') && (
    url.pathname.includes('content') ||
    url.pathname.includes('episodes') ||
    url.pathname.includes('vocab') ||
    url.pathname.includes('characters') ||
    url.pathname.includes('places') ||
    url.pathname.includes('tags') ||
    url.pathname.includes('subplots')
  )) {
    event.respondWith(
      caches.open(CONTENT_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          swStats.cacheHits++;
          return cached;
        }
        swStats.cacheMisses++;
        try {
          const networkResponse = await fetch(request);
          if (isCacheable(networkResponse)) {
            await tryCachePut(CONTENT_CACHE_NAME, request, networkResponse);
          }
          return networkResponse;
        } catch (err) {
          swStats.fetchErrors++;
          console.error('[SW] Fetch failed for JSON:', request.url, err.message);
          return new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Cache-first for all other requests (images, JS, CSS, HTML, etc.)
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        swStats.cacheHits++;
        return cached;
      }
      swStats.cacheMisses++;
      swStats.networkFetches++;

      try {
        const networkResponse = await fetch(request);

        // Cache successful responses (including opaque CORS responses)
        if (isCacheable(networkResponse)) {
          // Clone BEFORE trying to cache — response can only be consumed once
          const responseToCache = networkResponse.clone();
          await tryCachePut(CACHE_NAME, request, responseToCache);
        } else {
          console.log('[SW] Not cacheable:', request.url, 'status:', networkResponse.status);
        }

        return networkResponse;
      } catch (err) {
        swStats.fetchErrors++;
        swStats.lastError = 'fetch: ' + err.message;
        console.error('[SW] Network fetch failed:', request.url, err.message);
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })
  );
});

// Message handling: respond to diagnostic queries from the app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data === 'GET_SW_STATS') {
    event.source.postMessage({ type: 'SW_STATS', stats: swStats });
    return;
  }

  if (event.data === 'GET_SW_CACHE_LIST') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      const urls = keys.map(r => r.url);
      event.source.postMessage({ type: 'SW_CACHE_LIST', urls });
    }).catch(err => {
      event.source.postMessage({ type: 'SW_CACHE_LIST', urls: [], error: err.message });
    });
    return;
  }
});
