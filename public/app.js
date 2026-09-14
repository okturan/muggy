/* Muggy — how the outside air treats you, with a cloud who feels it. */
import { interpolateNow } from './lib/interp.js';
import { textureOf } from './lib/texture.js';
import { loadAt, loadSeries, readingNow, intervalInputs, isSunUp } from './lib/load.js';
import { levelOf, alertMark, createHysteresis, roundHalfUp, LEVELS, LEVEL_MIN } from './lib/levels.js';
import { compose } from './lib/verdict.js';
import { attribute, peakAndTrend, factorSummary, REFERENCE_WIND_MS } from './lib/explain.js';
import { findRelief, describeRelief, forecastHours } from './lib/relief.js';
import { describe as describeNormals, barSegments, hasHourLadders } from './lib/normals.js';
import { TEXTURE_SENTENCE, LEVEL_GUIDE, LEVEL_PHRASE, factorSentence } from './lib/copy.js';

const DEFAULT_PLACE = { name: 'Tirana', lat: 41.33, lon: 19.82 };

const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const $ = (id) => document.getElementById(id);
const app = $('app');
const els = {
  placeName: $('placeName'), levelName: $('levelName'), timeChip: $('timeChip'),
  title: $('title'), blurb: $('blurb'), temp: $('temp'), hum: $('hum'), comfort: $('comfort'),
  hours: $('hours'), hoursSub: $('hoursSub'), week: $('week'), weekSub: $('weekSub'),
  sheet: $('sheet'), q: $('q'), results: $('results'), toast: $('toast'),
  normalCard: $('normalCard'), normalSub: $('normalSub'), normalVerdict: $('normalVerdict'),
  normalNote: $('normalNote'), mixBar: $('mixBar'),
  windowCard: $('windowCard'), windowSub: $('windowSub'), windowWhen: $('windowWhen'), windowNote: $('windowNote'),
  strainCard: $('strainCard'), strainSub: $('strainSub'), strainNote: $('strainNote'),
  factorsText: $('factorsText'), doors: $('doors'), doorShade: $('doorShade'), doorSun: $('doorSun'),
  whyBtn: $('whyBtn'), whyCardBtn: $('whyCardBtn'), whySheet: $('whySheet'), whyBody: $('whyBody'), whyClose: $('whyClose'),
};

const prefs = (() => {
  try { return JSON.parse(localStorage.getItem('muggy:prefs') || '{}'); } catch { return {}; }
})();
const savePrefs = () => { try { localStorage.setItem('muggy:prefs', JSON.stringify(prefs)); } catch {} };

const qs = new URLSearchParams(location.search);
const savedUnit = qs.get('unit') || prefs.unit;
// First visit with no saved choice: Fahrenheit for the handful of locales
// that live in it, Celsius for everyone else. The toggle always wins after.
let unit = savedUnit === 'f' || savedUnit === 'c'
  ? savedUnit
  : (/(^|-)(US|BS|BZ|KY|LR)$/i.test(navigator.language || '') ? 'f' : 'c');
let data = null;
let normals = null;       // climatology for this place and date, or null while loading/unavailable
let currentPlace = null;  // the place on screen; share and title derive from this, never from the URL bar
let now = null;           // everything the last render decided, for the "Why?" sheet
// Level changes need a clear crossing, so a reading on a boundary does not
// flip the verdict every minute. Reset when the place changes.
const hysteresis = createHysteresis();

const fmtTemp = (c) => (c == null || !Number.isFinite(c) ? '–' : `${Math.round(unit === 'f' ? c * 9 / 5 + 32 : c)}°`);
/**
 * The WBGT printed beside a level. While hysteresis holds a level across a
 * boundary, the plain rounded value would sit outside the level's range and
 * read as a contradiction, so it is clamped; the Why sheet shows the exact
 * value and says the reading is on the line.
 */
