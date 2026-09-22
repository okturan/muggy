// Builds the named browser-test fixtures: Open-Meteo-shaped forecasts for
// Tirana with clear-sky radiation from the engine's own solar geometry. Each
// scenario is confirmed against the real modules before it is written, so a
// fixture can never silently stop describing the situation it is named after.
//
// Usage: node tools/e2e-fixtures.mjs   → test/e2e/fixtures/*.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { czaAt } from '../public/lib/sun.js';
import { interpolateNow } from '../public/lib/interp.js';
import { textureOf } from '../public/lib/texture.js';
import { loadNow, loadSeries, rhFromDewPoint, isSunUp } from '../public/lib/load.js';
import { levelOf, alertMark } from '../public/lib/levels.js';
import { compose } from '../public/lib/verdict.js';
import { findRelief, describeRelief, forecastHours } from '../public/lib/relief.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'e2e', 'fixtures');
const PLACE = { name: 'Tirana', lat: 41.33, lon: 19.82, elevation: 119, offset: 7200 };
const MIN = 60000;

const ghiAt = (ms, clear) => {
  const c = czaAt(ms, PLACE.lat, PLACE.lon);
  return c > 0.00873 ? clear * 1098 * c * Math.exp(-0.057 / c) : 0;
};
const meanGhi = (endMs, minutes, clear) => {
  let s = 0;
  for (let k = 0; k < minutes; k++) s += ghiAt(endMs - (minutes - k - 0.5) * MIN, clear);
  return s / minutes;
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/** profile(localHour, dayIndex, minuteIndex) → { T, Td, wind (km/h), clear } */
function forecast({ date, now, profile, radiation = true, temperature = true }) {
  const midnight = Date.parse(`${date}T00:00:00Z`) - PLACE.offset * 1000;
  const nowMs = Date.parse(`${date}T${now}:00Z`) - PLACE.offset * 1000;
  const iso = (ms) => new Date(ms + PLACE.offset * 1000).toISOString().slice(0, 16);
  const at = (ms, minutes, stepIndex) => {
    const localH = (ms - midnight) / 3600000;
    const p = profile(((localH % 24) + 24) % 24, Math.floor(localH / 24), stepIndex);
    const sw = radiation ? meanGhi(ms, minutes, p.clear ?? 1) : null;
    return {
      temperature_2m: temperature ? r1(p.T) : null,
      relative_humidity_2m: temperature ? Math.round(Math.min(100, rhFromDewPoint(p.T, p.Td))) : null,
      dew_point_2m: r1(p.Td),
      apparent_temperature: temperature ? r1(p.T) : null,
      wind_speed_10m: r1(p.wind),
      surface_pressure: 1004,
      shortwave_radiation: r1(sw),
      direct_radiation: radiation ? r1(0.8 * sw) : null,
      diffuse_radiation: radiation ? r1(0.2 * sw) : null,
      is_day: czaAt(ms, PLACE.lat, PLACE.lon) > 0 ? 1 : 0,
      weather_code: 0,
    };
  };
  const keys = Object.keys(at(nowMs, 60, 0));
  const hourly = Object.fromEntries([['time', []], ...keys.map((k) => [k, []])]);
  for (let i = 0; i < 168; i++) {
    const ms = midnight + i * 3600000;
    hourly.time.push(iso(ms));
    const v = at(ms, 60, null);
    for (const k of keys) hourly[k].push(v[k]);
  }
  const m15 = Object.fromEntries([['time', []], ...keys.map((k) => [k, []])]);
  const firstStep = Math.floor(nowMs / (15 * MIN)) * 15 * MIN - 15 * MIN;
  for (let i = 0; i < 96; i++) {
    const ms = firstStep + i * 15 * MIN;
    m15.time.push(iso(ms));
    const v = at(ms, 15, i);
    for (const k of keys) m15[k].push(v[k]);
  }
  const curMs = Math.floor(nowMs / (15 * MIN)) * 15 * MIN;
  const current = { time: iso(curMs), interval: 900, ...at(curMs, 15, Math.round((curMs - firstStep) / (15 * MIN))) };
  const data = {
    latitude: PLACE.lat, longitude: PLACE.lon, elevation: PLACE.elevation, utc_offset_seconds: PLACE.offset,
    timezone: 'Europe/Tirane', current, minutely_15: m15, hourly,
  };
  return { data, nowMs, nowLocal: `${date}T${now}` };
}

/** What the first render must show (no hysteresis yet). */
function expected(data, nowMs) {
  const cur = interpolateNow(data, nowMs);
  const texture = textureOf(cur.dew_point_2m);
  const load = cur.temperature_2m != null ? loadNow(data, cur) : null;
  const shadeLevel = load ? levelOf(load.shade) : null;
  const sunLevel = load && load.sunKnown ? levelOf(load.sun) : null;
  // Mirrors app.js render(): day/night is the sun at this minute; hours are levelled relative to now.
  const isDay = isSunUp(nowMs, PLACE.lat, PLACE.lon);
  const sunInPlay = !!(isDay && load && load.sunUp && load.sunKnown);
  const worst = load ? (sunInPlay ? Math.max(load.sun, load.shade) : load.shade) : null;
  const verdict = compose({ texture, shadeLevel, sunLevel, isDay, sunKnown: load ? load.sunKnown : false, alert: worst != null ? alertMark(worst) : null, air: { t: cur.temperature_2m, rh: cur.relative_humidity_2m } });
  const series = loadSeries(data);
  const hours = load ? forecastHours(data.hourly, series, shadeLevel, sunLevel) : [];
  const relief = load ? describeRelief(findRelief({ time: cur.time, texture, shadeLevel, sunLevel, sunUp: isDay, sunKnown: load.sunKnown }, hours)) : null;
  return { texture, shadeLevel, sunLevel, sunUp: load ? isDay : null, sunKnown: load ? load.sunKnown : null, headline: verdict.headline, blurb: verdict.blurb, split: verdict.split, worst: verdict.worst, relief, shade: load && load.shade, sun: load && load.sun };
}

const normalsFixture = {
  years: 10, windowDays: 7, hourSpan: 2,
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour, n: 750,
    q: Array.from({ length: 101 }, (_, i) => Math.round((6 + i * 0.16) * 10) / 10),
    mix: { dry: 0.425, comfortable: 0.175, humid: 0.169, muggy: 0.175, oppressive: 0.056 },
  })),
};

