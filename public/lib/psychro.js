/**
 * Psychrometric wet-bulb temperature, computed the way the Japan Ministry of
 * the Environment computes it for its measured WBGT (Iribarne & Godson 1981;
 * MOE WBGT method document, eqs. 2.2-2.5). Muggy's load levels are MOE's, so
 * the wet bulb inside the index is MOE's too.
 */

const C0 = 26.66082;
const C1 = 0.0091379024;
const C2 = 6106.396;
const F = 0.0006355; // Cp / (L * epsilon), 1/K

/** Saturation vapour pressure, hPa, for temperature in kelvin. */
const svp = (tk) => Math.exp(C0 - C1 * tk - C2 / tk);

/** Dew point (°C) from air temperature (°C) and relative humidity (%), Magnus over water (A 7.5, B 237.3). */
export function dewPointMoe(ta, rh) {
  const A = 7.5;
  const B = 237.3;
  const c1 = Math.log10(Math.max(rh, 0.01) / 100);
  const c2 = (ta * A * B) / (B + ta);
  const c3 = c1 * B;
  const c4 = c1 - (A * B) / (B + ta);
  return (-c2 - c3) / c4;
}

/** Wet-bulb temperature (°C) from air temperature (°C), relative humidity (%) and pressure (hPa). */
export function wetBulbMoe(ta, rh, p) {
  if (rh >= 100) return ta;
  const Ta = ta + 273.15;
  const Td = dewPointMoe(ta, rh) + 273.15;
  if (Ta - Td < 1e-6) return ta;
  const es = svp(Ta);
  const ed = svp(Td);
  const s = (es - ed) / (Ta - Td);
  let Tw = (Ta * F * p + Td * s) / (F * p + s);
  // MOE stops at the third estimate (within 0.1 °C); iterate to convergence.
  for (let i = 0; i < 20; i++) {
    const ew = svp(Tw);
    const de = F * p * (Ta - Tw) - (ew - ed);
    const der = ew * (C1 - C2 / (Tw * Tw)) - F * p;
    const next = Tw - de / der;
    if (Math.abs(next - Tw) < 0.001) { Tw = next; break; }
    Tw = next;
  }
  return Tw - 273.15;
}
