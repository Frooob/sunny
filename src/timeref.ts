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

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 1-indexed day of the year, e.g. Jan 1 -> 1, Dec 31 -> 365/366, in the given reference frame. */
export function dayOfYear(date: Date, ref: TimeReference): number {
  const start = startOfDay(withDayOfYear(date, 1, ref), ref);
  // Floor, not round — this counts whole calendar days elapsed since day 1,
  // so it shouldn't bump up a day just because the time-of-day is past
  // noon (that was rounding the fractional-day part up to 1). A small
  // epsilon guards against a sub-ms rounding dip right at midnight (DST
  // shifts the real elapsed time a few ms off an exact day, local ref only).
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000 + 1e-6) + 1;
}

/** Returns a copy of `date` moved to the given 1-indexed day of its own year, time-of-day unchanged — all in the given reference frame. */
export function withDayOfYear(date: Date, day: number, ref: TimeReference): Date {
  if (ref === "utc") {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        0,
        day,
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
      ),
    );
  }
  return new Date(
    date.getFullYear(),
    0,
    day,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}
