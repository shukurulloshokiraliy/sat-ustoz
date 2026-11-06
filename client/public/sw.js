/*
 * SAT Ustoz service worker (prompt 12): faster repeat visits on mobile data and an app that opens offline.
 *  - /assets/* (hashed build files, fonts): cache first, they never change.
 *  - pictures and icons: served from the cache, refreshed in the background.
 *  - pages: network first, the cached app shell when offline.
 *  - /api/* is never cached: answers and results always go to the server.
 */
const VERSION = 'v1-b';
const STATIC = `static-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const SHELL = ['/app', '/favicon.svg', '/icon-192.png', '/site.webmanifest', '/theme.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, RUNTIME].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (cache, req, res) => { if (res && res.ok && res.type === 'basic') caches.open(cache).then((c) => c.put(req, res.clone())).catch(() => {}); return res; };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/assets/')) {
    // a file that is gone after a deploy comes back as the app page (HTML): never keep that as a script
    const isAsset = (res) => res && res.ok && !(res.headers.get('content-type') || '').includes('text/html');
    e.respondWith(caches.match(req).then((hit) => (isAsset(hit) ? hit : fetch(req).then((res) => (isAsset(res) ? put(STATIC, req, res) : res)))));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/app').then((hit) => hit || Response.error())));
    return;
  }
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => put(RUNTIME, req, res)).catch(() => hit);
      return hit || net;
    }));
  }
});
