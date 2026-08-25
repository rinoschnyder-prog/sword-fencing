// ==========================================
// ★ sw.js v18.1（Service Worker キャッシュ＆高速起動）
// ==========================================

const CACHE_NAME = 'sword-fencing-v18.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './event.html',
  './style.css?v=18.1',
  './game.js?v=18.1',
  './event.js?v=18.1',
  './shop.js?v=18.1',
  './renderer.js?v=18.1',
  './effects.js?v=18.1',
  './sound.js?v=18.1',
  './manifest.json',
  './background.jpg'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 新バージョン時に古いキャッシュを自動削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワーク優先（オフライン時はキャッシュから配信）
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