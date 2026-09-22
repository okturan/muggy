// Every combination the engine can produce composes, and every composed
// sentence has earned its advice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compose } from '../public/lib/verdict.js';
import * as COPY from '../public/lib/copy.js';
import { classesIn, isHydrationOnly } from '../public/lib/lexicon.js';
import { LEVELS } from '../public/lib/levels.js';

const { tuples } = JSON.parse(readFileSync(new URL('./fixtures/reachable.json', import.meta.url), 'utf8'));
const rank = (l) => (l == null ? -1 : LEVELS.indexOf(l));

/** Gating rules from the comfort-verdict spec; returns a list of violations. */
export function violations(v, t) {
  const out = [];
  const effectiveSun = t.isDay && t.sunKnown && t.sunLevel != null ? t.sunLevel : t.shadeLevel;
  const worst = rank(effectiveSun) > rank(t.shadeLevel) ? effectiveSun : t.shadeLevel;
  const text = `${v.headline} ${v.blurb}`;
  if (!v.headline || /undefined|null/.test(text) || !v.blurb) out.push('missing copy');
  if (v.sentences.some((s) => typeof s.text !== 'string' || !s.text.trim())) out.push('empty sentence');
  if (/\s{2,}/.test(v.blurb)) out.push('double space in blurb (a dropped sentence?)');
  if ((!t.isDay || !t.sunKnown) && classesIn(text).has('sunShade')) out.push('sun or shade wording without a known daytime sun');

  for (const s of v.sentences) {
    const c = classesIn(s.text);
    // The level that applies to this sentence's scope.
    const scoped = s.scope === 'sun' ? effectiveSun : s.scope === 'shade' ? t.shadeLevel : worst;
    const hydrationTexture = s.kind === 'texture' && t.texture === 'dry' && isHydrationOnly(s.text);
    if (s.kind === 'texture' && (c.has('pace') || c.has('avoidExertion') || c.has('stopCool') || c.has('indoor') || (c.has('restWater') && !hydrationTexture))) {
      out.push(`texture sentence gives activity advice: "${s.text}"`);
    }
    if (c.has('reassurance')) {
      const ok = s.scope === 'shade' ? rank(t.shadeLevel) <= rank('easy') : rank(worst) <= rank('easy');
      if (!ok) out.push(`reassurance at ${worst}: "${s.text}"`);
    }
    if (c.has('pace') && rank(scoped) < rank('noticeable')) out.push(`pace advice at ${scoped}: "${s.text}"`);
    if (c.has('restWater') && !hydrationTexture && rank(scoped) < rank('realWork')) out.push(`rest/water advice at ${scoped}: "${s.text}"`);
    if (c.has('avoidExertion') && rank(scoped) < rank('hard')) out.push(`avoid-exertion advice at ${scoped}: "${s.text}"`);
    if (c.has('stopCool') && rank(scoped) < rank('dangerous')) out.push(`stop-and-cool advice at ${scoped}: "${s.text}"`);
    if (c.has('indoor') && t.isDay && rank(worst) < rank('hard')) out.push(`indoor advice in daytime at ${worst}: "${s.text}"`);
    // Severity justified only by the sun must say so.
    const severe = c.has('avoidExertion') || c.has('stopCool') || (c.has('restWater') && !hydrationTexture) || c.has('pace');
    const needs = c.has('stopCool') ? 'dangerous' : c.has('avoidExertion') ? 'hard' : c.has('restWater') && !hydrationTexture ? 'realWork' : 'noticeable';
    if (severe && s.scope !== 'sun' && rank(t.shadeLevel) < rank(needs) && rank(effectiveSun) >= rank(needs) && s.kind !== 'texture') {
      out.push(`sun-only severity not labelled: "${s.text}"`);
    }
  }
  if (v.sentences.length > 3) out.push(`more than three sentences (${v.sentences.length})`);
  return out;
}

test('the reachability sweep covered the engine broadly', () => {
  assert.ok(tuples.length > 60, `${tuples.length} combinations`);
  const textures = new Set(tuples.map((t) => t.texture));
  assert.equal(textures.size, 6);
});

test('every reachable combination composes and passes every gating rule', () => {
  const failures = [];
  // The air only changes wording (damp cool, hot and dry), so every tuple is
  // also composed in fog, crisp cold, mild, and desert heat.
  const airs = [null, { t: 5, rh: 96 }, { t: 14, rh: 60 }, { t: 24, rh: 55 }, { t: 38, rh: 15 }];
  for (const t of tuples) {
    for (const air of airs) {
      const v = compose({ ...t, air });
      const bad = violations(v, t);
      if (bad.length) failures.push(`${JSON.stringify({ ...t, air })} → ${v.headline} | ${v.blurb} :: ${bad.join('; ')}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the gate catches a deliberately bad string', () => {
  const original = COPY.LOAD_SENTENCE.easy.day;
  try {
    COPY.LOAD_SENTENCE.easy.day = 'Nothing here will slow you down, but take it slower than usual.';
    const t = { texture: 'muggy', shadeLevel: 'easy', sunLevel: 'easy', isDay: true, sunKnown: true };
    assert.ok(violations(compose(t), t).some((m) => m.startsWith('pace advice')));
  } finally {
    COPY.LOAD_SENTENCE.easy.day = original;
  }
  const originalTexture = COPY.TEXTURE_SENTENCE.muggy.day;
  try {
    COPY.TEXTURE_SENTENCE.muggy.day = 'Shirts stick. Keep to the shade and take it slower than usual.';
    const t = { texture: 'muggy', shadeLevel: 'noticeable', sunLevel: 'noticeable', isDay: true, sunKnown: true };
    assert.ok(violations(compose(t), t).some((m) => m.startsWith('texture sentence gives activity advice')));
  } finally {
    COPY.TEXTURE_SENTENCE.muggy.day = originalTexture;
  }
});
