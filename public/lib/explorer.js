/**
 * "Try it" on the About page: pick a temperature, an air texture, a sun and a
 * wind, and see the verdict Muggy would give. It runs the same engine, verdict
 * and attribution as the main screen, so the explanation can never drift from
 * the app.
 */
import { wbgtInterval, rhFromDewPoint } from './load.js';
import { textureOf } from './texture.js';
import { levelOf, alertMark } from './levels.js';
import { compose } from './verdict.js';
import { attribute, factorSummary } from './explain.js';

/** Sun choices: a clear sky with the sun at a fixed height. */
export const SUN_OPTIONS = {
  none: null,
  some: { elevation: 35, fdir: 0.4 },
  full: { elevation: 65, fdir: 0.85 },
};
/** 10 m wind, m/s. */
export const WIND_OPTIONS = { still: 0.5, breeze: 3, windy: 8 };
/** A dew point in the middle of each band. */
export const DEW_POINT_FOR = { dry: 8, comfortable: 14.2, humid: 17, muggy: 19.7, oppressive: 22.5, miserable: 25.5 };

// Only the Sun–Earth distance is taken from this moment; the sun's height is set directly.
const MOMENT = Date.parse('2026-06-21T03:00:00Z');

export function explorerInputs({ tair, texture, sun, wind }) {
  const dewPoint = Math.min(DEW_POINT_FOR[texture], tair - 0.5);
  const s = SUN_OPTIONS[sun];
  const cza = s ? Math.sin((s.elevation * Math.PI) / 180) : null;
  const ghi = s ? 1098 * cza * Math.exp(-0.057 / cza) : 0;
  return {
    dewPoint,
    inputs: {
      endMs: MOMENT, minutes: 0, lat: 35.68, lon: 139.69,
      tair, rh: Math.min(100, rhFromDewPoint(tair, dewPoint)), wind10: WIND_OPTIONS[wind], pres: 1013,
      sw: ghi, direct: s ? s.fdir * ghi : 0,
      sunOverride: s ? { fSun: 1, cza } : { fSun: 0, cza: null },
    },
  };
}

export function explore(opts) {
  const { inputs, dewPoint } = explorerInputs(opts);
  const load = wbgtInterval(inputs);
  const texture = textureOf(dewPoint);
  const isDay = opts.sun !== 'none';
  const shadeLevel = levelOf(load.shade);
  const sunLevel = levelOf(load.sun);
  const worstValue = isDay ? Math.max(load.shade, load.sun) : load.shade;
  const verdict = compose({
    texture, shadeLevel, sunLevel, isDay, sunKnown: true, alert: alertMark(worstValue),
    air: { t: inputs.tair, rh: inputs.rh },
  });
  const a = attribute(inputs, isDay ? 'sun' : 'shade');
  // The same sentence as the app's "Why it feels like this" card.
  const summary = verdict.worst === 'none' ? '' : factorSummary(a.factors, { wind10: inputs.wind10 });
  return { texture, dewPoint, load, shadeLevel, sunLevel, verdict, factors: a.factors, words: a.words, reference: a.reference, summary };
}
