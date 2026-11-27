// まなびクエスト service worker
// ゲーム本体(index.html)は「ネット優先」：つながっていれば常に最新、オフラインなら保存済みの版を使う。
// キャッシュの書きこみは waitUntil で最後まで待つ（iOS で とちゅうで止められて 古い版が のこるのを ふせぐ）。
const CACHE = 'mq-cache-v195';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !/^(fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com)$/.test(url.hostname)) return;
  // バージョン チェック（?u=）は かならず ネットへ（キャッシュの 古い版を かえさない）
  if (url.origin === location.origin && url.searchParams.has('u')) { e.respondWith(fetch(req, { cache: 'no-store' })); return; }
  const isPage = req.mode === 'navigate' || (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html')));
  if (isPage) {
    const net = fetch(req, { cache: 'no-store' });
    const store = net.then(res => {
      if (res && res.ok) { const a = res.clone(), b = res.clone(); return caches.open(CACHE).then(c => Promise.all([c.put('./index.html', a), c.put('./', b)])); }
    }).catch(() => {});
    e.waitUntil(store);
    e.respondWith(
      Promise.race([net, timeout(6000)])
        .then(res => res && res.ok ? res : Promise.reject(new Error('bad')))
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./') || net))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, cp))); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
