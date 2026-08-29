/**
 * Muggy — Cloudflare Worker.
 * Serves the static app from ./public and proxies Open-Meteo behind a small edge cache.
 */

const UPSTREAM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const UPSTREAM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const UPSTREAM_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

// WeatherSpark comfort bands (55/60/65/70/75 °F) in °C. Kept in step with public/app.js.
const BANDS = [
  ['dry', 12.8],
  ['comfortable', 15.6],
  ['humid', 18.3],
  ['muggy', 21.1],
  ['oppressive', 23.9],
  ['miserable', Infinity],
];
const bandOf = (dp) => BANDS.find(([, max]) => dp < max)[0];

// How much history the "is this normal?" comparison is built from.
const NORMAL_YEARS = 10;
const NORMAL_WINDOW_DAYS = 7;

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

/**
 * Climatology for this location and this time of year: what the air is normally
 * like in a +/- 7 day window around today's date, across the last 10 years.
 *
 * Answers "is this normal?" without ever putting a dew point on screen — the
 * client compares today's reading against the returned quantiles to get a
 * percentile, and against `mix` to see which bands are typical here at all.
 */
async function normals(request, env, ctx) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'lat and lon are required' }, 400);
  }

  // Dew-point climatology varies slowly in space, so snap hard (~55 km) for a
  // much better cache hit rate. Keyed by day-of-year: the answer is the same
  // for everyone at this place on this date.
  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const key = `v3:${(Math.round(lat * 2) / 2).toFixed(1)}:${(Math.round(lon * 2) / 2).toFixed(1)}:${mm}-${dd}`;

  if (env.NORMALS) {
    const hit = await env.NORMALS.get(key, 'json').catch(() => null);
    if (hit) return json({ ...hit, cached: true });
  }

  // One request per year. Each window is centred on today's month/day in a PAST
  // year, so it is always fully inside the archive (which lags ~5 days) and a
  // window spanning New Year resolves to a normal contiguous range on its own.
  const ymd = (d) => d.toISOString().slice(0, 10);
  const reqs = [];
  for (let i = 1; i <= NORMAL_YEARS; i++) {
    const centre = new Date(Date.UTC(today.getUTCFullYear() - i, today.getUTCMonth(), today.getUTCDate()));
    const from = new Date(centre); from.setUTCDate(from.getUTCDate() - NORMAL_WINDOW_DAYS);
    const to = new Date(centre); to.setUTCDate(to.getUTCDate() + NORMAL_WINDOW_DAYS);
    const up = new URL(UPSTREAM_ARCHIVE);
    up.searchParams.set('latitude', lat.toFixed(2));
    up.searchParams.set('longitude', lon.toFixed(2));
    up.searchParams.set('start_date', ymd(from));
    up.searchParams.set('end_date', ymd(to));
    up.searchParams.set('hourly', 'dew_point_2m');
    up.searchParams.set('timezone', 'auto');
    // Ten parallel archive calls occasionally drop one; a single retry is
    // cheaper than silently narrowing the sample.
    const pull = () =>
      fetch(up, { headers: { 'user-agent': 'muggy-app (workers.dev)' } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    reqs.push(pull().then((r) => r ?? pull()));
  }

  const years = await Promise.all(reqs);
  const vals = [];
  // A median per past DAY, not per year. Ranking today against ten fortnight-long
  // medians flatters it — a single sticky day clears a smoothed average easily —
  // so today gets compared against the ~150 individual days it belongs with.
  const days = [];
  let got = 0;
  for (const y of years) {
    const times = y?.hourly?.time;
    const series = y?.hourly?.dew_point_2m;
    if (!times || !series) continue;
    got++;
    const byDay = new Map();
    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v == null) continue;
      vals.push(v);
      const d = times[i].slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(v);
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => a - b);
      days.push(Math.round(arr[Math.floor(arr.length / 2)] * 10) / 10);
    }
  }
  days.sort((a, b) => a - b);
  // Too thin to make a claim about "normal" — say so rather than guess.
  if (got < 5 || vals.length < 1000) return json({ error: 'not enough history' }, 503);

  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.min(vals.length - 1, Math.round((p / 100) * (vals.length - 1)))];
  const q = [];
  for (let p = 0; p <= 100; p++) q.push(Math.round(at(p) * 10) / 10);

  const counts = {};
  for (const v of vals) counts[bandOf(v)] = (counts[bandOf(v)] || 0) + 1;
  const mix = {};
  for (const [b, n] of Object.entries(counts)) mix[b] = Math.round((n / vals.length) * 1000) / 1000;

  const body = {
    q,
    mix,
    days,
    medianBand: bandOf(at(50)),
    years: got,
    windowDays: NORMAL_WINDOW_DAYS,
    samples: vals.length,
  };

  // Keyed by day-of-year, so a TTL under a year means it naturally refreshes
  // next time round with the newest year folded in.
  if (env.NORMALS) {
    ctx.waitUntil(
      env.NORMALS.put(key, JSON.stringify(body), { expirationTtl: 200 * 86400 }).catch(() => {}),
    );
  }
  return json(body, 200, { 'cache-control': 'public, max-age=86400' });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      if (pathname === '/api/forecast') return forecast(request, ctx);
      if (pathname === '/api/geocode') return geocode(request, ctx);
      if (pathname === '/api/normals') return normals(request, env, ctx);
      return json({ error: 'not found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
