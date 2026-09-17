// Relief-window scenarios from the relief-window spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRelief, describeRelief } from '../public/lib/relief.js';
import { classesIn } from '../public/lib/lexicon.js';

/** Build 30 hours from a start hour with a function giving each hour's state. */
function hours(startIso, fn) {
  const t0 = Date.parse(`${startIso}:00Z`);
  return Array.from({ length: 30 }, (_, i) => {
    const time = new Date(t0 + i * 3600000).toISOString().slice(0, 16);
    return { time, ...fn(Number(time.slice(11, 13)), i) };
  });
}

test('sunset counts as relief', () => {
  const current = { time: '2026-08-01T17:00', texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'realWork', sunUp: true };
  const hs = hours('2026-08-01T17:00', (h) => (h < 19
    ? { texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'realWork', sunUp: true }
    : { texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false }));
  const w = findRelief(current, hs);
  assert.equal(w.kind, 'relief');
  assert.equal(w.open.time, '2026-08-01T19:00');
  assert.equal(w.cause, 'sunDown');
  const d = describeRelief(w);
  assert.match(d.note, /^Noticeable from 19:00, once the sun is down\./);
});

test('drier air counts as relief', () => {
  const current = { time: '2026-08-01T18:00', texture: 'oppressive', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false };
  const hs = hours('2026-08-01T18:00', (h) => ({ texture: h >= 22 || h < 6 ? 'humid' : 'oppressive', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false }));
  const w = findRelief(current, hs);
  assert.equal(w.open.time, '2026-08-01T22:00');
  assert.equal(w.cause, 'drier');
  assert.match(describeRelief(w).note, /Humid air from 22:00 as it dries out/);
});

test('easy load: texture alone ranks relief', () => {
  const current = { time: '2026-08-01T21:00', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: false };
  const hs = hours('2026-08-01T21:00', (h) => ({ texture: h >= 23 || h < 8 ? 'comfortable' : 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: false }));
  const w = findRelief(current, hs);
  assert.equal(w.textureOnly, true);
  assert.equal(w.open.time, '2026-08-01T23:00');
});

test('night hours extend but never open a window, and the window reports where it bottoms out', () => {
  const current = { time: '2026-08-01T20:00', texture: 'muggy', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: false };
  const hs = hours('2026-08-01T20:00', (h) => {
    if (h === 21) return { texture: 'muggy', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: false };
    if (h >= 22 || h < 2) return { texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false };
    if (h >= 2 && h < 6) return { texture: 'comfortable', shadeLevel: 'easy', sunLevel: 'easy', sunUp: false };
    return { texture: 'muggy', shadeLevel: 'realWork', sunLevel: 'hard', sunUp: true };
  });
  const w = findRelief(current, hs);
  assert.equal(w.open.time, '2026-08-01T22:00');
  assert.equal(w.deepens, true);
  assert.equal(w.bottom.time, '2026-08-02T02:00');
  const d = describeRelief(w);
  assert.match(d.note, /Easing to easy by 02:00/);

  // Relief that exists only between 00:00 and 05:59 is not offered.
  const onlyNight = hours('2026-08-01T20:00', (h) => ({ texture: 'muggy', shadeLevel: h < 6 ? 'easy' : 'realWork', sunLevel: h < 6 ? 'easy' : 'realWork', sunUp: false }));
  assert.equal(findRelief(current, onlyNight).kind, 'none');
});

test('a window that bottoms out at None never says "easing to none"', () => {
  const current = { time: '2026-07-20T12:30', texture: 'dry', shadeLevel: 'easy', sunLevel: 'noticeable', sunUp: true };
  const hs = hours('2026-07-20T12:00', (h) => (h < 17
    ? { texture: 'dry', shadeLevel: 'easy', sunLevel: 'noticeable', sunUp: true }
    : h < 21 ? { texture: 'dry', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h < 20 }
      : { texture: 'dry', shadeLevel: 'none', sunLevel: 'none', sunUp: false }));
  const d = describeRelief(findRelief(current, hs));
  assert.ok(!/\bnone\b/i.test(d.note), d.note);
  assert.match(d.note, /out of the picture by 21:00/);
});

