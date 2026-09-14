// Chooses the engine's two calibrated parameters from TRAINING stations only
// (the fixed split; kept for continuity next to crossval.mjs).
//
// Decision rule (shared with crossval.mjs, see metrics.mjs chooseConfig):
//   1. eligible: configurations meeting every accuracy threshold on these stations
//      (otherwise those with the fewest misses);
//   2. lowest MAE among the eligible;
//   3. within 0.02 °C of it, closest to the reference values, then 'preceding' timing.
//
// Usage: node tools/wbgt-validation/calibrate.mjs
// Output: data/calibration-train.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowReader, runMoe, evaluate, chooseConfig, specMisses } from './metrics.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const GRID = {
  surfaceAlbedo: [0.1, 0.15, 0.2, 0.25, 0.3, 0.45],
  minWind2: [0.13, 0.5, 1.0],
  timing: ['preceding', 'centred'],
};

/** Only training rows ever leave this function. */
export function trainingRows(dataset) {
  const read = rowReader(dataset.columns);
  const splitCol = dataset.columns.indexOf('split');
  return dataset.rows.filter((r) => r[splitCol] === 'train').map(read);
}

export function selectConfig(rows, stations, grid = GRID, log = () => {}) {
  const entries = [];
  for (const timing of grid.timing) {
    for (const surfaceAlbedo of grid.surfaceAlbedo) {
      for (const minWind2 of grid.minWind2) {
        const cfg = { timing, surfaceAlbedo, minWind2 };
        const m = evaluate(rows, stations, (row, place) => runMoe(row, place, { globeDiameter: 0.15, surfaceAlbedo, minWind2 }, timing));
        entries.push({ cfg, metrics: m });
        const strong = m.bySun['>=700'];
        log(`${timing.padEnd(9)} albedo ${surfaceAlbedo.toFixed(2)} minWind ${minWind2.toFixed(2)}: MAE ${m.mae.toFixed(3)} bias ${m.bias.toFixed(3)} strong-sun ${strong ? strong.bias.toFixed(2) : '–'} misses ${specMisses(m).length}`);
      }
    }
  }
  const pick = chooseConfig(entries);
  const summary = (e) => ({ ...e.cfg, mae: e.metrics.mae, bias: e.metrics.bias, severeMissRate: e.metrics.severe.missRate, levelWithinOne: e.metrics.levelWithinOne, n: e.metrics.n });
  return {
    chosen: summary(pick.chosen),
    meetsSpecOnTraining: pick.meetsSpec,
    bestMae: pick.bestMae,
    candidates: pick.nearBest,
    results: entries.map((e) => ({ ...summary(e), misses: specMisses(e.metrics) })),
  };
}

function main() {
  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
  const rows = trainingRows(dataset);
  const trainStations = [...new Set(rows.map((r) => r.no))];
  console.log(`training on ${rows.length} hours from ${trainStations.length} stations`);
  const out = selectConfig(rows, dataset.stations, GRID, console.log);
  writeFileSync(join(ROOT, 'data', 'calibration-train.json'), JSON.stringify({ trainStations, ...out }, null, 2));
  console.log(`chosen: ${JSON.stringify(out.chosen)} (meets spec on training: ${out.meetsSpecOnTraining})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
