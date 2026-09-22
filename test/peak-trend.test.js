import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peakAndTrend } from '../public/lib/explain.js';
import { classesIn } from '../public/lib/lexicon.js';

const day = (levels) => levels.map((level, h) => ({ time: `2026-08-01T${String(h).padStart(2, '0')}:00`, level }));

test('quiet morning ahead of a hard afternoon: one sentence with the time', () => {
  const hs = day(['none', 'none', 'none', 'none', 'none', 'none', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'noticeable', 'realWork', 'hard', 'hard', 'realWork', 'noticeable', 'easy', 'easy', 'easy', 'none', 'none', 'none']);
  const s = peakAndTrend({ nowLevel: 'easy', now: '2026-08-01T10:30', hours: hs });
  assert.deepEqual(s, ["By 14:00 it's hard."]);
});

test('easy and at the peak: no dramatic wording', () => {
  const hs = day(Array(24).fill('easy'));
  assert.deepEqual(peakAndTrend({ nowLevel: 'easy', now: '2026-08-01T14:00', hours: hs }), []);
});

test('noticeable and at the peak: "it doesn\'t get worse than this today"', () => {
  const hs = day([...Array(12).fill('easy'), ...Array(5).fill('noticeable'), ...Array(7).fill('easy')]);
  assert.deepEqual(peakAndTrend({ nowLevel: 'noticeable', now: '2026-08-01T13:10', hours: hs, trend: 0.2 }), ["It doesn't get worse than this today."]);
  assert.deepEqual(peakAndTrend({ nowLevel: 'noticeable', now: '2026-08-01T15:10', hours: hs, trend: -1.2 }), ["It doesn't get worse than this today.", 'It has been easing over the past hour.']);
});

test('after the peak: time-tagged and eased, said once', () => {
  const hs = day([...Array(12).fill('noticeable'), 'hard', 'hard', ...Array(10).fill('realWork')]);
  const s = peakAndTrend({ nowLevel: 'realWork', now: '2026-08-01T17:05', hours: hs, trend: -1.3 });
  assert.deepEqual(s, ['It was hard around 12:00 and has eased since.']);
  for (const line of s) if (classesIn(line).has('loadLevel')) assert.match(line, /\d\d:00/);
});

test('a rise inside the current level never contradicts the statement', () => {
  // Houston, 23:45: dangerous earlier, easing, then the WBGT ticks up within the level.
  const hs = day([...Array(14).fill('realWork'), 'dangerous', ...Array(9).fill('realWork')]);
  assert.deepEqual(peakAndTrend({ nowLevel: 'realWork', now: '2026-08-01T23:45', hours: hs, trend: 1.4 }), ['It was dangerous around 14:00 and has eased since.']);
  const flat = day(Array(24).fill('realWork'));
  assert.deepEqual(peakAndTrend({ nowLevel: 'realWork', now: '2026-08-01T10:00', hours: flat, trend: 1.4 }), ["It doesn't get worse than this today."]);
});
