/**
 * When does it next get better?
 *
 * "Better" is ranked the same way as the verdict: load level first, texture
 * second. That lets sunset count as relief, not only drier air. When the load
 * is already easy, only the air texture is left to improve, so texture ranks
 * alone, but an hour with a heavier load is never offered as relief.
 *
 * Night hours (00:00-05:59) never open a window; nobody plans around 03:00.
 * They can extend one, which is how the card can say the air keeps easing
 * after midnight. A window only spans consecutive hours: a gap in the
 * forecast ends it.
 *
 * Dry or fresh air at an easy load is already as good as the card can offer,
 * so there is nothing to wait for and no card.
 */
import { LEVELS, stepLevel } from './levels.js';
import { TEXTURE_RANK, textureOf } from './texture.js';
import { LEVEL_PHRASE } from './copy.js';

const NIGHT_START = 6;
const HOUR = 3600000;
const lvl = (level) => LEVELS.indexOf(level);
const EASY = lvl('easy');
const ms = (time) => Date.parse(`${time}:00Z`);

/**
 * Forecast hours for relief and peak sentences, levelled relative to the held
 * current levels with the hysteresis margin, so an hour whose reading equals
 * now never reads as a change. Shared by the page and the test fixtures.
 */
export function forecastHours(hourly, series, shadeLevel, sunLevel) {
  const heldShade = LEVELS.indexOf(shadeLevel);
  const heldSun = sunLevel ? LEVELS.indexOf(sunLevel) : heldShade;
  return hourly.time.map((time, i) => {
    const s = series[i];
    if (!s || hourly.dew_point_2m[i] == null) return null;
    return {
      time,
      texture: textureOf(hourly.dew_point_2m[i]),
      shadeLevel: LEVELS[stepLevel(heldShade, s.shade)],
      sunLevel: s.sunKnown ? LEVELS[stepLevel(heldSun, s.sun)] : null,
      sunUp: s.sunUp,
      sunKnown: s.sunKnown,
    };
  }).filter(Boolean);
}

/** The worst level that applies to a person out at that hour. */
export const worstLevel = (e) => (e.sunUp && e.sunKnown !== false && lvl(e.sunLevel) > lvl(e.shadeLevel) ? e.sunLevel : e.shadeLevel);

/**
 * current: { time, texture, shadeLevel, sunLevel, sunUp, sunKnown }
 * hours:   the forecast, same shape, one entry per hour (time = local ISO hour),
 *          with levels placed relative to the current held level
 */
export function findRelief(current, hours) {
  const curLevel = lvl(worstLevel(current));
  const textureOnly = curLevel <= EASY;
  if (textureOnly && TEXTURE_RANK[current.texture] <= TEXTURE_RANK.comfortable) return null;
  // Never offer a heavier hour as relief: at an easy load a heavier hour sorts
  // above everything, whatever its texture.
  const rankOf = (e) => (textureOnly
    ? (lvl(worstLevel(e)) > curLevel ? 100 : 0) + TEXTURE_RANK[e.texture]
    : lvl(worstLevel(e)) * 10 + TEXTURE_RANK[e.texture]);
  const curRank = rankOf(current);
  const curHourMs = ms(`${current.time.slice(0, 13)}:00`);
  const pool = hours
    .map((h) => ({ ...h, ms: ms(h.time), hr: Number(h.time.slice(11, 13)), rank: rankOf(h) }))
    .filter((h) => h.ms > curHourMs && h.ms <= curHourMs + 24 * HOUR);
  if (!pool.length) return null;

  // The first better hour that is worth planning around. The window lasts as
  // long as the hours stay better than now, so a wobble in the air inside a
  // cooler evening does not cut it short. A lone hour of slightly drier air
  // between two stickier ones is the forecast wobbling across a band edge,
  // not relief, so it is skipped; a lone cooler hour is kept as a dip.
  let at = -1;
  let end = -1;
  for (let i = 0; i < pool.length && at < 0; i++) {
    if (!(pool[i].rank < curRank && pool[i].hr >= NIGHT_START)) continue;
    let e = i;
    while (e + 1 < pool.length && pool[e + 1].rank < curRank && pool[e + 1].ms === pool[e].ms + HOUR) e++;
    const blip = e === i && e !== pool.length - 1 && lvl(worstLevel(pool[i])) >= curLevel;
    if (!blip) { at = i; end = e; }
  }
  if (at < 0) return { kind: 'none', textureOnly, current };
  const target = pool[at].rank;
  let bottom = at;
  for (let k = at; k <= end; k++) if (pool[k].rank < pool[bottom].rank) bottom = k;

  const open = pool[at];
  const levelDrop = lvl(worstLevel(open)) < curLevel;
  const drier = TEXTURE_RANK[open.texture] < TEXTURE_RANK[current.texture];
  let cause = 'drier';
  if (!textureOnly && levelDrop) {
    // Sunset only explains an opening in the evening; a window that opens at
    // 06:00 has waited out the night, whatever the sun was doing at the start.
    const sunDown = current.sunUp && !open.sunUp && open.hr >= 12;
    cause = drier ? 'both' : sunDown ? 'sunDown' : 'cooler';
  }

  return {
    kind: 'relief',
    textureOnly,
    current,
    open,
    bottom: pool[bottom],
    deepens: pool[bottom].rank < target,
    len: end - at + 1,
    end: pool[end],
    // The window runs to the end of the forecast looked at, so its end is unknown.
    openEnded: end === pool.length - 1,
    tomorrow: open.time.slice(0, 10) !== current.time.slice(0, 10),
    cause,
  };
}

