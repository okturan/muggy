/**
 * Muggy — Cloudflare Worker.
 * Serves the static app from ./public and proxies Open-Meteo behind a small edge cache.
 */

const UPSTREAM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const UPSTREAM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

const HOURLY = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'weather_code',
  'is_day',
].join(',');
const CURRENT = HOURLY;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

async function cached(request, ctx, ttl, build) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await build();
  if (res.ok) {
    const out = new Response(res.body, res);
    out.headers.set('cache-control', `public, max-age=${ttl}`);
    ctx.waitUntil(cache.put(key, out.clone()));
    return out;
  }
  return res;
}

async function forecast(request, ctx) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'lat and lon are required' }, 400);
  }
  // Snap to ~1 km so nearby requests share a cache entry.
  const norm = new URL(url);
  norm.search = `?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;

  return cached(new Request(norm.toString()), ctx, 900, async () => {
    const up = new URL(UPSTREAM_FORECAST);
    up.searchParams.set('latitude', lat.toFixed(2));
    up.searchParams.set('longitude', lon.toFixed(2));
    up.searchParams.set('hourly', HOURLY);
    up.searchParams.set('current', CURRENT);
    up.searchParams.set('timezone', 'auto');
    up.searchParams.set('forecast_days', '7');
    const r = await fetch(up, { headers: { 'user-agent': 'muggy-app (workers.dev)' } });
    if (!r.ok) return json({ error: 'upstream failed', status: r.status }, 502);
    const data = await r.json();
    return json(data);
  });
}

async function geocode(request, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const norm = new URL(url);
  norm.search = `?q=${encodeURIComponent(q.toLowerCase())}`;
  return cached(new Request(norm.toString()), ctx, 86400, async () => {
    const up = new URL(UPSTREAM_GEOCODE);
    up.searchParams.set('name', q);
    up.searchParams.set('count', '6');
    up.searchParams.set('language', 'en');
    up.searchParams.set('format', 'json');
    const r = await fetch(up);
    if (!r.ok) return json({ error: 'upstream failed', status: r.status }, 502);
    const data = await r.json();
    const results = (data.results || []).map((p) => ({
      id: p.id,
      name: p.name,
      admin: p.admin1 || '',
      country: p.country || '',
      cc: p.country_code || '',
      lat: p.latitude,
      lon: p.longitude,
    }));
    return json({ results });
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      if (pathname === '/api/forecast') return forecast(request, ctx);
      if (pathname === '/api/geocode') return geocode(request, ctx);
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
