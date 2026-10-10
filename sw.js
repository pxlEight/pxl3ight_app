const CACHE_NAME = 'pxl3ight-v102';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './src/main.js',
    './src/PixelEditor.js',
    './manifest.json',
    './icons/icon.svg'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            const requests = ASSETS.map(url => new Request(url, { cache: 'no-cache' }));
            return cache.addAll(requests);
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchResponse => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            }).catch(() => {
                // Ignore offline errors for dynamic requests
            });
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
        })
    );
    self.clients.claim();
});

