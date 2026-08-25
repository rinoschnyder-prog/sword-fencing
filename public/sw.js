// ==========================================
// ★ sw.js v18.1.6（PWAクラッシュ防止・安全キャッシュ版）
// ==========================================

const VERSION = '18.1.8';
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
  './manifest.json'
];

// インストール（1つ失敗してもクラッシュさせない安全処理）
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

// 古いキャッシュを安全に消去
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワーク優先
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