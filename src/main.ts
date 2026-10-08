import "./style.css";
import { createDefaultStore } from "./state.ts";
import { SunnyScene } from "./scene.ts";
import { mountControlPanel } from "./ui.ts";
import { mountYearView } from "./yearview.ts";

const store = createDefaultStore();

const sceneContainer = document.querySelector<HTMLDivElement>("#scene-container")!;
const scene = new SunnyScene(sceneContainer);
store.subscribe((state) => scene.update(state));

const panel = document.querySelector<HTMLElement>("#panel")!;
mountControlPanel(panel, store);

const yearSection = document.querySelector<HTMLElement>("#year-section")!;
mountYearView(yearSection, store);
