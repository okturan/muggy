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

test('the heading carries the one number and the note adds context without another', () => {
  const d = describe(normals, 22.85, 10); // 89th percentile
  assert.equal(d.pct, 89);
  assert.equal(d.sub, 'stickier than 89% of mornings');
  assert.equal(d.note, 'Usually it is muggy at this time of day.');
  assert.deepEqual(`${d.sub} ${d.note}`.match(/\d+%/g), ['89%']);
  assert.equal(d.verdict, 'Stickier than usual');
});

test('record-level stickiness says so once', () => {
  const d = describe(normals, 30, 15);
  assert.equal(d.pct, 100);
  assert.equal(d.sub, 'stickiest afternoons on record here');
  assert.equal(d.note, 'Usually it is muggy at this time of day.');
});

test('air that is not sticky at all is damper, never stickier', () => {
  // A winter ladder: dew points from -5 to 10 °C, all in the dry band.
  const winter = { hours: Array.from({ length: 24 }, () => ({ q: Array.from({ length: 101 }, (_, i) => -5 + i * 0.15), mix: { dry: 1 }, n: 700 })) };
  const d = describe(winter, 9, 8);
  assert.equal(d.verdict, 'Way damper than usual');
  assert.match(d.sub, /^damper than \d+% of mornings$/);
  assert.equal(d.note, 'Still the usual dry air, at the damper end of it.');
  assert.ok(!/stick/i.test(`${d.verdict} ${d.sub} ${d.note}`));
  assert.equal(describe(winter, 11, 8).sub, 'dampest mornings on record here');
});

test('a rare band is described by how it feels, not by its name', () => {
  // Humid air in a place that is usually miserable reads "Air this dry", never "Humid air is rare here".
  const wet = { hours: Array.from({ length: 24 }, () => ({ q: Array.from({ length: 101 }, (_, i) => 16 + i * 0.1), mix: { humid: 0.02, miserable: 0.98 }, n: 700 })) };
  const d = describe(wet, 16.5, 14);
  assert.equal(d.note, 'Air this dry is rare here at this time of year.');
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

test('cool air that feels damp but holds little water says both', () => {
  const winter = { hours: Array.from({ length: 24 }, () => ({ q: Array.from({ length: 101 }, (_, i) => -5 + i * 0.15), mix: { dry: 1 }, n: 700 })) };
  const d = describe(winter, -3, 22, { feelsDamp: true });
  assert.equal(d.verdict, 'Drier than usual');
  assert.equal(d.note, 'The air holds less water than usual, even though it feels damp.');
  // About normal needs no explanation.
  assert.notEqual(describe(winter, 0, 22, { feelsDamp: true }).note, d.note);
});
