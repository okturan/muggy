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
  HEADLINES, TEXTURE_SENTENCE, TEXTURE_SENTENCE_NO_HEAT, TEXTURE_SENTENCE_MILD, LOAD_SENTENCE, LOAD_SUN_SENTENCE, SHADE_QUALIFIER, ALERT_SENTENCE,
  LEVEL_PHRASE, TEXTURE_KICKER, HOT_HEADLINES, HOT_MIN_C, DAMP_COOL, DAMP_COOL_MAX_C, DAMP_COOL_MIN_RH, COLD_MAX_C,
} from './copy.js';

const rank = (level) => LEVELS.indexOf(level);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Cool air near saturation, with no heat to speak of. air: { t, rh } in °C
 * and %, or null when unknown. worst: the verdict's level, null without a load.
 */
export function isDampCool(texture, worst, air) {
  return (worst == null || worst === 'none') && (texture === 'dry' || texture === 'comfortable')
    && !!air && Number.isFinite(air.t) && Number.isFinite(air.rh) && air.t < DAMP_COOL_MAX_C && air.rh >= DAMP_COOL_MIN_RH;
}

/**
 * The word the screen shows for the air: the band's name, unless that name
 * would contradict the headline. Cool air near saturation is "damp", whatever
 * its band. Comfortable air under a real heat load is "not sticky", because
 * nothing is comfortable at 35 °C. The band itself, and everything drawn from
 * it (colour, character, timelines), stays as it is.
 */
export function airWord(texture, worst, air = null) {
  if (isDampCool(texture, worst, air)) return 'damp';
  if (texture === 'comfortable' && worst != null && rank(worst) >= rank('noticeable')) return 'not sticky';
  return texture;
}

/**
 * The texture sentence for this moment. Shared by the verdict and the Why
 * sheet, so the two can never describe the air differently.
 */
export function textureSentence(texture, period, worst, air = null) {
  if (isDampCool(texture, worst, air)) return DAMP_COOL.sentence[period];
  if ((worst == null || worst === 'none') && TEXTURE_SENTENCE_NO_HEAT[texture]) return TEXTURE_SENTENCE_NO_HEAT[texture][period];
  const mild = worst === 'easy' && TEXTURE_SENTENCE_MILD[texture] && TEXTURE_SENTENCE_MILD[texture][period];
  if (mild) return mild;
  return TEXTURE_SENTENCE[texture][period];
}

/** worst null (no load) takes the texture-only headline. */
function headlineFor(texture, worst, air) {
  if (isDampCool(texture, worst, air)) return air.t < COLD_MAX_C ? DAMP_COOL.headline.cold : DAMP_COOL.headline.cool;
  const hot = air && Number.isFinite(air.t) && air.t >= HOT_MIN_C && HOT_HEADLINES[texture] && HOT_HEADLINES[texture][worst];
  return hot || HEADLINES[texture][worst || 'none'];
}

/**
 * compose({ texture, shadeLevel, sunLevel, isDay, sunKnown, alert, air })
 * shadeLevel null means the load is unavailable (no temperature).
 * air: { t, rh } at the minute, optional. It only picks the wording for cool
 * damp air and hot dry air; the levels never depend on it.
 * Returns { headline, sentences: [{ text, kind, scope }], blurb, split, worst }.
 * kind: texture | load | qualifier | alert; scope: all | sun | shade.
 */
export function compose({ texture, shadeLevel, sunLevel, isDay, sunKnown = true, alert = null, air = null }) {
  const period = isDay ? 'day' : 'night';

  if (shadeLevel == null) {
    const text = textureSentence(texture, period, null, air);
    return { headline: headlineFor(texture, null, air), sentences: [{ text, kind: 'texture', scope: 'all' }], blurb: text, split: false, worst: null };
  }

  const sun = isDay && sunKnown && sunLevel != null ? sunLevel : shadeLevel;
  // A split exists to carry different advice for shade and sun. Below
  // Noticeable there is no advice to carry, so "fine in the shade, easy in the
  // sun" would say the same thing twice; the texture-led headline does better.
  const split = rank(sun) > rank(shadeLevel) && rank(sun) >= rank('noticeable');
  const worst = rank(sun) > rank(shadeLevel) ? sun : shadeLevel;

  let headline;
  if (!split) {
    headline = headlineFor(texture, worst, air);
  } else if (sun === 'dangerous') {
    headline = `Dangerous in the sun, ${LEVEL_PHRASE[shadeLevel]} in the shade`;
  } else {
    const pair = `${LEVEL_PHRASE[shadeLevel]} in the shade, ${LEVEL_PHRASE[sun]} in the sun`;
    const kicker = TEXTURE_KICKER[texture];
    headline = kicker ? `${kicker}: ${pair}` : cap(pair);
  }

  const sentences = [];
  // Safety first: at Dangerous the texture sentence gives way.
  if (worst !== 'dangerous') sentences.push({ text: textureSentence(texture, period, worst, air), kind: 'texture', scope: 'all' });
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
