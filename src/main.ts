import "./style.css";
import { createDefaultStore } from "./state.ts";
import { SunnyScene } from "./scene.ts";
import { mountControlPanel } from "./ui.ts";
import { mountYearView } from "./yearview.ts";
import { Playback } from "./playback.ts";
import { computeDayArc } from "./dayarc.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";
import { ThemeController, DynamicBrightness, paletteAt, applyPaletteToDocument } from "./theme.ts";

const store = createDefaultStore();
const playback = new Playback(store);

const sceneContainer = document.querySelector<HTMLDivElement>("#scene-container")!;
const scene = new SunnyScene(sceneContainer);
store.subscribe((state) => scene.update(state));

// Theme: dark (default, unchanged look) / light (bright) / dynamic (follows
// how high the sun is right now, normalized to *today's own* peak so a low
// winter sun at high latitude still reaches full brightness at its own
// local noon — see theme.ts for why).
const theme = new ThemeController();
const dynamicBrightness = new DynamicBrightness();

function updateTheme() {
  let t: number;
  if (theme.mode === "dark") t = 0;
  else if (theme.mode === "light") t = 1;
  else {
    const { date, config } = store.get();
    t = dynamicBrightness.fractionFor(date, config);
  }
  applyPaletteToDocument(paletteAt(t));
  scene.setBrightness(t);
}

store.subscribe(updateTheme);
theme.onChange(updateTheme);

// Recompute the day's sun-path arc only when the calendar day (or the
// geometry it depends on) actually changes — not on every animation frame.
let lastArcKey = "";
store.subscribe((state) => {
  const key = `${state.date.toDateString()}|${JSON.stringify(state.config)}`;
  if (key !== lastArcKey) {
    lastArcKey = key;
    scene.setDayArc(computeDayArc(state.date, state.config), state.config.eyeHeight);
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

const povBtn = document.querySelector<HTMLButtonElement>("#pov-toggle")!;
povBtn.addEventListener("click", () => {
  if (scene.isInEyeView) {
    scene.exitEyeView();
  } else {
    scene.enterEyeView(store.get().config);
  }
  povBtn.textContent = scene.isInEyeView ? "Back to overview" : "View from desk";
  povBtn.classList.toggle("active", scene.isInEyeView);
});

const panel = document.querySelector<HTMLElement>("#panel")!;
mountControlPanel(panel, store, playback, scene, theme);

const yearSection = document.querySelector<HTMLElement>("#year-section")!;
mountYearView(yearSection, store);

// Collapsible sidebar: starts closed on narrow (mobile) viewports, where
// the fixed-width panel would otherwise eat the whole screen, and open on
// wider ones, matching the previous always-visible behavior.
const topRow = document.querySelector<HTMLElement>("#top-row")!;
const panelToggle = document.querySelector<HTMLButtonElement>("#panel-toggle")!;

function setPanelCollapsed(collapsed: boolean) {
  topRow.classList.toggle("panel-collapsed", collapsed);
  panelToggle.textContent = collapsed ? "Settings" : "Close";
  panelToggle.classList.toggle("active", !collapsed);
}

setPanelCollapsed(window.matchMedia("(max-width: 760px)").matches);

panelToggle.addEventListener("click", () => {
  setPanelCollapsed(!topRow.classList.contains("panel-collapsed"));
});
