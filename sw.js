// sw.js

const CACHE_NAME = 'golden-blue-hour-cache-v2'; // Increment version if assets change

// App files cached during installation. Paths are relative to this script so the
// app works both at a domain root and under a sub-path (e.g. GitHub Pages).
const URLS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'vendor/suncalc/suncalc.js',
    'icon_192.png',
    'icon_512.png',
    'git.png'
];

// Third-party assets are cached on a best-effort basis: failing to fetch them must
// not break the installation of the app itself.
const OPTIONAL_URLS_TO_CACHE = [
    'https://cdn.tailwindcss.com'
];

// --- Installation ---
// Cache core assets when the service worker is installed.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all([
                // If a core file can't be cached, fail the install so the previous
                // (working) service worker stays in charge.
                cache.addAll(URLS_TO_CACHE),
                ...OPTIONAL_URLS_TO_CACHE.map(url =>
                    fetch(url, { mode: 'no-cors' })
                        .then(response => cache.put(url, response))
                        .catch(error => console.warn('[Service Worker] Could not cache', url, error))
                )
            ]))
            .then(() => self.skipWaiting())
    );
});

// --- Activation ---
// Clean up old caches when the service worker is activated.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

// --- Fetch ---
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return; // Only GET requests can be cached

    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        // Network first for the app's own files so updates reach users right away,
        // falling back to the cache when offline.
        event.respondWith(networkFirst(request));
    } else {
        // Cache first for third-party assets (CDN), which rarely change.
        event.respondWith(cacheFirst(request));
    }
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const fallback = await cache.match('index.html');
            if (fallback) return fallback;
        }
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    // Opaque responses (cross-origin, no CORS) can't be inspected but are expected from CDNs.
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
}
