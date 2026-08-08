const CACHE_NAME = 'bpa-app-cache-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', '/index.html']).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Cache requests to our own origin
  if (url.origin === self.location.origin) {
    // For navigation/HTML requests, use Network-First with Cache fallback
    const isHtml = event.request.mode === 'navigate' || 
                   url.pathname === '/' || 
                   url.pathname === '/index.html' || 
                   url.pathname.endsWith('.html');

    if (isHtml) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback to cache if network is unavailable
            return caches.match(event.request)
              .then((cached) => cached || caches.match('/index.html') || caches.match('/'));
          })
      );
    } else {
      // For static assets (JS, CSS, images), use Stale-While-Revalidate
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
              }
            }).catch(() => {});
            return cachedResponse;
          }

          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(() => {
            return new Response('', { status: 404, statusText: 'Offline' });
          });
        })
      );
    }
  } else if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    // Cache external tiles and libraries (like PDF.js)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          return new Response('', { status: 404, statusText: 'Offline' });
        });
      })
    );
  }
});
