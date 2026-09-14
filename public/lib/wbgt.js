/*!
               Copyright © 2008, UChicago Argonne, LLC
                       All Rights Reserved

                        WBGT, Version 1.1

			     James C. Liljegren
              Decision & Information Sciences Division

			     OPEN SOURCE LICENSE

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.  Software changes,
   modifications, or derivative works, should be noted with comments and
   the author and organization’s name.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the names of UChicago Argonne, LLC or the Department of Energy
   nor the names of its contributors may be used to endorse or promote products
   derived from this software without specific prior written permission.

4. The software and the end-user documentation included with the
   redistribution, if any, must include the following acknowledgment:

   "This product includes software produced by UChicago Argonne, LLC
   under Contract No. DE-AC02-06CH11357 with the Department of Energy.”

******************************************************************************************
DISCLAIMER

THE SOFTWARE IS SUPPLIED "AS IS" WITHOUT WARRANTY OF ANY KIND.

NEITHER THE UNITED STATES GOVERNMENT, NOR THE UNITED STATES DEPARTMENT OF ENERGY,
NOR UCHICAGO ARGONNE, LLC, NOR ANY OF THEIR EMPLOYEES, MAKES ANY WARRANTY, EXPRESS
OR IMPLIED, OR ASSUMES ANY LEGAL LIABILITY OR RESPONSIBILITY FOR THE ACCURACY,
COMPLETENESS, OR USEFULNESS OF ANY INFORMATION, DATA, APPARATUS, PRODUCT, OR
PROCESS DISCLOSED, OR REPRESENTS THAT ITS USE WOULD NOT INFRINGE PRIVATELY OWNED RIGHTS.

******************************************************************************************

  Reference: Liljegren, J. C., R. A. Carhart, P. Lawday, S. Tschopp, and R. Sharp:
             Modeling the Wet Bulb Globe Temperature Using Standard Meteorological
             Measurements. The Journal of Occupational and Environmental Hygiene,
             vol. 5:10, pp. 645-655, 2008.
  Solar position: Nels Larson, Pacific Northwest National Laboratory (Version 3.0, 1992),
             as included in the Argonne source.

  MODIFICATIONS (licence condition 1)
  2026-09-13  Okan Erturan, Muggy (muggy.fyi)
  - Translated from K&R C (wbgt.c, version 1.1, as redistributed in
    github.com/mdljts/wbgt src/wbgt.c.original) to a JavaScript ES module.
    Arithmetic, constants, iteration and convergence rules are unchanged;
    single-precision floats become JavaScript doubles.
  - calc_wbgt and calc_solar_parameters return objects instead of writing
    through pointers; non-convergence returns null values instead of -9999.
  - calc_solar_parameters accepts an optional caller-supplied direct-beam
    fraction, used only where the original would have estimated one, and an
    optional caller-supplied cosine of the solar zenith angle (for irradiance
    averaged over an interval, where the sunlit-part mean is the right value).
  - Tglobe and Twb accept an optional globe diameter and surface albedo; the
    defaults are the original constants, and calc_wbgt passes them through
    from an optional second argument. Tglobe also accepts an optional
    iteration cap (default MAX_ITER): a 150 mm globe in calm, strong sun
    needs more than 50 relaxed iterations to converge.
  - The demonstration main() and the unused days_1900 date path are not ported.
  - The tools/wbgt-oracle driver checks this port against the original.
*/

const PI = 3.1415926535897932;
const TWOPI = 6.2831853071795864;
const DEG_RAD = 0.017453292519943295;
const RAD_DEG = 57.295779513082323;

const SOLAR_CONST = 1367;
const STEFANB = 5.6696e-8;
const Cp = 1003.5;
const M_AIR = 28.97;
const M_H2O = 18.015;
const RATIO = (Cp * M_AIR) / M_H2O;
const R_GAS = 8314.34;
const R_AIR = R_GAS / M_AIR;
const Pr = Cp / (Cp + 1.25 * R_AIR);

const EMIS_WICK = 0.95;
const ALB_WICK = 0.4;
const D_WICK = 0.007;
const L_WICK = 0.0254;

const EMIS_GLOBE = 0.95;
const ALB_GLOBE = 0.05;
export const D_GLOBE = 0.0508;

const EMIS_SFC = 0.999;
export const ALB_SFC = 0.45;

export const CZA_MIN = 0.00873;
const NORMSOLAR_MAX = 0.85;
export const REF_HEIGHT = 2.0;
export const MIN_SPEED = 0.13;
const CONVERGENCE = 0.02;
const MAX_ITER = 50;

