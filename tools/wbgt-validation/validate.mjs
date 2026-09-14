// Publishes the heat-load validation: results.json, history.json, RESULTS.md and
// public/lib/calibration.js, from the leave-one-station-out cross-validation
// (data/crossval.json, written by crossval.mjs).
//
// Usage: node tools/wbgt-validation/validate.mjs   (after crossval.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowReader, runMoe, runIso, runOno, evaluate, specMisses } from './metrics.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = join(ROOT, '..', '..');
const MODEL = 'MOE definition; 150 mm globe with ISO 7726 convection';
const PROTOCOL = 'leave-one-station-out cross-validation over all measured stations';

const f2 = (x) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(2));
const pct = (x) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
const levelNames = ['None', 'Easy', 'Noticeable', 'Real work', 'Hard', 'Dangerous'];

function table(title, byKey, order) {
  const keys = order || Object.keys(byKey).sort((a, b) => Number(a) - Number(b));
  return [`| ${title} | hours | bias °C | MAE °C |`, '|---|---|---|---|',
    ...keys.filter((k) => byKey[k]).map((k) => `| ${k} | ${byKey[k].n} | ${f2(byKey[k].bias)} | ${f2(byKey[k].mae)} |`)].join('\n');
}

function main() {
  const cv = JSON.parse(readFileSync(join(ROOT, 'data', 'crossval.json'), 'utf8'));
  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
  const rows = dataset.rows.map(rowReader(dataset.columns));
  const { timing, surfaceAlbedo, minWind2 } = cv.final.cfg;
  const cfg = { globeDiameter: 0.15, surfaceAlbedo, minWind2 };
  const oof = cv.outOfFold;
  const misses = specMisses(oof);

  // Baselines have nothing tuned, so every hour is out of sample for them.
  const reference = evaluate(rows, dataset.stations, (row, place) => runMoe(row, place, { globeDiameter: 0.15, surfaceAlbedo: 0.45, minWind2: 0.13 }, timing));
  const iso = evaluate(rows, dataset.stations, (row, place) => runIso(row, place, timing));
  const ono = evaluate(rows, dataset.stations, (row) => runOno(row));
  // The app's hourly series is a preceding-hour mean, while MOE observations are
  // instants; 'centred' is the closer proxy for the app's 15-minute current
  // reading, and this is the same parameters scored under the hourly alignment.
  const preceding = evaluate(rows, dataset.stations, (row, place) => runMoe(row, place, cfg, 'preceding'));

  let commit = 'uncommitted';
  // "-dirty" means the working tree had uncommitted changes: the results came from code not yet at that commit.
  try { commit = execSync('git describe --always --dirty', { cwd: REPO }).toString().trim(); } catch { /* not a git checkout */ }
  const times = rows.map((r) => r.time).sort();
  const results = {
    generated: new Date().toISOString(),
    commit,
    model: MODEL,
    protocol: PROTOCOL,
    decisionRule: 'meets every accuracy threshold on the choosing stations; lowest MAE; within 0.02 °C, closest to reference (albedo 0.45, minimum wind 0.13 m/s)',
    data: {
      measured: 'Japan Ministry of the Environment, measured WBGT (6-inch black globe), getSurveyData data_type=1, quality flag 4',
      inputs: 'Open-Meteo Historical Forecast API (best match), hourly',
      window: [times[0], times.at(-1)],
      stations: cv.stations,
      hours: cv.hours,
    },
    final: { timing, ...cfg },
    foldChoices: cv.foldChoices,
    outOfFold: oof,
    folds: cv.folds,
    appHourlyAlignment: { timing: 'preceding', note: 'same parameters, forecast hour ending at the observation; the hourly series the app shows', metrics: preceding },
    baselines: { referenceParameters: reference, isoLiljegren: iso, onoTonouchi: ono },
    passes: misses.length === 0,
    misses,
  };
  writeFileSync(join(ROOT, 'results.json'), JSON.stringify(results, null, 2));

  const historyPath = join(ROOT, 'history.json');
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : [];
  // Re-publishing identical results (same parameters, same errors) is not a new run.
  const last = history.at(-1);
  const republish = last && last.chosen && last.chosen.surfaceAlbedo === surfaceAlbedo && last.chosen.minWind2 === minWind2
    && Math.abs(last.heldOut.mae - oof.mae) < 1e-9 && Math.abs(last.heldOut.bias - oof.bias) < 1e-9;
  if (republish) history.pop();
  history.push({
    run: history.length + 1,
    generated: results.generated,
    commit,
    model: MODEL,
    protocol: PROTOCOL,
    chosen: results.final,
    heldOut: {
      hours: oof.n, mae: oof.mae, bias: oof.bias, levelWithinOne: oof.levelWithinOne, severeMissRate: oof.severe.missRate,
      strongSunBias: oof.bySun['>=700'] ? oof.bySun['>=700'].bias : null, nightBias: oof.bySun.night ? oof.bySun.night.bias : null,
    },
    passes: results.passes,
    misses,
  });
  writeFileSync(historyPath, JSON.stringify(history, null, 2));

  const folds = [...cv.folds].sort((a, b) => a.station - b.station);
  const md = [
    '# Heat-load engine: validation against measured WBGT',
    '',
    `Generated ${results.generated} at commit \`${commit}\`. Model: ${MODEL}.`,
    `Protocol: ${PROTOCOL}. ${cv.stations} stations, ${cv.hours} measured hours, ${times[0]} to ${times.at(-1)} (JST). Every station's numbers below come from parameters chosen without that station.`,
    '',
    `**Result: ${results.passes ? 'meets' : 'does not meet'} the heat-load accuracy requirement.**${misses.length ? ` Misses: ${misses.join('; ')}.` : ''}`,
    '',
    `Shipped parameters (same rule, all stations): surface albedo **${surfaceAlbedo}**, minimum 2 m wind **${minWind2} m/s**. Fold choices: ${Object.entries(cv.foldChoices).map(([k, v]) => `${k} × ${v}`).join(', ')}.`,
    '',
    '| Engine | hours | MAE °C | bias °C | globe MAE °C | level exact | within one level | severe under-warning |',
    '|---|---|---|---|---|---|---|---|',
    ...[['Muggy (out-of-fold)', oof], ['MOE definition, reference parameters', reference], ['ISO Liljegren (natural wet bulb, 2-inch globe)', iso], ['Ono–Tonouchi (MOE estimator)', ono]]
      .map(([name, m]) => `| ${name} | ${m.n} | ${f2(m.mae)} | ${f2(m.bias)} | ${f2(m.tg && m.tg.mae)} | ${pct(m.levelExact)} | ${pct(m.levelWithinOne)} | ${pct(m.severe.missRate)} of ${m.severe.n} |`),
    '',
    '## Radiation timing',
    '',
    `MOE observations are instantaneous, at the top of the hour. The cross-validation aligned the forecast's hourly-mean radiation to that instant with a two-hour window centred on it ("centred"), which is the closer proxy for the app's current reading (a 15-minute step). The app's hourly series is a preceding-hour mean; scored with that alignment ("preceding", the forecast hour ending at the observation) the same parameters give MAE ${f2(preceding.mae)} °C, bias ${f2(preceding.bias)} °C, strong-sun bias ${f2(preceding.bySun['>=700'] && preceding.bySun['>=700'].bias)} °C, ${pct(preceding.levelWithinOne)} within one level. Parameters were chosen under the centred alignment; this figure is a sensitivity check, not a second fit.`,
    '',
    '## Muggy by condition (out-of-fold)',
    '',
    table('2 m wind (m/s)', oof.byWind, ['<1', '1-2', '2-4', '>=4']),
    '',
    table('Irradiance (W/m²)', oof.bySun, ['night', '<300', '300-700', '>=700']),
    '',
    table('Hour (JST)', oof.byHour),
    '',
    '| Measured level | hours | bias °C | MAE °C | same level | within one |',
    '|---|---|---|---|---|---|',
    ...Object.entries(oof.byLevel).sort((a, b) => a[0] - b[0])
      .map(([k, v]) => `| ${levelNames[k]} | ${v.n} | ${f2(v.bias)} | ${f2(v.mae)} | ${pct(v.exact)} | ${pct(v.withinOne)} |`),
    '',
    '## By station (out-of-fold)',
    '',
    'Siting matters: a coastal observatory and a sheltered city yard see the same forecast grid cell differently. These are the numbers a visitor in each city would actually get.',
    '',
    '| station | hours | MAE °C | bias °C | strong-sun bias °C |',
    '|---|---|---|---|---|',
    ...folds.map((f) => `| ${f.name} (${f.station}) | ${f.hours} | ${f2(f.mae)} | ${f2(f.bias)} | ${f2(f.strongSunBias)} |`),
    '',
    '## Run history',
    '',
    'Every validation run is listed, passing or not. Runs 1 and 2 used one fixed train/held-out split; changes between runs were motivated by training-station evidence only, and the protocol then moved to leave-one-station-out cross-validation so that no single split is re-used.',
    '',
    '| run | date | protocol | model | albedo | min wind | MAE | bias | strong-sun bias | passes |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...history.map((h) => `| ${h.run} | ${h.generated.slice(0, 10)} | ${h.protocol || 'fixed split (held-out stations)'} | ${h.model} | ${h.chosen.surfaceAlbedo} | ${h.chosen.minWind2} | ${f2(h.heldOut.mae)} | ${f2(h.heldOut.bias)} | ${f2(h.heldOut.strongSunBias)} | ${h.passes ? 'yes' : `no: ${h.misses.join('; ')}`} |`),
    '',
    '## Data',
    '',
    '- Measured WBGT: Japan Ministry of the Environment, Heat Illness Prevention Information (wbgt.env.go.jp); stations with a measured 6-inch black globe, quality flag 4 (all inputs observed).',
    '- Inputs: Open-Meteo Historical Forecast API (CC BY 4.0), the same variables the app uses.',
    '- Reproduce: `node tools/wbgt-validation/fetch.mjs && node tools/wbgt-validation/dataset.mjs && node tools/wbgt-validation/crossval.mjs && node tools/wbgt-validation/validate.mjs`.',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'RESULTS.md'), md);

  writeFileSync(join(REPO, 'public', 'lib', 'calibration.js'), `/**
 * Heat-load engine parameters.
 *
 * GENERATED by tools/wbgt-validation/validate.mjs from results.json. Do not edit by hand.
 * Chosen by the decision rule on all measured stations; accuracy is the
 * leave-one-station-out figure in tools/wbgt-validation/RESULTS.md.
 */
export const CALIBRATION = Object.freeze({
  // Provisional until the validation meets the heat-load accuracy requirement.
  provisional: ${!results.passes},
  meetsAccuracyRequirement: ${results.passes},
  globeDiameter: 0.15,
  surfaceAlbedo: ${surfaceAlbedo},
  minWind2: ${minWind2},
  source: '${MODEL}; ${PROTOCOL} (${cv.stations} stations, ${cv.hours} hours): MAE ${f2(oof.mae)} °C, bias ${f2(oof.bias)} °C with centred radiation timing (${f2(preceding.mae)} °C with the hourly series alignment); run ${history.length}, commit ${commit}',
});
`);
  console.log(md);
  if (misses.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
