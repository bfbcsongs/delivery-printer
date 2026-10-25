const CACHE_NAME = 'miki-ledger-v4'; // Tinaas natin sa v4 para mag-update
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css', // <-- Eto ang idinagdag natin para sumama ang disenyo!
  './script.js',
  './manifest.json'
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

// 3. FETCH
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((res) => {
        return res || fetch(e.request).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).catch(() => {
        return new Response('', { status: 404, statusText: 'Offline' });
      });
    })
  );
});