/** C modf(): the signed fractional part. */
const frac = (x) => x - Math.trunc(x);

/**
 * Outdoor wet bulb globe temperature.
 *
 * Inputs: year; month (1-12, or 0 for day-of-year); day; hour and minute in
 * local standard time; gmt = LST - GMT in hours; avg = averaging time of the
 * meteorological inputs in minutes (the sun is evaluated at the middle of the
 * period); lat (N+), lon (E+); solar irradiance W/m2; pres mb; tair degC;
 * rh %; speed m/s measured at zspeed metres; dT = vertical temperature
 * difference (upper minus lower) degC; urban 1/0; optional fdir 0-0.9 to use
 * instead of the model's direct-beam estimate; optional cza to use instead of
 * the computed cosine of the solar zenith angle.
 *
 * opts: { globeDiameter (m), surfaceAlbedo } — default to the reference values.
 */
export function calcWbgt({
  year, month, day, hour, minute, gmt = 0, avg = 0, lat, lon,
  solar, pres, tair, rh: relhum, speed, zspeed, dT = 0, urban = 1, fdir: fdirIn, cza: czaIn,
}, { globeDiameter = D_GLOBE, surfaceAlbedo = ALB_SFC } = {}) {
  // convert time to GMT and center in avg period
  const hourGmt = hour - gmt + (minute - 0.5 * avg) / 60;
  const dday = day + hourGmt / 24;

  const sp = calcSolarParameters(year, month, dday, lat, lon, solar, fdirIn, czaIn);
  if (!sp) return null;

  let windSpeed = speed;
  let estSpeed = speed;
  if (zspeed !== REF_HEIGHT) {
    const daytime = sp.cza > 0;
    const stabilityClass = stabSrdt(daytime, windSpeed, sp.solar, dT);
    estSpeed = estWindSpeed(windSpeed, zspeed, stabilityClass, urban);
    windSpeed = estSpeed;
  }

  const tk = tair + 273.15;
  const rh = 0.01 * relhum;

  const Tg = tGlobe(tk, rh, pres, windSpeed, sp.solar, sp.fdir, sp.cza, globeDiameter, surfaceAlbedo);
  const Tnwb = tWb(tk, rh, pres, windSpeed, sp.solar, sp.fdir, sp.cza, 1, surfaceAlbedo);
  const Tpsy = tWb(tk, rh, pres, windSpeed, sp.solar, sp.fdir, sp.cza, 0, surfaceAlbedo);
  const Twbg = Tg == null || Tnwb == null ? null : 0.1 * tair + 0.2 * Tg + 0.7 * Tnwb;

  return { Tg, Tnwb, Tpsy, Twbg, estSpeed, cza: sp.cza, fdir: sp.fdir, solar: sp.solar };
}

/**
 * Cosine of the solar zenith angle and the direct-beam fraction, with the
 * irradiance clamped to be consistent with the top-of-atmosphere value.
 */
export function calcSolarParameters(year, month, day, lat, lon, solarIn, fdirIn, czaIn) {
  const pos = solarPosition(year, month, day, lat, lon);
  if (!pos) return null;
  const cza = czaIn != null ? czaIn : Math.cos((90 - pos.altitude) * DEG_RAD);
  let toasolar = (SOLAR_CONST * Math.max(0, cza)) / (pos.distance * pos.distance);
  // if the sun is not fully above the horizon set the maximum (top of atmosphere) solar = 0
  if (cza < CZA_MIN) toasolar = 0;

  let solar = solarIn;
  let fdir;
  if (toasolar > 0) {
    // account for any solar sensor calibration errors and make the solar
    // irradiance consistent with normsolar
    const normsolar = Math.min(solar / toasolar, NORMSOLAR_MAX);
    solar = normsolar * toasolar;
    if (normsolar > 0) {
      if (fdirIn != null && fdirIn >= 0) {
        fdir = fdirIn;
      } else {
        fdir = Math.exp(3 - 1.34 * normsolar - 1.65 / normsolar);
        fdir = Math.max(Math.min(fdir, 0.9), 0);
      }
    } else {
      fdir = 0;
    }
  } else {
    fdir = 0;
  }
  return { solar, cza, fdir, distance: pos.distance };
}

