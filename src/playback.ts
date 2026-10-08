import type { Store } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";

/**
 * Scans forward in fixed steps to find the next moment the sun is back
 * above the horizon. Deliberately avoids suncalc's getTimes() "sunrise for
 * the day containing this instant" semantics, which can resolve to a
 * sunrise *before* `from` across a local/UTC day-boundary mismatch and send
 * the animation backward in time.
 */
function scanForwardToSunrise(from: Date, config: SunnyConfig): Date {
  const stepMinutes = 15;
  const maxSteps = (4 * 24 * 60) / stepMinutes; // give up after 4 days (polar night etc.)
  let t = from;
  for (let i = 0; i < maxSteps; i++) {
    t = new Date(t.getTime() + stepMinutes * 60_000);
    if (getSunPosition(t, config.latitude, config.longitude).elevationDeg >= -1) {
      return t;
    }
  }
  return t;
}

/** Animates the date/time forward, skipping nights, so the sun's yearly motion can be watched play out. */
export class Playback {
  private rafId: number | null = null;
  private lastTs = 0;
  private anchorYear: number;
  private listeners: Array<(playing: boolean) => void> = [];

  /** Simulated days advanced per real second. */
  daysPerSecond = 1.5;

  private store: Store;

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
    this.anchorYear = this.store.get().date.getFullYear();
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

  private advance(dtMs: number) {
    const { config, date } = this.store.get();
    const minutes = (this.daysPerSecond * 24 * 60 * dtMs) / 1000;
    let next = new Date(date.getTime() + minutes * 60_000);

    // Skip straight through the night to the next sunrise instead of
    // burning frames on a sky with nothing visible happening.
    const { elevationDeg } = getSunPosition(next, config.latitude, config.longitude);
    if (elevationDeg < -1) {
      next = scanForwardToSunrise(next, config);
    }

    // Loop back to the start of the year once we run past it.
    if (next.getFullYear() > this.anchorYear) {
      const jan1 = new Date(this.anchorYear, 0, 1, 0, 0, 0, 0);
      next = scanForwardToSunrise(jan1, config);
    }

    this.store.update({ date: next });
  }
}
