import "./style.css";
import { createDefaultStore } from "./state.ts";
import { SunnyScene } from "./scene.ts";
import { mountControlPanel } from "./ui.ts";
import { mountYearView } from "./yearview.ts";
import { Playback } from "./playback.ts";
import { computeDayArc } from "./dayarc.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";

const store = createDefaultStore();
const playback = new Playback(store);

const sceneContainer = document.querySelector<HTMLDivElement>("#scene-container")!;
const scene = new SunnyScene(sceneContainer);
store.subscribe((state) => scene.update(state));

// Recompute the day's sun-path arc only when the calendar day (or the
// geometry it depends on) actually changes — not on every animation frame.
let lastArcKey = "";
store.subscribe((state) => {
  const key = `${state.date.toDateString()}|${JSON.stringify(state.config)}`;
  if (key !== lastArcKey) {
    lastArcKey = key;
    scene.setDayArc(computeDayArc(state.date, state.config));
  }
});

const overlay = document.querySelector<HTMLDivElement>("#scene-overlay")!;
store.subscribe((state) => {
  const { azimuthDeg, elevationDeg } = getSunPosition(
    state.date,
    state.config.latitude,
    state.config.longitude,
  );
  const glare = isGlare(azimuthDeg, elevationDeg, state.config);
  const dateStr = state.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = state.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  overlay.innerHTML = `
    <strong>${dateStr}</strong> &middot; ${timeStr}<br>
    <span class="${glare ? "glare-yes" : "glare-no"}">${glare ? "☀ Glare now" : "no glare"}</span>
  `;
});

const panel = document.querySelector<HTMLElement>("#panel")!;
mountControlPanel(panel, store, playback);

const yearSection = document.querySelector<HTMLElement>("#year-section")!;
mountYearView(yearSection, store);
