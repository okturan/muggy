// The engine must never fall back to shade because the globe solver gave up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAt } from '../public/lib/load.js';

test('the globe converges across calm, strong-sun, hot and cold cases', () => {
  const base = { lat: 35.68, lon: 139.69, elevation: 40, utcOffsetSeconds: 32400, avgMinutes: 60, surface_pressure: 1008 };
  let n = 0;
  for (const time of ['2026-08-01T12:00', '2026-06-21T09:00', '2026-12-21T12:00']) {
    for (let T = 5; T <= 48; T += 3) {
      for (const RH of [5, 30, 60, 95]) {
        for (const W of [0, 0.3, 1, 3, 10]) {
          for (const SR of [0, 200, 500, 800, 1050]) {
            for (const direct of [null, 0, 0.9 * SR]) {
              const o = loadAt({ ...base, time, temperature_2m: T, relative_humidity_2m: RH, wind_speed_10m: W * 3.6, shortwave_radiation: SR, direct_radiation: direct });
              assert.ok(o, `null at ${time} T${T} RH${RH} W${W} SR${SR}`);
              assert.ok(o.sunKnown, `sun unknown (solver gave up) at ${time} T${T} RH${RH} W${W} SR${SR} direct ${direct}`);
              assert.ok(Number.isFinite(o.shade) && Number.isFinite(o.sun));
              n++;
            }
          }
        }
      }
    }
  }
  assert.ok(n > 10000);
});
