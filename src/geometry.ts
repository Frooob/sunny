import type { SunnyConfig } from "./config.ts";

/** Signed angle a-b in degrees, wrapped to (-180, 180]. */
function angleDiffDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export interface GlareBounds {
  /** Minimum sun elevation (deg) that still clears the window's sill. */
  minElevationDeg: number;
  /** Maximum sun elevation (deg) that still clears the window's top. Above this, the sun is blocked by the wall/header above the window. */
  maxElevationDeg: number;
}

/**
 * For a sun azimuth offset `deltaAzDeg` (sun azimuth - window azimuth), the
 * range of sun elevations whose ray passes through the window and reaches
 * the eye point. Returns null if the sun is more than 90 deg off the
 * window's facing direction (it's hitting the wall from behind/the side,
 * can't shine through a flat window regardless of elevation).
 *
 * Derivation: the window is treated as an infinite vertical plane at
 * distance D from the eye, facing azimuth windowAzimuthDeg. A ray from sun
 * azimuth/elevation (az, el), traced backwards from the eye, crosses that
 * plane at horizontal distance t = D / cos(deltaAz) and height
 * eye + t * tan(el). Requiring that height to land within [sill, top]
 * gives the bounds below.
 */
export function glareElevationBounds(
  deltaAzDeg: number,
  config: SunnyConfig,
): GlareBounds | null {
  const deltaAzRad = (deltaAzDeg * Math.PI) / 180;
  const cosDelta = Math.cos(deltaAzRad);
  if (cosDelta <= 0) return null; // sun is behind the window's plane

  const { windowSillHeight, windowTopHeight, eyeHeight, distanceToWindow } =
    config;

  const minElevationDeg =
    (Math.atan(
      ((windowSillHeight - eyeHeight) / distanceToWindow) * cosDelta,
    ) *
      180) /
    Math.PI;
  const maxElevationDeg =
    (Math.atan(
      ((windowTopHeight - eyeHeight) / distanceToWindow) * cosDelta,
    ) *
      180) /
    Math.PI;

  return { minElevationDeg, maxElevationDeg };
}

/** Whether the sun, at this azimuth/elevation, is currently shining through the window onto the eye point. */
export function isGlare(
  sunAzimuthDeg: number,
  sunElevationDeg: number,
  config: SunnyConfig,
): boolean {
  if (sunElevationDeg <= 0) return false; // sun not risen

  const deltaAz = angleDiffDeg(sunAzimuthDeg, config.windowAzimuthDeg);
  if (Math.abs(deltaAz) >= 90) return false;

  const bounds = glareElevationBounds(deltaAz, config);
  if (!bounds) return false;

  return (
    sunElevationDeg >= bounds.minElevationDeg &&
    sunElevationDeg <= bounds.maxElevationDeg
  );
}
