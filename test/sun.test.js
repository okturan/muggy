import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunOverInterval, czaAt } from '../public/lib/sun.js';
import { CZA_MIN } from '../public/lib/wbgt.js';

/** Brute force: 1-second sampling. */
function brute(endMs, minutes, lat, lon) {
  let lit = 0;
  let sum = 0;
  const n = minutes * 60;
  for (let s = 0; s < n; s++) {
    const c = czaAt(endMs - (n - s - 0.5) * 1000, lat, lon);
    if (c >= CZA_MIN) { lit++; sum += c; }
  }
  return { fSun: lit / n, cza: lit ? sum / lit : null };
}

test('matches brute-force averaging, including sunrise and sunset hours', () => {
  const cases = [
    [0, 0, '2026-09-13T07:00:00Z'], [0, 0, '2026-09-13T06:30:00Z'], [0, 0, '2026-09-13T18:30:00Z'],
    [41.33, 19.82, '2026-06-21T18:00:00Z'], [41.33, 19.82, '2026-12-21T06:00:00Z'], [41.33, 19.82, '2026-09-13T11:00:00Z'],
    [64, 0, '2026-06-21T23:00:00Z'], [64, 0, '2026-12-21T12:00:00Z'], [-35, 150, '2026-03-20T20:00:00Z'],
  ];
  for (const [lat, lon, iso] of cases) {
    for (const minutes of [15, 60]) {
      const end = Date.parse(iso);
      const got = sunOverInterval(end, minutes, lat, lon);
      const ref = brute(end, minutes, lat, lon);
      assert.ok(Math.abs(got.fSun - ref.fSun) < 0.005, `${iso} ${minutes}m lat ${lat}: fSun ${got.fSun} vs ${ref.fSun}`);
      if (ref.cza != null && ref.fSun > 0.02) {
        assert.ok(Math.abs(got.cza - ref.cza) < 0.002, `${iso} ${minutes}m lat ${lat}: cza ${got.cza} vs ${ref.cza}`);
      }
    }
  }
});

test('night interval has no sun; full-day interval is fully sunlit', () => {
  assert.deepEqual(sunOverInterval(Date.parse('2026-09-13T00:00:00Z'), 60, 41.33, 19.82), { fSun: 0, cza: null });
  const noon = sunOverInterval(Date.parse('2026-09-13T11:00:00Z'), 60, 41.33, 19.82);
  assert.equal(noon.fSun, 1);
  assert.ok(noon.cza > 0.6);
});

test('an instant uses the instantaneous cosine', () => {
  const t = Date.parse('2026-09-13T09:00:00Z');
  const inst = sunOverInterval(t, 0, 41.33, 19.82);
  assert.equal(inst.cza, czaAt(t, 41.33, 19.82));
});
