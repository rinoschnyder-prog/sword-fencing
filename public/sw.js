// ==========================================
// ★ sw.js v18.1（背景1〜3キャッシュ対応版）
// ==========================================

const VERSION = '18.91';
const CACHE_NAME = `sword-fencing-v${VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './event.html',
  `./style.css?v=${VERSION}`,
  `./game.js?v=${VERSION}`,
  `./event.js?v=${VERSION}`,
  `./shop.js?v=${VERSION}`,
  `./renderer.js?v=${VERSION}`,
  `./effects.js?v=${VERSION}`,
  `./sound.js?v=${VERSION}`,
  './manifest.json',
  './background1.jpg',
  './background2.jpg',
  './background3.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (e) {}
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});