function shownWbgt(value, level) {
  const i = LEVELS.indexOf(level);
  const lo = LEVEL_MIN[i];
  const hi = i + 1 < LEVEL_MIN.length ? LEVEL_MIN[i + 1] - 1 : Infinity;
  return Math.min(hi, Math.max(lo, roundHalfUp(value)));
}
const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const hourLabel = (iso) => iso.slice(11, 13);
const phrase = (level) => (level ? LEVEL_PHRASE[level] : '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const placeKey = () => (currentPlace ? `${currentPlace.lat},${currentPlace.lon}` : 'here');

function toast(msg, ms = 2600) {
  els.toast.textContent = msg;
  els.toast.classList.add('is-on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove('is-on'), ms);
}

function applyPrefUI() {
  document.querySelectorAll('.units button').forEach((b) => b.classList.toggle('is-on', b.dataset.unit === unit));
}

/**
 * "Current" from the model is a 15-minute step; the app promises the minute.
 * The shared interpolation (also used by the link preview) runs against the
 * pristine model step every minute.
 */
function synthesize() {
  if (!data || !data.current) return;
  if (!data._model) data._model = { ...data.current };
  data.current = interpolateNow(data, Date.now(), data._model);
}


// ---------- render ----------
function render() {
  if (!data) return;
  const { current: cur, hourly: h } = data;
  const texture = textureOf(cur.dew_point_2m);
  app.dataset.level = texture;
  app.dataset.state = 'ready';
  els.levelName.textContent = texture;
  els.timeChip.textContent = `now · ${cur.time.slice(11, 16)}`;

  // The heat-load work (current reading, 7-day series, breakdown) is measured
  // as one span so the performance budget can be checked on a slow phone.
  performance.mark('muggy:load:start');
  const reading = cur.temperature_2m != null ? readingNow(data, cur) : null;
  const load = reading ? loadAt(reading) : null;
  const key = placeKey();
  const shadeLevel = load ? hysteresis.level(`${key}:shade`, load.shade) : null;
  const sunLevel = load && load.sunKnown ? hysteresis.level(`${key}:sun`, load.sun) : null;
  // Day or night for the wording is the sun at this minute; the load itself
  // averages over its interval, so it may still carry a sliver of sun at dusk.
  const nowMs = Date.parse(`${cur.time}:00Z`) - (data.utc_offset_seconds || 0) * 1000;
  const isDay = isSunUp(nowMs, data.latitude, data.longitude);
  const sunInPlay = !!(isDay && load && load.sunUp && load.sunKnown);
  const worstValue = load ? (sunInPlay ? Math.max(load.sun, load.shade) : load.shade) : null;
  const verdict = compose({
    texture, shadeLevel, sunLevel, isDay, sunKnown: load ? load.sunKnown : false,
    alert: worstValue != null ? alertMark(worstValue) : null,
  });
  const series = loadSeries(data);
  // Forecast hours levelled relative to the held current levels (see relief.js).
  const hours = load ? forecastHours(h, series, shadeLevel, sunLevel) : [];
  const hourValue = (s) => (s ? (s.sunUp && s.sunKnown ? Math.max(s.sun, s.shade) : s.shade) : null);
  // Trend over the last hour: the difference between the two most recent
  // hourly means, which is steady within the hour rather than flickering.
  const slot = h.time.findIndex((t) => t.slice(0, 13) === cur.time.slice(0, 13));
  const trend = slot > 0 && hourValue(series[slot]) != null && hourValue(series[slot - 1]) != null
    ? hourValue(series[slot]) - hourValue(series[slot - 1]) : 0;
  now = { cur, texture, reading, load, shadeLevel, sunLevel, isDay, sunInPlay, worstValue, verdict, series, hours, trend };

  const named = currentPlace && currentPlace.name && currentPlace.name !== 'My location';
  document.title = named ? `${verdict.headline} in ${currentPlace.name} · muggy.fyi` : `Muggy · ${verdict.headline}`;
  els.title.textContent = verdict.headline;
  els.blurb.textContent = verdict.blurb;
  els.whyBtn.hidden = !load;
  els.temp.textContent = fmtTemp(cur.temperature_2m);
  els.hum.textContent = cur.relative_humidity_2m == null ? '–' : `${Math.round(cur.relative_humidity_2m)}%`;
  els.comfort.textContent = texture;
  els.comfort.classList.toggle('long', texture.length > 8);

  renderHours(cur, h);
  renderWeek(cur, h);
  renderOutInIt();
  // Conservative: the span also covers the hours and week DOM work.
  performance.measure('muggy:load', 'muggy:load:start');
  renderRelief();
  renderNormals();
}

function renderHours(cur, h) {
  // Hours: from the current hour, next 24.
  const curHour = cur.time.slice(0, 13);
  let start = h.time.findIndex((t) => t.slice(0, 13) === curHour);
  if (start < 0) start = 0;
  const slice = [];
  for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
    slice.push({ t: h.time[i], dp: h.dew_point_2m[i], temp: h.temperature_2m[i] });
  }
  // The "now" cell must be the same now as every card above it.
  if (slice.length) slice[0] = { t: cur.time, dp: cur.dew_point_2m, temp: cur.temperature_2m };
  const valid = slice.filter((x) => x.dp != null);
  const peak = valid.reduce((a, b) => (b.dp > a.dp ? b : a), valid[0]);
  els.hours.innerHTML = slice.map((x, i) => {
    const lv = x.dp == null ? 'comfortable' : textureOf(x.dp);
    return `<div class="hour${i === 0 ? ' is-now' : ''}" data-level="${lv}" title="${lv}">
      <span class="t">${i === 0 ? 'now' : `${hourLabel(x.t)}:00`}</span><span class="dot"></span><span class="d">${fmtTemp(x.temp)}</span></div>`;
  }).join('');
  els.hoursSub.textContent = peak ? `stickiest around ${hourLabel(peak.t)}:00 (${textureOf(peak.dp)})` : '';
}

function renderWeek(cur, h) {
  // One row per local date: a 24-segment stickiness bar and the day's high temperature.
  const days = new Map();
  h.time.forEach((t, i) => {
    const d = t.slice(0, 10);
    if (!days.has(d)) days.set(d, { dps: [], temps: [] });
    days.get(d).dps.push(h.dew_point_2m[i]);
    days.get(d).temps.push(h.temperature_2m[i]);
  });
  const todayKey = cur.time.slice(0, 10);
  const rows = [...days.entries()].filter(([d, o]) => d >= todayKey && o.dps.some((v) => v != null)).slice(0, 7);
  let stickyDays = 0;
  els.week.innerHTML = rows.map(([d, { dps, temps }]) => {
    const vals = dps.filter((v) => v != null);
    const hi = Math.max(...temps.filter((v) => v != null));
    const lvMax = textureOf(Math.max(...vals));
    if (['muggy', 'oppressive', 'miserable'].includes(lvMax)) stickyDays++;
    const segs = dps.map((v) => {
      const lv = v == null ? 'comfortable' : textureOf(v);
      return `<i data-level="${lv}" style="--lc:var(--c-${lv})"></i>`;
    }).join('');
    return `<div class="day" title="${lvMax}"><span class="n display">${d === todayKey ? 'Today' : dayName(d)}</span>
      <div class="bar">${segs}</div><span class="d">${fmtTemp(hi)}</span></div>`;
  }).join('');
  els.weekSub.textContent = stickyDays
    ? `${stickyDays} of ${rows.length} day${rows.length === 1 ? '' : 's'} muggy or worse`
    : 'nothing sticky ahead';
}

// ---------- out in it ----------

function factorsFor(n) {
  const inputs = intervalInputs(n.reading);
  // Unknown wind: attribute at the reference breeze so the breeze share is
  // exactly zero, and the shares still add up without a breeze row.
  if (!n.load.windKnown) inputs.wind10 = REFERENCE_WIND_MS;
  const scope = n.sunInPlay ? 'sun' : 'shade';
  const a = attribute(inputs, scope);
  const entries = Object.entries(a.factors).filter(([name]) => name !== 'breeze' || n.load.windKnown);
  return { a, entries, inputs, scope };
}

function renderOutInIt() {
  const n = now;
  const worst = n.verdict.worst;
  if (!n.load || !worst || worst === 'none') { els.strainCard.hidden = true; return; }

  // The two doors: the choice you actually make outside. Only when the sun is in play.
  els.doors.hidden = !n.sunInPlay;
  if (n.sunInPlay) {
    els.doorShade.textContent = phrase(n.shadeLevel);
    els.doorSun.textContent = phrase(n.sunLevel);
  }
  const { a } = factorsFor(n);
  els.factorsText.textContent = factorSummary(a.factors, { windKnown: n.load.windKnown });

  // Where the day is heading; any other level carries its time.
  const today = n.cur.time.slice(0, 10);
  const hours = n.hours
    .filter((x) => x.time.slice(0, 10) === today)
    .map((x) => ({ time: x.time, level: x.sunUp && x.sunKnown !== false && LEVELS.indexOf(x.sunLevel) > LEVELS.indexOf(x.shadeLevel) ? x.sunLevel : x.shadeLevel }));
  els.strainNote.textContent = peakAndTrend({ nowLevel: worst, now: n.cur.time, hours, trend: n.trend }).join(' ');

  const shade = `WBGT ${shownWbgt(n.load.shade, n.shadeLevel)} shade`;
  const sun = n.sunInPlay ? ` · ${shownWbgt(n.load.sun, n.sunLevel)} sun` : '';
  els.strainSub.innerHTML = `<a href="/about#wbgt">${shade}${sun} · what's this?</a>`;
  els.strainCard.hidden = false;
}

// ---------- when will it get better ----------
function renderRelief() {
  const n = now;
  const current = { time: n.cur.time, texture: n.texture, shadeLevel: n.shadeLevel, sunLevel: n.sunLevel, sunUp: n.isDay, sunKnown: n.load ? n.load.sunKnown : false };
  const d = n.load ? describeRelief(findRelief(current, n.hours)) : null;
  if (!d) { els.windowCard.hidden = true; return; }
  const panel = els.windowCard.querySelector('.panel');
  if (panel) panel.style.background = `var(--c-${d.tint})`;
  els.windowWhen.textContent = d.when;
  els.windowSub.textContent = d.sub;
  els.windowNote.textContent = d.note;
  els.windowCard.hidden = false;
}

// ---------- is this normal? ----------
function renderNormals() {
  if (!normals || !data) { els.normalCard.hidden = true; return; }
  const d = describeNormals(normals, data.current.dew_point_2m, Number(data.current.time.slice(11, 13)));
  if (!d) { els.normalCard.hidden = true; return; }
  els.normalVerdict.textContent = d.verdict;
  els.normalSub.textContent = d.sub;
  els.normalNote.textContent = d.note;
  // Segments sized by each band's share of the comparison set, so the marker at
  // the current percentile lands inside today's band.
  const segs = barSegments(d.mix)
    .map((s) => `<i style="flex-grow:${(s.share * 1000).toFixed(0)};background:var(--c-${s.band})" title="${s.band} ${Math.round(s.share * 100)}%"></i>`)
    .join('');
  els.mixBar.innerHTML = `${segs}<span class="marker" style="left:${d.pct}%"></span>`;
  els.normalCard.hidden = false;
}

async function loadNormals(place, superseded = () => false) {
  normals = null;
  els.normalCard.hidden = true;
  try {
    const r = await fetch(`/api/normals?lat=${place.lat}&lon=${place.lon}`);
    if (!r.ok || superseded()) return;     // no history for this spot, or the user has moved on
    const j = await r.json();
    if (!hasHourLadders(j) || superseded()) return;
    normals = j;
    renderNormals();
  } catch { /* the rest of the app is unaffected */ }
}

// ---------- why this verdict? ----------
let whyOpener = null;
const section = (title, body) => `<section><h3>${esc(title)}</h3>${body}</section>`;

function openWhy(opener) {
  const n = now;
  if (!n) return;
  const { verdict, texture, load, isDay } = n;
  const parts = [];
  parts.push(section('The verdict', `<p><strong>${esc(verdict.headline)}.</strong> ${esc(verdict.blurb)}</p>`));
  parts.push(section('The air', `<p>The air is <strong>${esc(texture)}</strong>. ${esc(TEXTURE_SENTENCE[texture][isDay ? 'day' : 'night'])}</p>
    <p class="small">That comes from the dew point, which is how much water the air already holds. It decides how well sweat can dry.</p>`));

  if (load && verdict.worst) {
    if (verdict.worst !== 'none') {
      const { a, entries, inputs } = factorsFor(n);
      const lines = entries.map(([name, c]) => `<p>${esc(factorSentence(name, c, a.words[name], { wind10: inputs.wind10 }))}</p>`).join('');
      parts.push(section('Why it feels like this', `<p>Compared with a dry, shady ${esc(fmtTemp(n.cur.temperature_2m))} in a light wind.</p>${lines}`));
    }
    if (verdict.split) {
      parts.push(section('Shade and sun', `<p>Under cover it is <strong>${esc(phrase(n.shadeLevel))}</strong>. Standing in the sun it is <strong>${esc(phrase(n.sunLevel))}</strong>. The sun heats you directly, the way it heats a black globe.</p>`));
    }
    parts.push(section(verdict.worst === 'none' ? 'The heat load' : `What ${phrase(verdict.worst)} means`, `<p>${esc(LEVEL_GUIDE[verdict.worst])}</p>
      <p class="small">Paraphrased from the Japanese Society of Biometeorology's daily-life guideline and Japan's Ministry of the Environment. Age, fitness, clothing and how used you are to the heat all change your own risk.</p>`));
    const nums = `WBGT ${load.shade.toFixed(1)} °C in the shade${n.sunInPlay ? ` and ${load.sun.toFixed(1)} °C in the sun` : ''}.`;
    const held = levelOf(load.shade) !== n.shadeLevel || (n.sunInPlay && levelOf(load.sun) !== n.sunLevel);
    const onLine = held
      ? ' That is right on the line between two levels. Muggy keeps the earlier one until the reading clearly crosses.'
      : '';
    parts.push(section('Where the numbers come from', `<p>${nums}${onLine} WBGT, wet-bulb globe temperature, blends a wet thermometer (how well sweat can cool you), a black globe (how much sun and warm surroundings load you) and the air temperature, the way Japan's Ministry of the Environment publishes it.</p>
      <p class="small">Muggy models it from the forecast for your area, not your street, and checks the model against dozens of stations that measure it. <a href="/about#wbgt">How Muggy works →</a></p>`));
  } else {
    parts.push(section('Heat load', '<p>No temperature is available right now, so Muggy only describes the air.</p>'));
  }

  els.whyBody.innerHTML = parts.join('');
  whyOpener = opener;
  els.whySheet.showModal();
  els.whyClose.focus();
}

els.whyBtn.addEventListener('click', (e) => openWhy(e.currentTarget));
els.whyCardBtn.addEventListener('click', (e) => openWhy(e.currentTarget));
els.whyClose.addEventListener('click', () => els.whySheet.close());
els.whySheet.addEventListener('click', (e) => { if (e.target === els.whySheet) els.whySheet.close(); });
els.whySheet.addEventListener('close', () => { if (whyOpener) whyOpener.focus(); whyOpener = null; });

// ---------- data ----------
function syncUrl(place, push) {
  // Geolocation stays at "/" — coordinates do not belong in a shareable URL.
  const path = place.geo ? '/' : `/${slugify(place.name)}`;
  try {
    if (push) history.pushState({}, '', path);
    else history.replaceState({}, '', path);
  } catch { /* sandboxed contexts */ }
}

// Loads can overlap (boot runs load(prefs.place) and then a GPS locate; a
// stale-cache refetch fires six seconds after any load). Only the newest load
// may touch the screen, or a slow response for a place the user has left
// would overwrite the one they asked for.
let loadSeq = 0;

async function load(place, { push } = {}) {
  const seq = ++loadSeq;
  const superseded = () => seq !== loadSeq;
  app.dataset.state = 'loading';
  els.placeName.textContent = place.name;
  syncUrl(place, push);
  try {
    const r = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}`);
    if (superseded()) return;
    if (!r.ok) throw new Error(`forecast ${r.status}`);
    const fresh = await r.json();
    if (superseded()) return;
    data = fresh;
    if (!data.current || data.current.dew_point_2m == null) throw new Error('no dew point');
    if (!currentPlace || currentPlace.lat !== place.lat || currentPlace.lon !== place.lon) hysteresis.reset();
    currentPlace = place;
    if (!place.geo) {
      const rec = (prefs.recents || []).filter((r2) => r2.name !== place.name);
      rec.unshift({ name: place.name, lat: place.lat, lon: place.lon });
      prefs.recents = rec.slice(0, 5);
    }
    prefs.place = place; savePrefs();
    synthesize();
    render();
    // A stale hit means the worker is refreshing KV behind this response.
    // Pick the fresh copy up once, quietly, without flashing the UI.
    if (r.headers.get('x-muggy-cache') === 'stale') {
      setTimeout(async () => {
        if (superseded()) return;
        try {
          const r2 = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}`, { cache: 'reload' });
          if (!r2.ok || superseded()) return;
          const d2 = await r2.json();
          if (superseded()) return;
          if (d2.current && d2.current.dew_point_2m != null) { data = d2; synthesize(); render(); }
        } catch { /* the stale data stays; it was good enough to render */ }
      }, 6000);
    }
    loadNormals(place, superseded);   // slower and optional; never blocks the main view
  } catch (err) {
    if (superseded()) return;
    console.error(err);
    app.dataset.state = 'error';
    els.title.textContent = 'Could not read the sky.';
    els.blurb.textContent = 'The weather service did not answer. Pull down or try again in a moment.';
    toast('Weather service unavailable');
  }
}

