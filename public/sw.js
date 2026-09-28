/**
 * EasperWeb Service Worker
 * Provides offline capabilities, asset caching (including webfonts and 21MB ONNX WASM binaries),
 * and automatic Cross-Origin-Isolation (COOP/COEP) header injection for multi-threaded CPU execution.
 */

const CACHE_NAME = 'easper-web-v4';

// Static entry assets and webfonts to pre-cache immediately upon installation
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './webfonts/fa-solid-900.woff2',
  './webfonts/fa-regular-400.woff2',
  './webfonts/fa-brands-400.woff2',
  './webfonts/fa-v4compatibility.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching core application shell and webfonts...');
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              await cache.put(url, res);
              console.log('[SW] Pre-cached:', url);
            } else {
              console.warn('[SW] Pre-cache HTTP status for', url, res.status);
            }
          } catch (err) {
            console.warn('[SW] Pre-cache fetch failed for', url, err);
          }
        })
      );
    })
  );
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name.startsWith('easper-web-'))
          .map((name) => {
            console.log('[SW] Clearing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy
 * headers into navigation (document) responses so that window.crossOriginIsolated
 * remains active offline or on static hosts.
 */
function attachNavigationIsolationHeaders(response) {
  if (!response || response.type === 'opaque' || response.status === 0) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Injects Cross-Origin-Resource-Policy and CORS headers into subresource
 * responses to prevent Chromium COEP blockage on fonts, WASM, and scripts.
 */
function attachSubresourceHeaders(response, url) {
  if (!response || response.type === 'opaque' || response.status === 0) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
  newHeaders.set('Access-Control-Allow-Origin', '*');

  if (url && url.pathname && url.pathname.endsWith('.woff2') && !newHeaders.has('Content-Type')) {
    newHeaders.set('Content-Type', 'font/woff2');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Helper to match known Font Awesome fonts by filename in cache
 * even if requested with a Vite asset hash or varying relative path.
 */
async function matchFontFallback(cache, pathname) {
  if (pathname.includes('fa-solid')) {
    return (await cache.match('./webfonts/fa-solid-900.woff2')) || (await cache.match('/webfonts/fa-solid-900.woff2'));
  }
  if (pathname.includes('fa-regular')) {
    return (await cache.match('./webfonts/fa-regular-400.woff2')) || (await cache.match('/webfonts/fa-regular-400.woff2'));
  }
  if (pathname.includes('fa-brands')) {
    return (await cache.match('./webfonts/fa-brands-400.woff2')) || (await cache.match('/webfonts/fa-brands-400.woff2'));
  }
  if (pathname.includes('fa-v4compatibility')) {
    return (await cache.match('./webfonts/fa-v4compatibility.woff2')) || (await cache.match('/webfonts/fa-v4compatibility.woff2'));
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests and http/https schemes
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // In local development, bypass Service Worker caching completely so Vite HMR and dynamic modules are untouched
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // 1. Navigation request (HTML document) -> Network first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', cloned));
          return attachNavigationIsolationHeaders(networkResponse);
        })
        .catch(async () => {
          console.log('[SW] Offline navigate fallback to cached index.html');
          const cached = (await caches.match('./index.html')) || (await caches.match('./'));
          if (cached) {
            return attachNavigationIsolationHeaders(cached);
          }
          return new Response('<h1>Offline</h1><p>EasperWeb is ready offline once cached.</p>', {
            headers: { 'Content-Type': 'text/html' },
          });
        })
    );
    return;
  }

  // 2. Webfonts (.woff2, destination === 'font', or /webfonts/*) -> Dedicated cache-first with fallback
  if (
    request.destination === 'font' ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.includes('/webfonts/')
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        let response = await cache.match(request);
        if (!response) {
          // Check static pre-cached fallback by font style name
          response = await matchFontFallback(cache, url.pathname);
        }
        if (response) {
          return attachSubresourceHeaders(response, url);
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return attachSubresourceHeaders(networkResponse, url);
        } catch (err) {
          console.warn('[SW] Font fetch failed, attempting cached fallback:', url.pathname);
          const fallback = await matchFontFallback(cache, url.pathname);
          if (fallback) {
            return attachSubresourceHeaders(fallback, url);
          }
          throw err;
        }
      })()
    );
    return;
  }

  // 3. Static Vite assets & WASM binaries (/assets/*) -> Cache first, fallback to network
  if (
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return attachSubresourceHeaders(cachedResponse, url);
        }

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
            }
            return attachSubresourceHeaders(networkResponse, url);
          })
          .catch((fetchErr) => {
            console.warn('[SW] Static asset fetch failed:', url.pathname, fetchErr);
            return cachedResponse || new Response('Asset unavailable offline', { status: 503 });
          });
      })
    );
    return;
  }

  // 4. All other same-origin requests -> Stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
            }
            return attachSubresourceHeaders(networkResponse, url);
          })
          .catch(() => cachedResponse);

        return cachedResponse ? attachSubresourceHeaders(cachedResponse, url) : fetchPromise;
      })
    );
    return;
  }
});
