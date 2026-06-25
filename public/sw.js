// Service Worker for Thai RPG Staging PWA
// BUILD_VERSION: 2026-06-23-01 — multi-tag acts, staging CMS
const CACHE_NAME = 'thai-rpg-staging-v1';
const CONTENT_CACHE_NAME = 'thai-rpg-content-v1'; // Cache API cache for CMS content
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-512x512.png',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: Clean up old caches but PRESERVE the content cache
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== CONTENT_CACHE_NAME)
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

// Fetch: Serve from cache or network
// For navigation (index.html): network-first, fallback to cache
// For assets (JS/CSS/JSON): cache-first, fallback to network, fallback to index.html for offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const isNavigation = request.mode === 'navigate';
  const isAsset = request.url.includes('/assets/') || request.url.match(/\.(js|css|png|json)$/);

  if (isNavigation) {
    // Network-first for HTML: try server, fall back to cached index.html
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html').then((cached) => {
          if (cached) return cached;
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
    return;
  }

  // For assets: cache-first, then network, then fallback
  // For images, try URL-only matching first (bypasses request attribute mismatches)
  const isImage = request.url.match(/\.(png|jpg|jpeg)$/);
  const cacheMatch = isImage
    ? caches.match(request.url).then((cached) => cached || caches.match(request))
    : caches.match(request);

  event.respondWith(
    cacheMatch.then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Cache GET requests with successful (200) or opaque (status 0, cross-origin no-cors) responses
        if (request.method !== 'GET' || !response || (response.status !== 200 && response.type !== 'opaque')) {
          return response;
        }
        // Clone response to cache it (use URL string as key for images to ensure future matches)
        const responseToCache = response.clone();
        const cacheKey = isImage ? request.url : request;
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(cacheKey, responseToCache);
        });
        return response;
      }).catch(() => {
        // Network failed, no cache match
        console.log('[SW] Network fetch failed for:', request.url);
        // For HTML-like requests, return cached index.html (SPA fallback)
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
        // For everything else, return a 404
        return new Response('Not found offline', { status: 404, statusText: 'Not Found' });
      });
    })
  );
});

// Message handler for skipWaiting only
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