/**
 * getCurrentPosition with a cap WE enforce. In-app browsers (LinkedIn,
 * Instagram) often neither prompt nor call the error callback — the spec's
 * own timeout only starts after permission resolves, so the call can hang
 * forever. This one always answers.
 */
const gps = (ms) => new Promise((resolve) => {
  let done = false;
  const finish = (v) => { if (!done) { done = true; resolve(v); } };
  if (!navigator.geolocation) return finish(null);
  try {
    navigator.geolocation.getCurrentPosition((p) => finish(p), () => finish(null),
      { timeout: Math.max(1000, ms - 500), maximumAge: 600000 });
  } catch { finish(null); }
  setTimeout(() => finish(null), ms);
});

/** Coordinates → the name of the biggest real city that agrees on where we are. */
async function nameFor(lat, lon) {
  let name = 'My location';
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const j = r.ok ? await r.json() : null;
    if (j) name = j.city || j.locality || j.principalSubdivision || name;
    const fields = j ? [j.city, j.locality, j.principalSubdivision,
      ...(((j.localityInfo || {}).administrative) || []).map((a) => a.name)].filter(Boolean) : [];
    const cands = [...new Set(fields.map((f) => f.trim()))].slice(0, 7);
    const near = await Promise.all(cands.map(async (q2) => {
      try {
        const g = await fetch(`/api/geocode?q=${encodeURIComponent(q2)}`);
        if (!g.ok) return null;
        const c = ((await g.json()).results || [])[0];
        if (!c || /^PCL/.test(c.fc || '')) return null;
        return Math.abs(c.lat - lat) < 0.7 && Math.abs(c.lon - lon) < 0.7 ? c : null;
      } catch { return null; }
    }));
    const best = near.filter(Boolean).sort((a2, b2) => (b2.population || 0) - (a2.population || 0))[0];
    if (best) name = best.name;
  } catch { /* the generic label is a fine fallback */ }
  return name;
}

