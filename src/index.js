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
 *
 * The verdict logic lives in public/lib and is imported here unchanged, so a
 * link preview and the page it points to can never disagree.
 */
import { interpolateNow } from '../public/lib/interp.js';
import { textureOf } from '../public/lib/texture.js';
import { loadNow, isSunUp } from '../public/lib/load.js';
import { levelOf, alertMark } from '../public/lib/levels.js';
import { compose } from '../public/lib/verdict.js';

const UPSTREAM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const UPSTREAM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const UPSTREAM_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const CANONICAL_HOST = 'muggy.fyi';

// Forecast freshness. FRESH is what users see; STALE_SERVE is how long stale
// data is acceptable while a background refresh runs; STALE_MAX is the
// upstream-is-down emergency ration.
const FRESH_S = 300;
const STALE_SERVE_S = 1800;
const STALE_MAX_S = 24 * 3600;
// f2: forecasts carry direct/diffuse radiation and surface pressure for the
// heat-load engine; f: entries lack them and simply expire.
const FORECAST_PREFIX = 'f2:';

const NORMAL_YEARS = 10;
const NORMAL_WINDOW_DAYS = 7;
const NORMAL_HOUR_SPAN = 2;
const NORMAL_MIN_SAMPLES = 200;

const HOURLY = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'weather_code',
  'is_day',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'surface_pressure',
  'wind_speed_10m',
].join(',');
const CURRENT = HOURLY;
const MINUTELY = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'apparent_temperature',
  'wind_speed_10m',
  'surface_pressure',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
].join(',');

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

/** One data point per event; never let analytics break a response. */
function track(env, request, type, slug = '', extra = '') {
  try {
    env.TRACK?.writeDataPoint({
      blobs: [type, slug.slice(0, 60), request?.cf?.country || '', request?.cf?.colo || '', extra],
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
  up.searchParams.set('minutely_15', MINUTELY);
  up.searchParams.set('forecast_minutely_15', '96');
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
  const key = `${FORECAST_PREFIX}${coordKey(lat, lon)}`;
  const hit = env.KV ? await env.KV.get(key, 'json').catch(() => null) : null;
  const age = hit ? (Date.now() - hit.at) / 1000 : Infinity;

  if (hit && age < FRESH_S) return { data: hit.data, state: 'fresh' };

  const store = (data) =>
    env.KV?.put(key, JSON.stringify({ at: Date.now(), data }),
      { expirationTtl: STALE_MAX_S, metadata: { at: Date.now() } }).catch(() => {});

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
  const key = `g3:${q.toLowerCase()}`;   // g3: adds population + feature code
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
    population: p.population || 0,
    fc: p.feature_code || '',
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
  if (!url.searchParams.has('lat') || !url.searchParams.has('lon')) return null;
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
  return json(data, 200, { 'cache-control': 'public, max-age=120', 'x-muggy-cache': state });
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

/** 101-point quantile ladder (0.1 °C precision) of a sorted array. */
function ladder(sorted) {
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)))];
  const q = [];
  for (let p = 0; p <= 100; p++) q.push(Math.round(at(p) * 10) / 10);
  return q;
}

/**
 * Climatology for this place, date and time of day (see public/lib/normals.js).
 * For each local hour H, the comparison set is every past hour within
 * H ± 2 hours and ± 7 days of today's date over the last ten years.
 */
