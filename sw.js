const CACHE_NAME = 'miki-ledger-clean-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json'
];

// 1. INSTALL: I-save lahat ng core files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Linisin ang lumang caches
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

// 3. FETCH: Laging unahin ang Cache (Cache-First) para laging buksan ang app kahit offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Kung nahanap sa cache, ibigay agad
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Kung wala, subukang i-fetch online
      return fetch(e.request).catch(() => {
        // Kung offline at navigation request ito, ibigay ang index.html sa halip na error screen
        if (e.request.mode === 'navigate' || e.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return caches.match('./index.html'); // Fallback para hindi mag-404
      });
    })
  );
});
