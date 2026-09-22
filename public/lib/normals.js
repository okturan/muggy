/**
 * "Is this normal?" — one comparison, one number.
 *
 * The current dew point is ranked against past hours from the same place,
 * within a week of today's date and two hours of the current time of day, over
 * ten years. The heading, the verdict, the sentence and the bar all come from
 * that single set. The old card compared a morning against whole days in the
 * heading and against all hours in the body, and printed two different
 * percentages next to each other.
 */
import { TEXTURE_RANK, textureOf } from './texture.js';

/** Part of the day named in the statistic. */
export function daypart(hour) {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night';
}
const plural = (part) => (part === 'night' ? 'nights' : `${part}s`);

/** Percentile (0-100) of x within a 101-point quantile ladder. */
export function percentileOf(q, x) {
  if (!q || q.length !== 101) return null;
  if (x <= q[0]) return 0;
  if (x >= q[100]) return 100;
  let lo = 0;
  let hi = 100;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (q[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** True when the v4 normals response carries a usable ladder for every hour. */
export const hasHourLadders = (normals) =>
  !!(normals && Array.isArray(normals.hours) && normals.hours.length === 24
    && normals.hours.every((h) => h && Array.isArray(h.q) && h.q.length === 101 && h.mix));

/** Percentile floors for the verdict; WET is "stickier" or, for air that is not sticky at all, "damper". */
export const VERDICTS = [
  [90, 'Way WET than usual'],
  [70, 'WET than usual'],
  [31, 'About normal'],
  [11, 'Drier than usual'],
  [0, 'Way drier than usual'],
];

/**
 * describe(normals, dewPointC, localHour) →
 * { pct, verdict, sub, note, mix, band, usualBand } or null when normals are unusable.
 */
export function describe(normals, dewPointC, localHour) {
  if (!hasHourLadders(normals) || dewPointC == null) return null;
  const hour = normals.hours[localHour];
  const pct = percentileOf(hour.q, dewPointC);
  const part = plural(daypart(localHour));
  const band = textureOf(dewPointC);
  const usualBand = textureOf(hour.q[50]);
  // Dry and fresh air is not sticky at any percentile, so it gets "damper".
  const sticky = TEXTURE_RANK[band] >= TEXTURE_RANK.humid;
  const wetter = sticky ? 'stickier' : 'damper';
  const verdict = cap(VERDICTS.find(([min]) => pct >= min)[1].replace('WET', wetter));
  const record = pct >= 99 || pct <= 1;

  let sub;
  if (pct >= 99) sub = `${sticky ? 'stickiest' : 'dampest'} ${part} on record here`;
  else if (pct <= 1) sub = `driest ${part} on record here`;
  else if (pct >= 50) sub = `${wetter} than ${pct}% of ${part}`;
  else sub = `drier than ${100 - pct}% of ${part}`;

  // The heading carries the number; the note adds context without a second one.
  const share = hour.mix[band] || 0;
  const likeThis = `Air this ${pct >= 50 ? (sticky ? 'sticky' : 'damp') : 'dry'}`;
  let note;
  if (!record && share === 0) note = `${likeThis} has not been recorded here at this time of year.`;
  else if (!record && share < 0.05) note = `${likeThis} is rare here at this time of year.`;
  else if (band !== usualBand) note = `Usually it is ${usualBand} at this time of day.`;
  else if (pct >= 65) note = `Still the usual ${band} air, at the ${wetter} end of it.`;
  else if (pct <= 35) note = `Still the usual ${band} air, at the drier end of it.`;
  else note = 'Squarely normal for here.';

  return { pct, verdict, sub, note, mix: hour.mix, band, usualBand, samples: hour.n };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Bar segments in band order, with shares that sum to 1. */
export function barSegments(mix) {
  return Object.entries(mix)
    .filter(([, v]) => v > 0)
    .sort((a, b) => TEXTURE_RANK[a[0]] - TEXTURE_RANK[b[0]])
    .map(([band, share]) => ({ band, share }));
}
