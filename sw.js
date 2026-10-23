/* 離線快取：每次都先問伺服器檔案有沒有變（no-cache）：沒變只回一個很小的 304，不會整個重抓，
 * 有變就立刻拿到新版（GitHub Pages 預設會讓舊檔在瀏覽器留 10 分鐘，所以不能用一般快取）；
 * 沒網路時用上次存下來的 */
const CACHE = 'tcm-app-v3';
const FILES = ['./', 'data.enc', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tcm-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/preview/')) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(url.origin + url.pathname, copy)); }   // 不含 ?v=…，同一個檔只存一份
      return r;
    }).catch(() => caches.match(url.origin + url.pathname).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || caches.match('./')))
  );
});
