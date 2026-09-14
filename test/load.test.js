import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAt, loadNow, loadSeries, wbgtInterval, pressureFromElevation } from '../public/lib/load.js';
import { CALIBRATION } from '../public/lib/calibration.js';
import { czaAt } from '../public/lib/sun.js';
import { estWindSpeed, stabSrdt, CZA_MIN } from '../public/lib/wbgt.js';

const TIRANA = { lat: 41.33, lon: 19.82, elevation: 119, utcOffsetSeconds: 7200 };
const noon = {
  ...TIRANA, time: '2026-09-13T13:00', avgMinutes: 60,
  temperature_2m: 30, relative_humidity_2m: 50, wind_speed_10m: 9, surface_pressure: 1004,
  shortwave_radiation: 800, direct_radiation: 680,
};

test('WBGT is 0.7 Tw + 0.2 Tg + 0.1 Ta with a 150 mm globe', () => {
  const o = loadAt(noon);
  assert.equal(CALIBRATION.globeDiameter, 0.15);
  assert.ok(Math.abs(o.shade - (0.7 * o.tw + 0.2 * o.tgShade + 0.1 * 30)) < 1e-9);
  assert.ok(Math.abs(o.sun - (0.7 * o.tw + 0.2 * o.tgSun + 0.1 * 30)) < 1e-9);
});

test('sun raises the load at a clear noon; night makes sun equal shade', () => {
  const day = loadAt(noon);
  assert.ok(day.sunUp && day.sunKnown && day.fSun === 1);
  assert.ok(day.sun > day.shade + 1, `sun ${day.sun} vs shade ${day.shade}`);
  const night = loadAt({ ...noon, time: '2026-09-13T23:00', shortwave_radiation: 0, direct_radiation: 0 });
  assert.equal(night.sunUp, false);
  assert.equal(night.sun, night.shade);
});

test('the direct fraction comes from the data when present, the estimate otherwise', () => {
  const a = loadAt({ ...noon, direct_radiation: 80 });
  const b = loadAt({ ...noon, direct_radiation: 720 });
  assert.notEqual(a.sun, b.sun);
  assert.equal(loadAt({ ...noon, direct_radiation: 800 }).sun, b.sun, 'direct/shortwave is clamped to 0.9');
  const est = loadAt({ ...noon, direct_radiation: null });
  assert.ok(est.sunKnown && est.sun > est.shade);
  assert.notEqual(est.sun, a.sun);
  assert.notEqual(est.sun, b.sun);
});

test('an hour holding sunset blends the sunlit part with shade', () => {
  // Tirana 21 June, sunset about 18:48 UTC+... local 20:48; the hour ending 21:00 local is partly lit.
  const r = { ...TIRANA, time: '2026-06-21T21:00', avgMinutes: 60, temperature_2m: 27, relative_humidity_2m: 55,
    wind_speed_10m: 6, surface_pressure: 1008, shortwave_radiation: 40, direct_radiation: 20 };
  const o = loadAt(r);
  assert.ok(o.fSun > 0 && o.fSun < 1, `fSun ${o.fSun}`);
  assert.ok(o.sun >= o.shade);
});

test('shade and sun share one 2 m wind from the real irradiance, never below the minimum', () => {
  const o = loadAt(noon);
  const cls = stabSrdt(true, 9 / 3.6, 800, 1);
  const expected = Math.max(estWindSpeed(9 / 3.6, 10, cls, 1), CALIBRATION.minWind2);
  assert.ok(Math.abs(o.wind2 - expected) < 1e-9);
  const calm = loadAt({ ...noon, wind_speed_10m: 0 }, { ...CALIBRATION, minWind2: 1 });
  assert.equal(calm.wind2, 1);
});

test('missing radiation in daylight: sun unknown, sun equals shade', () => {
  const out = loadAt({ ...noon, shortwave_radiation: null, direct_radiation: null });
  assert.equal(out.sunUp, true);
  assert.equal(out.sunKnown, false);
  assert.equal(out.sun, out.shade);
});

test('missing wind: still produced, flagged unknown', () => {
  const out = loadAt({ ...noon, wind_speed_10m: null });
  assert.ok(Number.isFinite(out.shade));
  assert.equal(out.windKnown, false);
});

