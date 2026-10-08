import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";

export interface DayArcPoint {
  time: Date;
  azimuthDeg: number;
  elevationDeg: number;
  glare: boolean;
}

/** Samples the sun's position through daylight hours of one calendar day, for drawing its path across the sky. */
export function computeDayArc(
  date: Date,
  config: SunnyConfig,
  stepMinutes = 4,
): DayArcPoint[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const points: DayArcPoint[] = [];
  const steps = (24 * 60) / stepMinutes;
  for (let i = 0; i <= steps; i++) {
    const t = new Date(dayStart.getTime() + i * stepMinutes * 60_000);
    const { azimuthDeg, elevationDeg } = getSunPosition(
      t,
      config.latitude,
      config.longitude,
    );
    if (elevationDeg < -1) continue; // keep the arc to the visible sky
    points.push({
      time: t,
      azimuthDeg,
      elevationDeg,
      glare: isGlare(azimuthDeg, elevationDeg, config),
    });
  }
  return points;
}
