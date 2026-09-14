/**
 * What the verdict is made of.
 *
 * The load is compared against a plain reference: the same air temperature in
 * dry, shaded air with a light breeze. The difference is shared between three
 * factors (damp, sun and breeze) using exact Shapley values. Each factor is
 * credited with its average effect over every order in which the factors
 * could be added. The shares always add up to the whole difference, and no
 * factor gets extra credit for being added first or last.
 */
import { wbgtInterval, rhFromDewPoint } from './load.js';
import { CALIBRATION } from './calibration.js';

export const REFERENCE_WIND_MS = 2;
export const REFERENCE_DEW_POINT_C = 10;

/** Shapley weights for n players: |S|! (n - |S| - 1)! / n! */
const fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
const weight = (s, n) => (fact(s) * fact(n - s - 1)) / fact(n);

/**
 * i: the wbgtInterval inputs for the moment being explained.
 * scope: 'sun' (all three factors) or 'shade' (damp and breeze; no sun).
 * Returns { value, reference, factors: { damp, breeze, sun? }, words }.
 */
export function attribute(i, scope = 'sun', cfg = CALIBRATION) {
  // Dew point 10 °C, or 6 °C below the air when the air is cooler than that, so
  // the reference stays dry (about 65 % RH) instead of saturating in cool air.
  const refRh = Math.min(100, rhFromDewPoint(i.tair, Math.min(i.tair - 6, REFERENCE_DEW_POINT_C)));
  const players = scope === 'sun' ? ['damp', 'sun', 'breeze'] : ['damp', 'breeze'];
  const n = players.length;
  const cache = new Map();

  const value = (mask) => {
    if (cache.has(mask)) return cache.get(mask);
    const on = (name) => (mask >> players.indexOf(name)) & 1;
    const input = {
      ...i,
      rh: on('damp') ? i.rh : refRh,
      wind10: on('breeze') ? i.wind10 : REFERENCE_WIND_MS,
      sw: scope === 'sun' && on('sun') ? i.sw : 0,
      direct: scope === 'sun' && on('sun') ? i.direct : 0,
    };
    const o = wbgtInterval(input, cfg);
    const v = o ? o.sun : NaN;
    cache.set(mask, v);
    return v;
  };

  const full = (1 << n) - 1;
  const factors = {};
  players.forEach((name, p) => {
    let phi = 0;
    for (let mask = 0; mask <= full; mask++) {
      if ((mask >> p) & 1) continue;
      let size = 0;
      for (let b = 0; b < n; b++) size += (mask >> b) & 1;
      phi += weight(size, n) * (value(mask | (1 << p)) - value(mask));
    }
    factors[name] = phi;
  });

  const words = Object.fromEntries(Object.entries(factors).map(([k, c]) => [k, wordFor(c)]));
  return { value: value(full), reference: value(0), factors, words };
}

/** How much, in words. Negative means the factor takes load away. */
export function wordFor(c) {
  if (c <= -0.5) return 'takes some off';
  const a = Math.abs(c);
  if (a < 0.5) return 'nothing';
  if (a < 1.5) return 'a little';
  if (a < 3) return 'some';
  return 'a lot';
}

const LEVEL_ORDER = ['none', 'easy', 'noticeable', 'realWork', 'hard', 'dangerous'];
const LEVEL_WORDS = { none: 'fine', easy: 'easy', noticeable: 'noticeable', realWork: 'real work', hard: 'hard', dangerous: 'dangerous' };
const hourOf = (time) => `${time.slice(11, 13)}:00`;

/**
 * Where the day's load is heading, in at most two sentences.
 *
 * At Easy or below the card stays quiet, unless a higher level is on its way
 * later today; then it says when. "About as heavy as today gets" is kept for
 * Noticeable and up. Any level other than now's carries its time.
 *
 * nowLevel: the headline's worst level; now: local ISO minute;
 * hours: today's hourly [{ time, level }] (worst level per hour);
 * trend: °C of WBGT per hour over the last hour (optional).
 */
export function peakAndTrend({ nowLevel, now, hours, trend = 0 }) {
  const rank = (l) => LEVEL_ORDER.indexOf(l);
  const today = now.slice(0, 10);
  const nowHour = now.slice(0, 13);
  const sameDay = hours.filter((h) => h.time.slice(0, 10) === today);
  const later = sameDay.filter((h) => h.time.slice(0, 13) > nowHour);
  const earlier = sameDay.filter((h) => h.time.slice(0, 13) < nowHour);
  const firstHigher = later.find((h) => rank(h.level) > rank(nowLevel));
  const laterPeak = later.reduce((a, h) => (!a || rank(h.level) > rank(a.level) ? h : a), null);
  const earlierPeak = earlier.reduce((a, h) => (!a || rank(h.level) > rank(a.level) ? h : a), null);
  const out = [];

  if (rank(nowLevel) <= rank('easy')) {
    if (laterPeak && rank(laterPeak.level) >= rank('noticeable')) {
      const first = later.find((h) => h.level === laterPeak.level);
      out.push(`It gets to ${LEVEL_WORDS[laterPeak.level]} by ${hourOf(first.time)}.`);
    }
    return out;
  }

  if (firstHigher) {
    const first = later.find((h) => h.level === laterPeak.level);
    out.push(`It gets to ${LEVEL_WORDS[laterPeak.level]} by ${hourOf(first.time)}.`);
  } else if (earlierPeak && rank(earlierPeak.level) > rank(nowLevel)) {
    out.push(`It was ${LEVEL_WORDS[earlierPeak.level]} around ${hourOf(earlierPeak.time)} and has eased since.`);
  } else {
    out.push('This is about as heavy as today gets.');
  }
  if (trend >= 1) out.push('It is still climbing.');
  else if (trend <= -1) out.push('It has been easing over the past hour.');
  return out.slice(0, 2);
}
