// Engine runners, error metrics and the calibration decision rule for the
// validation against MOE measured WBGT.
import { wbgtInterval } from '../../public/lib/load.js';
import { sunOverInterval } from '../../public/lib/sun.js';
import { calcSolarParameters, estWindSpeed, stabSrdt, tGlobe, tWb } from '../../public/lib/wbgt.js';
import { levelIndex, roundHalfUp } from '../../public/lib/levels.js';

export const JST = 32400;
const H = 3600000;
export const REFERENCE = { surfaceAlbedo: 0.45, minWind2: 0.13 };

/** Dataset row (array) → object, using the dataset's column list. */
export const rowReader = (columns) => {
  const c = Object.fromEntries(columns.map((k, i) => [k, i]));
  return (r) => ({
    no: r[c.no], split: r[c.split], time: r[c.time], WBGT: r[c.WBGT], Tw: r[c.Tw], Tg: r[c.Tg],
    T: r[c.T], RH: r[c.RH], W: r[c.W], P: r[c.P], sw: r[c.sw], dir: r[c.dir], sw1: r[c.sw1], dir1: r[c.dir1],
  });
};

const endOf = (time) => Date.parse(`${time}:00Z`) - JST * 1000;

/**
 * Radiation timing against an observation at the top of the hour.
 * preceding: the forecast hour ending at the observation.
 * centred:   the two forecast hours around the observation.
 */
function interval(row, timing) {
  if (timing === 'centred') {
    return { endMs: endOf(row.time) + H, minutes: 120, sw: (row.sw + row.sw1) / 2, direct: (row.dir + row.dir1) / 2 };
  }
  return { endMs: endOf(row.time), minutes: 60, sw: row.sw, direct: row.dir };
}

/** Muggy's engine: MOE definition, calibrated parameters. */
export function runMoe(row, place, cfg, timing) {
  const iv = interval(row, timing);
  const o = wbgtInterval({ ...iv, lat: place.lat, lon: place.lon, tair: row.T, rh: row.RH, wind10: row.W / 3.6, pres: row.P }, cfg);
  return o && { wbgt: o.sun, tg: o.tgSun, wind2: o.wind2, sunUp: o.sunUp };
}

/** Baseline: ISO-style Liljegren (natural wet bulb, 2-inch globe, reference albedo and minimum wind), same inputs and timing. */
export function runIso(row, place, timing) {
  const iv = interval(row, timing);
  const sun = sunOverInterval(iv.endMs, iv.minutes, place.lat, place.lon);
  const sunUp = sun.fSun > 0;
  const cza = sunUp ? sun.cza : 0.004;
  const swLit = sunUp && iv.sw > 0 ? iv.sw / sun.fSun : 0;
  const fdir = iv.sw > 0 ? Math.max(0, Math.min(0.9, iv.direct / iv.sw)) : undefined;
  const d = new Date(iv.endMs - (iv.minutes * 60000) / 2);
  const day = d.getUTCDate() + (d.getUTCHours() + d.getUTCMinutes() / 60) / 24;
  const sp = calcSolarParameters(d.getUTCFullYear(), d.getUTCMonth() + 1, day, place.lat, place.lon, swLit, fdir, cza);
  const wind10 = row.W / 3.6;
  const wind2 = estWindSpeed(wind10, 10, stabSrdt(sunUp, wind10, sp.solar, 1), 1);
  const tk = row.T + 273.15;
  const rh = row.RH / 100;
  const tgDark = tGlobe(tk, rh, row.P, wind2, 0, 0, cza, undefined, undefined, 2000);
  const nwbDark = tWb(tk, rh, row.P, wind2, 0, 0, cza, 1);
  let tg = tgDark;
  let nwb = nwbDark;
  if (sunUp && sp.solar > 0) {
    const tgLit = tGlobe(tk, rh, row.P, wind2, sp.solar, sp.fdir, cza, undefined, undefined, 2000);
    const nwbLit = tWb(tk, rh, row.P, wind2, sp.solar, sp.fdir, cza, 1);
    if (tgLit != null && nwbLit != null) {
      tg = sun.fSun * tgLit + (1 - sun.fSun) * tgDark;
      nwb = sun.fSun * nwbLit + (1 - sun.fSun) * nwbDark;
    }
  }
  if (tg == null || nwb == null) return null;
  return { wbgt: 0.7 * nwb + 0.2 * tg + 0.1 * row.T, tg, wind2, sunUp };
}

