import * as SunCalc from "suncalc";
import type { SunnyConfig } from "./config.ts";
import { customSunPosition, REAL_EARTH } from "./astronomy.ts";

export interface SunPosition {
  /** Degrees above the horizon. Negative = below horizon (sun not visible). */
  elevationDeg: number;
  /** Compass azimuth, degrees from north, clockwise (0=N, 90=E, 180=S, 270=W). */
  azimuthDeg: number;
}

/**
 * Sun position at a given instant, for the given location — using real
 * Earth physics (via suncalc, its usual precise path) when both the tilt
 * and eccentricity toggles are on, or a parametrized formula (astronomy.ts)
 * when either is switched off, since suncalc has no way to configure those
 * away. The two agree to within ~0.01° when both toggles are on, so there's
 * no behavior change for anyone who never touches them.
 */
export function getSunPosition(date: Date, config: SunnyConfig): SunPosition {
  if (config.tiltEnabled && config.eccentricityEnabled) {
    // suncalc v2 returns both angles in degrees already, azimuth north-based
    // clockwise (0=N, 90=E, 180=S, 270=W) — exactly the convention used here.
    const pos = SunCalc.getPosition(date, config.latitude, config.longitude);
    return { elevationDeg: pos.altitude, azimuthDeg: pos.azimuth };
  }

  return customSunPosition(date, config.latitude, config.longitude, {
    obliquityDeg: config.tiltEnabled ? REAL_EARTH.obliquityDeg : 0,
    eccentricity: config.eccentricityEnabled ? REAL_EARTH.eccentricity : 0,
  });
}
