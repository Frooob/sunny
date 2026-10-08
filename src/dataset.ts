import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";
import { startOfDay, type TimeReference } from "./timeref.ts";

export interface GlareInterval {
  start: Date;
  end: Date;
}

/**
 * Scans one calendar day minute-by-minute and returns the contiguous time
 * ranges during which the sun shines through the window onto the eye
 * point. Usually 0 or 1 interval per day, but a window facing close to a
 * solstice sunset/sunrise azimuth can in principle produce more than one,
 * so this returns a list. `ref` picks whether the calendar day runs
 * local-midnight-to-local-midnight or UTC-midnight-to-UTC-midnight.
 */
export function findGlareIntervals(
  date: Date,
  config: SunnyConfig,
  stepMinutes = 1,
  ref: TimeReference = "local",
): GlareInterval[] {
  const dayStart = startOfDay(date, ref);

  const intervals: GlareInterval[] = [];
  let currentStart: Date | null = null;
  let prev: Date | null = null;

  const minutesInDay = (24 * 60) / stepMinutes;
  for (let i = 0; i <= minutesInDay; i++) {
    const t = new Date(dayStart.getTime() + i * stepMinutes * 60_000);
    const { azimuthDeg, elevationDeg } = getSunPosition(
      t,
      config.latitude,
      config.longitude,
    );
    const glare = isGlare(azimuthDeg, elevationDeg, config);

    if (glare && currentStart === null) {
      currentStart = t;
    } else if (!glare && currentStart !== null) {
      intervals.push({ start: currentStart, end: prev ?? currentStart });
      currentStart = null;
    }
    prev = t;
  }
  if (currentStart !== null && prev !== null) {
    intervals.push({ start: currentStart, end: prev });
  }
  return intervals;
}

export interface DayGlareResult {
  date: Date;
  intervals: GlareInterval[];
}

/** Runs findGlareIntervals for every day of the given year. */
export function generateYearData(
  year: number,
  config: SunnyConfig,
  stepMinutes = 1,
): DayGlareResult[] {
  const results: DayGlareResult[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    results.push({
      date: new Date(d),
      intervals: findGlareIntervals(d, config, stepMinutes),
    });
    d.setDate(d.getDate() + 1);
  }
  return results;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Converts year data to a CSV string: date, start, end, duration (minutes) per row (one row per interval, empty row if no glare that day). */
export function yearDataToCSV(data: DayGlareResult[]): string {
  const rows = ["date,start,end,duration_minutes"];
  for (const { date, intervals } of data) {
    if (intervals.length === 0) {
      rows.push(`${fmtDate(date)},,,0`);
      continue;
    }
    for (const { start, end } of intervals) {
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);
      rows.push(`${fmtDate(date)},${fmtTime(start)},${fmtTime(end)},${durationMin}`);
    }
  }
  return rows.join("\n");
}
