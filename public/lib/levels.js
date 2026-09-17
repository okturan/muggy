/**
 * Six load levels on rounded outdoor WBGT.
 *
 * Anchors: Japanese Society of Biometeorology, "Guidelines for the prevention
 * of heat illness in daily life" Ver. 4 (caution < 25, warning 25-28, severe
 * warning 28-31, danger >= 31), with caution split at 21 using the Ministry of
 * the Environment exercise table ("almost safe" below 21). Below 18, WBGT stops
 * saying anything useful about heat stress, so no heat-load claims are made.
 */

export const LEVELS = ['none', 'easy', 'noticeable', 'realWork', 'hard', 'dangerous'];
export const LEVEL_NAMES = {
  none: 'None', easy: 'Easy', noticeable: 'Noticeable', realWork: 'Tiring', hard: 'Hard', dangerous: 'Dangerous',
};
/** Lowest rounded WBGT of each level, by index. */
export const LEVEL_MIN = [-Infinity, 18, 21, 25, 28, 31];
export const ALERT_MIN = 33;
export const SPECIAL_ALERT_MIN = 35;

export const roundHalfUp = (x) => Math.floor(x + 0.5);

/** Level index (0-5) for a WBGT value, from the value as printed. */
export function levelIndex(wbgt) {
  const w = roundHalfUp(wbgt);
  let i = 0;
  while (i + 1 < LEVEL_MIN.length && w >= LEVEL_MIN[i + 1]) i++;
  return i;
}

export const levelOf = (wbgt) => LEVELS[levelIndex(wbgt)];

/** Japan MOE alert marks inside Dangerous: 'alert' at 33+, 'special' at 35+. */
export function alertMark(wbgt) {
  const w = roundHalfUp(wbgt);
  if (w >= SPECIAL_ALERT_MIN) return 'special';
  if (w >= ALERT_MIN) return 'alert';
  return null;
}

/**
 * Hysteresis around the rounding boundaries (x.5), so a reading that hovers
 * on a line does not flip the verdict every minute. Keys are free-form
 * ("tirana:shade"); reset() on a change of place.
 */
// Compare in thousandths so 20.5 + 0.3 is exactly 20.8.
const milli = (x) => Math.round(x * 1000);

/**
 * The level a reading lands on, starting from a held level: it must clear the
 * rounding boundary by the margin to move. Used for the session's own held
 * level, and to place forecast hours relative to it, so an hour whose reading
 * equals now can never read as a change.
 */
export function stepLevel(fromIndex, wbgt, margin = 0.3) {
  const raw = levelIndex(wbgt);
  let cur = fromIndex;
  if (raw > cur) {
    for (let i = cur + 1; i <= raw; i++) if (milli(wbgt) >= milli(LEVEL_MIN[i] - 0.5 + margin)) cur = i;
  } else if (raw < cur) {
    for (let i = cur - 1; i >= raw; i--) if (milli(wbgt) < milli(LEVEL_MIN[i + 1] - 0.5 - margin)) cur = i;
  }
  return cur;
}

export function createHysteresis(margin = 0.3) {
  const held = new Map();
  return {
    level(key, wbgt) {
      const cur = held.has(key) ? stepLevel(held.get(key), wbgt, margin) : levelIndex(wbgt);
      held.set(key, cur);
      return LEVELS[cur];
    },
    reset() { held.clear(); },
  };
}
