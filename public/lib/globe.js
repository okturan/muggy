/*!
 * Black-globe temperature for the standard 150 mm globe.
 *
 * Energy balance: Liljegren et al. (2008), as ported from the Argonne source in
 * wbgt.js. The Argonne licence conditions and the acknowledgment apply ("This
 * product includes software produced by UChicago Argonne, LLC under Contract
 * No. DE-AC02-06CH11357 with the Department of Energy."); see wbgt.js.
 *
 * Convection: ISO 7726:1998, the standard for globe thermometers. It uses the
 * larger of natural convection, 1.4 (|Tg - Ta| / D)^0.25, and forced
 * convection, 6.3 v^0.6 / D^0.4 (W/m² K).
 *
 * Why not Liljegren's own sphere correlation: that correlation is forced
 * convection only and was validated with a 2-inch globe. A 150 mm globe in
 * still air and strong sun runs 20-30 K above the air, so free convection
 * carries real heat away and the forced-only correlation misses it. On
 * Muggy's training stations (Japan MOE measured 6-inch globes, forecast
 * inputs), the forced-only correlation left the globe 6 °C too warm in strong
 * sun and 10 °C too warm below 1 m/s of wind. ISO 7726 convection brought the
 * strong-sun globe error to within half a degree.
 * See tools/wbgt-validation/RESULTS.md.
 *
 * MODIFICATIONS relative to Tglobe in wbgt.js (licence condition 1)
 * 2026-09-13  Okan Erturan, Muggy (muggy.fyi): the convective coefficient
 * follows ISO 7726 instead of h_sphere_in_air; iteration cap 4000; no
 * pressure argument (ISO 7726 convection does not use air density).
 */
import { emisAtm } from './wbgt.js';

const STEFANB = 5.6696e-8;
const EMIS_GLOBE = 0.95;
const ALB_GLOBE = 0.05;
const EMIS_SFC = 0.999;
const CONVERGENCE = 0.02;
const MAX_ITER = 4000;
const MIN_SPEED = 0.13;

/** ISO 7726 convective heat transfer coefficient of a globe, W/(m² K). */
export function isoGlobeConvection(deltaT, diameter, speed) {
  const natural = 1.4 * (Math.abs(deltaT) / diameter) ** 0.25;
  const forced = (6.3 * Math.max(speed, MIN_SPEED) ** 0.6) / diameter ** 0.4;
  return Math.max(natural, forced);
}

/**
 * Globe temperature, °C, or null if not converged.
 * Tair K; rh fraction; speed m/s at 2 m; solar W/m²; fdir 0-0.9; cza cosine of
 * the zenith angle (must not be 0); diameter m; albedoSfc surface albedo.
 */
export function globeTemperature(Tair, rh, speed, solar, fdir, cza, diameter, albedoSfc) {
  const Tsfc = Tair;
  const longwave = 0.5 * (emisAtm(Tair, rh) * Tair ** 4 + EMIS_SFC * Tsfc ** 4);
  const shortwave = (solar / (2 * STEFANB * EMIS_GLOBE)) * (1 - ALB_GLOBE) * (fdir * (1 / (2 * cza) - 1) + 1 + albedoSfc);
  let prev = Tair;
  let next;
  let converged = false;
  let iter = 0;
  do {
    iter++;
    const h = isoGlobeConvection(prev - Tair, diameter, speed);
    next = (longwave - (h / (STEFANB * EMIS_GLOBE)) * (prev - Tair) + shortwave) ** 0.25;
    if (Math.abs(next - prev) < CONVERGENCE) converged = true;
    prev = 0.9 * prev + 0.1 * next;
  } while (!converged && iter < MAX_ITER);
  return converged ? next - 273.15 : null;
}
