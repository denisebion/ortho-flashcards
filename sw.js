// Service worker: makes the app work offline.
//
// Strategy: network first, cache as the fallback. When online you always get the latest
// files (so a redeploy or a re-imported cards.json shows up right away, with no version
// number to remember to bump); when offline, or if the network takes longer than 4
// seconds, the last copy that was fetched is used. Every file the app loads is saved as
// it is fetched, and the list below is saved up front so the very first offline launch works.

const CACHE = 'ortho-flashcards-v1';
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/data.js',
  'js/help.js',
  'js/render.js',
  'js/session.js',
  'js/srs.js',
  'js/store.js',
  'topics.json',
  'cards.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'data/TEMPLATE.csv',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' skips the browser's HTTP cache so we store fresh copies
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    // 'no-cache' = ask the server if the file changed (cheap 304 when it hasn't)
    const response = await fetch(request.url, { cache: 'no-cache', signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put(request.url, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request.url, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('index.html');
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