test('no relief: wording depends on whether the air is already easy', () => {
  const easy = { time: '2026-08-01T09:00', texture: 'comfortable', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true };
  const same = hours('2026-08-01T09:00', () => ({ texture: 'comfortable', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true }));
  assert.match(describeRelief(findRelief(easy, same)).sub, /as good as it gets/);
  const heavy = { time: '2026-08-01T09:00', texture: 'miserable', shadeLevel: 'hard', sunLevel: 'hard', sunUp: true };
  const worse = hours('2026-08-01T09:00', () => ({ texture: 'miserable', shadeLevel: 'hard', sunLevel: 'hard', sunUp: true }));
  assert.match(describeRelief(findRelief(heavy, worse)).sub, /no real relief/);
});

test('every level named in relief wording carries a time', () => {
  const current = { time: '2026-08-01T13:00', texture: 'muggy', shadeLevel: 'hard', sunLevel: 'dangerous', sunUp: true };
  const hs = hours('2026-08-01T13:00', (h) => (h < 18
    ? { texture: 'muggy', shadeLevel: 'hard', sunLevel: 'dangerous', sunUp: true }
    : { texture: 'humid', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false }));
  const d = describeRelief(findRelief(current, hs));
  if (classesIn(d.note).has('loadLevel')) assert.match(d.note, /\d\d:00/);
});

test('at an easy load, heavier hours are never offered as relief even if the air is drier', () => {
  // Reviewer scenario: muggy but easy at 08:30; midday dries to humid but the load climbs to heavy.
  const current = { time: '2026-08-01T08:30', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true };
  const hs = hours('2026-08-01T08:00', (h) => (h >= 12 && h < 18
    ? { texture: 'humid', shadeLevel: 'realWork', sunLevel: 'hard', sunUp: true }
    : { texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h >= 6 && h < 20 }));
  const w = findRelief(current, hs);
  assert.equal(w.kind, 'none', JSON.stringify(w.open));
});

test('a window only spans consecutive hours; a missing hour ends it', () => {
  const current = { time: '2026-08-01T20:30', texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false };
  const all = hours('2026-08-01T20:00', (h) => ({ texture: h === 21 || h === 23 ? 'humid' : 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false }));
  const gap = all.filter((h) => h.time !== '2026-08-01T22:00');
  const w = findRelief(current, gap);
  assert.equal(w.open.time, '2026-08-01T21:00');
  assert.equal(w.len, 1);
  assert.equal(describeRelief(w).when, 'From 21:00');
});

test('when only the air dries within a window, the card says so instead of repeating the level', () => {
  const current = { time: '2026-08-01T18:30', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'noticeable', sunUp: true };
  const hs = hours('2026-08-01T18:00', (h) => ({ texture: h >= 22 || h < 6 ? 'humid' : 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h >= 6 && h < 19 }));
  const d = describeRelief(findRelief(current, hs));
  assert.match(d.note, /^Easy from 19:00, once the sun is down\. Humid air by 22:00\.$/);
});

test('a relief hour at level None is described without the word "none"', () => {
  const current = { time: '2026-08-01T17:30', texture: 'dry', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: true };
  const hs = hours('2026-08-01T17:00', (h) => (h >= 19 || h < 6
    ? { texture: 'dry', shadeLevel: 'none', sunLevel: 'none', sunUp: false }
    : { texture: 'dry', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: true }));
  const d = describeRelief(findRelief(current, hs));
  assert.ok(!/\bnone\b/i.test(d.note), d.note);
  assert.match(d.note, /^The heat is out of the picture from 19:00, once the sun is down\./);
});
