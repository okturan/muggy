/**
 * Every sentence the verdict can say, as data.
 *
 * Two readings feed it: the air texture (dew point band: what the moisture
 * does to skin and sweat) and the load level (WBGT: what heat and damp
 * together do to a body). Texture copy never gives activity advice; load copy
 * gives exactly the advice its level has earned. lexicon.js and the gating
 * tests hold both to that.
 */

export const LEVEL_PHRASE = {
  none: 'fine', easy: 'easy', noticeable: 'noticeable', realWork: 'tiring', hard: 'hard', dangerous: 'dangerous',
};

/** Kicker for split headlines; drier air needs none. */
export const TEXTURE_KICKER = { dry: null, comfortable: null, humid: 'Sticky', muggy: 'Muggy', oppressive: 'Oppressive', miserable: 'Miserable' };

const DANGER = 'Dangerous heat';

/**
 * HEADLINES[texture][level]. Texture leads at none/easy (with a "mild"
 * qualifier once the air is muggy or wetter); load leads from noticeable up;
 * danger drops the texture.
 */
export const HEADLINES = {
  dry: { none: 'Crisp and dry', easy: 'Dry and easy', noticeable: 'Warm, dry air', realWork: 'Tiring, dry heat', hard: 'Hard, dry heat', dangerous: DANGER },
  comfortable: { none: 'Perfect air', easy: 'Fresh and easy', noticeable: 'Warm but fresh', realWork: 'Hot and tiring', hard: 'Hard heat', dangerous: DANGER },
  humid: { none: 'A little sticky', easy: 'A little sticky, still easy', noticeable: 'Sticky and warm', realWork: 'Sticky and tiring', hard: 'Sticky and hard going', dangerous: DANGER },
  muggy: { none: "It's muggy out", easy: 'Muggy but mild', noticeable: 'Muggy and warm', realWork: 'Muggy and tiring', hard: 'Muggy and hard going', dangerous: DANGER },
  oppressive: { none: 'Oppressive air', easy: 'Oppressive but mild', noticeable: 'Oppressive air', realWork: 'Oppressive and tiring', hard: 'Oppressive and hard going', dangerous: DANGER },
  miserable: { none: 'Miserable air', easy: 'Miserable air', noticeable: 'Miserable air', realWork: 'Miserable and tiring', hard: 'Miserable and hard going', dangerous: DANGER },
};

/** From this air temperature, "warm" undersells a noticeable load in dry air. */
export const HOT_MIN_C = 30;
export const HOT_HEADLINES = { dry: { noticeable: 'Hot, dry air' }, comfortable: { noticeable: 'Hot but not sticky' } };

/**
 * Cool air close to saturation. The dew point band calls it dry or
 * comfortable, because cold air holds little water, but fog and drizzle feel
 * damp. Below DAMP_COOL_MAX_C nobody is sweating, so stickiness is beside the
 * point and the humidity is what you notice.
 */
export const DAMP_COOL_MAX_C = 18;
export const DAMP_COOL_MIN_RH = 80;
export const COLD_MAX_C = 8;
export const DAMP_COOL = {
  headline: { cool: 'Cool and damp', cold: 'Cold and damp' },
  sentence: { day: 'Damp air, but too cool to feel sticky.', night: 'A damp night, but too cool to feel sticky.' },
};

/**
 * What the moisture does, once there is heat to sweat about. Skin, sweat, the
 * feel of the air. Never what to do. The headline already names dry and fresh
 * air, so those sentences start with what it means.
 */
export const TEXTURE_SENTENCE = {
  dry: {
    day: 'Sweat dries before you notice it, so keep drinking.',
    night: 'Your lips will feel the dry air by morning.',
  },
  comfortable: {
    day: 'Sweat dries as fast as it comes.',
    night: 'Sweat still dries after dark.',
  },
  humid: {
    day: 'A little damp. You feel it on your skin.',
    night: 'A little damp after dark.',
  },
  muggy: {
    day: 'Shirts stick and sweat is slow to dry.',
    night: 'The air stays sticky after dark and sweat is slow to dry.',
  },
  oppressive: {
    day: 'Sweat barely dries, so it stops cooling you.',
    night: "Sweat won't dry, even after dark.",
  },
  miserable: {
    day: 'The air is soaked. Sweat pours and does almost nothing.',
    night: "The air is soaked. Sweat won't dry at all.",
  },
};

/** Fresh air on a mild night: an easy load is too little heat for sweat to be the point. */
export const TEXTURE_SENTENCE_MILD = { comfortable: { night: 'The air stays pleasant after dark.' } };