const diurnal = (base, amp, h, peak = 15) => base + amp * Math.cos((2 * Math.PI * (h - peak)) / 24);

/** Try candidate profiles in order until the scenario check passes. */
function scenario(name, candidates, check, extra = {}) {
  for (const c of candidates) {
    const f = forecast(c);
    const exp = expected(f.data, f.nowMs);
    if (check(exp, f)) return { name, ...extra, nowMs: f.nowMs, nowLocal: f.nowLocal, place: PLACE, data: f.data, normals: normalsFixture, expect: exp };
  }
  throw new Error(`fixture ${name}: no candidate produced the scenario`);
}
const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step);

const fixtures = [
  // The moment that started this change: a muggy mid-morning in full sun.
  scenario('tirana-2026-09-13-1030', [{ date: '2026-09-13', now: '10:30', profile: (h) => ({ T: diurnal(22.5, 4.5, h), Td: 18.5, wind: 7 }) }],
    (e) => e.texture === 'muggy'),
  scenario('muggy-mild-dawn', range(18.6, 21, 0.2).map((base) => ({ date: '2026-09-13', now: '06:45', profile: (h) => ({ T: Math.max(18.9, diurnal(base + 3, 3, h)), Td: 18.5, wind: 5 }) })),
    (e) => e.headline === 'Muggy but mild'),
  scenario('split-noon', range(20, 34, 0.5).map((T) => ({ date: '2026-07-20', now: '12:30', profile: (h) => ({ T: diurnal(T, 3, h), Td: 9, wind: 12 }) })),
    (e) => e.split && e.shadeLevel !== 'none'),
  scenario('dry-heat-danger', range(38, 50, 0.5).map((T) => ({ date: '2026-07-20', now: '13:30', profile: (h) => ({ T: diurnal(T, 3, h), Td: 12, wind: 6 }) })),
    (e) => e.worst === 'dangerous' && e.texture === 'dry'),
  scenario('sunset-relief', range(26, 32, 0.5).map((T) => ({ date: '2026-07-20', now: '17:00', profile: (h) => ({ T: diurnal(T, 5, h), Td: 19.5, wind: 5 }) })),
    (e) => e.relief && e.relief.sub === 'first relief' && /from \d\d:00/.test(e.relief.note) && ['sunDown', 'cooler', 'both'].some(() => true) && e.worst !== 'easy' && e.worst !== 'none'),
  scenario('night-oppressive', range(24, 30, 0.5).map((T) => ({ date: '2026-07-20', now: '23:10', profile: (h, day) => ({ T: diurnal(T, 3.5, h), Td: (day === 0 && h >= 18) || (day === 1 && h < 5) ? 22.4 : 17, wind: 4 }) })),
    (e) => e.texture === 'oppressive' && e.sunUp === false && e.relief && e.relief.sub !== 'next 24 hours'),
  scenario('missing-radiation', [{ date: '2026-07-20', now: '12:30', radiation: false, profile: (h) => ({ T: diurnal(29, 4, h), Td: 17, wind: 8 }) }],
    (e) => e.sunKnown === false && e.split === false),
  scenario('no-temperature', [{ date: '2026-09-13', now: '10:30', temperature: false, profile: (h) => ({ T: diurnal(22.5, 4.5, h), Td: 18.5, wind: 7 }) }],
    (e) => e.shadeLevel === null && e.headline === "It's muggy out"),
];

// A reading that hovers on the Easy/Noticeable line at night: the rounded
// level flips from minute to minute, the displayed level must not.
{
  const build = (Tb) => forecast({ date: '2026-09-13', now: '21:07', profile: (h, day, step) => ({ T: Tb + (step == null ? 0 : step % 2 ? 0.2 : -0.2), Td: 16, wind: 6 }) });
  let lo = 14; let hi = 26;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const f = build(mid);
    const e = expected(f.data, f.nowMs);
    if (e.shade < 20.5) lo = mid; else hi = mid;
  }
  const f = build((lo + hi) / 2);
  const raw = [];
  for (let m = 0; m <= 60; m++) {
    const cur = interpolateNow(f.data, f.nowMs + m * MIN);
    raw.push(levelOf(loadNow(f.data, cur).shade));
  }
  const flips = raw.filter((l, i) => i && l !== raw[i - 1]).length;
  if (flips < 2) throw new Error(`boundary fixture: raw level only flips ${flips} times`);
  fixtures.push({ name: 'boundary-hysteresis', nowMs: f.nowMs, nowLocal: f.nowLocal, place: PLACE, data: f.data, normals: normalsFixture, expect: expected(f.data, f.nowMs), rawLevelsByMinute: raw, rawFlips: flips });
}

mkdirSync(OUT, { recursive: true });
for (const fx of fixtures) {
  writeFileSync(join(OUT, `${fx.name}.json`), JSON.stringify(fx));
  console.log(`${fx.name.padEnd(24)} ${fx.expect.headline}${fx.expect.relief ? ` | relief: ${fx.expect.relief.when}` : ''}${fx.rawFlips ? ` | raw flips ${fx.rawFlips}` : ''}`);
}
