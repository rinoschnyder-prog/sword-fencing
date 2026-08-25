// ==========================================
// ★ sw.js（バージョン1箇所変更だけで全自動連動版）
// ==========================================

// ★ 今後はこの「バージョン番号」の1行だけを書き換えるだけでOK！
const VERSION = '18.1.1';

const CACHE_NAME = `sword-fencing-v${VERSION}`;

// 自動で ?v=${VERSION} が入るため、下のリストを毎回書き換える必要はありません！
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