/** Baseline: Ono & Tonouchi (2014), MOE's estimator, with the same forecast inputs. */
export function runOno(row) {
  const SR = row.sw / 1000;
  const WS = row.W / 3.6;
  return { wbgt: 0.735 * row.T + 0.0374 * row.RH + 0.00292 * row.T * row.RH + 7.619 * SR - 4.557 * SR * SR - 0.0572 * WS - 4.064, tg: null, wind2: null };
}

export const windBand = (w) => (w == null ? 'n/a' : w < 1 ? '<1' : w < 2 ? '1-2' : w < 4 ? '2-4' : '>=4');
export const sunBand = (sw) => (sw <= 0 ? 'night' : sw < 300 ? '<300' : sw < 700 ? '300-700' : '>=700');

// ---------- accumulators: metrics that can be merged across stations ----------
const cell = () => ({ n: 0, abs: 0, sum: 0, sq: 0 });
const put = (c, d) => { c.n++; c.abs += Math.abs(d); c.sum += d; c.sq += d * d; };
const join = (a, b) => ({ n: a.n + b.n, abs: a.abs + b.abs, sum: a.sum + b.sum, sq: a.sq + b.sq });
const out = (c) => (c.n ? { n: c.n, mae: c.abs / c.n, bias: c.sum / c.n, rmse: Math.sqrt(c.sq / c.n) } : { n: 0 });

export function createAcc() {
  return { all: cell(), tg: cell(), byWind: {}, bySun: {}, byHour: {}, byLevel: {}, exact: 0, withinOne: 0, severeN: 0, severeMiss: 0 };
}

/** pair: { pred, obs, predTg, obsTg, wind2, sw, hour } */
export function addPair(acc, p) {
  const d = p.pred - p.obs;
  put(acc.all, d);
  if (p.predTg != null && p.obsTg != null) put(acc.tg, p.predTg - p.obsTg);
  put((acc.byWind[windBand(p.wind2)] ||= cell()), d);
  put((acc.bySun[sunBand(p.sw)] ||= cell()), d);
  put((acc.byHour[p.hour] ||= cell()), d);
  const lo = levelIndex(p.obs);
  const lp = levelIndex(p.pred);
  const b = (acc.byLevel[lo] ||= { ...cell(), exact: 0, withinOne: 0 });
  put(b, d);
  if (lo === lp) { acc.exact++; b.exact++; }
  if (Math.abs(lo - lp) <= 1) { acc.withinOne++; b.withinOne++; }
  if (roundHalfUp(p.obs) >= 28) {
    acc.severeN++;
    if (roundHalfUp(p.pred) <= 24) acc.severeMiss++;
  }
}

export function mergeAccs(list) {
  const m = createAcc();
  const mergeMap = (target, src, levels = false) => {
    for (const [k, v] of Object.entries(src)) {
      const t = target[k] || (levels ? { ...cell(), exact: 0, withinOne: 0 } : cell());
      const j = join(t, v);
      target[k] = levels ? { ...j, exact: t.exact + v.exact, withinOne: t.withinOne + v.withinOne } : j;
    }
  };
  for (const a of list) {
    m.all = join(m.all, a.all);
    m.tg = join(m.tg, a.tg);
    mergeMap(m.byWind, a.byWind);
    mergeMap(m.bySun, a.bySun);
    mergeMap(m.byHour, a.byHour);
    mergeMap(m.byLevel, a.byLevel, true);
    m.exact += a.exact;
    m.withinOne += a.withinOne;
    m.severeN += a.severeN;
    m.severeMiss += a.severeMiss;
  }
  return m;
}

