import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolateNow, localIso } from '../public/lib/interp.js';

const data = {
  utc_offset_seconds: 7200,
  current: { time: '2026-09-13T10:30', temperature_2m: 23, dew_point_2m: 18 },
  minutely_15: {
    time: ['2026-09-13T10:30', '2026-09-13T10:45', '2026-09-13T11:00'],
    temperature_2m: [23, 24, 26],
    relative_humidity_2m: [74, 72, 66],
    dew_point_2m: [18, 18.6, 19.2],
    wind_speed_10m: [6, 8, 8],
    surface_pressure: [1004, 1004.2, 1004.4],
    shortwave_radiation: [600, 660, null],
    direct_radiation: [480, 540, 600],
  },
};
// 10:30 local at UTC+2 is 08:30 UTC.
const at = (hhmm) => Date.parse(`2026-09-13T${hhmm}:00Z`) - 7200 * 1000;

test('local minute in the place time zone', () => {
  assert.equal(localIso(data, at('10:37')), '2026-09-13T10:37');
});

test('linear interpolation to the minute across every field', () => {
  const cur = interpolateNow(data, at('10:36'));
  assert.equal(cur.time, '2026-09-13T10:36');
  assert.ok(Math.abs(cur.temperature_2m - 23.4) < 1e-9);
  assert.ok(Math.abs(cur.dew_point_2m - 18.24) < 1e-9);
  assert.ok(Math.abs(cur.wind_speed_10m - 6.8) < 1e-9);
  assert.ok(Math.abs(cur.shortwave_radiation - 624) < 1e-9);
  assert.ok(Math.abs(cur.surface_pressure - 1004.08) < 1e-9);
});

test('a missing end value holds the start value', () => {
  const cur = interpolateNow(data, at('10:50'));
  assert.equal(cur.shortwave_radiation, 660);
});

test('before the series starts, the model step stands', () => {
  const cur = interpolateNow(data, at('10:10'));
  assert.equal(cur.time, '2026-09-13T10:30');
  assert.equal(cur.temperature_2m, 23);
});

test('five minutes give five monotone readings between steps', () => {
  const temps = ['10:31', '10:34', '10:38', '10:41', '10:44'].map((t) => interpolateNow(data, at(t)).temperature_2m);
  for (let i = 1; i < temps.length; i++) assert.ok(temps[i] > temps[i - 1]);
});
