/**
 * Phrase classes used to keep copy honest.
 *
 * The screen once said "take it slower than usual" and "nothing here will slow
 * you down" at the same minute, because two cards were written independently.
 * Copy is now data, and every string the app can show is scanned for these
 * classes, so gating (reassurance only when easy, severity only when earned,
 * no sun wording at night, no activity advice in texture copy) is checked by
 * tests rather than by care.
 */

const rx = (list) => list.map((s) => (s instanceof RegExp ? s : new RegExp(`\\b${s}\\b`, 'i')));

export const PHRASE_CLASSES = {
  reassurance: rx([
    'nothing (here )?will slow you( down)?', 'adds? up to (very )?little', 'barely registers', 'nothing to plan around',
    'no need to (slow|change|worry)', 'easy going', "won't slow you",
    'as good as (a night|air|it) gets', 'sleep should be fine', 'not much more', 'stays out of your way',
  ]),
  pace: rx(['easy pace', 'take it (a bit |a little )?slow(er)?', 'slow (it|things|everything) down', 'keep the pace (easy|down|gentle)', 'slower than usual', 'ease off']),
  restWater: rx([
    '(take|regular|proper) (a )?(breaks?|rests?)', 'rest (often|regularly|in the shade)', 'drink(ing)?', 'hydrat(e|ed|ion)',
    'water (close|on you|with you|bottle)', 'keep water',
  ]),
  avoidExertion: rx(['avoid (heavy |hard |real |strenuous )?(exertion|exercise|effort|work)', 'skip (the )?(run|workout|training|game)', 'avoid (the )?direct sun', 'no hard effort']),
  stopCool: rx(['stop (what you are doing|all activity|exercising|and cool)', 'get (somewhere )?cool', 'heat ?stroke', 'cool down (now|right away)']),
  indoor: [/\bindoors?\b/i, /\bair[- ]?condition/i, /\bAC\b/, /\bfans?\b/i, /\bstay in\b/i, /\bgo inside\b/i],
  sunShade: rx(['sun', 'sunny', 'sunshine', 'shade', 'shady', 'sunlight']),
  loadLevel: rx(['easy', 'noticeable', 'heavy', 'hard', 'dangerous', 'danger']),
};

/** Advice about what to do: everything texture copy must never contain (hydration is added back for dry air). */
export const ACTIVITY_ADVICE = ['pace', 'restWater', 'avoidExertion', 'stopCool', 'indoor'];

/** The set of phrase-class names present in a piece of text. */
export function classesIn(text) {
  const found = new Set();
  for (const [name, patterns] of Object.entries(PHRASE_CLASSES)) {
    if (patterns.some((p) => p.test(text))) found.add(name);
  }
  return found;
}

/** Hydration only (for the dry-air exception). */
export const isHydrationOnly = (text) => {
  const strip = text.replace(/\b(drink(ing)?|hydrat(e|ed|ion)|water (close|on you|with you|bottle)|keep water)\b/gi, '');
  return !PHRASE_CLASSES.restWater.some((p) => p.test(strip));
};
