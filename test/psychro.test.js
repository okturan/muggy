import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wetBulbMoe, dewPointMoe } from '../public/lib/psychro.js';

/**
 * Independent reference: the WMO psychrometer equation (Guide to Instruments
 * and Methods of Observation, WMO-No. 8, Annex 4.B) for a ventilated
 * psychrometer, e = e'w(Tw) - A p (T - Tw), A = 6.53e-4 (1 + 0.000944 Tw) /K,
 * with WMO's saturation vapour pressure over water and its enhancement factor,
 * solved by bisection. MOE uses Iribarne & Godson's thermodynamic constants
 * instead, so small differences are expected in very hot, very dry air.
 */
const enh = (p) => 1.0016 + 3.15e-6 * p - 0.074 / p;
const ew = (t, p) => enh(p) * 6.112 * Math.exp((17.62 * t) / (243.12 + t));
function wmoWetBulb(T, RH, p) {
  const e = (RH / 100) * ew(T, p);
  let lo = -40;
  let hi = T;
  for (let i = 0; i < 80; i++) {
    const tw = (lo + hi) / 2;
    if (ew(tw, p) - 6.53e-4 * (1 + 0.000944 * tw) * p * (T - tw) - e > 0) hi = tw;
    else lo = tw;
  }
  return (lo + hi) / 2;
}

test('agrees with the WMO psychrometer equation within 0.4 °C over 10-45 °C, 5-100 % RH, 850-1013 hPa', () => {
  let worst = 0;
  for (const p of [850, 925, 1013.25]) {
    for (let T = 10; T <= 45; T += 1) {
      for (let RH = 5; RH <= 100; RH += 5) {
        const d = Math.abs(wetBulbMoe(T, RH, p) - wmoWetBulb(T, RH, p));
        worst = Math.max(worst, d);
        assert.ok(d <= 0.4, `T ${T} RH ${RH} p ${p}: ${wetBulbMoe(T, RH, p).toFixed(2)} vs WMO ${wmoWetBulb(T, RH, p).toFixed(2)}`);
      }
    }
  }
  console.log(`worst difference from the WMO psychrometer equation: ${worst.toFixed(3)} °C`);
});

test('saturated air: wet bulb equals air temperature', () => {
  assert.equal(wetBulbMoe(25, 100, 1013.25), 25);
  assert.ok(Math.abs(wetBulbMoe(25, 99.999, 1013.25) - 25) < 0.01);
});

test('dew point inverts the Magnus humidity relation', () => {
  const td = dewPointMoe(30, 60);
  const e = (t) => 6.1078 * 10 ** ((7.5 * t) / (t + 237.3));
  assert.ok(Math.abs((100 * e(td)) / e(30) - 60) < 1e-6);
});

test('lower pressure lowers the wet bulb for dry air', () => {
  assert.ok(wetBulbMoe(32, 30, 850) < wetBulbMoe(32, 30, 1013.25));
});
