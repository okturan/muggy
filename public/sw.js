/**
 * Muggy service worker: network first, cache as the fallback.
 *
 * Network-first means a deploy is never masked by a stale cache — the trade
 * is a little speed for zero staleness. The cache earns its keep offline:
 * the shell renders and the last forecast the person saw renders with it,
 * instead of the browser's dinosaur.
 */
const CACHE = 'muggy-v2';
// The app is ES modules: every shared module must be cached, or the offline
// shell loads app.js and then fails on its first import.
const CORE = ['/', '/styles.css', '/app.js', '/about', '/manifest.webmanifest', '/icons/icon-192.png',
  '/lib/calibration.js', '/lib/copy.js', '/lib/explain.js', '/lib/explorer.js', '/lib/globe.js', '/lib/interp.js', '/lib/levels.js', '/lib/lexicon.js', '/lib/load.js', '/lib/normals.js', '/lib/psychro.js', '/lib/relief.js', '/lib/sun.js', '/lib/texture.js', '/lib/verdict.js', '/lib/wbgt.js'];

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
