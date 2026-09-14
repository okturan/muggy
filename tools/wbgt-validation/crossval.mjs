// Leave-one-station-out cross-validation of the calibrated engine over every
// measured station.
//
// Each configuration in the grid is evaluated once per station; metrics are
// kept as mergeable accumulators. For each station, the decision rule picks a
// configuration from the OTHER stations only, and that configuration's errors
// at the left-out station are pooled. The pooled out-of-fold metrics are the
// published accuracy. The shipped parameters are picked by the same rule from
// all stations.
//
// Usage: node tools/wbgt-validation/crossval.mjs
// Output: data/crossval.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowReader, runMoe, createAcc, addPair, pairOf, mergeAccs, finalize, chooseConfig, specMisses } from './metrics.mjs';
import { GRID } from './calibrate.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

function main() {
  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
  const read = rowReader(dataset.columns);
  const rows = dataset.rows.map(read);
  const stations = [...new Set(rows.map((r) => r.no))].sort((a, b) => a - b);

  const configs = [];
  for (const timing of GRID.timing) for (const surfaceAlbedo of GRID.surfaceAlbedo) for (const minWind2 of GRID.minWind2) configs.push({ timing, surfaceAlbedo, minWind2 });
  const key = (c) => `${c.timing}|${c.surfaceAlbedo}|${c.minWind2}`;

  // acc[config][station]
  const acc = {};
  const t0 = Date.now();
  configs.forEach((c, ci) => {
    const per = (acc[key(c)] = Object.fromEntries(stations.map((s) => [s, createAcc()])));
    const cfg = { globeDiameter: 0.15, surfaceAlbedo: c.surfaceAlbedo, minWind2: c.minWind2 };
    for (const row of rows) {
      const o = runMoe(row, dataset.stations[row.no], cfg, c.timing);
      if (o && Number.isFinite(o.wbgt)) addPair(per[row.no], pairOf(row, o));
    }
    console.log(`config ${ci + 1}/${configs.length} ${key(c)} done (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  });

  const entriesFor = (included) => configs.map((c) => ({ cfg: c, metrics: finalize(mergeAccs(included.map((s) => acc[key(c)][s]))) }));

  const folds = [];
  const oof = [];
  for (const s of stations) {
    const pick = chooseConfig(entriesFor(stations.filter((x) => x !== s)));
    const stationAcc = acc[key(pick.chosen.cfg)][s];
    oof.push(stationAcc);
    const m = finalize(stationAcc);
    folds.push({ station: s, name: dataset.stations[s].name, chosen: pick.chosen.cfg, trainingMeetsSpec: pick.meetsSpec, hours: m.n, mae: m.mae, bias: m.bias, strongSunBias: m.bySun['>=700'] ? m.bySun['>=700'].bias : null });
  }
  const pooled = finalize(mergeAccs(oof));
  const misses = specMisses(pooled);
  const final = chooseConfig(entriesFor(stations));
  const choices = {};
  for (const f of folds) choices[key(f.chosen)] = (choices[key(f.chosen)] || 0) + 1;

  const result = {
    generated: new Date().toISOString(),
    protocol: 'leave-one-station-out; decision rule: meets every accuracy threshold on the other stations, lowest MAE, within 0.02 °C closest to reference',
    stations: stations.length,
    hours: pooled.n,
    outOfFold: pooled,
    passes: misses.length === 0,
    misses,
    foldChoices: choices,
    folds,
    final: { cfg: final.chosen.cfg, meetsSpecOnAll: final.meetsSpec, metricsOnAll: final.chosen.metrics },
  };
  writeFileSync(join(ROOT, 'data', 'crossval.json'), JSON.stringify(result, null, 2));
  console.log(`out-of-fold over ${stations.length} stations, ${pooled.n} hours: MAE ${pooled.mae.toFixed(3)} bias ${pooled.bias.toFixed(3)} within-one ${(pooled.levelWithinOne * 100).toFixed(1)}% severe miss ${(pooled.severe.missRate * 100).toFixed(2)}%`);
  console.log(`by sun: ${Object.entries(pooled.bySun).map(([k, v]) => `${k} ${v.bias.toFixed(2)}`).join(', ')}`);
  console.log(`by wind: ${Object.entries(pooled.byWind).map(([k, v]) => `${k} ${v.bias.toFixed(2)}`).join(', ')}`);
  console.log(`passes: ${result.passes}${misses.length ? ` (${misses.join('; ')})` : ''}`);
  console.log(`fold choices: ${JSON.stringify(choices)}`);
  console.log(`final (all stations): ${JSON.stringify(final.chosen.cfg)} meets spec on all: ${final.meetsSpec}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