async function normals(request, env, ctx) {
  const c = coords(new URL(request.url));
  if (!c) return json({ error: 'lat and lon are required' }, 400);
  const { lat, lon } = c;

  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  // Snapped hard (~55 km): dew-point climatology varies slowly in space.
  const key = `v4:${(Math.round(lat * 2) / 2).toFixed(1)}:${(Math.round(lon * 2) / 2).toFixed(1)}:${mm}-${dd}`;

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
  const byHour = Array.from({ length: 24 }, () => []);
  let got = 0;
  for (const y of years) {
    const times = y?.hourly?.time;
    const series = y?.hourly?.dew_point_2m;
    if (!times || !series) continue;
    got++;
    for (let i = 0; i < series.length; i++) {
      if (series[i] == null) continue;
      byHour[Number(times[i].slice(11, 13))].push(series[i]);
    }
  }
  if (got < 5) return json({ error: 'not enough history' }, 503);

  const hours = [];
  for (let h = 0; h < 24; h++) {
    const pooled = [];
    for (let k = -NORMAL_HOUR_SPAN; k <= NORMAL_HOUR_SPAN; k++) pooled.push(...byHour[(h + k + 24) % 24]);
    if (pooled.length < NORMAL_MIN_SAMPLES) return json({ error: 'not enough history' }, 503);
    pooled.sort((a, b) => a - b);
    const counts = {};
    for (const v of pooled) { const b = textureOf(v); counts[b] = (counts[b] || 0) + 1; }
    const mix = {};
    for (const [b, n] of Object.entries(counts)) mix[b] = Math.round((n / pooled.length) * 1000) / 1000;
    hours.push({ hour: h, q: ladder(pooled), mix, n: pooled.length });
  }

  const body = { years: got, windowDays: NORMAL_WINDOW_DAYS, hourSpan: NORMAL_HOUR_SPAN, hours };
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

/** The same composed verdict the page shows at this minute (first render: no hysteresis). */
export function previewVerdict(data, nowMs = Date.now()) {
  const cur = interpolateNow(data, nowMs);
  if (cur.dew_point_2m == null) return null;
  const texture = textureOf(cur.dew_point_2m);
  const load = cur.temperature_2m != null ? loadNow(data, cur) : null;
  const shadeLevel = load ? levelOf(load.shade) : null;
  const sunLevel = load && load.sunKnown ? levelOf(load.sun) : null;
  const isDay = isSunUp(Date.parse(`${cur.time}:00Z`) - (data.utc_offset_seconds || 0) * 1000, data.latitude, data.longitude);
  const sunInPlay = !!(isDay && load && load.sunUp && load.sunKnown);
  const worst = load ? (sunInPlay ? Math.max(load.shade, load.sun) : load.shade) : null;
  const verdict = compose({
    texture,
    shadeLevel,
    sunLevel,
    isDay,
    sunKnown: load ? load.sunKnown : false,
    alert: worst != null ? alertMark(worst) : null,
    air: { t: cur.temperature_2m, rh: cur.relative_humidity_2m },
  });
  return { cur, texture, verdict };
}

/**
 * WhatsApp (and every other unfurler) reads the raw HTML and runs no JS, so
 * the preview has to be written server-side. For muggy.fyi/tirana the slug is
 * resolved and the tags carry the live verdict; the OG image is one of six
 * pre-rendered banners, picked by the air texture.
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
        const p = data ? previewVerdict(data) : null;
        if (p) {
          og = {
            title: `${p.verdict.headline} in ${place.name} right now`,
            desc: `${[p.cur.temperature_2m != null ? `${Math.round(p.cur.temperature_2m)}°C` : null, p.cur.relative_humidity_2m != null ? `${Math.round(p.cur.relative_humidity_2m)}% humidity` : null].filter(Boolean).join(', ')}. ${p.verdict.blurb}`,
            image: `https://${CANONICAL_HOST}/og/${p.texture}.png?v=3`,
            url: `https://${CANONICAL_HOST}/${slug}`,
          };
        }
      }
    } catch { /* fall through to defaults */ }
  }
  if (!og) {
    og = {
      title: 'Muggy · how sticky is it out there?',
      desc: 'Not how hot. How sticky. How the air treats you, whether it is normal, and when it will get better.',
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
  /**
   * Pre-warmer. Visitors to a quiet city normally pay the stale-then-refresh
   * dance; this keeps recently active cities inside the fresh window through
   * their quiet gaps. Ages come from list() metadata — zero reads — and the
   * cap of 4 refreshes per run stays far inside free-plan KV write budgets.
   */
  async scheduled(event, env, ctx) {
    if (!env.KV) return;
    const list = await env.KV.list({ prefix: FORECAST_PREFIX }).catch(() => null);
    if (!list) return;
    const now = Date.now();
    const due = list.keys
      .map((k) => ({ key: k.name, at: (k.metadata && k.metadata.at) || 0 }))
      .filter((e) => e.at && now - e.at > FRESH_S * 1000)
      .sort((a, b) => b.at - a.at)
      .slice(0, 4);
    for (const e of due) {
      const [lat, lon] = e.key.slice(FORECAST_PREFIX.length).split(':').map(Number);
      const data = await fetchUpstreamForecast(lat, lon);
      if (data) {
        await env.KV.put(e.key, JSON.stringify({ at: Date.now(), data }),
          { expirationTtl: STALE_MAX_S, metadata: { at: Date.now() } }).catch(() => {});
        track(env, null, 'warm', e.key);
      }
    }
  },

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
      // 60 req/min per IP. The app itself uses a handful per load plus one
      // refresh every five minutes; only scripts ever hit this.
      if (env.LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const { success } = await env.LIMITER.limit({ key: ip }).catch(() => ({ success: true }));
        if (!success) {
          track(env, request, 'ratelimited', pathname);
          return json({ error: 'slow down' }, 429, { 'retry-after': '60' });
        }
      }
      if (pathname === '/api/whereami') {
        // Cloudflare's IP geolocation: city-level, no permission prompt, no
        // third party. The instant first paint for in-app browsers that
        // swallow the real geolocation API without ever answering.
        const cf = request.cf || {};
        track(env, request, 'api:whereami', cf.city || '');
        return json({
          city: cf.city || '',
          lat: cf.latitude != null ? Number(cf.latitude) : null,
          lon: cf.longitude != null ? Number(cf.longitude) : null,
        }, 200, { 'cache-control': 'no-store' });
      }
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
