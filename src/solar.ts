import * as SunCalc from "suncalc";

export interface SunPosition {
  /** Degrees above the horizon. Negative = below horizon (sun not visible). */
  elevationDeg: number;
  /** Compass azimuth, degrees from north, clockwise (0=N, 90=E, 180=S, 270=W). */
  azimuthDeg: number;
}

/** Sun position at a given instant, for the given location. */
export function getSunPosition(
  date: Date,
  latitude: number,
  longitude: number,
): SunPosition {
  // suncalc v2 returns both angles in degrees already, azimuth north-based
  // clockwise (0=N, 90=E, 180=S, 270=W) — exactly the convention used here.
  const pos = SunCalc.getPosition(date, latitude, longitude);
  return { elevationDeg: pos.altitude, azimuthDeg: pos.azimuth };
}

/** Sunrise/sunset etc. for the given date and location. */
export function getSunTimes(date: Date, latitude: number, longitude: number) {
  return SunCalc.getTimes(date, latitude, longitude);
}
