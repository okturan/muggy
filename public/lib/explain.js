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

  const words = Object.fromEntries(Object.entries(factors).map(([k, c]) => [k, wordFor(c, k)]));
  return { value: value(full), reference: value(0), factors, words };
}

/** How much, in words that read as a sentence after the factor's name. */
export function wordFor(c, name = 'damp') {
  if (name === 'breeze') return c <= -0.5 ? 'helps' : c < 0.5 ? 'no difference' : c < 1.5 ? 'a bit worse' : 'makes it worse';
  if (c <= -0.5) return name === 'sun' ? 'no difference' : 'makes it easier';
  const hot = name === 'sun';
  if (c < 0.5) return 'no difference';
  if (c < 1.5) return hot ? 'a bit hotter' : 'a bit worse';
  if (c < 3) return hot ? 'hotter' : 'worse';
  return hot ? 'much hotter' : 'much worse';
}

const LEVEL_ORDER = ['none', 'easy', 'noticeable', 'realWork', 'hard', 'dangerous'];
const LEVEL_WORDS = { none: 'fine', easy: 'easy', noticeable: 'noticeable', realWork: 'heavy', hard: 'hard', dangerous: 'dangerous' };
const hourOf = (time) => `${time.slice(11, 13)}:00`;

/**
 * Where the day's load is heading, in at most two sentences.
 *
 * At Easy or below the card stays quiet, unless a higher level is on its way
 * later today; then it says when. "About as bad as today gets" is kept for
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
    out.push('This is about as bad as today gets.');
  }
  if (trend >= 1) out.push('It is still climbing.');
  else if (trend <= -1) out.push('It has been easing over the past hour.');
  return out.slice(0, 2);
}

/**
 * The breakdown as one or two plain sentences: the biggest cause first, the
 * helpers after, and anything that does nothing left out.
 * factors: { damp, sun?, breeze }; windKnown hides the breeze.
 */
export function factorSummary(factors, { windKnown = true } = {}) {
  const items = Object.entries(factors)
    .filter(([name]) => name !== 'breeze' || windKnown)
    .filter(([, c]) => Math.abs(c) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const adds = items.filter(([, c]) => c > 0);
  const helps = items.filter(([, c]) => c < 0);
  const noun = { damp: 'the damp', sun: 'the sun', breeze: 'still air' };
  const helper = { damp: 'The dry air', sun: 'The sun', breeze: 'The breeze' };
  const out = [];
  if (adds.length === 0) out.push('This is mostly just the air temperature.');
  else if (adds.length === 1 || Math.abs(adds[0][1]) >= 2 * Math.abs(adds[1][1])) {
    const rest = adds.slice(1).map(([n]) => noun[n]);
    out.push(`Most of this is ${noun[adds[0][0]]}${rest.length ? `, with a little from ${rest.join(' and ')}` : ''}.`);
  } else out.push(`${adds.map(([n]) => noun[n]).join(' and ').replace(/^./, (c) => c.toUpperCase())} share this about equally.`);
  for (const [n, c] of helps) out.push(`${helper[n]} helps${Math.abs(c) < 1.5 ? ' a little' : ''}.`);
  return out.join(' ');
}
