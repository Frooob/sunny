import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";

export type ThemeMode = "dark" | "light" | "dynamic";

export interface Palette {
  bg: string;
  panelBg: string;
  panelBorder: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  inputBg: string;
  inputBorder: string;
  readoutBg: string;
  readoutBorder: string;
  buttonBg: string;
  buttonBorder: string;
  buttonHoverBg: string;
  overlayBg: string;
  overlayBorder: string;
  chartSurface: string;
  chartSeries1: string;
  chartTextPrimary: string;
  chartTextSecondary: string;
  chartTextMuted: string;
  chartGridline: string;
  chartBaseline: string;
  statusGood: string;
  statusBad: string;
}

export interface ScenePalette {
  background: number;
  floor: number;
  gridMain: number;
  gridSub: number;
  wall: number;
  ambientColor: number;
  ambientIntensity: number;
}

// The current look, unchanged — this is "dark mode" from here on.
const DARK: Palette = {
  bg: "#0b1020",
  panelBg: "#11182b",
  panelBorder: "#22304a",
  text: "#e6e8ef",
  textMuted: "#8891a7",
  textSubtle: "#c3c9db",
  inputBg: "#0b1020",
  inputBorder: "#334165",
  readoutBg: "#0b1020",
  readoutBorder: "#334165",
  buttonBg: "#2a3a66",
  buttonBorder: "#3a4a7a",
  buttonHoverBg: "#344a86",
  overlayBg: "rgba(11, 16, 32, 0.7)",
  overlayBorder: "#334165",
  chartSurface: "#1a1a19",
  chartSeries1: "#3987e5",
  chartTextPrimary: "#ffffff",
  chartTextSecondary: "#c3c2b7",
  chartTextMuted: "#898781",
  chartGridline: "#2c2c2a",
  chartBaseline: "#383835",
  statusGood: "#6bffb0",
  statusBad: "#ff6b5e",
};

const LIGHT: Palette = {
  bg: "#eef1f6",
  panelBg: "#ffffff",
  panelBorder: "#d7dce6",
  text: "#1a1f2b",
  textMuted: "#5b6478",
  textSubtle: "#3c4453",
  inputBg: "#f5f7fa",
  inputBorder: "#c3cada",
  readoutBg: "#f5f7fa",
  readoutBorder: "#c3cada",
  buttonBg: "#dde4f0",
  buttonBorder: "#b7c1d6",
  buttonHoverBg: "#ccd6ea",
  overlayBg: "rgba(255, 255, 255, 0.78)",
  overlayBorder: "#c3cada",
  chartSurface: "#fcfcfb",
  chartSeries1: "#2a78d6",
  chartTextPrimary: "#0b0b0b",
  chartTextSecondary: "#52514e",
  chartTextMuted: "#898781",
  chartGridline: "#e1e0d9",
  chartBaseline: "#c3c2b7",
  statusGood: "#0f8a4b",
  statusBad: "#c23f33",
};

const DARK_SCENE: ScenePalette = {
  background: 0x0b1020,
  floor: 0x2a2f3a,
  gridMain: 0x445566,
  gridSub: 0x334455,
  wall: 0x4a4f5a,
  ambientColor: 0x667799,
  ambientIntensity: 0.6,
};

const LIGHT_SCENE: ScenePalette = {
  background: 0xbfe0f2,
  floor: 0xd7dde6,
  gridMain: 0x8a95ab,
  gridSub: 0xa9b2c4,
  wall: 0xc7ccd6,
  ambientColor: 0xffffff,
  ambientIntensity: 1.15,
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp255(x: number): number {
  return Math.round(Math.max(0, Math.min(255, x)));
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number) => clamp255(x).toString(16).padStart(2, "0");
  return `#${c(ar + (br - ar) * t)}${c(ag + (bg - ag) * t)}${c(ab + (bb - ab) * t)}`;
}

function lerpRgba(a: string, b: string, t: number): string {
  const parse = (s: string) => s.match(/[\d.]+/g)!.map(Number);
  const [ar, ag, ab, aa] = parse(a);
  const [br, bg, bb, ba] = parse(b);
  const n = (x: number, y: number) => x + (y - x) * t;
  return `rgba(${clamp255(n(ar, br))}, ${clamp255(n(ag, bg))}, ${clamp255(n(ab, bb))}, ${n(aa, ba).toFixed(2)})`;
}

