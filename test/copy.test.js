// Texture copy describes the air, never what to do; night copy never mentions the sun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTURE_SENTENCE, TEXTURE_SENTENCE_NO_HEAT, DAMP_COOL, HEADLINES, LOAD_SENTENCE } from '../public/lib/copy.js';
import { classesIn, ACTIVITY_ADVICE, isHydrationOnly } from '../public/lib/lexicon.js';
import { TEXTURES } from '../public/lib/texture.js';
import { LEVELS } from '../public/lib/levels.js';

test('texture sentences carry no activity advice (dry air may mention drinking)', () => {
  for (const texture of TEXTURES) {
    for (const period of ['day', 'night']) {
      const text = TEXTURE_SENTENCE[texture][period];
      const found = classesIn(text);
      for (const cls of ACTIVITY_ADVICE) {
        if (cls === 'restWater' && texture === 'dry' && isHydrationOnly(text)) continue;
        assert.ok(!found.has(cls), `${texture}/${period} has ${cls}: "${text}"`);
      }
    }
  }
});

test('night copy never mentions sun or shade', () => {
  for (const texture of TEXTURES) assert.ok(!classesIn(TEXTURE_SENTENCE[texture].night).has('sunShade'), texture);
  for (const level of LEVELS) {
    const t = LOAD_SENTENCE[level].night;
    if (t) assert.ok(!classesIn(t).has('sunShade'), level);
  }
});

test('every texture has a headline for every level', () => {
  for (const texture of TEXTURES) for (const level of LEVELS) assert.ok(HEADLINES[texture][level], `${texture}/${level}`);
});

test('the no-heat and damp-cool sentences give no advice and never mention the sun', () => {
  const all = [...Object.values(TEXTURE_SENTENCE_NO_HEAT).flatMap((p) => [p.day, p.night]), DAMP_COOL.sentence.day, DAMP_COOL.sentence.night];
  for (const text of all) {
    const found = classesIn(text);
    for (const cls of ACTIVITY_ADVICE) assert.ok(!found.has(cls), `${cls}: "${text}"`);
    assert.ok(!found.has('sunShade'), text);
    assert.ok(!/sweat dries|keep drinking/i.test(text), `no sweat talk when nobody sweats: "${text}"`);
  }
});

test('no two sentences that can sit side by side both say "tonight"', () => {
  for (const texture of Object.keys(TEXTURE_SENTENCE)) {
    for (const level of Object.keys(LOAD_SENTENCE)) {
      const pair = `${TEXTURE_SENTENCE[texture].night} ${LOAD_SENTENCE[level].night || ''}`;
      assert.ok((pair.match(/tonight/g) || []).length <= 1, pair);
    }
  }
});
