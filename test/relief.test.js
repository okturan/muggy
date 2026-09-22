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
  assert.equal(describeRelief(w).note, 'The air dries out a little from 22:00.');
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
  assert.match(d.note, /By 02:00 it's down to easy\./);

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
  assert.match(d.note, /By 21:00 the heat is out of the picture\./);
});

test('dry or fresh air at an easy load has nothing to wait for, so there is no card', () => {
  for (const texture of ['dry', 'comfortable']) {
    for (const level of ['none', 'easy']) {
      const now = { time: '2026-08-01T09:00', texture, shadeLevel: level, sunLevel: level, sunUp: true };
      const later = hours('2026-08-01T09:00', (h) => ({ texture: h > 20 ? 'dry' : texture, shadeLevel: 'none', sunLevel: 'none', sunUp: h < 19 }));
      assert.equal(describeRelief(findRelief(now, later)), null, `${texture}/${level}`);
    }
  }
});

test('no relief never answers "When will it get better?" with "Right now"', () => {
  const muggy = { time: '2026-08-01T09:00', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true };
  const same = hours('2026-08-01T09:00', () => ({ texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true }));
  assert.deepEqual(describeRelief(findRelief(muggy, same)), { when: 'Stays muggy', sub: 'next 24 hours', note: "The air doesn't get any drier before this time tomorrow.", tint: 'muggy' });
  const heavy = { time: '2026-08-01T09:00', texture: 'miserable', shadeLevel: 'hard', sunLevel: 'hard', sunUp: true };
  const worse = hours('2026-08-01T09:00', () => ({ texture: 'miserable', shadeLevel: 'hard', sunLevel: 'hard', sunUp: true }));
  const d = describeRelief(findRelief(heavy, worse));
  assert.equal(d.when, 'No relief yet');
  assert.equal(d.sub, 'next 24 hours');
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
  // Reviewer scenario: muggy but easy at 08:30; midday dries to humid but the load climbs to tiring.
  const current = { time: '2026-08-01T08:30', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: true };
  const hs = hours('2026-08-01T08:00', (h) => (h >= 12 && h < 18
    ? { texture: 'humid', shadeLevel: 'realWork', sunLevel: 'hard', sunUp: true }
    : { texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h >= 6 && h < 20 }));
  const w = findRelief(current, hs);
  assert.equal(w.kind, 'none', JSON.stringify(w.open));
});

test('a window only spans consecutive hours; a missing hour ends it', () => {
  const current = { time: '2026-08-01T20:30', texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: false };
  const all = hours('2026-08-01T20:00', (h) => ({ texture: 'muggy', shadeLevel: h === 21 || h === 23 ? 'easy' : 'noticeable', sunLevel: h === 21 || h === 23 ? 'easy' : 'noticeable', sunUp: false }));
  const gap = all.filter((h) => h.time !== '2026-08-01T22:00');
  const w = findRelief(current, gap);
  assert.equal(w.open.time, '2026-08-01T21:00');
  assert.equal(w.len, 1);
  // One better hour between worse ones is a dip, so it is "around", not "from".
  assert.equal(describeRelief(w).when, 'Around 21:00');
  assert.match(describeRelief(w).note, /around 21:00/);
});

test('a window that runs to the end of the forecast has no end time', () => {
  const current = { time: '2026-08-01T12:30', texture: 'muggy', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: true };
  const hs = hours('2026-08-01T12:00', (h, i) => (i >= 22
    ? { texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h >= 6 && h < 19 }
    : { texture: 'muggy', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: h >= 6 && h < 19 })).slice(0, 26);
  const w = findRelief(current, hs);
  assert.equal(w.openEnded, true);
  assert.match(describeRelief(w).when, /^Tomorrow, from 10:00$/);
});

test('sunset only explains a window that opens in the evening', () => {
  // Hot all night; the load only drops at dawn. That is cooling, not sunset.
  const current = { time: '2026-08-01T15:00', texture: 'muggy', shadeLevel: 'hard', sunLevel: 'hard', sunUp: true };
  const hs = hours('2026-08-01T15:00', (h) => (h >= 6 && h < 10
    ? { texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', sunUp: h >= 7 }
    : { texture: 'muggy', shadeLevel: 'hard', sunLevel: 'hard', sunUp: h >= 7 && h < 19 }));
  const w = findRelief(current, hs);
  assert.equal(w.open.time, '2026-08-02T06:00');
  assert.equal(w.cause, 'cooler');
  assert.match(describeRelief(w).note, /^Noticeable from 06:00 as it cools off\./);
});

test('when only the air dries within a window, the card says so instead of repeating the level', () => {
  const current = { time: '2026-08-01T18:30', texture: 'muggy', shadeLevel: 'easy', sunLevel: 'noticeable', sunUp: true };
  const hs = hours('2026-08-01T18:00', (h) => ({ texture: h >= 22 || h < 6 ? 'humid' : 'muggy', shadeLevel: 'easy', sunLevel: 'easy', sunUp: h >= 6 && h < 19 }));
  const d = describeRelief(findRelief(current, hs));
  assert.match(d.note, /^Easy from 19:00, once the sun is down\. The air is drier still by 22:00\.$/);
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

test('a lone hour of slightly drier air is forecast wobble, not relief', () => {
  const current = { time: '2026-08-01T14:30', texture: 'oppressive', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: true };
  const hs = hours('2026-08-01T14:00', (h) => ({ texture: h === 16 ? 'muggy' : h >= 20 && h < 23 ? 'muggy' : 'oppressive', shadeLevel: 'realWork', sunLevel: 'realWork', sunUp: h >= 6 && h < 19 }));
  const w = findRelief(current, hs);
  assert.equal(w.open.time, '2026-08-01T20:00');
  assert.equal(describeRelief(w).when, '20:00 – 23:00');
});
