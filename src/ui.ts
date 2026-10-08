import type { Store } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { glareElevationBounds, isGlare } from "./geometry.ts";
import { findGlareIntervals } from "./dataset.ts";

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

export function mountControlPanel(container: HTMLElement, store: Store) {
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
    const [y, m, d] = dateInput.value.split("-").map(Number);
    const current = store.get().date;
    const next = new Date(current);
    next.setFullYear(y, m - 1, d);
    store.update({ date: next });
  });

  timeInput.addEventListener("input", () => {
    const minutes = parseInt(timeInput.value, 10);
    const current = store.get().date;
    const next = new Date(current);
    next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    store.update({ date: next });
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
