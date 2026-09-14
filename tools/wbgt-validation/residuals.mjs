// Residual analysis on TRAINING stations only: splits the WBGT error into its
// wet-bulb (0.7), globe (0.2) and air-temperature (0.1) parts, by condition.
// MOE's air temperature is recovered from its published WBGT, Tw and Tg (±~0.5 °C from rounding).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trainingRows } from './calibrate.mjs';
import { runMoe, runOno } from './metrics.mjs';
import { wetBulbMoe } from '../../public/lib/psychro.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const { chosen } = JSON.parse(readFileSync(join(ROOT, 'data', 'calibration-train.json'), 'utf8'));
const cfg = { globeDiameter: 0.15, surfaceAlbedo: chosen.surfaceAlbedo, minWind2: chosen.minWind2 };
const rows = trainingRows(dataset);

const groups = {};
const add = (g, k, v) => { const b = ((groups[g] ||= {})[k] ||= { n: 0, wbgt: 0, tw: 0, tg: 0, ta: 0, ono: 0, twC: 0, tgC: 0, taC: 0 }); b.n++; for (const [kk, vv] of Object.entries(v)) b[kk] += vv; };
for (const r of rows) {
  const place = dataset.stations[r.no];
  const o = runMoe(r, place, cfg, chosen.timing);
  if (!o) continue;
  const tw = wetBulbMoe(r.T, r.RH, r.P);
  const taMoe = (r.WBGT - 0.7 * r.Tw - 0.2 * r.Tg) / 0.1;
  const d = { wbgt: o.wbgt - r.WBGT, tw: tw - r.Tw, tg: o.tg - r.Tg, ta: r.T - taMoe, ono: runOno(r).wbgt - r.WBGT };
  const v = { ...d, twC: 0.7 * d.tw, tgC: 0.2 * d.tg, taC: 0.1 * d.ta };
  const sw = (r.sw + r.sw1) / 2;
  add('irradiance (centred mean)', sw <= 0 ? 'night' : sw < 300 ? '<300' : sw < 700 ? '300-700' : sw < 850 ? '700-850' : '>=850', v);
  add('hour JST', r.time.slice(11, 13), v);
  if (sw >= 700) add('strong sun: 2 m wind', o.wind2 < 1 ? '<1' : o.wind2 < 2 ? '1-2' : '>=2', v);
  if (sw >= 700) add('strong sun: forecast RH', r.RH < 50 ? '<50' : r.RH < 70 ? '50-70' : '>=70', v);
  if (sw >= 700) add('strong sun: measured Tg - Ta', r.Tg - taMoe < 5 ? '<5 (cloud/shade at site?)' : r.Tg - taMoe < 12 ? '5-12' : '>=12', v);
}
const f = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
for (const [g, byK] of Object.entries(groups)) {
  console.log(`\n${g}\n  bucket                          n    WBGT err | 0.7·Tw err  0.2·Tg err  0.1·Ta err | Tw err  Tg err  Ta err | Ono err`);
  for (const [k, b] of Object.entries(byK).sort()) {
    const m = (x) => b[x] / b.n;
    console.log(`  ${k.padEnd(28)} ${String(b.n).padStart(6)}   ${f(m('wbgt'))}   |   ${f(m('twC'))}      ${f(m('tgC'))}      ${f(m('taC'))}   | ${f(m('tw'))}  ${f(m('tg'))}  ${f(m('ta'))} | ${f(m('ono'))}`);
  }
}