const hh = (time) => `${time.slice(11, 13)}:00`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const word = (level) => LEVEL_PHRASE[level];

/** Card text: { when, sub, note, tint } */
export function describeRelief(w) {
  if (!w) return null;
  const cur = w.current;
  if (w.kind === 'none') {
    return w.textureOnly
      ? { when: `Stays ${cur.texture}`, sub: 'next 24 hours', note: "The air doesn't get any drier before this time tomorrow.", tint: cur.texture }
      : { when: 'No relief yet', sub: 'next 24 hours', note: 'Nothing before this time tomorrow is any easier than now.', tint: cur.texture };
  }

  const from = hh(w.open.time);
  const to = `${String((Number(w.end.time.slice(11, 13)) + 1) % 24).padStart(2, '0')}:00`;
  // One better hour between two worse ones is a dip, not a start.
  const single = w.len === 1 && !w.openEnded;
  const span = single ? `Around ${from}` : w.len > 8 || w.openEnded ? `From ${from}` : `${from} – ${to}`;
  const when = w.tomorrow ? `Tomorrow, ${span.charAt(0).toLowerCase()}${span.slice(1)}` : span;
  const at = single ? `around ${from}` : `from ${from}`;
  const tint = (w.deepens ? w.bottom : w.open).texture;

  let note;
  if (w.textureOnly) {
    note = w.deepens
      ? `${cap(w.open.texture)} air ${at}, and ${w.bottom.texture} by ${hh(w.bottom.time)}.`
      : `${cap(w.open.texture)} air ${at}, better than the ${cur.texture} air right now.`;
  } else {
    // The heat leads, in the level words; the air only says it dries out,
    // because "oppressive" reads as bad news even when it is a step down.
    const openLevel = worstLevel(w.open);
    const sunDown = w.cause === 'sunDown' ? ', once the sun is down' : '';
    const lead = openLevel === 'none'
      ? `The heat is out of the picture ${at}${sunDown}.`
      : {
        sunDown: `${cap(word(openLevel))} ${at}, once the sun is down.`,
        cooler: `${cap(word(openLevel))} ${at} as it cools off.`,
        drier: `The air dries out a little ${at}.`,
        both: `${cap(word(openLevel))} ${at}, and the air dries out a little.`,
      }[w.cause];
    // The window can deepen through the load, the air, or both; say which.
    let deeper = '';
    if (w.deepens) {
      const bottomLevel = worstLevel(w.bottom);
      const by = hh(w.bottom.time);
      if (lvl(bottomLevel) < lvl(openLevel)) {
        deeper = bottomLevel === 'none'
          ? ` By ${by} the heat is out of the picture.`
          : ` By ${by} it's down to ${word(bottomLevel)}.`;
      } else if (w.bottom.texture !== w.open.texture) {
        deeper = ` The air is drier still by ${by}.`;
      }
    }
    // "The air dries out a little from 10:00. The air is drier still…" says the air twice.
    note = w.cause === 'drier' && deeper.startsWith(' The air is drier')
      ? `${lead.slice(0, -1)}, and more by ${hh(w.bottom.time)}.`
      : lead + deeper;
  }
  const sub = w.deepens || !w.textureOnly ? 'first relief' : 'a little relief';
  return { when, sub, note, tint };
}
