/**
 * The sun over an averaging interval.
 *
 * Forecast radiation is an average over the interval that ends at its
 * timestamp. Pairing that average with the sun at a single instant goes wrong
 * exactly when it matters most: in the hours holding sunrise or sunset, the
 * midpoint can be dark while the last half of the hour is bright. Following
 * Hogan & Hirahara (2016) and ECMWF Technical Memo 895, the zenith cosine is
 * averaged over the sunlit part of the interval only, and the sunlit fraction
 * is reported so the dark part can be treated as shade.
 *
 * Geometry comes from the Argonne port's own solar position, so the model and
 * the averaging never disagree about where the sun is.
 */
import { solarPosition, CZA_MIN } from './wbgt.js';

const DEG = Math.PI / 180;
const MINUTE = 60000;

/** Cosine of the solar zenith angle (refraction included) at a UTC instant. */
export function czaAt(ms, lat, lon) {
  const d = new Date(ms);
  const day = d.getUTCDate() + (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + d.getUTCMilliseconds() / 3.6e6) / 24;
  const pos = solarPosition(d.getUTCFullYear(), d.getUTCMonth() + 1, day, lat, lon);
  return pos ? Math.cos((90 - pos.altitude) * DEG) : null;
}

// 5-point Gauss-Legendre nodes and weights on [-1, 1].
const GL_X = [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640];
const GL_W = [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891];

/** Time where the cosine crosses the model's horizon threshold, between a and b (one crossing assumed). */
function crossing(a, b, lat, lon) {
  let lo = a;
  let hi = b;
  const upAtLo = czaAt(lo, lat, lon) >= CZA_MIN;
  for (let i = 0; i < 20 && hi - lo > 1000; i++) {
    const mid = (lo + hi) / 2;
    if ((czaAt(mid, lat, lon) >= CZA_MIN) === upAtLo) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const memo = new Map();

/**
 * Sun over the interval (endMs - minutes, endMs].
 * Returns { fSun, cza }: the sunlit fraction of the interval and the mean
 * zenith cosine over its sunlit part (cza is null when fSun is 0).
 * minutes = 0 means an instant.
 */
export function sunOverInterval(endMs, minutes, lat, lon) {
  if (!minutes) {
    const c = czaAt(endMs, lat, lon);
    return c != null && c >= CZA_MIN ? { fSun: 1, cza: c } : { fSun: 0, cza: null };
  }
  const key = `${endMs}|${minutes}|${lat}|${lon}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const start = endMs - minutes * MINUTE;
  // Coarse scan (every 10 minutes) to find sunlit sub-intervals.
  const steps = Math.max(1, Math.ceil(minutes / 10));
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(start + ((endMs - start) * i) / steps);
  const up = pts.map((t) => czaAt(t, lat, lon) >= CZA_MIN);
  const segments = [];
  let segStart = up[0] ? start : null;
  for (let i = 1; i < pts.length; i++) {
    if (up[i] !== up[i - 1]) {
      const t = crossing(pts[i - 1], pts[i], lat, lon);
      if (up[i]) segStart = t;
      else { segments.push([segStart, t]); segStart = null; }
    }
  }
  if (segStart != null) segments.push([segStart, endMs]);

  let sunlitMs = 0;
  let integral = 0;
  for (const [a, b] of segments) {
    const half = (b - a) / 2;
    const mid = (a + b) / 2;
    let s = 0;
    for (let k = 0; k < GL_X.length; k++) s += GL_W[k] * Math.max(0, czaAt(mid + half * GL_X[k], lat, lon));
    integral += s * half;
    sunlitMs += b - a;
  }
  const out = sunlitMs > 0
    ? { fSun: sunlitMs / (endMs - start), cza: Math.max(CZA_MIN, integral / sunlitMs) }
    : { fSun: 0, cza: null };
  if (memo.size > 5000) memo.clear();
  memo.set(key, out);
  return out;
}
