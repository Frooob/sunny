import type { Store } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { glareElevationBounds, isGlare } from "./geometry.ts";
import { findGlareIntervals } from "./dataset.ts";
import type { Playback, PlaybackMode } from "./playback.ts";
import type { TimeReference } from "./timeref.ts";

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

function fmtHM(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function mountControlPanel(container: HTMLElement, store: Store, playback: Playback) {
  container.innerHTML = `
    <h1>Sunny</h1>
    <p class="subtitle">Window-glare simulator</p>

    <section>
      <h2>Location</h2>
      ${numberField("Latitude", "latitude", 0.0001, store)}
      ${numberField("Longitude", "longitude", 0.0001, store)}
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
        <input id="f-time" type="range" min="0" max="1439" step="1" />
      </div>
      <div class="field">
        <label id="f-time-label" style="color:#c3c9db"></label>
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
      <div class="field" id="f-timeref-row" hidden>
        <label for="f-timeref">Time reference</label>
        <select id="f-timeref" style="background:#0b1020; color:#e6e8ef; border:1px solid #334165; border-radius:4px; padding:6px;">
          <option value="local" selected>Local (your clock)</option>
          <option value="utc">UTC (no DST jump)</option>
        </select>
      </div>
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

  const dateInput = container.querySelector("#f-date") as HTMLInputElement;
  const timeInput = container.querySelector("#f-time") as HTMLInputElement;
  const timeLabel = container.querySelector("#f-time-label") as HTMLElement;

  function setDateTimeInputsFrom(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dateInput.value = `${y}-${m}-${d}`;
    const minutes = date.getHours() * 60 + date.getMinutes();
    timeInput.value = String(minutes);
    timeLabel.textContent = fmtHM(date);
  }

  dateInput.addEventListener("change", () => {
    playback.pause();
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const current = store.get().date;
    const next = new Date(current);
    next.setFullYear(y, m - 1, d);
    store.update({ date: next });
  });

  timeInput.addEventListener("input", () => {
    playback.pause();
    const minutes = parseInt(timeInput.value, 10);
    const current = store.get().date;
    const next = new Date(current);
    next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    store.update({ date: next });
  });

  const playBtn = container.querySelector("#f-play") as HTMLButtonElement;
  const speedSelect = container.querySelector("#f-speed") as HTMLSelectElement;
  const modeSelect = container.querySelector("#f-mode") as HTMLSelectElement;
  const modeCaption = container.querySelector("#f-mode-caption") as HTMLElement;
  const fixedTimeRow = container.querySelector("#f-fixedtime-row") as HTMLElement;
  const fixedTimeInput = container.querySelector("#f-fixedtime") as HTMLInputElement;
  const timeRefRow = container.querySelector("#f-timeref-row") as HTMLElement;
  const timeRefSelect = container.querySelector("#f-timeref") as HTMLSelectElement;

  const MODE_CAPTIONS: Record<PlaybackMode, string> = {
    continuous:
      "Steps through the year, skipping nights, so you can watch the sun's daily path rise, fall, and swing in and out of the window.",
    fixedTime:
      "Jumps day by day, always at the same clock time, so you can watch how the sun's position at that one moment shifts across the year.",
    glareOnset:
      "Jumps day by day, landing each time on the moment the glare first starts that day (skipping any day with none).",
  };

  function updateModeVisibility(mode: PlaybackMode) {
    modeCaption.textContent = MODE_CAPTIONS[mode];
    fixedTimeRow.hidden = mode !== "fixedTime";
    timeRefRow.hidden = mode === "continuous";
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
  timeRefSelect.addEventListener("change", () => {
    playback.setTimeReference(timeRefSelect.value as TimeReference);
  });
  playback.onPlayStateChange((playing) => {
    playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
  });

  const readout = container.querySelector("#readout") as HTMLElement;
  const todayReadout = container.querySelector("#today-readout") as HTMLElement;

  let lastDayKey = "";

  store.subscribe((state) => {
    setDateTimeInputsFrom(state.date);

    const { azimuthDeg, elevationDeg } = getSunPosition(
      state.date,
      state.config.latitude,
      state.config.longitude,
    );
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
