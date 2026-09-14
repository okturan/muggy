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

  const at = pool.findIndex((h) => h.rank < curRank && h.hr >= NIGHT_START);
  if (at < 0) return { kind: 'none', textureOnly, current };

  const target = pool[at].rank;
  let end = at;
  while (end + 1 < pool.length && pool[end + 1].rank <= target && pool[end + 1].ms === pool[end].ms + HOUR) end++;
  let bottom = at;
  for (let k = at; k <= end; k++) if (pool[k].rank < pool[bottom].rank) bottom = k;

  const open = pool[at];
  const levelDrop = lvl(worstLevel(open)) < curLevel;
  const drier = TEXTURE_RANK[open.texture] < TEXTURE_RANK[current.texture];
  let cause = 'drier';
  if (!textureOnly && levelDrop) {
    const sunDown = current.sunUp && !open.sunUp;
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
      ? { when: 'Right now', sub: 'as good as it gets', note: `Nothing in the next 24 hours beats the ${cur.texture} air you already have.`, tint: cur.texture }
      : { when: 'Right now', sub: 'no real relief', note: 'Nothing in the next 24 hours is any easier than right now.', tint: cur.texture };
  }

  const from = hh(w.open.time);
  const to = `${String((Number(w.end.time.slice(11, 13)) + 1) % 24).padStart(2, '0')}:00`;
  const span = w.len > 8 || w.len === 1 ? `From ${from}` : `${from} – ${to}`;
  const when = w.tomorrow ? `Tomorrow, ${span.charAt(0).toLowerCase()}${span.slice(1)}` : span;
  const tint = (w.deepens ? w.bottom : w.open).texture;

  let note;
  if (w.textureOnly) {
    note = w.deepens
      ? `${cap(w.open.texture)} from ${from}, easing to ${w.bottom.texture} by ${hh(w.bottom.time)}.`
      : `${cap(w.open.texture)} from ${from}, a step better than the ${cur.texture} air right now.`;
  } else {
    const openLevel = worstLevel(w.open);
    const sunDown = w.cause === 'sunDown' ? ', once the sun is down' : '';
    const lead = openLevel === 'none'
      ? `The heat is out of the picture from ${from}${sunDown}.`
      : {
        sunDown: `${cap(word(openLevel))} from ${from}, once the sun is down.`,
        cooler: `${cap(word(openLevel))} from ${from} as it cools off.`,
        drier: `${cap(w.open.texture)} air from ${from} as it dries out.`,
        both: `${cap(word(openLevel))} and ${w.open.texture} from ${from}.`,
      }[w.cause];
    // The window can deepen through the load, the air, or both; say which.
    let deeper = '';
    if (w.deepens) {
      const bottomLevel = worstLevel(w.bottom);
      if (lvl(bottomLevel) < lvl(openLevel)) {
        deeper = bottomLevel === 'none'
          ? ` The heat is out of the picture by ${hh(w.bottom.time)}.`
          : ` Easing to ${word(bottomLevel)} by ${hh(w.bottom.time)}.`;
      } else if (w.bottom.texture !== w.open.texture) {
        deeper = ` ${cap(w.bottom.texture)} air by ${hh(w.bottom.time)}.`;
      }
    }
    note = lead + deeper;
  }
  const sub = w.deepens || !w.textureOnly ? 'first relief' : 'a little relief';
  return { when, sub, note, tint };
}
