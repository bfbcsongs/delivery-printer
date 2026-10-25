const CACHE_NAME = 'miki-ledger-v7';
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

// 3. FETCH (Strict Cache-First Strategy para hindi mag-error offline)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(e.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // Kung offline at hindi mahanap ang file, ibigay ang index.html para hindi mag-fail ang app
        if (e.request.mode === 'navigate' || e.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 404, statusText: 'Offline' });
      });
    })
  );
});
