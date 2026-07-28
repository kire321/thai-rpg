// Service Worker for Thai RPG PWA
// BUILD_VERSION: 2026-07-28-02 — durable GitHub Pages hosting: relative precache paths + same-origin CMS
const CACHE_NAME = 'thai-rpg-2026-07-28-02';
const CONTENT_CACHE_NAME = 'thai-rpg-content-v1';

// Assets to cache on install. Each is cached INDIVIDUALLY so one failure
// doesn't block the others. Missing files are skipped gracefully.
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icon-512x512.png',
];

// In-memory stats for diagnostics (reset on SW restart)
const swStats = {
  cacheHits: 0,
  cacheMisses: 0,
  networkFetches: 0,
  cacheWriteErrors: 0,
  cacheWrites: 0,
  fetchErrors: 0,
  installErrors: [],
  lastError: null,
};

// Install event: cache static assets one-by-one, skip waiting.
// Unlike cache.addAll() which is atomic (one failure = total failure),
// this approach caches whatever succeeds and logs what fails.
self.addEventListener('install', (event) => {
  console.log('[SW] Install, cache:', CACHE_NAME);
  self.skipWaiting();
  swStats.installErrors = [];

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        STATIC_ASSETS.map(async (url) => {
          try {
            const resp = await fetch(url);
            if (resp.ok || resp.status === 0) {
              await cache.put(url, resp);
              console.log('[SW] Cached:', url);
            } else {
              console.warn('[SW] Skipped (status ' + resp.status + '):', url);
              swStats.installErrors.push(url + ': ' + resp.status);
            }
          } catch (err) {
            console.warn('[SW] Skipped (fetch error):', url, err.message);
            swStats.installErrors.push(url + ': ' + err.message);
          }
        })
      );
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      console.log('[SW] Install complete:', succeeded, '/', STATIC_ASSETS.length, 'assets cached');
      if (swStats.installErrors.length > 0) {
        swStats.lastError = 'install: ' + swStats.installErrors.join(', ');
      }
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

// The CMS sends "Vary: Origin". Cache matching then compares the REQUEST's
// Origin header — which differs between <img crossorigin> requests (Origin
// present), page cache.match(url) calls (no Origin), and SW-constructed
// Requests (no Origin). Entries cached via one path become invisible to the
// others: images that ARE cached still 503 offline.
// Fix: strip Vary when writing (new entries match any request for the URL)
// and match with ignoreVary (legacy entries stay readable).
function stripVaryHeader(response) {
  // Opaque responses can't be inspected or rebuilt — store as-is
  if (!response || response.type === 'opaque' || response.status === 0) return response;
  if (!response.headers.get('vary')) return response;
  const headers = new Headers(response.headers);
  headers.delete('vary');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Helper: find a cached response in ANY thai-rpg cache (current or old)
async function findInAnyCache(request) {
  const cacheNames = await caches.keys();
  const allCaches = cacheNames.filter((n) => n.startsWith('thai-rpg') && !n.includes('content'));

  // Search current cache first
  const currentCache = allCaches.find((n) => n === CACHE_NAME);
  if (currentCache) {
    const cache = await caches.open(currentCache);
    const match = await cache.match(request, { ignoreVary: true });
    if (match) return { response: match, cacheName: currentCache, isCurrent: true };
  }

  // Fall back to older caches
  for (const name of allCaches) {
    if (name === CACHE_NAME) continue;
    const cache = await caches.open(name);
    const match = await cache.match(request, { ignoreVary: true });
    if (match) return { response: match, cacheName: name, isCurrent: false };
  }

  return null;
}

// Helper: copy a response from an old cache to the current cache
async function migrateToCurrentCache(request, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, stripVaryHeader(response.clone()));
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
    await cache.put(request, stripVaryHeader(response.clone()));
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

  // CMS JSON data → content cache.
  // NETWORK-FIRST so online users always get fresh content (the page adds a
  // ?t= cache-buster; we strip it when caching so entries stay matchable).
  // Offline, fall back to a cached copy ignoring query params.
  if (url.pathname.endsWith('.json') && (
    url.pathname.includes('content') || url.pathname.includes('episodes') ||
    url.pathname.includes('vocab') || url.pathname.includes('characters') ||
    url.pathname.includes('places') || url.pathname.includes('tags') ||
    url.pathname.includes('subplots')
  )) {
    // Normalize: cache under the URL WITHOUT the ?t= cache-buster
    const cleanUrl = url.origin + url.pathname;
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(request);
          swStats.networkFetches++;
          if (isCacheable(resp)) {
            try {
              const cache = await caches.open(CONTENT_CACHE_NAME);
              await cache.put(cleanUrl, stripVaryHeader(resp.clone()));
              swStats.cacheWrites++;
            } catch (err) {
              swStats.cacheWriteErrors++;
            }
          }
          return resp;
        } catch (err) {
          // Offline: serve cached copy (ignore the ?t= cache-buster)
          const cache = await caches.open(CONTENT_CACHE_NAME);
          const cached = await cache.match(cleanUrl, { ignoreSearch: true, ignoreVary: true }) || await cache.match(request, { ignoreSearch: true, ignoreVary: true });
          if (cached) { swStats.cacheHits++; return cached; }
          swStats.cacheMisses++;
          swStats.fetchErrors++;
          return new Response('Offline', { status: 503 });
        }
      })()
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

// Bulk-cache a list of URLs (used for image prefetch/repair).
// Each URL is handled INDIVIDUALLY: already-cached URLs are skipped,
// failures don't block the rest, and every URL is retried once.
// Reports progress back to the requesting client when done.
async function cacheUrls(urls, client) {
  const unique = [...new Set(urls)];
  const results = { total: unique.length, alreadyCached: 0, cached: [], failed: [] };
  for (const url of unique) {
    try {
      const existing = await findInAnyCache(url);
      if (existing) { results.alreadyCached++; continue; }
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          const resp = await fetch(new Request(url, { mode: 'cors' }));
          swStats.networkFetches++;
          if (isCacheable(resp)) {
            ok = await tryCachePut(url, resp);
          }
        } catch (err) {
          swStats.fetchErrors++;
          console.warn('[SW] CACHE_URLS fetch failed (attempt ' + (attempt + 1) + '):', url, err.message);
        }
      }
      if (ok) results.cached.push(url);
      else results.failed.push(url);
    } catch (err) {
      results.failed.push(url);
    }
  }
  console.log('[SW] CACHE_URLS done:', results.cached.length, 'cached,', results.alreadyCached, 'already,', results.failed.length, 'failed');
  if (client) {
    client.postMessage({ type: 'CACHE_URLS_DONE', results });
  }
}

// Message handlers for diagnostics and bulk caching
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'GET_SW_STATS') {
    event.source.postMessage({ type: 'SW_STATS', stats: swStats });
    return;
  }
  if (event.data && event.data.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    // Keep the SW alive until the bulk caching job finishes
    event.waitUntil(cacheUrls(event.data.urls, event.source));
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
