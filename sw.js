const CACHE_NAME = 'miki-ledger-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './script.js',
  './manifest.json'
];

// 1. INSTALL: I-cache ang mga pangunahing files
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. ACTIVATE: Linisin ang mga lumang caches
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

// 3. FETCH: Saluhin ang offline requests para hindi mag-crash ang app
self.addEventListener('fetch', (e) => {
  // Kung nagbubukas o nag-a-access ng pahina (navigation), ibigay agad ang index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((res) => {
        return res || fetch(e.request).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Para sa ibang files (JS, CSS, images)
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).catch(() => {
        // Kung offline at walang cache, huwag hayaang mag-crash
        return new Response('', { status: 404, statusText: 'Offline' });
      });
    })
  );
});
