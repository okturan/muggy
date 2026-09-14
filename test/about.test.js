// The About page must say exactly what the code and the published results say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS, LEVEL_MIN } from '../public/lib/levels.js';
import { CALIBRATION } from '../public/lib/calibration.js';

const html = readFileSync(new URL('../public/about.html', import.meta.url), 'utf8');
const results = JSON.parse(readFileSync(new URL('../tools/wbgt-validation/results.json', import.meta.url), 'utf8'));
const metric = (name) => {
  const m = html.match(new RegExp(`data-metric="${name}">([^<]+)<`));
  assert.ok(m, `metric ${name} missing`);
  return m[1];
};

test('the level ladder matches levels.js', () => {
  for (let i = 0; i < LEVELS.length; i++) {
    const row = html.match(new RegExp(`<tr data-level="${LEVELS[i]}"([^>]*)>`));
    assert.ok(row, `row for ${LEVELS[i]}`);
    const min = row[1].match(/data-min="(\d+)"/);
    const max = row[1].match(/data-max="(\d+)"/);
    if (i > 0) assert.equal(Number(min[1]), LEVEL_MIN[i], `${LEVELS[i]} min`);
    else assert.equal(min, null);
    if (i < LEVELS.length - 1) assert.equal(Number(max[1]), LEVEL_MIN[i + 1] - 1, `${LEVELS[i]} max`);
    else assert.equal(max, null);
  }
});

test('published accuracy on the page matches results.json', () => {
  const oof = results.outOfFold;
  assert.equal(Number(metric('stations')), results.data.stations);
  assert.equal(Number(metric('hours').replace(/,/g, '')), results.data.hours);
  assert.equal(metric('mae'), oof.mae.toFixed(2));
  assert.equal(metric('bias'), oof.bias.toFixed(2));
  assert.equal(metric('withinOne'), (oof.levelWithinOne * 100).toFixed(1));
  assert.equal(metric('severe'), (oof.severe.missRate * 100).toFixed(2));
  assert.equal(Number(metric('albedo')), CALIBRATION.surfaceAlbedo);
  assert.equal(Number(metric('minWind')), CALIBRATION.minWind2);
});

test('the Argonne acknowledgment appears verbatim', () => {
  assert.ok(html.includes('This product includes software produced by UChicago Argonne, LLC under Contract No. DE-AC02-06CH11357 with the Department of Energy.'));
});

test('FAQ structured data matches the visible method and ranges', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const answers = ld.mainEntity.map((q) => `${q.name} ${q.acceptedAnswer.text}`).join(' ');
  assert.ok(!/humidex/i.test(answers), 'no FAQ answer presents humidex');
  assert.match(answers, /WBGT/);
  for (const edge of ['12.8', '15.6', '18.3', '21.1', '23.9']) assert.ok(answers.includes(edge), `band edge ${edge}`);
  for (const range of ['below WBGT 18', '18 to 20', '21 to 24', '25 to 27', '28 to 30', '31 and up']) assert.ok(answers.includes(range), `level range ${range}`);
  assert.ok(answers.includes(results.outOfFold.mae.toFixed(2)), 'FAQ accuracy matches results');
});
