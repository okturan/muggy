import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attribute, wordFor, factorSummary } from '../public/lib/explain.js';
import { factorSentence } from '../public/lib/copy.js';

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
    if (a.factors.breeze > 0) assert.notEqual(a.words.breeze, 'helps');
    if (a.words.breeze === 'helps') assert.ok(a.factors.breeze <= -0.5);
  }
});

test('word buckets', () => {
  assert.equal(wordFor(0.2), 'no difference');
  assert.equal(wordFor(1), 'a bit worse');
  assert.equal(wordFor(2, 'sun'), 'hotter');
  assert.equal(wordFor(3.5, 'sun'), 'much hotter');
  assert.equal(wordFor(-0.8), 'makes it easier');
  assert.equal(wordFor(-0.8, 'breeze'), 'helps');
});

test('in cool air the reference is still dry, so damp cannot "take some off" against a saturated baseline', () => {
  // 8 °C at 90 % RH is wetter than the reference (dew point 2 °C, about 66 % RH), so damp adds load;
  // at 50 % RH it is drier than the reference, so a negative share is right.
  const wet = attribute(base({ tair: 8, rh: 90, sw: 300, direct: 240, wind10: 2 }), 'sun');
  assert.ok(wet.factors.damp > 0, `damp ${wet.factors.damp}`);
  const dry = attribute(base({ tair: 8, rh: 50, sw: 300, direct: 240, wind10: 2 }), 'sun');
  assert.ok(dry.factors.damp < 0, `damp ${dry.factors.damp}`);
});

test('the summary names the biggest cause first and drops what does nothing', () => {
  assert.equal(factorSummary({ damp: -0.9, sun: 3.6, breeze: 0.1 }), 'Most of this is the sun. The dry air helps a little.');
  assert.equal(factorSummary({ damp: 2.2, sun: 2.0, breeze: -1.8 }), 'The damp and the sun share this about equally. The breeze helps.');
  assert.equal(factorSummary({ damp: 0.2, breeze: 0.1 }), 'This is mostly just the air temperature.');
  assert.equal(factorSummary({ damp: 3.1, sun: 1.2, breeze: 2 }, { windKnown: false }), 'Most of this is the damp, with a little from the sun.');
});

test('the summary names the wind by what it is doing, and lists three causes with commas', () => {
  // A breeze share above zero is too little wind in light air, and the wind itself when it blows.
  assert.equal(factorSummary({ damp: 1, sun: 1, breeze: 0.8 }, { wind10: 0.5 }), 'The damp, the sun and the lack of wind share this about equally.');
  assert.equal(factorSummary({ sun: 3, breeze: 1 }, { wind10: 0.5 }), 'Most of this is the sun, with a little from the lack of wind.');
  assert.equal(factorSummary({ sun: 3, breeze: 1 }, { wind10: 6 }), 'Most of this is the sun, with a little from the wind.');
  assert.equal(factorSummary({ sun: 3, damp: -0.8, breeze: -0.9 }, { wind10: 6 }), 'Most of this is the sun. The breeze and the dry air both help a little.');
  assert.equal(factorSummary({ sun: 3, breeze: -0.9 }, { wind10: 0.5 }), 'Most of this is the sun. The calm air helps a little.');
  for (const s of [factorSummary({ damp: 2, breeze: 2, sun: 1 }, { wind10: 0.5 }), factorSummary({ damp: 2, breeze: 2, sun: 1.2 })]) {
    assert.ok(!/ and .* and /.test(s), s);
    assert.ok(!/is still air/.test(s), s);
  }
});

test('the Why sheet never says "makes it makes it"', () => {
  for (const name of ['damp', 'sun', 'breeze']) {
    for (const c of [-3, -1, -0.2, 0.2, 1, 2, 4]) {
      for (const wind10 of [0.5, 5]) {
        const s = factorSentence(name, c, wordFor(c, name), { wind10 });
        assert.ok(!/makes it makes it/.test(s), s);
        assert.ok(!/black globe/.test(s), s);
      }
    }
  }
});
