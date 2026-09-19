// Progressive Web App Service Worker for BPA Office / Remix: Aplicações BPA
// Designed for 100% off-grid reliability in field operations and low-spec smartphones

const CACHE_NAME = 'bpa-app-cache-v4';

// Critical core assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/vendor/pdfjs/pdf.min.js',
  '/vendor/pdfjs/pdf.worker.min.js'
];

// Offline fallback tile for map canvas when offline (clean SVG tile)
const OFFLINE_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#1b231a" stroke="#2c362a" stroke-width="1"/>
  <line x1="0" y1="128" x2="256" y2="128" stroke="#253024" stroke-width="1" stroke-dasharray="4,4"/>
  <line x1="128" y1="0" x2="128" y2="256" stroke="#253024" stroke-width="1" stroke-dasharray="4,4"/>
  <text x="128" y="132" font-family="monospace" font-size="10" fill="#4b5d49" text-anchor="middle">OFFLINE</text>
</svg>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add precache assets gracefully so failure of any single asset does not abort install
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Falha ao precachear asset:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removendo cache antigo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Navigation (HTML Pages) - Network First with offline Cache Fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const indexCached = await caches.match('/index.html');
          if (indexCached) return indexCached;
          return caches.match('/');
        })
    );
    return;
  }

  // 2. Same-Origin Assets (Vite JS bundles, CSS, images, vendor libraries)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // Stale-While-Revalidate for local assets
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => null);

        // Return cached version immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise.then((resp) => {
          if (resp) return resp;
          // If neither cache nor network worked, and it's a script/style, return empty 200 or 404
          return new Response('', { status: 404, statusText: 'Offline Asset Not Found' });
        });
      })
    );
    return;
  }

  // 3. Map Tiles (OpenStreetMap, Google Maps, Esri Satellite)
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('mt1.google.com') ||
    url.hostname.includes('server.arcgisonline.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback: Return SVG placeholder tile
            return new Response(OFFLINE_TILE_SVG, {
              headers: { 'Content-Type': 'image/svg+xml' }
            });
          });
      })
    );
    return;
  }

  // 4. External CDNs (Fonts, Icons, Cloudflare)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => new Response('', { status: 404, statusText: 'Offline' }));
      })
    );
    return;
  }
});