function lerpColorNum(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (clamp255(ar + (br - ar) * t) << 16) | (clamp255(ag + (bg - ag) * t) << 8) | clamp255(ab + (bb - ab) * t);
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Backgrounds/structure interpolate smoothly with `t` for a real sense of
 * "brighter/darker" — but text snaps to whichever endpoint is nearer
 * (never blends) so contrast against the continuously-lightening
 * background never passes through a muddy, low-contrast middle.
 */
export function paletteAt(t: number): Palette {
  const nearer = t < 0.5 ? DARK : LIGHT;
  return {
    bg: lerpHex(DARK.bg, LIGHT.bg, t),
    panelBg: lerpHex(DARK.panelBg, LIGHT.panelBg, t),
    panelBorder: lerpHex(DARK.panelBorder, LIGHT.panelBorder, t),
    inputBg: lerpHex(DARK.inputBg, LIGHT.inputBg, t),
    inputBorder: lerpHex(DARK.inputBorder, LIGHT.inputBorder, t),
    readoutBg: lerpHex(DARK.readoutBg, LIGHT.readoutBg, t),
    readoutBorder: lerpHex(DARK.readoutBorder, LIGHT.readoutBorder, t),
    buttonBg: lerpHex(DARK.buttonBg, LIGHT.buttonBg, t),
    buttonBorder: lerpHex(DARK.buttonBorder, LIGHT.buttonBorder, t),
    buttonHoverBg: lerpHex(DARK.buttonHoverBg, LIGHT.buttonHoverBg, t),
    overlayBg: lerpRgba(DARK.overlayBg, LIGHT.overlayBg, t),
    overlayBorder: lerpHex(DARK.overlayBorder, LIGHT.overlayBorder, t),
    chartSurface: lerpHex(DARK.chartSurface, LIGHT.chartSurface, t),
    chartSeries1: lerpHex(DARK.chartSeries1, LIGHT.chartSeries1, t),
    text: nearer.text,
    textMuted: nearer.textMuted,
    textSubtle: nearer.textSubtle,
    chartTextPrimary: nearer.chartTextPrimary,
    chartTextSecondary: nearer.chartTextSecondary,
    chartTextMuted: nearer.chartTextMuted,
    chartGridline: nearer.chartGridline,
    chartBaseline: nearer.chartBaseline,
    statusGood: nearer.statusGood,
    statusBad: nearer.statusBad,
  };
}

export function scenePaletteAt(t: number): ScenePalette {
  return {
    background: lerpColorNum(DARK_SCENE.background, LIGHT_SCENE.background, t),
    floor: lerpColorNum(DARK_SCENE.floor, LIGHT_SCENE.floor, t),
    gridMain: lerpColorNum(DARK_SCENE.gridMain, LIGHT_SCENE.gridMain, t),
    gridSub: lerpColorNum(DARK_SCENE.gridSub, LIGHT_SCENE.gridSub, t),
    wall: lerpColorNum(DARK_SCENE.wall, LIGHT_SCENE.wall, t),
    ambientColor: lerpColorNum(DARK_SCENE.ambientColor, LIGHT_SCENE.ambientColor, t),
    ambientIntensity: lerpNum(DARK_SCENE.ambientIntensity, LIGHT_SCENE.ambientIntensity, t),
  };
}

export function applyPaletteToDocument(p: Palette) {
  const s = document.documentElement.style;
  s.setProperty("--bg", p.bg);
  s.setProperty("--panel-bg", p.panelBg);
  s.setProperty("--panel-border", p.panelBorder);
  s.setProperty("--text", p.text);
  s.setProperty("--text-muted", p.textMuted);
  s.setProperty("--text-subtle", p.textSubtle);
  s.setProperty("--input-bg", p.inputBg);
  s.setProperty("--input-border", p.inputBorder);
  s.setProperty("--readout-bg", p.readoutBg);
  s.setProperty("--readout-border", p.readoutBorder);
  s.setProperty("--button-bg", p.buttonBg);
  s.setProperty("--button-border", p.buttonBorder);
  s.setProperty("--button-hover-bg", p.buttonHoverBg);
  s.setProperty("--overlay-bg", p.overlayBg);
  s.setProperty("--overlay-border", p.overlayBorder);
  s.setProperty("--chart-surface", p.chartSurface);
  s.setProperty("--chart-series-1", p.chartSeries1);
  s.setProperty("--chart-text-primary", p.chartTextPrimary);
  s.setProperty("--chart-text-secondary", p.chartTextSecondary);
  s.setProperty("--chart-text-muted", p.chartTextMuted);
  s.setProperty("--chart-gridline", p.chartGridline);
  s.setProperty("--chart-baseline", p.chartBaseline);
  s.setProperty("--status-good", p.statusGood);
  s.setProperty("--status-bad", p.statusBad);
}

/** Simple pub-sub so the UI can react when the mode changes (dark/light are instant; dynamic needs the date to drive it). */
export class ThemeController {
  mode: ThemeMode = "dark";
  private listeners: Array<() => void> = [];

  setMode(mode: ThemeMode) {
    this.mode = mode;
    for (const l of this.listeners) l();
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }
}

/**
 * How bright "dynamic" mode should be right now: 0 (full dark, sun down)
 * to 1 (full bright, at today's solar noon). Normalized against *this
 * day's own* peak elevation (cached per day+location) rather than a fixed
 * elevation threshold — a low winter sun in northern Europe still reaches
 * full brightness at its own local noon, same as a high midday sun near
 * the equator. Below the horizon is always 0, regardless of location.
 */
export class DynamicBrightness {
  private cacheKey = "";
  private peakElevationDeg = 0;

  fractionFor(date: Date, config: SunnyConfig): number {
    // Keyed on the tilt/eccentricity toggles too — disabling either changes
    // the whole year's elevation pattern, not just a given day's.
    const key = `${date.toDateString()}|${config.latitude}|${config.longitude}|${config.tiltEnabled}|${config.eccentricityEnabled}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      // suncalc's getTimes() (the previous source of solar noon) has real
      // Earth physics hardcoded, so it can't respect these toggles — scan
      // the day instead, using the same toggle-aware getSunPosition
      // everything else in the app uses.
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      let peak = -90;
      for (let i = 0; i <= 24 * 4; i++) {
        const t = new Date(dayStart.getTime() + i * 15 * 60_000);
        const el = getSunPosition(t, config).elevationDeg;
        if (el > peak) peak = el;
      }
      this.peakElevationDeg = peak;
    }

    if (this.peakElevationDeg <= 0) return 0; // polar night: sun never really rises

    const { elevationDeg } = getSunPosition(date, config);
    if (elevationDeg <= 0) return 0;

    return Math.max(0, Math.min(1, elevationDeg / this.peakElevationDeg));
  }
}
