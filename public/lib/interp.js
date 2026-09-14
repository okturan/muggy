/**
 * "Current" from the model is a 15-minute step; the app promises the minute.
 * The 15-minute series is interpolated to the wall clock in the place's own
 * time zone. Dew point, temperature, wind, pressure and radiation all move
 * smoothly at this scale. The page, its link preview and the heat-load engine
 * all read the same interpolated moment.
 */
export const INTERP_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'wind_speed_10m',
  'surface_pressure', 'shortwave_radiation', 'direct_radiation', 'diffuse_radiation',
];

/** The wall-clock minute at the place, as "YYYY-MM-DDTHH:MM". */
export const localIso = (data, nowMs = Date.now()) =>
  new Date(nowMs + (data.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 16);

/**
 * The current reading at the minute. `base` is the model's own current step,
 * kept separately by callers that re-run this every minute.
 */
export function interpolateNow(data, nowMs = Date.now(), base = data.current) {
  const cur = { ...(base || {}) };
  const iso = localIso(data, nowMs);
  const m = data.minutely_15;
  if (m && m.time && m.time.length > 1 && iso >= m.time[0]) {
    let i = 0;
    while (i + 1 < m.time.length && m.time[i + 1] <= iso) i++;
    const j = Math.min(i + 1, m.time.length - 1);
    const t0 = Date.parse(`${m.time[i]}:00Z`);
    const t1 = Date.parse(`${m.time[j]}:00Z`);
    const frac = t1 > t0 ? Math.min(1, (Date.parse(`${iso}:00Z`) - t0) / (t1 - t0)) : 0;
    for (const k of INTERP_FIELDS) {
      const a = m[k] && m[k][i];
      const b = m[k] && m[k][j];
      if (a != null && b != null) cur[k] = a + (b - a) * frac;
      else if (a != null) cur[k] = a;
    }
    cur.time = iso;
  }
  return cur;
}
