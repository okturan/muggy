/**
 * Muggy service worker: network first, cache as the fallback.
 *
 * Network-first means a deploy is never masked by a stale cache — the trade
 * is a little speed for zero staleness. The cache earns its keep offline:
 * the shell renders and the last forecast the person saw renders with it,
 * instead of the browser's dinosaur.
 */
const CACHE = 'muggy-v1';
const CORE = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // A city path with no cached copy still gets the app shell.
        if (req.mode === 'navigate') return caches.match('/');
        return Response.error();
      }),
  );
});