async function locate({ silent } = {}) {
  const pos = await gps(6000);
  if (!pos) { if (!silent) toast('Could not get your location'); return false; }
  const lat = +pos.coords.latitude.toFixed(3);
  const lon = +pos.coords.longitude.toFixed(3);
  const name = await nameFor(lat, lon);
  load({ name, lat, lon, geo: true });
  return true;
}

/** IP-level location from our own worker: instant, promptless, city-close. */
async function ipLocate() {
  try {
    const r = await fetch('/api/whereami');
    if (!r.ok) return false;
    const j = await r.json();
    if (j.lat == null || j.lon == null) return false;
    const lat = +(+j.lat).toFixed(2);
    const lon = +(+j.lon).toFixed(2);
    load({ name: j.city || await nameFor(lat, lon), lat, lon, geo: true });
    return true;
  } catch { return false; }
}

// ---------- search sheet ----------
let searchT = null;
function renderResults(list, emptyMsg) {
  if (!list.length) { els.results.innerHTML = emptyMsg ? `<li class="empty">${emptyMsg}</li>` : ''; return; }
  els.results.innerHTML = list.map((p, i) => `<li><button type="button" data-i="${i}">
    <span class="nm">${esc(p.name)}</span><span class="ad">${esc([p.admin, p.country].filter(Boolean).join(', '))}</span></button></li>`).join('');
  els.results.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const p = list[+b.dataset.i];
    els.sheet.close();
    load({ name: p.name, lat: p.lat, lon: p.lon }, { push: true });
  }));
}

