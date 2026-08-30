/**
 * Muggy — Cloudflare Worker.
 *
 * Serves the static app, proxies Open-Meteo behind a two-layer cache, injects
 * per-city Open Graph tags into the HTML so shared links unfurl properly, and
 * writes one Analytics Engine data point per page view / API call.
 *
 * Caching is deliberately layered:
 *   edge cache (per colo, minutes)  →  KV (global, stale-while-revalidate)  →  upstream
 * The KV layer is what protects the upstream API: worldwide, at most one
 * forecast fetch per city per FRESH window, and if Open-Meteo is down or
 * rate-limiting, stale data keeps serving for a day rather than erroring.
 */

const UPSTREAM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const UPSTREAM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const UPSTREAM_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const CANONICAL_HOST = 'muggy.fyi';

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
const OG_LINE = {
  dry: 'Crisp and dry',
  comfortable: 'Perfect air',
  humid: 'A little sticky',
  muggy: "It's muggy out",
  oppressive: 'Oppressive out there',
  miserable: 'Honestly miserable out there',
};

// Forecast freshness. FRESH is what users see; STALE_SERVE is how long stale
// data is acceptable while a background refresh runs; STALE_MAX is the
// upstream-is-down emergency ration.
const FRESH_S = 600;
const STALE_SERVE_S = 1800;
const STALE_MAX_S = 24 * 3600;

const NORMAL_YEARS = 10;
const NORMAL_WINDOW_DAYS = 7;

const HOURLY = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'weather_code',
  'is_day',
  'shortwave_radiation',
  'wind_speed_10m',
].join(',');
const CURRENT = HOURLY;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

/** One data point per event; never let analytics break a response. */
function track(env, request, type, slug = '', extra = '') {
  try {
    env.TRACK?.writeDataPoint({
      blobs: [type, slug.slice(0, 60), request.cf?.country || '', request.cf?.colo || '', extra],
      doubles: [1],
      indexes: [type],
    });
  } catch { /* analytics must not cost anyone their weather */ }
}

const coordKey = (lat, lon) => `${lat.toFixed(2)}:${lon.toFixed(2)}`;

async function fetchUpstreamForecast(lat, lon) {
  const up = new URL(UPSTREAM_FORECAST);
  up.searchParams.set('latitude', lat.toFixed(2));
  up.searchParams.set('longitude', lon.toFixed(2));
  up.searchParams.set('hourly', HOURLY);
  up.searchParams.set('current', CURRENT);
  up.searchParams.set('timezone', 'auto');
  up.searchParams.set('forecast_days', '7');
  const r = await fetch(up, { headers: { 'user-agent': 'muggy.fyi (Cloudflare Worker)' } });
  if (!r.ok) return null;
  return r.json();
}

/**
 * Forecast with stale-while-revalidate over KV.
 * Returns { data, state } where state is fresh | stale | miss | dead.
 */
async function forecastCached(env, ctx, lat, lon) {
  const key = `f:${coordKey(lat, lon)}`;
  const hit = env.KV ? await env.KV.get(key, 'json').catch(() => null) : null;
  const age = hit ? (Date.now() - hit.at) / 1000 : Infinity;

  if (hit && age < FRESH_S) return { data: hit.data, state: 'fresh' };

  const store = (data) =>
    env.KV?.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: STALE_MAX_S }).catch(() => {});

  if (hit && age < STALE_SERVE_S) {
    // Serve stale instantly; refresh behind the response. Upstream sees at most
    // one of these per city per fresh window, regardless of traffic.
    ctx.waitUntil(fetchUpstreamForecast(lat, lon).then((d) => (d ? store(d) : null)));
    return { data: hit.data, state: 'stale' };
  }

  const data = await fetchUpstreamForecast(lat, lon);
  if (data) {
    ctx.waitUntil(store(data));
    return { data, state: 'miss' };
  }
  // Upstream down: the emergency ration.
  if (hit) return { data: hit.data, state: 'dead' };
  return { data: null, state: 'dead' };
}

