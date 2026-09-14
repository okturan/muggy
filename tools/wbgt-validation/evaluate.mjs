// Prints engine and baseline metrics for one split of the validation dataset.
//
// Usage: node tools/wbgt-validation/evaluate.mjs [--split train|heldout]
// Held-out metrics are refused until calibrate.mjs has fixed the configuration,
// so nobody can tune by looking at them.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowReader, runMoe, runIso, runOno, evaluate } from './metrics.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const split = process.argv.includes('--split') ? process.argv[process.argv.indexOf('--split') + 1] : 'train';
if (split === 'heldout' && !existsSync(join(ROOT, 'data', 'calibration-train.json'))) {
  console.error('Refusing to evaluate held-out stations before calibrate.mjs has chosen the configuration.');
  process.exit(2);
}
const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const read = rowReader(dataset.columns);
const col = dataset.columns.indexOf('split');
const rows = dataset.rows.filter((r) => r[col] === split).map(read);
const ref = { globeDiameter: 0.15, surfaceAlbedo: 0.45, minWind2: 0.13 };
const engines = [
  ['MOE definition, reference params, preceding hour', (r, p) => runMoe(r, p, ref, 'preceding')],
  ['MOE definition, reference params, centred', (r, p) => runMoe(r, p, ref, 'centred')],
  ['ISO Liljegren, preceding hour', (r, p) => runIso(r, p, 'preceding')],
  ['Ono-Tonouchi', (r) => runOno(r)],
];
const f = (x) => (x == null || !Number.isFinite(x) ? '   –  ' : x.toFixed(2).padStart(6));
const pc = (x) => `${(x * 100).toFixed(1).padStart(5)}%`;
console.log(`${split}: ${rows.length} hours`);
console.log('engine'.padEnd(50), '   MAE   bias  tgMAE  tgBias  exact  within1  severe-miss');
for (const [name, eng] of engines) {
  const m = evaluate(rows, dataset.stations, eng);
  console.log(name.padEnd(50), f(m.mae), f(m.bias), f(m.tg.mae), f(m.tg.bias), pc(m.levelExact), pc(m.levelWithinOne), `${pc(m.severe.missRate)} of ${m.severe.n}`);
  const bands = Object.entries(m.byWind).map(([k, v]) => `${k}:${v.bias.toFixed(2)}`).join(' ');
  const suns = Object.entries(m.bySun).map(([k, v]) => `${k}:${v.bias.toFixed(2)}`).join(' ');
  console.log(''.padEnd(50), `bias by wind ${bands} | by sun ${suns}`);
}