test('missing pressure: estimated from elevation', () => {
  const fromElev = loadAt({ ...noon, surface_pressure: null });
  const explicit = loadAt({ ...noon, surface_pressure: pressureFromElevation(TIRANA.elevation) });
  assert.equal(fromElev.shade, explicit.shade);
});

test('missing temperature or humidity: no WBGT; dew point stands in for humidity', () => {
  assert.equal(loadAt({ ...noon, temperature_2m: null }), null);
  assert.equal(loadAt({ ...noon, relative_humidity_2m: null }), null);
  const viaDew = loadAt({ ...noon, relative_humidity_2m: null, dew_point_2m: 18.4 });
  assert.ok(viaDew && Number.isFinite(viaDew.shade));
});

test('loadNow uses the 15-minute step that contains now; loadSeries covers every hour', () => {
  const data = {
    latitude: 41.33, longitude: 19.82, elevation: 119, utc_offset_seconds: 7200,
    minutely_15: {
      time: ['2026-09-13T10:15', '2026-09-13T10:30', '2026-09-13T10:45'],
      shortwave_radiation: [600, 640, 680], direct_radiation: [480, 520, 560],
    },
    hourly: {
      time: ['2026-09-13T10:00', '2026-09-13T11:00'],
      temperature_2m: [23, 24], relative_humidity_2m: [74, 71], dew_point_2m: [18.2, 18.5],
      wind_speed_10m: [7, 8], surface_pressure: [1004, 1004], shortwave_radiation: [560, 700], direct_radiation: [440, 580],
    },
  };
  const cur = { time: '2026-09-13T10:37', temperature_2m: 23.7, relative_humidity_2m: 72, wind_speed_10m: 7.4, surface_pressure: 1004 };
  const now = loadNow(data, cur);
  const expected = loadAt({ ...TIRANA, ...cur, time: '2026-09-13T10:45', avgMinutes: 15, shortwave_radiation: 680, direct_radiation: 560 });
  assert.deepEqual(now, expected);
  const series = loadSeries(data);
  assert.equal(series.length, 2);
  assert.ok(series.every((s) => s && Number.isFinite(s.shade) && Number.isFinite(s.sun)));
});

test('interval-averaged inputs agree with minute-resolved physics (hourly ≤ 0.7 °C, 15-minute ≤ 0.2 °C)', () => {
  const ghi = (c) => (c > CZA_MIN ? 1098 * c * Math.exp(-0.057 / c) : 0);
  const airs = [[18, 30, 2], [26, 60, 7], [34, 50, 15]];
  const worst = { 60: 0, 15: 0 };
  for (const lat of [-35, 0, 23.4, 41.33, 60, 64]) {
    for (const date of ['2026-03-20', '2026-06-21', '2026-09-13', '2026-12-21']) {
      for (const [tair, rh, windKmh] of airs) {
        const base = { lat, lon: 0, tair, rh, wind10: windKmh / 3.6, pres: 1013 };
        for (const minutes of [60, 15]) {
          const day0 = Date.parse(`${date}T00:00:00Z`);
          for (let end = day0 + minutes * 60000; end <= day0 + 86400000; end += minutes * 60000) {
            let sum = 0;
            let lit = 0;
            const mins = [];
            for (let s = 0; s < minutes; s++) {
              const ms = end - (minutes - s - 0.5) * 60000;
              const g = ghi(czaAt(ms, lat, 0));
              mins.push({ ms, g });
              if (g > 0) lit++;
            }
            if (!lit) continue;
            const avg = mins.reduce((a, m) => a + m.g, 0) / minutes;
            for (const m of mins) sum += wbgtInterval({ ...base, endMs: m.ms, minutes: 0, sw: m.g, direct: 0.8 * m.g }).sun;
            const truth = sum / minutes;
            const got = wbgtInterval({ ...base, endMs: end, minutes, sw: avg, direct: 0.8 * avg }).sun;
            const d = Math.abs(got - truth);
            worst[minutes] = Math.max(worst[minutes], d);
            const tol = minutes === 60 ? 0.7 : 0.2;
            assert.ok(d <= tol, `lat ${lat} ${date} ${new Date(end).toISOString()} ${minutes}m air ${tair}/${rh}/${windKmh}: ${got.toFixed(2)} vs ${truth.toFixed(2)}`);
          }
        }
      }
    }
  }
  console.log(`worst: hourly ${worst[60].toFixed(3)} °C, 15-minute ${worst[15].toFixed(3)} °C`);
});
