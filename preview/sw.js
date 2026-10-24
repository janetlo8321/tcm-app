/* 預覽版離線快取（只管 /preview/ 底下）
 * 每次都先問伺服器檔案有沒有變（no-cache）：沒變只回一個很小的 304，不會整個重抓，
 * 有變就立刻拿到新版（GitHub Pages 預設會讓舊檔在瀏覽器留 10 分鐘，所以不能用一般快取）；
 * 沒網路時用上次存下來的 */
const CACHE = 'tcm-preview-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(url.origin + url.pathname, copy)); }   // 不含 ?v=…，同一個檔只存一份
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./')).then(r => r || new Response('', { status: 504, statusText: 'offline' })))   // 沒網路也沒存檔：回 504，讓頁面自己重試，不會變成「respondWith 錯誤」
  );
});
