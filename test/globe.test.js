import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoGlobeConvection, globeTemperature } from '../public/lib/globe.js';
import { hSphereInAir, tGlobe } from '../public/lib/wbgt.js';

test('ISO 7726 convection: the larger of natural and forced', () => {
  // D 0.15 m, globe 25 K above the air, 0.13 m/s: natural 1.4 (25/0.15)^0.25 = 5.03 beats forced 3.96.
  assert.ok(Math.abs(isoGlobeConvection(25, 0.15, 0.13) - 1.4 * (25 / 0.15) ** 0.25) < 1e-12);
  // At 2 m/s forced convection wins: 6.3 * 2^0.6 / 0.15^0.4.
  assert.ok(Math.abs(isoGlobeConvection(25, 0.15, 2) - (6.3 * 2 ** 0.6) / 0.15 ** 0.4) < 1e-12);
});

test('for a 150 mm globe, ISO 7726 convection is stronger than the forced-only sphere correlation', () => {
  for (const v of [0.13, 0.5, 1, 2, 4]) {
    for (const dT of [5, 15, 30]) {
      const iso = isoGlobeConvection(dT, 0.15, v);
      const sphere = hSphereInAir(0.15, 303.15, 1008, v);
      assert.ok(iso >= sphere, `v ${v} dT ${dT}: ISO ${iso.toFixed(2)} vs sphere ${sphere.toFixed(2)}`);
    }
  }
});

test('so the globe runs cooler in calm, strong sun than with the sphere correlation', () => {
  const Ta = 303.15;
  const iso = globeTemperature(Ta, 0.5, 0.3, 850, 0.8, 0.9, 0.15, 0.2);
  const sphere = tGlobe(Ta, 0.5, 1008, 0.3, 850, 0.8, 0.9, 0.15, 0.2, 4000);
  assert.ok(iso < sphere - 2, `ISO ${iso.toFixed(1)} vs sphere ${sphere.toFixed(1)}`);
  assert.ok(iso > 30 + 5, `still well above the air in strong sun: ${iso.toFixed(1)}`);
});

test('with no sun the globe sits close to the air, a little below it under a clear night sky', () => {
  const tg = globeTemperature(298.15, 0.7, 1, 0, 0, 0.004, 0.15, 0.2);
  assert.ok(tg < 25 && tg > 22, `${tg}`);
});
