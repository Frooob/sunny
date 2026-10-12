import type { Store } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { glareElevationBounds, isGlare } from "./geometry.ts";
import { findGlareIntervals } from "./dataset.ts";
import type { Playback, PlaybackMode } from "./playback.ts";
import { dayOfYear, isLeapYear, withDayOfYear, type TimeReference } from "./timeref.ts";
import type { SunnyScene } from "./scene.ts";
import type { ThemeController, ThemeMode } from "./theme.ts";

function numberField(
  label: string,
  key: keyof SunnyConfig,
  step: number,
  store: Store,
): string {
  const value = store.get().config[key];
  return `
    <div class="field">
      <label for="f-${key}">${label}</label>
      <input id="f-${key}" type="number" step="${step}" value="${value}" data-key="${key}" />
    </div>
  `;
}

function checkboxField(label: string, key: keyof SunnyConfig, store: Store): string {
  const checked = store.get().config[key] ? "checked" : "";
  return `
    <div class="field">
      <label for="f-${key}">${label}</label>
      <input id="f-${key}" type="checkbox" ${checked} data-bool-key="${key}" />
    </div>
  `;
}

function fmtHM(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtHM_UTC(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function mountControlPanel(
  container: HTMLElement,
  store: Store,
  playback: Playback,
  scene: SunnyScene,
  theme: ThemeController,
) {
  container.innerHTML = `
    <h1>Sunny</h1>
    <p class="subtitle">Window-glare simulator</p>

    <section>
      <h2>Appearance</h2>
      <div class="field">
        <label for="f-theme">Theme</label>
        <select id="f-theme">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="dynamic">Dynamic (follows the sun)</option>
        </select>
      </div>
    </section>

    <section>
      <h2>Location</h2>
      ${numberField("Latitude", "latitude", 0.0001, store)}
      ${numberField("Longitude", "longitude", 0.0001, store)}
    </section>

    <section>
      <h2>Earth's orbit</h2>
      <p class="subtitle" style="margin-bottom: 10px;">
        The two independent causes of seasons and the sun's day-to-day
        drift — disable either to see how the sky would look without it.
      </p>
      ${checkboxField("Axial tilt (seasons)", "tiltEnabled", store)}
      ${checkboxField("Orbital eccentricity (elliptical orbit)", "eccentricityEnabled", store)}
    </section>

    <section>
      <h2>Window &amp; desk geometry</h2>
      ${numberField("Window azimuth (°)", "windowAzimuthDeg", 0.1, store)}
      ${numberField("Window sill height (m)", "windowSillHeight", 0.1, store)}
      ${numberField("Window top height (m)", "windowTopHeight", 0.1, store)}
      ${numberField("Window width (m)", "windowWidth", 0.1, store)}
      ${numberField("Eye height (m)", "eyeHeight", 0.05, store)}
      ${numberField("Distance to window (m)", "distanceToWindow", 0.1, store)}
    </section>

    <section>
      <h2>Date &amp; time</h2>
      <div class="field">
        <label for="f-date">Date</label>
        <input id="f-date" type="date" />
      </div>
      <div class="field">
        <input id="f-dayofyear" type="range" min="1" max="365" step="1" />
      </div>
      <div class="field">
        <label id="f-dayofyear-label" style="color:#c3c9db"></label>
      </div>
      <div class="field">
        <input id="f-time" type="range" min="0" max="1439" step="1" />
        <select id="f-time-slider-ref" style="background:#0b1020; color:#e6e8ef; border:1px solid #334165; border-radius:4px; padding:6px;">
          <option value="local" selected>Local</option>
          <option value="utc">UTC</option>
        </select>
      </div>
      <div class="field">
        <label id="f-time-label" style="color:#c3c9db"></label>
      </div>
    </section>

    <section>
      <h2>Track the sun</h2>
      <p class="subtitle" style="margin-bottom: 10px;">
        Records every sun position visited — by playback or by dragging a
        slider above — into a trail in the 3D view, until cleared.
      </p>
      <div class="field">
        <button id="f-track" type="button" style="width: auto; flex: 1 1 auto;">Start tracking</button>
        <button id="f-track-clear" type="button" style="width: auto;">Clear track</button>
      </div>
    </section>

    <section>
      <h2>Watch the year play out</h2>
      <p class="subtitle" id="f-mode-caption" style="margin-bottom: 10px;"></p>
      <div class="field">
        <label for="f-mode">Mode</label>
        <select id="f-mode" style="background:#0b1020; color:#e6e8ef; border:1px solid #334165; border-radius:4px; padding:6px;">
          <option value="continuous" selected>Full day sweep</option>
          <option value="fixedTime">Fixed time each day</option>
          <option value="glareOnset">Daily glare onset</option>
        </select>
      </div>
      <div class="field" id="f-fixedtime-row" hidden>
        <label for="f-fixedtime">Time of day</label>
        <input id="f-fixedtime" type="time" step="60" value="17:00" />
      </div>
      <p class="subtitle" id="f-timeref-note" style="margin-bottom: 10px;"></p>
      <div class="field">
        <button id="f-play" type="button" style="width: auto; flex: 1 1 auto;">▶ Play</button>
        <select id="f-speed" style="background:#0b1020; color:#e6e8ef; border:1px solid #334165; border-radius:4px; padding:6px;">
          <option value="0.3">Slow</option>
          <option value="1.5" selected>Normal</option>
          <option value="6">Fast</option>
          <option value="20">Very fast</option>
        </select>
      </div>
    </section>

    <section>
      <h2>Current state</h2>
      <div class="readout" id="readout"></div>
    </section>

    <section>
      <h2>Today's glare window</h2>
      <div class="readout" id="today-readout"></div>
    </section>
  `;

  // Wire config number inputs.
  container.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key as keyof SunnyConfig;
      const value = parseFloat(input.value);
      if (!Number.isNaN(value)) {
        store.updateConfig({ [key]: value } as Partial<SunnyConfig>);
      }
    });
  });

  // Wire config boolean (checkbox) inputs.
  container.querySelectorAll<HTMLInputElement>("input[data-bool-key]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.boolKey as keyof SunnyConfig;
      store.updateConfig({ [key]: input.checked } as Partial<SunnyConfig>);
    });
  });

  const themeSelect = container.querySelector("#f-theme") as HTMLSelectElement;
  themeSelect.value = theme.mode;
  themeSelect.addEventListener("change", () => {
    theme.setMode(themeSelect.value as ThemeMode);
  });

  const dateInput = container.querySelector("#f-date") as HTMLInputElement;
  const dayOfYearInput = container.querySelector("#f-dayofyear") as HTMLInputElement;
  const dayOfYearLabel = container.querySelector("#f-dayofyear-label") as HTMLElement;
  const timeInput = container.querySelector("#f-time") as HTMLInputElement;
  const timeLabel = container.querySelector("#f-time-label") as HTMLElement;
  const timeRefSelect = container.querySelector("#f-time-slider-ref") as HTMLSelectElement;

  // One shared Local/UTC setting — it's the single source of truth for both
  // how this time slider reads/writes and how day-stepping playback jumps
  // between days (playback.timeReference). Two separate controls for what
  // looks like the same setting is exactly the kind of thing that gets one
  // of them set and the other missed.
  function currentTimeRef(): TimeReference {
    return playback.timeReference;
  }

  function setDateTimeInputsFrom(date: Date) {
    const ref = currentTimeRef();
    const y = ref === "utc" ? date.getUTCFullYear() : date.getFullYear();
    const m = String((ref === "utc" ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, "0");
    const d = String(ref === "utc" ? date.getUTCDate() : date.getDate()).padStart(2, "0");
    dateInput.value = `${y}-${m}-${d}`;

    const yearLength = isLeapYear(y) ? 366 : 365;
    const doy = dayOfYear(date, ref);
    dayOfYearInput.max = String(yearLength);
    dayOfYearInput.value = String(doy);
    dayOfYearLabel.textContent = `Day ${doy} of ${yearLength}`;

    if (ref === "utc") {
      timeInput.value = String(date.getUTCHours() * 60 + date.getUTCMinutes());
      timeLabel.textContent = `${fmtHM_UTC(date)} UTC`;
    } else {
      timeInput.value = String(date.getHours() * 60 + date.getMinutes());
      timeLabel.textContent = fmtHM(date);
    }
  }

  dateInput.addEventListener("change", () => {
    playback.pause();
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const current = store.get().date;
    const next = new Date(current);
    if (currentTimeRef() === "utc") {
      next.setUTCFullYear(y, m - 1, d);
    } else {
      next.setFullYear(y, m - 1, d);
    }
    store.update({ date: next });
  });

  dayOfYearInput.addEventListener("input", () => {
    playback.pause();
    const day = parseInt(dayOfYearInput.value, 10);
    const next = withDayOfYear(store.get().date, day, currentTimeRef());
    store.update({ date: next });
  });

  timeInput.addEventListener("input", () => {
    playback.pause();
    const minutes = parseInt(timeInput.value, 10);
    const current = store.get().date;
    const next = new Date(current);
    if (currentTimeRef() === "utc") {
      next.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    } else {
      next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    }
    store.update({ date: next });
  });

  timeRefSelect.addEventListener("change", () => {
    playback.setTimeReference(timeRefSelect.value as TimeReference);
    setDateTimeInputsFrom(store.get().date);
  });

  const playBtn = container.querySelector("#f-play") as HTMLButtonElement;
  const speedSelect = container.querySelector("#f-speed") as HTMLSelectElement;
  const modeSelect = container.querySelector("#f-mode") as HTMLSelectElement;
  const modeCaption = container.querySelector("#f-mode-caption") as HTMLElement;
  const fixedTimeRow = container.querySelector("#f-fixedtime-row") as HTMLElement;
  const fixedTimeInput = container.querySelector("#f-fixedtime") as HTMLInputElement;
  const timeRefNote = container.querySelector("#f-timeref-note") as HTMLElement;

  const MODE_CAPTIONS: Record<PlaybackMode, string> = {
    continuous:
      "Steps through the year in real time (night included — the sun just goes dark while it's down), so you can watch its daily path rise, fall, and swing in and out of the window.",
    fixedTime:
      "Jumps day by day, always at the same clock time, so you can watch how the sun's position at that one moment shifts across the year.",
    glareOnset:
      "Jumps day by day, landing each time on the moment the glare first starts that day (skipping any day with none).",
  };

  function updateModeVisibility(mode: PlaybackMode) {
    modeCaption.textContent = MODE_CAPTIONS[mode];
    fixedTimeRow.hidden = mode !== "fixedTime";
    timeRefNote.hidden = mode === "continuous";
    timeRefNote.textContent =
      "Uses the Local/UTC setting next to the time slider above: Local jumps an hour at DST transitions (matching your clock); UTC steps by a constant 24h with no jump.";
  }
  updateModeVisibility(playback.mode);

  playBtn.addEventListener("click", () => playback.toggle());
  speedSelect.addEventListener("change", () => {
    playback.daysPerSecond = parseFloat(speedSelect.value);
  });
  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value as PlaybackMode;
    playback.setMode(mode);
    updateModeVisibility(mode);
  });
  fixedTimeInput.addEventListener("change", () => {
    const [h, m] = fixedTimeInput.value.split(":").map(Number);
    playback.setFixedTimeMinutes(h * 60 + m);
  });
  playback.onPlayStateChange((playing) => {
    playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
  });

  const trackBtn = container.querySelector("#f-track") as HTMLButtonElement;
  const trackClearBtn = container.querySelector("#f-track-clear") as HTMLButtonElement;

  trackBtn.addEventListener("click", () => {
    if (scene.isTracking) {
      scene.stopTracking();
    } else {
      scene.startTracking(store.get());
    }
    trackBtn.textContent = scene.isTracking ? "Stop tracking" : "Start tracking";
    trackBtn.classList.toggle("active", scene.isTracking);
  });
  trackClearBtn.addEventListener("click", () => scene.clearTrack());

  const readout = container.querySelector("#readout") as HTMLElement;
  const todayReadout = container.querySelector("#today-readout") as HTMLElement;

  let lastDayKey = "";

  store.subscribe((state) => {
    setDateTimeInputsFrom(state.date);

    const { azimuthDeg, elevationDeg } = getSunPosition(state.date, state.config);
    const glare = isGlare(azimuthDeg, elevationDeg, state.config);
    const deltaAz = ((((azimuthDeg - state.config.windowAzimuthDeg) % 360) + 540) % 360) - 180;
    const bounds = glareElevationBounds(deltaAz, state.config);

    readout.innerHTML = `
      Sun azimuth: <strong>${azimuthDeg.toFixed(1)}°</strong><br>
      Sun elevation: <strong>${elevationDeg.toFixed(1)}°</strong><br>
      Offset from window-facing: <strong>${deltaAz.toFixed(1)}°</strong><br>
      Glare right now: <span class="${glare ? "glare-yes" : "glare-no"}">${glare ? "YES" : "no"}</span><br>
      ${bounds ? `Elevation band for glare at this azimuth: ${Math.max(0, bounds.minElevationDeg).toFixed(1)}°&ndash;${bounds.maxElevationDeg.toFixed(1)}°` : "Sun is behind the window plane (no glare possible)"}
    `;

    const dayKey = state.date.toDateString() + JSON.stringify(state.config);
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      const intervals = findGlareIntervals(state.date, state.config, 1);
      todayReadout.innerHTML =
        intervals.length === 0
          ? "No glare today with the current geometry."
          : intervals
              .map((iv) => `${fmtHM(iv.start)}&ndash;${fmtHM(iv.end)}`)
              .join("<br>");
    }
  });
}