export function finalize(acc) {
  const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, out(v)]));
  const n = acc.all.n;
  return {
    ...out(acc.all),
    tg: out(acc.tg),
    byWind: map(acc.byWind),
    bySun: map(acc.bySun),
    byHour: map(acc.byHour),
    byLevel: Object.fromEntries(Object.entries(acc.byLevel).map(([k, v]) => [k, { ...out(v), exact: v.exact / v.n, withinOne: v.withinOne / v.n }])),
    levelExact: n ? acc.exact / n : null,
    levelWithinOne: n ? acc.withinOne / n : null,
    severe: { n: acc.severeN, missRate: acc.severeN ? acc.severeMiss / acc.severeN : 0 },
  };
}

/** Metrics for a list of pairs. */
export function metrics(pairs) {
  const acc = createAcc();
  for (const p of pairs) addPair(acc, p);
  return finalize(acc);
}

/** A row's prediction as a metric pair. */
export const pairOf = (row, o) => ({ pred: o.wbgt, obs: row.WBGT, predTg: o.tg, obsTg: row.Tg, wind2: o.wind2, sw: row.sw, hour: Number(row.time.slice(11, 13)) });

/** Evaluate one engine over rows. engine: (row, place) => { wbgt, tg, wind2 } | null. */
export function evaluate(rows, stations, engine) {
  const acc = createAcc();
  for (const row of rows) {
    const o = engine(row, stations[row.no]);
    if (o && Number.isFinite(o.wbgt)) addPair(acc, pairOf(row, o));
  }
  return finalize(acc);
}

/** The heat-load spec's accuracy requirement; returns the list of misses (empty = pass). */
export function specMisses(m) {
  const misses = [];
  if (!(m.mae <= 1.2)) misses.push(`MAE ${m.mae.toFixed(3)} > 1.2`);
  if (!(Math.abs(m.bias) <= 0.5)) misses.push(`bias ${m.bias.toFixed(3)} outside ±0.5`);
  for (const [band, v] of Object.entries(m.byWind)) if (v.n >= 50 && !(Math.abs(v.bias) <= 1.0)) misses.push(`wind ${band} bias ${v.bias.toFixed(3)} outside ±1.0`);
  for (const [band, v] of Object.entries(m.bySun)) if (v.n >= 50 && !(Math.abs(v.bias) <= 1.0)) misses.push(`sun ${band} bias ${v.bias.toFixed(3)} outside ±1.0`);
  if (!(m.levelWithinOne >= 0.95)) misses.push(`within one level ${(m.levelWithinOne * 100).toFixed(1)}% < 95%`);
  if (!(m.severe.missRate <= 0.02)) misses.push(`severe under-warning ${(m.severe.missRate * 100).toFixed(2)}% > 2%`);
  return misses;
}

/**
 * The calibration decision rule (revised after run 2; see design D13.5):
 *   1. eligible: configurations meeting every accuracy threshold on the stations
 *      they are chosen from (if none do, those with the fewest misses);
 *   2. lowest MAE among the eligible;
 *   3. within 0.02 °C of that MAE, the one closest to the reference parameters,
 *      then 'preceding' timing (the app's own alignment).
 * entries: [{ cfg: { surfaceAlbedo, minWind2, timing }, metrics }]
 */
export function chooseConfig(entries) {
  const scored = entries.map((e) => ({ ...e, misses: specMisses(e.metrics) }));
  const fewest = Math.min(...scored.map((e) => e.misses.length));
  const eligible = scored.filter((e) => e.misses.length === fewest);
  const best = Math.min(...eligible.map((e) => e.metrics.mae));
  const distance = (c) => Math.abs(c.surfaceAlbedo - REFERENCE.surfaceAlbedo) / 0.35 + Math.abs(c.minWind2 - REFERENCE.minWind2) / 0.87;
  const near = eligible
    .filter((e) => e.metrics.mae <= best + 0.02)
    .sort((a, b) => distance(a.cfg) - distance(b.cfg) || (a.cfg.timing === 'preceding' ? -1 : 1) - (b.cfg.timing === 'preceding' ? -1 : 1) || a.metrics.mae - b.metrics.mae);
  return { chosen: near[0], meetsSpec: fewest === 0, eligible: eligible.length, nearBest: near.length, bestMae: best };
}
