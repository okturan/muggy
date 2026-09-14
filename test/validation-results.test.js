// The published validation must meet the heat-load accuracy requirement, and
// the engine must ship exactly the parameters that were validated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specMisses } from '../tools/wbgt-validation/metrics.mjs';
import { CALIBRATION } from '../public/lib/calibration.js';

const results = JSON.parse(readFileSync(new URL('../tools/wbgt-validation/results.json', import.meta.url), 'utf8'));
const history = JSON.parse(readFileSync(new URL('../tools/wbgt-validation/history.json', import.meta.url), 'utf8'));

test('out-of-fold metrics meet every heat-load threshold', () => {
  assert.match(results.protocol, /leave-one-station-out/);
  assert.ok(results.data.stations >= 40, `stations ${results.data.stations}`);
  assert.deepEqual(specMisses(results.outOfFold), []);
  assert.equal(results.passes, true);
});

test('calibration.js ships the validated parameters', () => {
  assert.equal(CALIBRATION.provisional, false);
  assert.equal(CALIBRATION.meetsAccuracyRequirement, true);
  assert.equal(CALIBRATION.globeDiameter, 0.15);
  assert.equal(CALIBRATION.surfaceAlbedo, results.final.surfaceAlbedo);
  assert.equal(CALIBRATION.minWind2, results.final.minWind2);
});

test('the run history keeps every run, including failures, and ends with this one', () => {
  assert.ok(history.length >= 3);
  assert.ok(history.some((h) => !h.passes), 'earlier failing runs are kept');
  const last = history.at(-1);
  assert.equal(last.generated, results.generated);
  assert.equal(last.passes, results.passes);
});
