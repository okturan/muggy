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
  if (name === 'breeze') return c <= -0.5 ? 'helps' : c < 0.5 ? 'no difference' : c < 1.5 ? 'a bit worse' : 'worse';
  if (c <= -0.5) return name === 'sun' ? 'no difference' : 'makes it easier';
  const hot = name === 'sun';
  if (c < 0.5) return 'no difference';
  if (c < 1.5) return hot ? 'a bit hotter' : 'a bit worse';
  if (c < 3) return hot ? 'hotter' : 'worse';
  return hot ? 'much hotter' : 'much worse';
}

const LEVEL_ORDER = ['none', 'easy', 'noticeable', 'realWork', 'hard', 'dangerous'];
const LEVEL_WORDS = { none: 'fine', easy: 'easy', noticeable: 'noticeable', realWork: 'tiring', hard: 'hard', dangerous: 'dangerous' };
const hourOf = (time) => `${time.slice(11, 13)}:00`;

/**
 * Where the day's load is heading, in at most two sentences.
 *
 * At Easy or below the card stays quiet, unless a higher level is on its way
 * later today; then it says when. "It doesn't get worse than this today" is
 * kept for Noticeable and up. Any level other than now's carries its time.
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
      out.push(`By ${hourOf(first.time)} it's ${LEVEL_WORDS[laterPeak.level]}.`);
    }
    return out;
  }

  // One statement about the rest of today. The hourly trend is added only
  // where it tells you something the statement does not: "has eased since"
  // already says it is falling, and a rise inside the same level would read
  // as a contradiction of "it doesn't get worse than this".
  if (firstHigher) {
    const first = later.find((h) => h.level === laterPeak.level);
    out.push(`By ${hourOf(first.time)} it's ${LEVEL_WORDS[laterPeak.level]}.`);
  } else if (earlierPeak && rank(earlierPeak.level) > rank(nowLevel)) {
    out.push(`It was ${LEVEL_WORDS[earlierPeak.level]} around ${hourOf(earlierPeak.time)} and has eased since.`);
  } else {
    out.push("It doesn't get worse than this today.");
    if (trend <= -1) out.push('It has been easing over the past hour.');
  }
  return out;
}

const listOf = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The breakdown as one or two plain sentences: the biggest cause first, the
 * helpers after, and anything that does nothing left out.
 * factors: { damp, sun?, breeze }; windKnown hides the breeze; wind10 (m/s)
 * names it, since a breeze factor above zero means too little wind when the
 * wind is light and the wind itself when it is strong.
 */
export function factorSummary(factors, { windKnown = true, wind10 = REFERENCE_WIND_MS } = {}) {
  const items = Object.entries(factors)
    .filter(([name]) => name !== 'breeze' || windKnown)
    .filter(([, c]) => Math.abs(c) >= 0.5)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const adds = items.filter(([, c]) => c > 0);
  const helps = items.filter(([, c]) => c < 0);
  const light = wind10 < REFERENCE_WIND_MS;
  const noun = { damp: 'the damp', sun: 'the sun', breeze: light ? 'the lack of wind' : 'the wind' };
  const helper = { damp: 'the dry air', sun: 'the sun', breeze: light ? 'the calm air' : 'the breeze' };
  const out = [];
  if (adds.length === 0) out.push('This is mostly just the air temperature.');
  else {
    // Causes more than half the size of the biggest share the lead.
    const lead = adds.filter(([, c]) => c * 2 > adds[0][1]);
    const rest = adds.filter((a) => !lead.includes(a)).map(([n]) => noun[n]);
    const tail = rest.length ? `, with a little from ${listOf(rest)}` : '';
    out.push(lead.length === 1
      ? `Most of this is ${noun[lead[0][0]]}${tail}.`
      : `${capFirst(listOf(lead.map(([n]) => noun[n])))} share this about equally${tail}.`);
  }
  const strong = helps.filter(([, c]) => c <= -1.5).map(([n]) => helper[n]);
  const weak = helps.filter(([, c]) => c > -1.5).map(([n]) => helper[n]);
  if (strong.length) out.push(`${capFirst(listOf(strong))} ${strong.length > 1 ? 'both help' : 'helps'}.`);
  if (weak.length) out.push(`${capFirst(listOf(weak))} ${weak.length > 1 ? 'both help' : 'helps'} a little.`);
  return out.join(' ');
}
