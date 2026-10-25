const CACHE_NAME = 'miki-ledger-v6'; // Tinaas sa v6 para i-clear ang lumang offline fallback error
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// 1. INSTALL
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH (Offline-First Strategy)
self.addEventListener('fetch', (e) => {
  // Para sa mga navigation requests (tulad ng pag-open o pag-refresh ng app)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((cachedRes) => {
        return cachedRes || fetch(e.request).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Para sa lahat ng iba pang assets (CSS, JS, images, CDN)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (e.request.method === 'GET' && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Kung offline at hinahanap ang index.html o root, ibigay ang cached index.html sa halip na error
        if (e.request.url.includes('index.html') || e.request.url.endsWith('/')) {
          return caches.match('./index.html');
        }
        return new Response('', { status: 404, statusText: 'Offline Resource Not Found' });
      });
    })
  );
});
