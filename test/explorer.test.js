import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explore, explorerInputs } from '../public/lib/explorer.js';
import { wbgtInterval } from '../public/lib/load.js';
import { levelOf } from '../public/lib/levels.js';
import { compose } from '../public/lib/verdict.js';

test('the explorer runs the same engine and verdict as the app', () => {
  for (const opts of [
    { tair: 24, texture: 'muggy', sun: 'full', wind: 'breeze' },
    { tair: 34, texture: 'dry', sun: 'full', wind: 'still' },
    { tair: 27, texture: 'oppressive', sun: 'none', wind: 'still' },
  ]) {
    const e = explore(opts);
    const load = wbgtInterval(explorerInputs(opts).inputs);
    assert.equal(e.load.shade, load.shade);
    const v = compose({ texture: e.texture, shadeLevel: levelOf(load.shade), sunLevel: levelOf(load.sun), isDay: opts.sun !== 'none', sunKnown: true, alert: e.verdict.sentences.some((s) => s.kind === 'alert') ? 'alert' : null });
    assert.equal(e.verdict.headline, v.headline, JSON.stringify(opts));
  }
});

test('full sun is heavier than no sun, and night never splits', () => {
  const sunny = explore({ tair: 30, texture: 'humid', sun: 'full', wind: 'still' });
  const dark = explore({ tair: 30, texture: 'humid', sun: 'none', wind: 'still' });
  assert.ok(sunny.load.sun > dark.load.sun + 1);
  assert.equal(dark.verdict.split, false);
  assert.equal(dark.factors.sun, undefined);
});

test('the texture follows the dew point actually used (capped below the air temperature)', () => {
  const e = explore({ tair: 15, texture: 'miserable', sun: 'none', wind: 'breeze' });
  assert.equal(e.dewPoint, 14.5);
  assert.equal(e.texture, 'comfortable');
});

test('factor shares add up to the difference from the reference', () => {
  const e = explore({ tair: 33, texture: 'muggy', sun: 'some', wind: 'windy' });
  const sum = Object.values(e.factors).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - (e.load.sun - e.reference)) < 1e-9);
});
