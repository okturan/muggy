// Composition scenarios from the comfort-verdict spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../public/lib/verdict.js';
import { classesIn } from '../public/lib/lexicon.js';

const day = { isDay: true, sunKnown: true };

test('muggy air at an easy load reads as muggy but mild, not a warning', () => {
  const v = compose({ texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', ...day });
  assert.equal(v.headline, 'Muggy but mild');
  for (const s of v.sentences) {
    const c = classesIn(s.text);
    assert.ok(!c.has('pace') && !c.has('avoidExertion') && !c.has('stopCool'), s.text);
  }
});

test('regression, 13 September 2026: muggy, easy in the shade, full sun', () => {
  const v = compose({ texture: 'muggy', shadeLevel: 'easy', sunLevel: 'noticeable', ...day });
  const all = v.sentences.map((s) => ({ ...s, c: classesIn(s.text) }));
  const slows = all.some((s) => s.c.has('pace') || s.c.has('avoidExertion'));
  const unqualifiedReassurance = all.some((s) => s.c.has('reassurance') && s.scope !== 'shade');
  assert.ok(!(slows && unqualifiedReassurance), v.blurb);
  assert.match(v.headline, /easy in the shade, noticeable in the sun/);
});

test('a sun level of Easy over a shade level of None is not a split: nothing to warn about', () => {
  const v = compose({ texture: 'comfortable', shadeLevel: 'none', sunLevel: 'easy', ...day });
  assert.equal(v.split, false);
  assert.equal(v.headline, 'Fresh and easy');
  assert.ok(v.sentences.every((s) => typeof s.text === 'string' && s.text.length > 0));
  assert.ok(!/\s{2,}/.test(v.blurb), v.blurb);
  // But a sun level that carries advice does split, even over None.
  const s = compose({ texture: 'dry', shadeLevel: 'none', sunLevel: 'noticeable', ...day });
  assert.equal(s.split, true);
  assert.equal(s.headline, 'Fine in the shade, noticeable in the sun');
});

test('dangerous load drops the texture word', () => {
  const v = compose({ texture: 'dry', shadeLevel: 'dangerous', sunLevel: 'dangerous', ...day });
  assert.equal(v.headline, 'Dangerous heat');
  assert.ok(!/\bdry\b/i.test(v.headline));
  assert.ok(!v.sentences.some((s) => s.kind === 'texture'));
});

test('cool weather: texture-led headline with no heat-load claim', () => {
  const v = compose({ texture: 'comfortable', shadeLevel: 'none', sunLevel: 'none', ...day });
  assert.equal(v.headline, 'Perfect air');
  assert.equal(v.sentences.length, 1);
  assert.equal(v.sentences[0].kind, 'texture');
});

test('split headline names both levels; equal levels mention neither', () => {
  const split = compose({ texture: 'comfortable', shadeLevel: 'easy', sunLevel: 'noticeable', ...day });
  assert.equal(split.headline, 'Easy in the shade, noticeable in the sun');
  const same = compose({ texture: 'humid', shadeLevel: 'realWork', sunLevel: 'realWork', ...day });
  assert.ok(!/\b(sun|shade)\b/i.test(same.headline + ' ' + same.blurb), same.headline + ' | ' + same.blurb);
});

test('night: no sun or shade wording anywhere, even if a sun level is passed', () => {
  const v = compose({ texture: 'oppressive', shadeLevel: 'realWork', sunLevel: 'hard', isDay: false, sunKnown: true });
  assert.equal(v.split, false);
  assert.ok(!classesIn(v.headline + ' ' + v.blurb).has('sunShade'), v.headline + ' | ' + v.blurb);
});

test('blurb order: air, then the body in the sun, then the shade', () => {
  const v = compose({ texture: 'humid', shadeLevel: 'noticeable', sunLevel: 'realWork', ...day });
  assert.deepEqual(v.sentences.map((s) => `${s.kind}:${s.scope}`), ['texture:all', 'load:sun', 'qualifier:shade']);
  assert.ok(v.sentences.length <= 3);
});

test('radiation unknown in daylight: no split and no sun words', () => {
  const v = compose({ texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'hard', isDay: true, sunKnown: false });
  assert.equal(v.split, false);
  assert.ok(!classesIn(v.headline + ' ' + v.blurb).has('sunShade'));
});

test('load unavailable: texture only', () => {
  const v = compose({ texture: 'muggy', shadeLevel: null, sunLevel: null, isDay: true });
  assert.equal(v.headline, "It's muggy out");
  assert.deepEqual(v.sentences.map((s) => s.kind), ['texture']);
});

test('alert marks join a dangerous verdict', () => {
  const v = compose({ texture: 'oppressive', shadeLevel: 'dangerous', sunLevel: 'dangerous', ...day, alert: 'alert' });
  assert.ok(v.sentences.some((s) => s.kind === 'alert'));
  assert.ok(v.sentences.length <= 3);
});
