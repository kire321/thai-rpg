// Service Worker for Thai RPG PWA
// BUILD_VERSION: 2026-07-13-01 — check all caches, don't delete old until new is populated
const CACHE_NAME = 'thai-rpg-2026-07-13-01';
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

// Install event: cache static assets, skip waiting
self.addEventListener('install', (event) => {
  console.log('[SW] Install, cache:', CACHE_NAME);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch((err) => {
        console.error('[SW] addAll failed:', err);
        swStats.lastError = 'install: ' + err.message;
      })
  );
});

// Activate event: claim clients but DO NOT delete old caches yet.
// Old caches are preserved until the new cache has been populated.
// They serve as a fallback for offline image loading.
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(self.clients.claim());
});

// Helper: find a cached response in ANY thai-rpg cache (current or old)
async function findInAnyCache(request) {
  const cacheNames = await caches.keys();
  const allCaches = cacheNames.filter((n) => n.startsWith('thai-rpg') && !n.includes('content'));

  // Search current cache first
  const currentCache = allCaches.find((n) => n === CACHE_NAME);
  if (currentCache) {
    const cache = await caches.open(currentCache);
    const match = await cache.match(request);
    if (match) return { response: match, cacheName: currentCache, isCurrent: true };
  }

  // Fall back to older caches
  for (const name of allCaches) {
    if (name === CACHE_NAME) continue;
    const cache = await caches.open(name);
    const match = await cache.match(request);
    if (match) return { response: match, cacheName: name, isCurrent: false };
  }

  return null;
}

// Helper: copy a response from an old cache to the current cache
async function migrateToCurrentCache(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    swStats.cacheWrites++;
    console.log('[SW] Migrated to current cache:', request.url);
  } catch (err) {
    console.error('[SW] Migration failed:', request.url, err.message);
  }
}

// Helper: try to cache a new response
async function tryCachePut(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    swStats.cacheWrites++;
    return true;
  } catch (err) {
    swStats.cacheWriteErrors++;
    swStats.lastError = 'cachePut: ' + err.message;
    console.error('[SW] cache.put failed:', request.url, err.message);
    return false;
  }
}

function isCacheable(response) {
  if (!response) return false;
  return response.status === 0 || response.status === 200;
}

// Fetch event: check ALL caches, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // CMS JSON data → content cache
  if (url.pathname.endsWith('.json') && (
    url.pathname.includes('content') || url.pathname.includes('episodes') ||
    url.pathname.includes('vocab') || url.pathname.includes('characters') ||
    url.pathname.includes('places') || url.pathname.includes('tags') ||
    url.pathname.includes('subplots')
  )) {
    event.respondWith(
      caches.open(CONTENT_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) { swStats.cacheHits++; return cached; }
        swStats.cacheMisses++;
        try {
          const resp = await fetch(request);
          if (isCacheable(resp)) await tryCachePut(request, resp);
          return resp;
        } catch (err) {
          swStats.fetchErrors++;
          return new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Everything else: check ALL caches, then network
  event.respondWith(
    findInAnyCache(request).then(async (found) => {
      if (found) {
        swStats.cacheHits++;
        console.log('[SW] Cache hit (' + (found.isCurrent ? 'current' : 'legacy ' + found.cacheName) + '):', request.url);

        // If found in old cache, migrate to current cache in background
        if (!found.isCurrent) {
          migrateToCurrentCache(request, found.response).catch(() => {});
        }
        return found.response;
      }

      swStats.cacheMisses++;
      swStats.networkFetches++;

      try {
        const networkResponse = await fetch(request);
        if (isCacheable(networkResponse)) {
          const toCache = networkResponse.clone();
          await tryCachePut(request, toCache);
        }
        return networkResponse;
      } catch (err) {
        swStats.fetchErrors++;
        swStats.lastError = 'fetch: ' + err.message;
        console.error('[SW] Fetch failed:', request.url, err.message);
        return new Response('Offline', { status: 503 });
      }
    })
  );
});

// Message handlers for diagnostics
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
    caches.keys().then(async (names) => {
      const result = {};
      for (const name of names) {
        if (!name.startsWith('thai-rpg') || name.includes('content')) continue;
        const cache = await caches.open(name);
        const keys = await cache.keys();
        result[name] = keys.map((r) => r.url);
      }
      event.source.postMessage({ type: 'SW_CACHE_LIST', caches: result });
    });
    return;
  }
  if (event.data === 'PURGE_OLD_CACHES') {
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith('thai-rpg') && n !== CACHE_NAME && !n.includes('content'))
          .map((n) => { console.log('[SW] Purging old cache:', n); return caches.delete(n); })
      )
    ).then(() => {
      event.source.postMessage({ type: 'PURGE_DONE' });
    });
    return;
  }
});
