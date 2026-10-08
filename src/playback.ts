import type { Store } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { findGlareIntervals } from "./dataset.ts";
import { addDays, startOfDay, withTimeOfDay, yearOf, type TimeReference } from "./timeref.ts";

export type PlaybackMode = "continuous" | "fixedTime" | "glareOnset";

const MAX_DAY_SCAN = 400; // guard against an infinite loop if a config has no glare all year

/**
 * Animates the date/time forward so the sun's motion can be watched play
 * out, in one of three modes:
 * - continuous: sweeps through real time, night included — the sun is
 *   just drawn dark while it's down (see scene.ts).
 * - fixedTime: jumps day by day, always landing on the same clock time, so
 *   you watch how the sun's position at that one moment shifts across the
 *   year (an analemma-style view).
 * - glareOnset: jumps day by day, landing on the moment glare first starts
 *   that day (skipping any day with none at all).
 */
export class Playback {
  private rafId: number | null = null;
  private lastTs = 0;
  private anchorYear: number;
  private dayAccumulator = 0;
  private listeners: Array<(playing: boolean) => void> = [];
  private store: Store;

  /** Simulated days advanced per real second (all modes). */
  daysPerSecond = 1.5;
  mode: PlaybackMode = "continuous";
  /** Target clock time for "fixedTime" mode, minutes since midnight. */
  fixedTimeMinutes = 17 * 60;
  /** Whether day-stepping modes use local calendar days (DST-aware, can jump) or UTC days (always 24h, no jump). */
  timeReference: TimeReference = "local";

  constructor(store: Store) {
    this.store = store;
    this.anchorYear = store.get().date.getFullYear();
  }

  get isPlaying(): boolean {
    return this.rafId !== null;
  }

  onPlayStateChange(listener: (playing: boolean) => void) {
    this.listeners.push(listener);
  }

  private notify() {
    for (const l of this.listeners) l(this.isPlaying);
  }

  play() {
    if (this.isPlaying) return;
    this.anchorYear = yearOf(this.store.get().date, this.timeReference);
    this.dayAccumulator = 0;
    this.lastTs = performance.now();
    const tick = (ts: number) => {
      this.advance(ts - this.lastTs);
      this.lastTs = ts;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
    this.notify();
  }

  pause() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.notify();
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  /** Changing mode/speed settings mid-flight would read as a glitch — pause instead, let the user hit Play again. */
  setMode(mode: PlaybackMode) {
    this.pause();
    this.mode = mode;
  }

  setTimeReference(ref: TimeReference) {
    this.pause();
    this.timeReference = ref;
  }

  setFixedTimeMinutes(minutes: number) {
    this.pause();
    this.fixedTimeMinutes = minutes;
  }

  private advance(dtMs: number) {
    if (this.mode === "continuous") {
      this.advanceContinuous(dtMs);
    } else {
      this.advanceDayStep(dtMs);
    }
  }

  private advanceContinuous(dtMs: number) {
    const { date } = this.store.get();
    const minutes = (this.daysPerSecond * 24 * 60 * dtMs) / 1000;
    let next = new Date(date.getTime() + minutes * 60_000);

    // Loop back to the start of the year once we run past it.
    if (next.getFullYear() > this.anchorYear) {
      next = new Date(this.anchorYear, 0, 1, 0, 0, 0, 0);
    }

    this.store.update({ date: next });
  }

  private advanceDayStep(dtMs: number) {
    this.dayAccumulator += (this.daysPerSecond * dtMs) / 1000;
    if (this.dayAccumulator < 1) return;
    this.dayAccumulator -= 1;

    const { config, date } = this.store.get();
    let day = this.wrapToAnchorYear(addDays(date, 1, this.timeReference), this.timeReference);

    const next =
      this.mode === "fixedTime"
        ? withTimeOfDay(day, this.fixedTimeMinutes, this.timeReference)
        : this.findNextGlareOnset(day, config);

    this.store.update({ date: next });
  }

  private wrapToAnchorYear(day: Date, ref: TimeReference): Date {
    if (yearOf(day, ref) > this.anchorYear) {
      return startOfDay(new Date(this.anchorYear, 0, 1), ref);
    }
    return day;
  }

  private findNextGlareOnset(startDay: Date, config: SunnyConfig): Date {
    let day = startDay;
    for (let i = 0; i < MAX_DAY_SCAN; i++) {
      const intervals = findGlareIntervals(day, config, 1, this.timeReference);
      if (intervals.length > 0) return intervals[0].start;
      day = this.wrapToAnchorYear(addDays(day, 1, this.timeReference), this.timeReference);
    }
    return startDay; // no glare found all year under this geometry — give up where we started
  }
}