/** Natural wet bulb (rad = 1) or psychrometric wet bulb (rad = 0), degC; null if not converged. */
export function tWb(Tair, rh, Pair, speed, solar, fdir, cza, rad, albedoSfc = ALB_SFC) {
  const a = 0.56; // from Bedingfield and Drew
  const Tsfc = Tair;
  const sza = Math.acos(cza);
  const eair = rh * esat(Tair, 0);
  const Tdew = dewPoint(eair, 0);
  let TwbPrev = Tdew; // first guess is the dew point temperature
  let TwbNew;
  let converged = false;
  let iter = 0;
  do {
    iter++;
    const Tref = 0.5 * (TwbPrev + Tair); // evaluate properties at the average temperature
    const h = hCylinderInAir(D_WICK, L_WICK, Tref, Pair, speed);
    const Fatm = STEFANB * EMIS_WICK
      * (0.5 * (emisAtm(Tair, rh) * Tair ** 4 + EMIS_SFC * Tsfc ** 4) - TwbPrev ** 4)
      + (1 - ALB_WICK) * solar
      * ((1 - fdir) * (1 + (0.25 * D_WICK) / L_WICK) + fdir * (Math.tan(sza) / PI + (0.25 * D_WICK) / L_WICK) + albedoSfc);
    const ewick = esat(TwbPrev, 0);
    const density = (Pair * 100) / (R_AIR * Tref);
    const Sc = viscosity(Tref) / (density * diffusivity(Tref, Pair));
    TwbNew = Tair - ((evap(Tref) / RATIO) * (ewick - eair)) / (Pair - ewick) * (Pr / Sc) ** a + (Fatm / h) * rad;
    if (Math.abs(TwbNew - TwbPrev) < CONVERGENCE) converged = true;
    TwbPrev = 0.9 * TwbPrev + 0.1 * TwbNew;
  } while (!converged && iter < MAX_ITER);
  return converged ? TwbNew - 273.15 : null;
}

/** Convective heat transfer coefficient, W/(m2 K), for a long cylinder in cross flow (Bedingfield and Drew). */
export function hCylinderInAir(diameter, length, Tair, Pair, speed) {
  const a = 0.56;
  const b = 0.281;
  const c = 0.4;
  const density = (Pair * 100) / (R_AIR * Tair);
  const Re = (Math.max(speed, MIN_SPEED) * density * diameter) / viscosity(Tair);
  const Nu = b * Re ** (1 - c) * Pr ** (1 - a);
  return (Nu * thermalCond(Tair)) / diameter;
}

/**
 * Globe temperature, degC; null if not converged. maxIter defaults to the
 * reference cap; a 150 mm globe in calm, strong sun has a much larger gap to
 * close under the same 0.1 relaxation and needs more iterations.
 */
export function tGlobe(Tair, rh, Pair, speed, solar, fdir, cza, diameter = D_GLOBE, albedoSfc = ALB_SFC, maxIter = MAX_ITER) {
  const Tsfc = Tair;
  let TglobePrev = Tair; // first guess is the air temperature
  let TglobeNew;
  let converged = false;
  let iter = 0;
  do {
    iter++;
    const Tref = 0.5 * (TglobePrev + Tair);
    const h = hSphereInAir(diameter, Tref, Pair, speed);
    TglobeNew = (
      0.5 * (emisAtm(Tair, rh) * Tair ** 4 + EMIS_SFC * Tsfc ** 4)
      - (h / (STEFANB * EMIS_GLOBE)) * (TglobePrev - Tair)
      + (solar / (2 * STEFANB * EMIS_GLOBE)) * (1 - ALB_GLOBE) * (fdir * (1 / (2 * cza) - 1) + 1 + albedoSfc)
    ) ** 0.25;
    if (Math.abs(TglobeNew - TglobePrev) < CONVERGENCE) converged = true;
    TglobePrev = 0.9 * TglobePrev + 0.1 * TglobeNew;
  } while (!converged && iter < maxIter);
  return converged ? TglobeNew - 273.15 : null;
}

/** Convective heat transfer coefficient, W/(m2 K), for flow around a sphere (BSL p. 409). */
export function hSphereInAir(diameter, Tair, Pair, speed) {
  const density = (Pair * 100) / (R_AIR * Tair);
  const Re = (Math.max(speed, MIN_SPEED) * density * diameter) / viscosity(Tair);
  const Nu = 2.0 + 0.6 * Math.sqrt(Re) * Pr ** 0.3333;
  return (Nu * thermalCond(Tair)) / diameter;
}

/** Saturation vapour pressure (mb) over liquid water (phase 0) or ice (phase 1); Buck (1981). */
export function esat(tk, phase) {
  let es;
  if (phase === 0) {
    const y = (tk - 273.15) / (tk - 32.18);
    es = 6.1121 * Math.exp(17.502 * y);
  } else {
    const y = (tk - 273.15) / (tk - 0.6);
    es = 6.1115 * Math.exp(22.452 * y);
  }
  return 1.004 * es; // correction for moist air, if pressure is not available; for pressure > 800 mb
}