/** Geocode with a long KV memory — city coordinates do not move. */
async function geocodeCached(env, ctx, q) {
  const key = `g:${q.toLowerCase()}`;
  const hit = env.KV ? await env.KV.get(key, 'json').catch(() => null) : null;
  if (hit) return hit;
  const up = new URL(UPSTREAM_GEOCODE);
  up.searchParams.set('name', q);
  up.searchParams.set('count', '6');
  up.searchParams.set('language', 'en');
  up.searchParams.set('format', 'json');
  const r = await fetch(up);
  if (!r.ok) return null;
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
  ctx.waitUntil(env.KV?.put(key, JSON.stringify({ results }), { expirationTtl: 30 * 86400 }).catch(() => {}));
  return { results };
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

function coords(url) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function forecast(request, env, ctx) {
  const c = coords(new URL(request.url));
  if (!c) return json({ error: 'lat and lon are required' }, 400);
  const { data, state } = await forecastCached(env, ctx, c.lat, c.lon);
  track(env, request, 'api:forecast', coordKey(c.lat, c.lon), state);
  if (!data) return json({ error: 'weather service unavailable' }, 503);
  // Short edge/browser TTL in front of the KV layer.
  return json(data, 200, { 'cache-control': 'public, max-age=300', 'x-muggy-cache': state });
}

async function geocode(request, env, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const data = await geocodeCached(env, ctx, q);
  track(env, request, 'api:geocode', q);
  if (!data) return json({ error: 'geocoder unavailable' }, 503);
  return json(data, 200, { 'cache-control': 'public, max-age=86400' });
}

/**
 * Climatology for this location and this time of year — see public/app.js for
 * how the client turns the quantile ladder into "stickier than 93% of days".
 */
async function normals(request, env, ctx) {
  const c = coords(new URL(request.url));
  if (!c) return json({ error: 'lat and lon are required' }, 400);
  const { lat, lon } = c;

  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  // Snapped hard (~55 km): dew-point climatology varies slowly in space.
  const key = `v3:${(Math.round(lat * 2) / 2).toFixed(1)}:${(Math.round(lon * 2) / 2).toFixed(1)}:${mm}-${dd}`;

  if (env.KV) {
    const hit = await env.KV.get(key, 'json').catch(() => null);
    if (hit) { track(env, request, 'api:normals', key, 'hit'); return json({ ...hit, cached: true }); }
  }

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
    const pull = () =>
      fetch(up, { headers: { 'user-agent': 'muggy.fyi (Cloudflare Worker)' } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    reqs.push(pull().then((r) => r ?? pull()));
  }

  const years = await Promise.all(reqs);
  const vals = [];
  const days = [];   // a median per past DAY — day-against-day beats day-against-average
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
  if (got < 5 || vals.length < 1000) return json({ error: 'not enough history' }, 503);

  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.min(vals.length - 1, Math.round((p / 100) * (vals.length - 1)))];
  const q = [];
  for (let p = 0; p <= 100; p++) q.push(Math.round(at(p) * 10) / 10);
  const counts = {};
  for (const v of vals) counts[bandOf(v)] = (counts[bandOf(v)] || 0) + 1;
  const mix = {};
  for (const [b, n] of Object.entries(counts)) mix[b] = Math.round((n / vals.length) * 1000) / 1000;

  const body = { q, mix, days, medianBand: bandOf(at(50)), years: got, windowDays: NORMAL_WINDOW_DAYS, samples: vals.length };
  if (env.KV) ctx.waitUntil(env.KV.put(key, JSON.stringify(body), { expirationTtl: 200 * 86400 }).catch(() => {}));
  track(env, request, 'api:normals', key, 'build');
  return json(body, 200, { 'cache-control': 'public, max-age=86400' });
}

// ---------------------------------------------------------------------------
// HTML: per-city share previews
// ---------------------------------------------------------------------------

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * WhatsApp (and every other unfurler) reads the raw HTML and runs no JS, so
 * the preview has to be written server-side. For muggy.fyi/tirana the slug is
 * resolved and the tags carry the live reading; the OG image is one of six
 * pre-rendered banners, picked by the current band.
 */
async function htmlFor(request, env, ctx, slug) {
  const asset = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));
  let og = null;

  if (slug) {
    try {
      const geo = await geocodeCached(env, ctx, slug.replace(/-/g, ' '));
      const place = geo?.results?.[0];
      if (place) {
        const { data } = await forecastCached(env, ctx, place.lat, place.lon);
        const cur = data?.current;
        if (cur && cur.dew_point_2m != null) {
          const band = bandOf(cur.dew_point_2m);
          og = {
            title: `${OG_LINE[band]} in ${place.name} right now`,
            desc: `${Math.round(cur.temperature_2m)}°C · ${Math.round(cur.relative_humidity_2m)}% humidity · comfort: ${band}. See when it gets better →`,
            image: `https://${CANONICAL_HOST}/og/${band}.png`,
            url: `https://${CANONICAL_HOST}/${slug}`,
          };
        }
      }
    } catch { /* fall through to defaults */ }
  }
  if (!og) {
    og = {
      title: 'Muggy · how sticky is it out there?',
      desc: 'Not how hot. How sticky. Comfort level, whether it is normal, and when it will get better.',
      image: `https://${CANONICAL_HOST}/og/default.png`,
      url: `https://${CANONICAL_HOST}/${slug || ''}`,
    };
  }

  const rewriter = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(og.title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute('content', og.desc); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute('content', og.title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute('content', og.desc); } })
    .on('meta[property="og:image"]', { element(e) { e.setAttribute('content', og.image); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute('content', og.url); } })
    .on('meta[name="twitter:title"]', { element(e) { e.setAttribute('content', og.title); } })
    .on('meta[name="twitter:description"]', { element(e) { e.setAttribute('content', og.desc); } })
    .on('meta[name="twitter:image"]', { element(e) { e.setAttribute('content', og.image); } })
    .on('link[rel="canonical"]', { element(e) { e.setAttribute('href', og.url); } });

  const out = rewriter.transform(asset);
  const res = new Response(out.body, out);
  res.headers.set('cache-control', 'public, max-age=300');
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // One canonical origin: https on the apex. Plain http must redirect —
    // geolocation and the share sheet only exist in secure contexts.
    if (url.protocol === 'http:' || url.hostname === `www.${CANONICAL_HOST}` || url.hostname.endsWith('.workers.dev')) {
      url.protocol = 'https:';
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      if (pathname === '/api/forecast') return forecast(request, env, ctx);
      if (pathname === '/api/geocode') return geocode(request, env, ctx);
      if (pathname === '/api/normals') return normals(request, env, ctx);
      return json({ error: 'not found' }, 404);
    }

    // Reserved pages are assets, not cities.
    if (pathname === '/about' || pathname === '/about/') {
      track(env, request, 'page', 'about');
      return env.ASSETS.fetch(request);
    }

    // App pages: "/" and city slugs like "/tirana". Anything with a dot is an
    // asset and skips the rewriter.
    const slugMatch = request.method === 'GET' && /^\/([a-z0-9-]{2,60})?$/.test(pathname);
    if (slugMatch && !pathname.includes('.')) {
      const slug = pathname.slice(1) || '';
      track(env, request, 'page', slug || 'home');
      return htmlFor(request, env, ctx, slug ? slugify(slug) : '');
    }

    return env.ASSETS.fetch(request);
  },
};
