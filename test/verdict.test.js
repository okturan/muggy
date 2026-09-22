// Composition scenarios from the comfort-verdict spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, textureSentence, airWord } from '../public/lib/verdict.js';
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

test('cool damp air reads as damp, not as crisp and dry', () => {
  // Tirana on a foggy winter morning: 6 °C, 95 % humidity, dew point in the dry band.
  const fog = compose({ texture: 'dry', shadeLevel: 'none', sunLevel: 'none', ...day, air: { t: 6, rh: 95 } });
  assert.equal(fog.headline, 'Cold and damp');
  assert.equal(fog.blurb, 'Damp air, but too cool to feel sticky.');
  const mist = compose({ texture: 'comfortable', shadeLevel: 'none', sunLevel: 'none', isDay: false, sunKnown: true, air: { t: 17, rh: 92 } });
  assert.equal(mist.headline, 'Cool and damp');
  assert.equal(mist.blurb, 'A damp night, but too cool to feel sticky.');
  // Drier cool air keeps its old headline, without sweat talk.
  const crisp = compose({ texture: 'dry', shadeLevel: 'none', sunLevel: 'none', ...day, air: { t: 12, rh: 55 } });
  assert.equal(crisp.headline, 'Crisp and dry');
  assert.equal(crisp.blurb, 'Dry air, nothing sticky about it.');
  // Any heat at all and the damp-cool wording steps aside.
  assert.equal(compose({ texture: 'comfortable', shadeLevel: 'easy', sunLevel: 'easy', ...day, air: { t: 17, rh: 92 } }).headline, 'Fresh and easy');
});

test('hot dry air is never called fresh', () => {
  // Kuwait City at 03:00: 34 °C, 27 % humidity, dew point in the comfortable band.
  const v = compose({ texture: 'comfortable', shadeLevel: 'noticeable', sunLevel: 'noticeable', isDay: false, sunKnown: true, air: { t: 34, rh: 27 } });
  assert.equal(v.headline, 'Hot but not sticky');
  assert.ok(!/fresh/i.test(`${v.headline} ${v.blurb}`), v.blurb);
  assert.equal(compose({ texture: 'dry', shadeLevel: 'noticeable', sunLevel: 'noticeable', ...day, air: { t: 38, rh: 12 } }).headline, 'Hot, dry air');
  assert.equal(compose({ texture: 'dry', shadeLevel: 'noticeable', sunLevel: 'noticeable', ...day, air: { t: 26, rh: 30 } }).headline, 'Warm, dry air');
  for (const texture of ['dry', 'comfortable']) {
    for (const level of ['noticeable', 'realWork', 'hard']) {
      const hot = compose({ texture, shadeLevel: level, sunLevel: level, ...day, air: { t: 36, rh: 20 } });
      assert.ok(!/fresh/i.test(hot.blurb), `${texture}/${level}: ${hot.blurb}`);
    }
  }
});

test('the headline never repeats its air word as the blurb\'s first words', () => {
  for (const texture of ['dry', 'comfortable']) {
    for (const level of ['easy', 'noticeable', 'realWork', 'hard']) {
      const v = compose({ texture, shadeLevel: level, sunLevel: level, ...day, air: { t: 27, rh: 40 } });
      assert.ok(!/^(Dry air|Fresh air)\b/.test(v.blurb), `${v.headline} | ${v.blurb}`);
    }
  }
});

test('the Why sheet describes the air with the same sentence as the verdict', () => {
  const air = { t: 6, rh: 95 };
  const v = compose({ texture: 'dry', shadeLevel: 'none', sunLevel: 'none', ...day, air });
  assert.equal(textureSentence('dry', 'day', v.worst, air), v.sentences.find((s) => s.kind === 'texture').text);
});

test('hard is "hard going" whatever the air', () => {
  for (const texture of ['humid', 'muggy', 'oppressive', 'miserable']) {
    assert.match(compose({ texture, shadeLevel: 'hard', sunLevel: 'hard', ...day }).headline, /and hard going$/);
  }
});

test('the headline and the air sentence always agree, with or without a load', () => {
  for (const texture of ['dry', 'comfortable']) {
    for (const shadeLevel of [null, 'none']) {
      const v = compose({ texture, shadeLevel, sunLevel: shadeLevel, ...day, air: { t: 3, rh: 97 } });
      assert.equal(v.headline, 'Cold and damp', `${texture}/${shadeLevel}`);
      assert.match(v.blurb, /damp/i);
    }
  }
});

test('the air word never contradicts the headline', () => {
  // Fog: the band is dry, the air is damp.
  assert.equal(airWord('dry', 'none', { t: 6, rh: 95 }), 'damp');
  assert.equal(airWord('comfortable', 'none', { t: 15, rh: 88 }), 'damp');
  // Crisp cold air keeps its band name.
  assert.equal(airWord('dry', 'none', { t: 6, rh: 60 }), 'dry');
  // Nothing is comfortable in real heat.
  for (const level of ['noticeable', 'realWork', 'hard', 'dangerous']) assert.equal(airWord('comfortable', level, { t: 38, rh: 20 }), 'not sticky');
  assert.equal(airWord('comfortable', 'easy', { t: 24, rh: 60 }), 'comfortable');
  // Hot dry air is still dry; sticky bands keep their names.
  assert.equal(airWord('dry', 'hard', { t: 45, rh: 8 }), 'dry');
  for (const band of ['humid', 'muggy', 'oppressive', 'miserable']) assert.equal(airWord(band, 'hard', { t: 32, rh: 70 }), band);
  // No load, no temperature: the band.
  assert.equal(airWord('comfortable', null, null), 'comfortable');
});
