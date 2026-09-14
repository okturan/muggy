import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, alertMark, createHysteresis, stepLevel, roundHalfUp } from '../public/lib/levels.js';
import { textureOf } from '../public/lib/texture.js';

test('level boundaries on rounded WBGT', () => {
  const cases = [[17, 'none'], [18, 'easy'], [20, 'easy'], [21, 'noticeable'], [24, 'noticeable'],
    [25, 'realWork'], [27, 'realWork'], [28, 'hard'], [30, 'hard'], [31, 'dangerous']];
  for (const [w, lv] of cases) assert.equal(levelOf(w), lv, `WBGT ${w}`);
});

test('printed number and level agree at the half', () => {
  assert.equal(roundHalfUp(20.5), 21);
  assert.equal(levelOf(20.5), 'noticeable');
  assert.equal(roundHalfUp(20.49), 20);
  assert.equal(levelOf(20.49), 'easy');
  assert.equal(levelOf(20.6), 'noticeable');
});

test('alert marks inside Dangerous', () => {
  assert.equal(alertMark(32), null);
  assert.equal(alertMark(34), 'alert');
  assert.equal(levelOf(34), 'dangerous');
  assert.equal(alertMark(35), 'special');
});

test('hysteresis holds a level near its boundary and releases on a clear crossing', () => {
  const h = createHysteresis();
  assert.equal(h.level('p:shade', 20.2), 'easy');
  for (const w of [20.4, 20.6, 20.5, 20.7]) assert.equal(h.level('p:shade', w), 'easy', `at ${w}`);
  assert.equal(h.level('p:shade', 20.8), 'noticeable');
  // Coming back down needs 20.2 or less.
  assert.equal(h.level('p:shade', 20.3), 'noticeable');
  assert.equal(h.level('p:shade', 20.19), 'easy');
});

test('hysteresis jumps several levels at once and resets on a new place', () => {
  const h = createHysteresis();
  assert.equal(h.level('k', 19), 'easy');
  assert.equal(h.level('k', 29), 'hard');
  h.reset();
  assert.equal(h.level('k', 20.6), 'noticeable');
});

test('texture band edges', () => {
  assert.equal(textureOf(12.7), 'dry');
  assert.equal(textureOf(12.8), 'comfortable');
  assert.equal(textureOf(18.3), 'muggy');
  assert.equal(textureOf(23.9), 'miserable');
});

test('stepLevel places a reading relative to a held level with the same margin', () => {
  const idx = (l) => ['none', 'easy', 'noticeable', 'realWork', 'hard', 'dangerous'].indexOf(l);
  // Held noticeable at 20.4: an hour at 20.4 (raw easy) stays noticeable, 20.1 drops.
  assert.equal(stepLevel(idx('noticeable'), 20.4), idx('noticeable'));
  assert.equal(stepLevel(idx('noticeable'), 20.1), idx('easy'));
  // Held easy at 20.6: an hour at 20.6 (raw noticeable) stays easy, 20.8 climbs.
  assert.equal(stepLevel(idx('easy'), 20.6), idx('easy'));
  assert.equal(stepLevel(idx('easy'), 20.8), idx('noticeable'));
  // Big moves are never held back.
  assert.equal(stepLevel(idx('easy'), 33), idx('dangerous'));
});
