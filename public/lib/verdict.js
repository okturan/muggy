/**
 * The single verdict: how the outside air treats a body right now.
 *
 * One headline and at most three sentences, composed from two readings that
 * used to fight each other on screen:
 *   - texture (dew point band): what the moisture does;
 *   - load (WBGT level, in the shade and in the sun): what it all adds up to.
 * Lower cards may add detail; nothing else on the page gets to disagree.
 */
import { LEVELS } from './levels.js';
import {
  HEADLINES, TEXTURE_SENTENCE, LOAD_SENTENCE, LOAD_SUN_SENTENCE, SHADE_QUALIFIER, ALERT_SENTENCE,
  LEVEL_PHRASE, TEXTURE_KICKER,
} from './copy.js';

const rank = (level) => LEVELS.indexOf(level);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * compose({ texture, shadeLevel, sunLevel, isDay, sunKnown, alert })
 * shadeLevel null means the load is unavailable (no temperature).
 * Returns { headline, sentences: [{ text, kind, scope }], blurb, split, worst }.
 * kind: texture | load | qualifier | alert; scope: all | sun | shade.
 */
export function compose({ texture, shadeLevel, sunLevel, isDay, sunKnown = true, alert = null }) {
  const period = isDay ? 'day' : 'night';

  if (shadeLevel == null) {
    const text = TEXTURE_SENTENCE[texture][period];
    return { headline: HEADLINES[texture].none, sentences: [{ text, kind: 'texture', scope: 'all' }], blurb: text, split: false, worst: null };
  }

  const sun = isDay && sunKnown && sunLevel != null ? sunLevel : shadeLevel;
  // A split exists to carry different advice for shade and sun. Below
  // Noticeable there is no advice to carry, so "fine in the shade, easy in the
  // sun" would say the same thing twice; the texture-led headline does better.
  const split = rank(sun) > rank(shadeLevel) && rank(sun) >= rank('noticeable');
  const worst = rank(sun) > rank(shadeLevel) ? sun : shadeLevel;

  let headline;
  if (!split) {
    headline = HEADLINES[texture][worst];
  } else if (sun === 'dangerous') {
    headline = `Dangerous in the sun, ${LEVEL_PHRASE[shadeLevel]} in the shade`;
  } else {
    const pair = `${LEVEL_PHRASE[shadeLevel]} in the shade, ${LEVEL_PHRASE[sun]} in the sun`;
    const kicker = TEXTURE_KICKER[texture];
    headline = kicker ? `${kicker}: ${pair}` : cap(pair);
  }

  const sentences = [];
  // Safety first: at Dangerous the texture sentence gives way.
  if (worst !== 'dangerous') sentences.push({ text: TEXTURE_SENTENCE[texture][period], kind: 'texture', scope: 'all' });
  if (split) {
    sentences.push({ text: LOAD_SUN_SENTENCE[sun], kind: 'load', scope: 'sun' });
    sentences.push({ text: SHADE_QUALIFIER[shadeLevel], kind: 'qualifier', scope: 'shade' });
  } else if (LOAD_SENTENCE[worst][period]) {
    sentences.push({ text: LOAD_SENTENCE[worst][period], kind: 'load', scope: 'all' });
  }
  if (worst === 'dangerous' && alert && ALERT_SENTENCE[alert]) {
    sentences.push({ text: ALERT_SENTENCE[alert], kind: 'alert', scope: 'all' });
  }
  // A missing string must surface as a gap the tests can see, never as a
  // silent double space from join().
  const missing = sentences.filter((s) => typeof s.text !== 'string' || !s.text);
  if (missing.length) throw new Error(`missing copy for ${texture}/${shadeLevel}/${sun}: ${missing.map((s) => s.kind).join(',')}`);

  return { headline, sentences, blurb: sentences.map((s) => s.text).join(' '), split, worst };
}
