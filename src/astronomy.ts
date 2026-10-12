/**
 * A from-scratch, parametrized solar-position formula — used only when the
 * axial-tilt or orbital-eccentricity toggles disable real Earth physics,
 * since suncalc's algorithm has those baked in as fixed constants with no
 * way to configure them. The geometry (hour angle -> azimuth/elevation) is
 * the same standard approach suncalc itself uses; what's parametrized is
 * the step before that — how the sun's ecliptic longitude and declination
 * are derived from obliquity and eccentricity.
 *
 * Derivation, in order:
 * 1. Mean anomaly M: Earth's *uniform-rate* position in its orbit. This
 *    doesn't depend on eccentricity — "mean" means the uniform-angular-
 *    velocity idealization eccentricity is a deviation *from*.
 * 2. Equation of center C(M, e): the correction from mean to true anomaly,
 *    i.e. exactly how non-uniform the orbit's angular speed actually is.
 *    This is the one term that depends on eccentricity — C = 0 when e = 0
 *    (a circular orbit has no equation of center: mean = true anomaly).
 * 3. Ecliptic longitude λ = L + C, where L is the mean longitude.
 * 4. Declination δ = asin(sin(obliquity) · sin(λ)) and right ascension α
 *    — projecting the ecliptic position onto the equatorial coordinate
 *    system latitude/longitude and clock time are measured in. This is
 *    the one step that depends on obliquity — with obliquity = 0 the
 *    ecliptic and equatorial planes coincide, so δ = 0 always (the sun
 *    never leaves the celestial equator — no seasons).
 * 5. Standard hour-angle -> azimuth/elevation conversion from δ, α, the
 *    observer's lat/lon, and sidereal time.
 */

const RAD = Math.PI / 180;

export const REAL_OBLIQUITY_DEG = 23.4397;
export const REAL_ECCENTRICITY = 0.0167086;

export interface EarthPhysics {
  /** Axial tilt, degrees. Real Earth ~23.4397°; 0 = no seasons (sun stays on the celestial equator). */
  obliquityDeg: number;
  /** Orbital eccentricity, 0 (circular) to <1. Real Earth ~0.0167. */
  eccentricity: number;
}

export const REAL_EARTH: EarthPhysics = {
  obliquityDeg: REAL_OBLIQUITY_DEG,
  eccentricity: REAL_ECCENTRICITY,
};

function toDays(date: Date): number {
  // Days since J2000.0 (UTC-based — matches suncalc's own toDays() to within
  // the ~70s of terrestrial-time correction it additionally applies, which
  // is well under this formula's own precision budget).
  const J1970 = 2440588;
  const J2000 = 2451545;
  return date.getTime() / 86_400_000 - 0.5 + J1970 - J2000;
}

function sunEquatorialPosition(d: number, physics: EarthPhysics): { ra: number; dec: number } {
  const t = d / 36525; // Julian centuries since J2000
  const L0 = RAD * (280.46646 + t * (36000.76983 + t * 0.0003032)); // mean longitude
  const M = RAD * (357.52911 + t * (35999.05029 - t * 0.0001537)); // mean anomaly — eccentricity-independent

  const e = physics.eccentricity;
  const sinM = Math.sin(M);
  // Equation of center series (mean anomaly -> true anomaly correction).
  // Coefficients derived directly from e, not hardcoded for Earth's value —
  // this is what makes the orbit's "ellipse-ness" an adjustable parameter.
  const c1 = 2 * e - (e ** 3) / 4;
  const c2 = 1.25 * e * e;
  const c3 = (13 / 12) * e ** 3;
  const C = c1 * sinM + c2 * Math.sin(2 * M) + c3 * Math.sin(3 * M);

  const L = L0 + C; // ecliptic longitude of the sun

  const obliquity = RAD * physics.obliquityDeg;
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(obliquity) * Math.sin(L));
  return { ra, dec };
}

function siderealTime(d: number, lngRad: number): number {
  return RAD * (280.46061837 + 360.98564736629 * d) + lngRad;
}

function astroRefraction(h: number): number {
  const hh = h < 0 ? 0 : h;
  return 0.0002967 / Math.tan(hh + 0.00312536 / (hh + 0.08901179));
}

export interface SimplePosition {
  elevationDeg: number;
  azimuthDeg: number;
}

export function customSunPosition(
  date: Date,
  latitude: number,
  longitude: number,
  physics: EarthPhysics,
): SimplePosition {
  const phi = RAD * latitude;
  const lngRad = RAD * longitude;
  const d = toDays(date);
  const { ra, dec } = sunEquatorialPosition(d, physics);
  const H = siderealTime(d, lngRad) - ra;

  const h = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az =
    ((Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) * 180) / Math.PI +
      540) %
    360;

  return {
    elevationDeg: ((h + astroRefraction(h)) * 180) / Math.PI,
    azimuthDeg: az,
  };
}
