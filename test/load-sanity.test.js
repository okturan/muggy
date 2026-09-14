// Independent sanity checks on the heat-load engine: Japan's official
// regression, and monotonic response to heat, damp and sun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAt } from '../public/lib/load.js';
import { solarPosition } from '../public/lib/wbgt.js';

/** Ono & Tonouchi (2014), used by Japan MOE at its estimated stations. SR in kW/m², WS in m/s. */
const onoTonouchi = (Ta, RH, SR, WS) =>
  0.735 * Ta + 0.0374 * RH + 0.00292 * Ta * RH + 7.619 * SR - 4.557 * SR * SR - 0.0572 * WS - 4.064;

let seed = 20260913;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const between = (a, b) => a + (b - a) * rand();

const TOKYO = { lat: 35.68, lon: 139.69, elevation: 40, utcOffsetSeconds: 32400 };

test('sun WBGT within 2 °C of Ono-Tonouchi for at least 95% of daytime cases in its range', () => {
  let n = 0;
  let within = 0;
  let sum = 0;
  while (n < 2000) {
    const month = 6 + Math.floor(rand() * 4);
    const day = 1 + Math.floor(rand() * 28);
    const hour = 10 + Math.floor(rand() * 5);
    const pos = solarPosition(2026, month, day + (hour - 9 - 0.5) / 24, TOKYO.lat, TOKYO.lon);
    const cza = Math.cos(((90 - pos.altitude) * Math.PI) / 180);
    const SR = between(0.25, 0.8) * ((1367 * cza) / (pos.distance * pos.distance));
    if (SR < 100 || SR > 1000) continue;
    const Ta = between(22, 36);
    const RH = between(35, 90);
    const WS = between(0.5, 6);
    const out = loadAt({
      ...TOKYO, time: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`,
      avgMinutes: 60, temperature_2m: Ta, relative_humidity_2m: RH, wind_speed_10m: WS * 3.6,
      surface_pressure: 1008, shortwave_radiation: SR, direct_radiation: null,
    });
    const d = out.sun - onoTonouchi(Ta, RH, SR / 1000, WS);
    sum += d;
    if (Math.abs(d) <= 2) within++;
    n++;
  }
  const share = within / n;
  console.log(`within 2 °C: ${(share * 100).toFixed(1)}%, mean difference ${(sum / n).toFixed(2)} °C`);
  assert.ok(share >= 0.95, `only ${(share * 100).toFixed(1)}% within 2 °C (mean ${(sum / n).toFixed(2)})`);
});

test('more heat, more damp or more sun never lowers WBGT by more than 0.1 °C', () => {
  const base = { ...TOKYO, avgMinutes: 60, surface_pressure: 1008, direct_radiation: null };
  let worst = 0;
  let checks = 0;
  for (const time of ['2026-08-01T12:00', '2026-08-01T08:00']) {
    for (let Ta = 12; Ta <= 44; Ta += 4) {
      for (let RH = 10; RH <= 90; RH += 20) {
        for (let SR = 0; SR <= 900; SR += 150) {
          for (const WS of [0, 0.5, 2, 5, 8]) {
            const at = (t, rh, sr) => loadAt({ ...base, time, temperature_2m: t, relative_humidity_2m: rh, shortwave_radiation: sr, wind_speed_10m: WS * 3.6 });
            const o = at(Ta, RH, SR);
            for (const [name, v] of [['hotter', at(Ta + 1, RH, SR)], ['damper', at(Ta, RH + 5, SR)], ['sunnier', at(Ta, RH, SR + 50)]]) {
              for (const k of ['shade', 'sun']) {
                const drop = o[k] - v[k];
                worst = Math.max(worst, drop);
                assert.ok(drop <= 0.1, `${name} lowered ${k} by ${drop.toFixed(3)} at ${time} T${Ta} RH${RH} SR${SR} WS${WS}`);
                checks++;
              }
            }
          }
        }
      }
    }
  }
  console.log(`${checks} checks, largest decrease ${worst.toFixed(4)} °C`);
});