/** Dry and fresh air when heat is not a factor: nobody is sweating, so no sweat talk. */
export const TEXTURE_SENTENCE_NO_HEAT = {
  dry: { day: 'Dry air, nothing sticky about it.', night: 'Dry air tonight, nothing sticky about it.' },
  comfortable: { day: 'Fresh air, nothing sticky about it.', night: 'Fresh air tonight, nothing sticky about it.' },
};

/** What the load means for a body, when it applies everywhere. */
export const LOAD_SENTENCE = {
  none: { day: null, night: null },
  easy: {
    day: 'The heat adds up to little.',
    night: 'The warmth adds up to little tonight.',
  },
  noticeable: {
    day: 'A hill or a fast walk will remind you. Keep the pace easy.',
    night: 'Moving air helps with sleep tonight.',
  },
  realWork: {
    day: 'Anything strenuous costs more than usual. Take regular breaks and keep water close.',
    night: 'A rough night. Keep water close and take it easy.',
  },
  hard: {
    day: 'Avoid hard effort. This is where heat illness starts. Find somewhere cooler when you can.',
    night: 'A hard night to be out. Avoid effort, keep water close, and sleep somewhere cooler if you can.',
  },
  dangerous: {
    day: 'Heat illness can come on even at rest, especially for older people. Stop hard activity and get somewhere cool.',
    night: 'Dangerous even at night. Stop hard activity and get somewhere cool.',
  },
};

/** The load in the sun, when it is worse than in the shade (daytime only). */
export const LOAD_SUN_SENTENCE = {
  noticeable: 'In full sun a hill or a fast walk will remind you. Keep the pace easy there.',
  realWork: 'In the sun anything strenuous costs more than usual. Take regular breaks and keep water close.',
  hard: 'In the sun avoid hard effort, and stay out of direct sun where you can.',
  dangerous: 'In the sun it is dangerous. Stop hard activity and get somewhere cool.',
};

/** The load under cover, when the sun makes it worse. */
export const SHADE_QUALIFIER = {
  none: "Under cover it's just warm air.",
  easy: 'Under cover it adds up to little.',
  noticeable: "Under cover it's only noticeable.",
  realWork: "Under cover it's still tiring.",
  hard: "Even under cover it's hard.",
};

/**
 * What each level means for a day, for the "Why this verdict?" sheet.
 * Paraphrased from the Japanese Society of Biometeorology's daily-life
 * guideline and Japan's Ministry of the Environment WBGT table.
 */
export const LEVEL_GUIDE = {
  none: 'Heat is not a factor. Dress for the temperature.',
  easy: 'Little heat stress. Long sessions of sport still go better with regular drinks.',
  noticeable: 'Low risk in daily life. During sport or heavy work, drink regularly.',
  realWork: 'Errands are fine. Moderate or heavy activity needs regular rest and water.',
  hard: 'This one counts for everyone. Avoid direct sun outdoors, skip heavy exercise, and watch indoor temperatures too.',
  dangerous: 'Avoid outdoor activity. Older people are at risk even at rest. Stay somewhere cool, ideally with air conditioning.',
};

/** One sentence per factor in the breakdown; c is its share in °C, w its word bucket. */
export function factorSentence(name, c, w, { wind10 = 2 } = {}) {
  if (w === 'no difference') {
    return { damp: 'The humidity makes no real difference here.', sun: 'The sun adds little right now.', breeze: 'The wind makes no real difference.' }[name];
  }
  if (name === 'damp') return c > 0 ? `The damp makes it ${w}. Sweat can't dry fast enough to cool you.` : 'The dry air makes it easier. Sweat dries quickly.';
  if (name === 'sun') return `The sun makes it ${w}. Direct sunlight adds its own heat on top of the air's.`;
  // breeze, against a light 2 m/s wind. In the sun, less wind leaves more heat
  // on you. The other two cases (calm helping, wind hurting) are rare and
  // small, so they get no explanation they could not back up.
  if (c < 0) return wind10 < 2 ? 'The calm air helps a little.' : 'The breeze helps by carrying heat away from you.';
  return wind10 < 2
    ? `Still air makes it ${w}. There is little breeze to carry heat away.`
    : `The wind makes it ${w}.`;
}

/** Japan MOE's alert marks within Dangerous. */
export const ALERT_SENTENCE = {
  alert: 'Japan issues a heat-stroke alert at this level.',
  special: 'Japan issues its special heat-stroke alert at this level.',
};
