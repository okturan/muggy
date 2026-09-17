import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peakAndTrend } from '../public/lib/explain.js';
import { classesIn } from '../public/lib/lexicon.js';

const day = (levels) => levels.map((level, h) => ({ time: `2026-08-01T${String(h).padStart(2, '0')}:00`, level }));

test('quiet morning ahead of a hard afternoon: one sentence with the time', () => {
  const hs = day(['none', 'none', 'none', 'none', 'none', 'none', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'noticeable', 'realWork', 'hard', 'hard', 'realWork', 'noticeable', 'easy', 'easy', 'easy', 'none', 'none', 'none']);
  const s = peakAndTrend({ nowLevel: 'easy', now: '2026-08-01T10:30', hours: hs });
  assert.deepEqual(s, ['It gets to hard by 14:00.']);
});

test('easy and at the peak: no dramatic wording', () => {
  const hs = day(Array(24).fill('easy'));
  assert.deepEqual(peakAndTrend({ nowLevel: 'easy', now: '2026-08-01T14:00', hours: hs }), []);
});

test('noticeable and at the peak: "about as bad as today gets"', () => {
  const hs = day([...Array(12).fill('easy'), ...Array(5).fill('noticeable'), ...Array(7).fill('easy')]);
  assert.deepEqual(peakAndTrend({ nowLevel: 'noticeable', now: '2026-08-01T13:10', hours: hs, trend: 0.2 }), ['This is about as bad as today gets.']);
});

test('after the peak: time-tagged and eased', () => {
  const hs = day([...Array(12).fill('noticeable'), 'hard', 'hard', ...Array(10).fill('realWork')]);
  const s = peakAndTrend({ nowLevel: 'realWork', now: '2026-08-01T17:05', hours: hs, trend: -1.3 });
  assert.deepEqual(s, ['It was hard around 12:00 and has eased since.', 'It has been easing over the past hour.']);
  for (const line of s) if (classesIn(line).has('loadLevel')) assert.match(line, /\d\d:00/);
});
