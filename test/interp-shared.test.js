// The page and its link preview read the same minute the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolateNow } from '../public/lib/interp.js';
import { previewVerdict } from '../src/index.js';

const data = {
  latitude: 41.31, longitude: 19.81, elevation: 119, utc_offset_seconds: 7200,
  current: { time: '2026-09-13T10:30', temperature_2m: 23.5, relative_humidity_2m: 73, dew_point_2m: 18.4, wind_speed_10m: 7, surface_pressure: 1004, shortwave_radiation: 600, direct_radiation: 480, is_day: 1 },
  minutely_15: {
    time: ['2026-09-13T10:30', '2026-09-13T10:45', '2026-09-13T11:00', '2026-09-13T11:15'],
    temperature_2m: [23.5, 24.1, 24.8, 25.2], relative_humidity_2m: [73, 71, 68, 66], dew_point_2m: [18.4, 18.5, 18.6, 18.6],
    wind_speed_10m: [7, 8, 8, 9], surface_pressure: [1004, 1004, 1003.9, 1003.8],
    shortwave_radiation: [600, 650, 700, 730], direct_radiation: [480, 520, 560, 590],
  },
  hourly: { time: ['2026-09-13T10:00', '2026-09-13T11:00'], temperature_2m: [23, 24.8], relative_humidity_2m: [75, 68], dew_point_2m: [18.3, 18.6], wind_speed_10m: [7, 8], surface_pressure: [1004, 1004], shortwave_radiation: [560, 700], direct_radiation: [440, 560] },
};
const at = (hhmm) => Date.parse(`2026-09-13T${hhmm}:00Z`) - 7200 * 1000;

test('client interpolation and worker preview produce identical current readings at five minutes', () => {
  for (const t of ['10:31', '10:37', '10:44', '10:52', '11:06']) {
    const client = interpolateNow(data, at(t));
    const worker = previewVerdict(data, at(t)).cur;
    assert.deepEqual(worker, client, t);
  }
});