/** Dew point (phase 0) or frost point (phase 1), K. */
export function dewPoint(e, phase) {
  if (phase === 0) {
    const z = Math.log(e / (6.1121 * 1.004));
    return 273.15 + (240.97 * z) / (17.502 - z);
  }
  const z = Math.log(e / (6.1115 * 1.004));
  return 273.15 + (272.55 * z) / (22.452 - z);
}

/** Viscosity of air, kg/(m s); BSL p. 23. */
export function viscosity(Tair) {
  const sigma = 3.617;
  const epsKappa = 97.0;
  const Tr = Tair / epsKappa;
  const omega = ((Tr - 2.9) / 0.4) * -0.034 + 1.048;
  return (2.6693e-6 * Math.sqrt(M_AIR * Tair)) / (sigma * sigma * omega);
}

/** Thermal conductivity of air, W/(m K); BSL p. 257. */
export function thermalCond(Tair) {
  return (Cp + 1.25 * R_AIR) * viscosity(Tair);
}

/** Diffusivity of water vapour in air, m2/s; BSL p. 505. */
export function diffusivity(Tair, Pair) {
  const PcritAir = 36.4;
  const PcritH2o = 218;
  const TcritAir = 132;
  const TcritH2o = 647.3;
  const a = 3.64e-4;
  const b = 2.334;
  const Pcrit13 = (PcritAir * PcritH2o) ** (1 / 3);
  const Tcrit512 = (TcritAir * TcritH2o) ** (5 / 12);
  const Tcrit12 = Math.sqrt(TcritAir * TcritH2o);
  const Mmix = Math.sqrt(1 / M_AIR + 1 / M_H2O);
  const Patm = Pair / 1013.25;
  return ((a * (Tair / Tcrit12) ** b * Pcrit13 * Tcrit512 * Mmix) / Patm) * 1e-4;
}

/** Heat of evaporation, J/(kg K), for 283-313 K; Van Wylen and Sonntag. */
export function evap(Tair) {
  return ((313.15 - Tair) / 30) * -71100 + 2.4073e6;
}

/** Atmospheric emissivity; Oke (2nd edition) p. 373. */
export function emisAtm(Tair, rh) {
  const e = rh * esat(Tair, 0);
  return 0.575 * e ** 0.143;
}

/**
 * Low-precision solar coordinates from the 1990 Astronomical Almanac
 * (N. Larson, PNNL). Date as {year, month, day.fraction} in UT, or
 * {year, 0, daynumber.fraction}. Altitude includes the refraction correction,
 * as in the Argonne source. Returns null when an input is out of bounds.
 */
