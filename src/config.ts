/**
 * All inputs the simulation depends on, in one place.
 * Heights are relative to the room's own floor (absolute building height
 * cancels out because the sun is ~150M km away — see README).
 */
export interface SunnyConfig {
  /** Observer location, decimal degrees. The only GPS point that matters. */
  latitude: number;
  longitude: number;

  /** Compass direction the window faces, degrees from north, clockwise (0=N, 90=E, 180=S, 270=W). */
  windowAzimuthDeg: number;

  /** Window bottom edge height above the floor, meters. */
  windowSillHeight: number;
  /** Window top edge height above the floor, meters. */
  windowTopHeight: number;

  /** Eye/desk height above the floor, meters. */
  eyeHeight: number;
  /** Horizontal distance from the eye point straight back to the window wall, meters. */
  distanceToWindow: number;
}

/** The two points marking the window's wall line, used only to derive its azimuth below. */
const windowLineStart = { lat: 52.391361137090136, lon: 9.799701479406648 };
const windowLineEnd = { lat: 52.39159347703902, lon: 9.799706589755724 };

export const defaultConfig: SunnyConfig = {
  latitude: 52.391425069681254,
  longitude: 9.799709144930263,
  windowAzimuthDeg: windowAzimuthFromLine(windowLineStart, windowLineEnd),
  windowSillHeight: 0,
  windowTopHeight: 2.5,
  eyeHeight: 1.2,
  distanceToWindow: 2,
};

/** Derives the window azimuth (degrees from north) from two lat/lon points marking its wall line. */
export function windowAzimuthFromLine(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
): number {
  const lat0 = ((start.lat + end.lat) / 2) * (Math.PI / 180);
  const metersPerDegLat =
    111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
  const metersPerDegLon =
    111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);

  const dx = (end.lon - start.lon) * metersPerDegLon; // east
  const dy = (end.lat - start.lat) * metersPerDegLat; // north

  const lineBearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  // The window faces perpendicular to its own wall line. Of the two options
  // (+90/-90), pick the one matching the known default (west-facing, not east).
  const normalized = (lineBearing - 90 + 360) % 360;
  return normalized;
}