els.q.addEventListener('input', () => {
  clearTimeout(searchT);
  const q = els.q.value.trim();
  if (q.length < 2) { renderResults([]); return; }
  searchT = setTimeout(async () => {
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (els.q.value.trim() !== q) return;
      renderResults(j.results || [], 'No matches. Try a bigger town nearby.');
    } catch { renderResults([], 'Search is unavailable right now.'); }
  }, 280);
});
// Enter in the search box submits the dialog form and closes the sheet with
// nothing chosen. People type a city and hit Enter; give them the top match.
els.q.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const first = els.results.querySelector('button');
  if (first) first.click();
});
function renderRecents() {
  const rec = prefs.recents || [];
  const box = $('recents');
  box.innerHTML = rec.map((r2, i) => `<button type="button" data-i="${i}">${esc(r2.name)}</button>`).join('');
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const r2 = rec[+b.dataset.i];
    els.sheet.close();
    load({ name: r2.name, lat: r2.lat, lon: r2.lon }, { push: true });
  }));
}
$('placeBtn').addEventListener('click', () => { els.sheet.showModal(); els.q.value = ''; renderResults([]); renderRecents(); setTimeout(() => els.q.focus(), 50); });
$('geoBtn').addEventListener('click', async () => {
  els.sheet.close();
  if (!(await locate())) {
    if (await ipLocate()) toast('Using your rough location');
  }
});
els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) els.sheet.close(); });