export function solarPosition(year, month, day, latitude, longitude) {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (year < 1950 || year > 2049) return null;
  let daynumber;
  if (month !== 0) {
    if (month < 1 || month > 12 || day < 0 || day > 33) return null;
    daynumber = daynum(year, month, Math.trunc(day));
  } else {
    if (day < 0 || day > 368) return null;
    daynumber = Math.trunc(day);
  }

  const deltaYears = year - 2000;
  let deltaDays = deltaYears * 365 + Math.trunc(deltaYears / 4) + daynumber;
  if (year > 2000) deltaDays += 1;
  let daysJ2000 = deltaDays - 1.5;
  const centJ2000 = daysJ2000 / 36525.0;
  let ut = frac(day);
  daysJ2000 += ut;
  ut *= 24.0;

  let meanAnomaly = 357.528 + 0.9856003 * daysJ2000;
  let meanLongitude = 280.46 + 0.9856474 * daysJ2000;
  meanAnomaly = frac(meanAnomaly / 360.0) * TWOPI;
  meanLongitude = frac(meanLongitude / 360.0) * TWOPI;

  const meanObliquity = (23.439 - 4.0e-7 * daysJ2000) * DEG_RAD;
  const eclipticLong = (1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2.0 * meanAnomaly)) * DEG_RAD + meanLongitude;

  const distance = 1.00014 - 0.01671 * Math.cos(meanAnomaly) - 0.00014 * Math.cos(2.0 * meanAnomaly);

  let apRa = Math.atan2(Math.cos(meanObliquity) * Math.sin(eclipticLong), Math.cos(eclipticLong));
  if (apRa < 0.0) apRa += TWOPI;
  apRa = frac(apRa / TWOPI) * 24.0;

  let apDec = Math.asin(Math.sin(meanObliquity) * Math.sin(eclipticLong));

  let gmst0h = 24110.54841 + centJ2000 * (8640184.812866 + centJ2000 * (0.093104 - centJ2000 * 6.2e-6));
  gmst0h = frac(gmst0h / 3600.0 / 24.0) * 24.0;
  if (gmst0h < 0.0) gmst0h += 24.0;

  let lmst = gmst0h + ut * 1.00273790934 + longitude / 15.0;
  lmst = frac(lmst / 24.0) * 24.0;
  if (lmst < 0.0) lmst += 24.0;

  let localHa = lmst - apRa;
  if (localHa < -12.0) localHa += 24.0;
  else if (localHa > 12.0) localHa -= 24.0;

  const lat = latitude * DEG_RAD;
  localHa = (localHa / 24.0) * TWOPI;

  const cosApdec = Math.cos(apDec);
  const sinApdec = Math.sin(apDec);
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const cosLha = Math.cos(localHa);

  let altitude = Math.asin(sinApdec * sinLat + cosApdec * cosLha * cosLat);
  const cosAlt = Math.cos(altitude);
  const tanAlt = Math.abs(altitude) < 1.57079615 ? Math.tan(altitude) : 6.0e6;

  const cosAz = (sinApdec * cosLat - cosApdec * cosLha * sinLat) / cosAlt;
  const sinAz = -((cosApdec * Math.sin(localHa)) / cosAlt);
  let azimuth = Math.acos(cosAz);
  if (Math.atan2(sinAz, cosAz) < 0.0) azimuth = TWOPI - azimuth;

  apDec *= RAD_DEG;
  altitude *= RAD_DEG;
  azimuth *= RAD_DEG;

  const pressure = 1013.25;
  const temp = 15.0;
  let refraction;
  if (altitude < -1.0 || tanAlt === 6.0e6) {
    refraction = 0.0;
  } else if (altitude < 19.225) {
    refraction = (0.1594 + altitude * (0.0196 + 0.00002 * altitude)) * pressure;
    refraction /= (1.0 + altitude * (0.505 + 0.0845 * altitude)) * (273.0 + temp);
  } else {
    refraction = (0.00452 * (pressure / (273.0 + temp))) / tanAlt;
  }
  // to match Michalsky's sunae program, JC Liljegren adds the refraction correction to the altitude
  altitude += refraction;

  return { apRa, apDec, altitude, refraction, azimuth, distance };
}

/** Sequential day number of a Gregorian calendar date. */
export function daynum(year, month, day) {
  const begmonth = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  if (year < 1) return -1;
  const leapyr = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  let dnum = begmonth[month] + day;
  if (leapyr && month > 2) dnum += 1;
  return dnum;
}

/** 2-m wind speed for all stability conditions; EPA-454/5-99-005, 2000, section 6.2.5. */
export function estWindSpeed(speed, zspeed, stabilityClass, urban) {
  const urbanExp = [0.15, 0.15, 0.2, 0.25, 0.3, 0.3];
  const ruralExp = [0.07, 0.07, 0.1, 0.15, 0.35, 0.55];
  const exponent = urban ? urbanExp[stabilityClass - 1] : ruralExp[stabilityClass - 1];
  return Math.max(speed * (REF_HEIGHT / zspeed) ** exponent, MIN_SPEED);
}

/** Pasquill stability class from solar radiation and delta-T; EPA-454/5-99-005, 2000, section 6.2.5. */
export function stabSrdt(daytime, speed, solar, dT) {
  const lsrdt = [
    [1, 1, 2, 4, 0, 5, 6, 0],
    [1, 2, 3, 4, 0, 5, 6, 0],
    [2, 2, 3, 4, 0, 4, 4, 0],
    [3, 3, 4, 4, 0, 0, 0, 0],
    [3, 4, 4, 4, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  let i;
  let j;
  if (daytime) {
    if (solar >= 925.0) j = 0;
    else if (solar >= 675.0) j = 1;
    else if (solar >= 175.0) j = 2;
    else j = 3;
    if (speed >= 6.0) i = 4;
    else if (speed >= 5.0) i = 3;
    else if (speed >= 3.0) i = 2;
    else if (speed >= 2.0) i = 1;
    else i = 0;
  } else {
    j = dT >= 0.0 ? 6 : 5;
    if (speed >= 2.5) i = 2;
    else if (speed >= 2.0) i = 1;
    else i = 0;
  }
  return lsrdt[i][j];
}
