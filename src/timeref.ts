/**
 * "local" steps calendar days using the browser's local timezone (DST
 * included — a fixed local clock time will jump by an hour across a DST
 * transition, because that's what your actual clock does).
 * "utc" steps using UTC calendar days, which are always exactly 24h, so a
 * fixed UTC time of day advances smoothly across the year with no jump.
 */
export type TimeReference = "local" | "utc";

export function addDays(date: Date, days: number, ref: TimeReference): Date {
  const d = new Date(date);
  if (ref === "utc") d.setUTCDate(d.getUTCDate() + days);
  else d.setDate(d.getDate() + days);
  return d;
}

/** Returns a copy of `date` with its time-of-day set, in the given reference frame. */
export function withTimeOfDay(
  date: Date,
  minutesSinceMidnight: number,
  ref: TimeReference,
): Date {
  const d = new Date(date);
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = Math.round(minutesSinceMidnight % 60);
  if (ref === "utc") d.setUTCHours(h, m, 0, 0);
  else d.setHours(h, m, 0, 0);
  return d;
}

export function startOfDay(date: Date, ref: TimeReference): Date {
  return withTimeOfDay(date, 0, ref);
}

export function yearOf(date: Date, ref: TimeReference): number {
  return ref === "utc" ? date.getUTCFullYear() : date.getFullYear();
}
