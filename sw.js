// ============================================================
// MIKI TABLE & LEDGER — SERVICE WORKER
// ============================================================

const CACHE_NAME = 'miki-ledger-v2';

const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// ============================================================
// INSTALL
// ============================================================

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});


// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});


// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', event => {

    const request = event.request;

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // --------------------------------------------------------
    // PAGE / NAVIGATION
    // Network first → cache fallback
    // --------------------------------------------------------

    if (request.mode === 'navigate') {

        event.respondWith(
            fetch(request)
                .then(response => {

                    // Save fresh HTML into cache
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put('./index.html', responseClone);
                    });

                    return response;
                })
                .catch(() => {
                    return caches.match('./index.html');
                })
        );

        return;
    }


    // --------------------------------------------------------
    // LOCAL STATIC ASSETS
    // Cache first → network fallback
    // --------------------------------------------------------

    const url = new URL(request.url);

    if (url.origin === self.location.origin) {

        event.respondWith(

            caches.match(request)
                .then(cachedResponse => {

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return fetch(request)
                        .then(response => {

                            if (response && response.status === 200) {

                                const responseClone = response.clone();

                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(request, responseClone);
                                });
                            }

                            return response;
                        });
                })
                .catch(() => {

                    // Do NOT return index.html for CSS/JS/images/etc.
                    return new Response('', {
                        status: 503,
                        statusText: 'Offline'
                    });

                })
        );

        return;
    }


    // --------------------------------------------------------
    // EXTERNAL REQUESTS
    // Network only
    // --------------------------------------------------------

    event.respondWith(
        fetch(request).catch(() => {
            return new Response('', {
                status: 503,
                statusText: 'Offline'
            });
        })
    );

});
