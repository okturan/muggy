import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, daypart, percentileOf, hasHourLadders, barSegments } from '../public/lib/normals.js';

/** A ladder from 14 to 24 °C, evenly spaced, for every hour. */
const ladder = Array.from({ length: 101 }, (_, i) => 14 + i * 0.1);
const mix = { comfortable: 0.25, humid: 0.3, muggy: 0.3, oppressive: 0.15 };
const normals = { years: 10, hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, q: ladder, mix, n: 750 })) };

test('dayparts', () => {
  assert.equal(daypart(10), 'morning');
  assert.equal(daypart(12), 'afternoon');
  assert.equal(daypart(21), 'evening');
  assert.equal(daypart(23), 'night');
  assert.equal(daypart(4), 'night');
});

test('heading and body state one statistic, and only one percentage appears', () => {
  const d = describe(normals, 22.85, 10); // 89th percentile
  assert.equal(d.pct, 89);
  assert.equal(d.sub, 'stickier than 89% of mornings');
  assert.match(d.note, /Only 11% of mornings around this date have been stickier\./);
  const percents = `${d.sub} ${d.note}`.match(/\d+%/g);
  assert.deepEqual([...new Set(percents)].sort(), ['11%', '89%']);
  assert.equal(d.verdict, 'Stickier than usual');
});

test('record-level stickiness says so', () => {
  const d = describe(normals, 30, 15);
  assert.equal(d.pct, 100);
  assert.match(d.sub, /stickiest afternoons on record/);
  assert.match(d.note, /Nothing recorded around this date has been stickier/);
});

test('verdict thresholds', () => {
  const at = (p) => describe(normals, ladder[p], 9).verdict;
  assert.equal(at(95), 'Way stickier than usual');
  assert.equal(at(75), 'Stickier than usual');
  assert.equal(at(50), 'About normal');
  assert.equal(at(20), 'Drier than usual');
  assert.equal(at(5), 'Way drier than usual');
});

test('unusable normals hide the card', () => {
  assert.equal(hasHourLadders({ hours: [] }), false);
  assert.equal(describe({ q: ladder, mix }, 20, 10), null);
  assert.equal(percentileOf([1, 2, 3], 2), null);
});

test('bar segments are in band order', () => {
  assert.deepEqual(barSegments({ muggy: 0.3, comfortable: 0.7 }).map((s) => s.band), ['comfortable', 'muggy']);
});
