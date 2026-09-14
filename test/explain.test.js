import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute, wordFor } from '../public/lib/explain.js';

const base = (over = {}) => ({
  endMs: Date.parse('2026-08-01T03:00:00Z'), minutes: 60, lat: 35.68, lon: 139.69,
  tair: 32, rh: 60, wind10: 2.5, pres: 1008, sw: 800, direct: 640, ...over,
});

test('shares add up to the whole difference, in sun and in shade, across a grid', () => {
  let worst = 0;
  for (const tair of [20, 28, 36, 42]) {
    for (const rh of [20, 50, 85]) {
      for (const wind10 of [0, 1.5, 6]) {
        for (const sw of [0, 400, 900]) {
          for (const scope of ['sun', 'shade']) {
            const a = attribute(base({ tair, rh, wind10, sw, direct: 0.8 * sw }), scope);
            const sum = Object.values(a.factors).reduce((x, y) => x + y, 0);
            const d = Math.abs(sum - (a.value - a.reference));
            worst = Math.max(worst, d);
            assert.ok(d <= 0.05, `T${tair} RH${rh} W${wind10} SW${sw} ${scope}: sum ${sum} vs ${a.value - a.reference}`);
            if (scope === 'shade') assert.equal(a.factors.sun, undefined);
          }
        }
      }
    }
  }
  assert.ok(worst < 1e-9, `exact by construction, got ${worst}`);
});

test('damp and sun add load on a humid sunny day; a strong breeze takes some off', () => {
  const a = attribute(base({ rh: 80, wind10: 8 }), 'sun');
  assert.ok(a.factors.damp > 1, `damp ${a.factors.damp}`);
  assert.ok(a.factors.sun > 1, `sun ${a.factors.sun}`);
  assert.ok(a.factors.breeze < 0, `breeze ${a.factors.breeze}`);
});

test('38 °C with strong wind: the breeze is only called helpful when its share is negative', () => {
  for (const sw of [0, 900]) {
    const a = attribute(base({ tair: 38, rh: 30, wind10: 12, sw, direct: 0.8 * sw }), 'sun');
    if (a.factors.breeze > 0) assert.notEqual(a.words.breeze, 'takes some off');
    if (a.words.breeze === 'takes some off') assert.ok(a.factors.breeze <= -0.5);
  }
});

test('word buckets', () => {
  assert.equal(wordFor(0.2), 'nothing');
  assert.equal(wordFor(-0.2), 'nothing');
  assert.equal(wordFor(1), 'a little');
  assert.equal(wordFor(2), 'some');
  assert.equal(wordFor(3.5), 'a lot');
  assert.equal(wordFor(-0.8), 'takes some off');
});

test('in cool air the reference is still dry, so damp cannot "take some off" against a saturated baseline', () => {
  // 8 °C at 90 % RH is wetter than the reference (dew point 2 °C, about 66 % RH), so damp adds load;
  // at 50 % RH it is drier than the reference, so a negative share is right.
  const wet = attribute(base({ tair: 8, rh: 90, sw: 300, direct: 240, wind10: 2 }), 'sun');
  assert.ok(wet.factors.damp > 0, `damp ${wet.factors.damp}`);
  const dry = attribute(base({ tair: 8, rh: 50, sw: 300, direct: 240, wind10: 2 }), 'sun');
  assert.ok(dry.factors.damp < 0, `damp ${dry.factors.damp}`);
});