// ---------- toggles ----------
document.querySelectorAll('.units button').forEach((b) => b.addEventListener('click', () => {
  unit = b.dataset.unit; prefs.unit = unit; savePrefs(); applyPrefUI(); render();
}));

// ---------- boot ----------
async function loadFromSlug(slug) {
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(slug.replace(/-/g, ' '))}`);
    const j = await r.json();
    const p = (j.results || [])[0];
    if (!p) return false;
    load({ name: p.name, lat: p.lat, lon: p.lon });
    return true;
  } catch { return false; }
}

window.addEventListener('popstate', () => {
  const slug = location.pathname.replace(/^\/+|\/+$/g, '');
  if (slug) loadFromSlug(slug);
  else if (prefs.place) load(prefs.place);
});

$('shareBtn').addEventListener('click', async () => {
  const named = currentPlace && currentPlace.name && currentPlace.name !== 'My location';
  const url = `https://muggy.fyi/${named ? slugify(currentPlace.name) : ''}`;
  const title = document.title;
  const text = data ? `${els.title.textContent} in ${els.placeName.textContent}. ${els.blurb.textContent}` : title;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch { /* dismissed */ }
  } else {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  }
});

applyPrefUI();
(async () => {
  const slug = location.pathname.replace(/^\/+|\/+$/g, '');
  if (/^[a-z0-9-]{2,60}$/i.test(slug)) {
    if (await loadFromSlug(slug)) return;
    toast('Could not find that place');
  }
  if (prefs.place && Number.isFinite(prefs.place.lat)) {
    load(prefs.place);
    if (prefs.place.geo) locate({ silent: true }); // refresh silently if they were on GPS
    return;
  }
  if (await ipLocate()) {
    locate({ silent: true });   // background upgrade to real GPS, if the browser allows it
    return;
  }
  const ok = await locate({ silent: true });
  if (!ok) { load(DEFAULT_PLACE); toast('Showing Tirana. Tap the name to change.'); }
})();

// The minute tick moves the interpolated reading; the five-minute fetch
// brings a fresh model step behind it.
setInterval(() => {
  if (data && !document.hidden) { synthesize(); render(); }
}, 60000);
setInterval(async () => {
  if (!currentPlace || document.hidden) return;
  const place = currentPlace;
  const seq = loadSeq;
  try {
    const r = await fetch(`/api/forecast?lat=${place.lat}&lon=${place.lon}`, { cache: 'reload' });
    if (!r.ok || seq !== loadSeq) return;   // the user has moved on
    const d = await r.json();
    if (seq !== loadSeq) return;
    if (d.current && d.current.dew_point_2m != null) { data = d; synthesize(); render(); }
  } catch { /* keep what we have */ }
}, 300000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Refresh when coming back to the tab after a while.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 15 * 60000 && prefs.place) load(prefs.place);
});
