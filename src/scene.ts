import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AppState } from "./state.ts";
import type { SunnyConfig } from "./config.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";
import type { DayArcPoint } from "./dayarc.ts";

const SUN_DISTANCE = 16;
const PLATFORM_SIZE = 14; // matches the floor/grid extent — the wall runs edge to edge of it
const WALL_MIN_HEIGHT = 3.4;
const WALL_TOP_MARGIN = 0.6; // headroom kept above the window top, whatever it's configured to

/** Compass azimuth (deg, 0=N clockwise) -> horizontal unit vector, north=-Z, east=+X. */
function azToHorizontal(azDeg: number): THREE.Vector2 {
  const rad = (azDeg * Math.PI) / 180;
  return new THREE.Vector2(Math.sin(rad), -Math.cos(rad));
}

/** World position at the given azimuth/elevation, `distance` away from `anchor` (default: world origin). */
function sunWorldPosition(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
  anchor = new THREE.Vector3(),
): THREE.Vector3 {
  const elRad = (elevationDeg * Math.PI) / 180;
  const dir = azToHorizontal(azimuthDeg).multiplyScalar(Math.cos(elRad));
  return new THREE.Vector3(dir.x * distance, Math.sin(elRad) * distance, dir.y * distance).add(anchor);
}

/**
 * Where the sun's ray actually crosses the window's (infinite) wall plane,
 * in world space — not generally the same point as "straight ahead of the
 * eye," since the sun is usually off to one side of the window's facing
 * direction. Returns null when the sun is behind the wall (can't shine
 * through a flat window from that side regardless of elevation) — same
 * condition as geometry.ts's glareElevationBounds.
 */
function windowCrossingPoint(
  sunAzimuthDeg: number,
  sunElevationDeg: number,
  config: SunnyConfig,
): THREE.Vector3 | null {
  const deltaAzRad = ((sunAzimuthDeg - config.windowAzimuthDeg) * Math.PI) / 180;
  const cosDelta = Math.cos(deltaAzRad);
  if (cosDelta <= 0) return null;

  const t = config.distanceToWindow / cosDelta; // slant distance from the eye, along the sun's azimuth
  const horiz = azToHorizontal(sunAzimuthDeg).multiplyScalar(t);
  const elRad = (sunElevationDeg * Math.PI) / 180;
  const height = config.eyeHeight + t * Math.tan(elRad);
  return new THREE.Vector3(horiz.x, height, horiz.y);
}

/** Splits a day's sun-position samples into contiguous [start,end) runs sharing the same glare state. */
function glareRuns(points: DayArcPoint[]): { start: number; end: number; glare: boolean }[] {
  const runs: { start: number; end: number; glare: boolean }[] = [];
  for (let i = 0; i < points.length; i++) {
    const glare = points[i].glare;
    if (runs.length > 0 && runs[runs.length - 1].glare === glare) {
      runs[runs.length - 1].end = i + 1;
    } else {
      runs.push({ start: i, end: i + 1, glare });
    }
  }
  return runs;
}

export class SunnyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private sunMesh: THREE.Mesh;
  private sunLight: THREE.DirectionalLight;
  private rayLine: THREE.Line;
  private wallMaterial: THREE.MeshStandardMaterial;
  private wallGroup = new THREE.Group();
  private lastWallShapeKey = "";
  private windowGroup = new THREE.Group();
  private eyeMesh: THREE.Mesh;
  private dayArcGroup = new THREE.Group();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0b1020);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 200);
    this.camera.position.set(14, 8, 2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 60;

    this.scene.add(new THREE.AmbientLight(0x667799, 0.6));

    this.sunLight = new THREE.DirectionalLight(0xfff2cc, 1.2);
    this.scene.add(this.sunLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3a }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(14, 14, 0x445566, 0x334455);
    this.scene.add(grid);

    this.scene.add(this.windowGroup);
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4f5a,
      side: THREE.DoubleSide,
    });
    this.windowGroup.add(this.wallGroup);

    this.eyeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xff8800 }),
    );
    this.scene.add(this.eyeMesh);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdd55 }),
    );
    this.scene.add(this.sunMesh);

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.rayLine = new THREE.Line(
      rayGeometry,
      new THREE.LineBasicMaterial({ color: 0x888888 }),
    );
    this.scene.add(this.rayLine);

    this.scene.add(this.dayArcGroup);

    this.resize(container);
    new ResizeObserver(() => this.resize(container)).observe(container);

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize(container: HTMLElement) {
    const { clientWidth: w, clientHeight: h } = container;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(state: AppState) {
    const { config, date } = state;

    // Position the eye and window group according to current config.
    this.eyeMesh.position.set(0, config.eyeHeight, 0);

    const dir = azToHorizontal(config.windowAzimuthDeg);
    const wx = dir.x * config.distanceToWindow;
    const wz = dir.y * config.distanceToWindow;
    this.windowGroup.position.set(wx, 0, wz);
    // Face the group so its local +Z plane normal matches the outward azimuth.
    this.windowGroup.rotation.y = Math.atan2(dir.x, -dir.y);

    this.rebuildWallIfNeeded(config);

    const eyePos = new THREE.Vector3(0, config.eyeHeight, 0);

    // Sun position for the selected date/time, anchored at the eye so it
    // sits exactly along the (azimuth, elevation) line of sight from there.
    const { azimuthDeg, elevationDeg } = getSunPosition(
      date,
      config.latitude,
      config.longitude,
    );
    const sunPos = sunWorldPosition(azimuthDeg, elevationDeg, SUN_DISTANCE, eyePos);
    this.sunMesh.position.copy(sunPos);
    this.sunMesh.visible = elevationDeg > -5;
    this.sunLight.position.copy(sunPos);
    this.sunLight.target.position.copy(eyePos);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = elevationDeg > 0 ? 1.2 : 0.1;

    const glare = isGlare(azimuthDeg, elevationDeg, config);

    // Ray from the sun through the actual point where it crosses the
    // window plane (not just "straight at the eye" — the sun is usually
    // off to one side), through the eye, and a bit further into the room.
    const crossing = windowCrossingPoint(azimuthDeg, elevationDeg, config);
    const beyond = eyePos
      .clone()
      .add(eyePos.clone().sub(sunPos).normalize().multiplyScalar(0.8));
    // setFromPoints() on an existing geometry reuses its buffer in place
    // rather than resizing it — since the point count here varies (2 or 3
    // depending on whether `crossing` exists), reusing it silently drops
    // the extra point once it grows. Replace the geometry outright instead.
    this.rayLine.geometry.dispose();
    this.rayLine.geometry = new THREE.BufferGeometry().setFromPoints(
      crossing ? [sunPos, crossing, beyond] : [sunPos, beyond],
    );
    (this.rayLine.material as THREE.LineBasicMaterial).color.set(
      glare ? 0xff3333 : 0x888888,
    );
  }

  /**
   * Builds the wall as solid panels around a real rectangular opening (the
   * window itself is left empty — nothing drawn there — so the sun is
   * actually visible through it rather than behind a colored pane). Only
   * rebuilds when the opening's shape actually changed, since this runs on
   * every store update (i.e. every animation frame during playback).
   */
  private rebuildWallIfNeeded(config: SunnyConfig) {
    const key = `${config.windowWidth}|${config.windowTopHeight}|${config.windowSillHeight}`;
    if (key === this.lastWallShapeKey) return;
    this.lastWallShapeKey = key;

    for (const child of this.wallGroup.children) {
      (child as THREE.Mesh).geometry.dispose();
    }
    this.wallGroup.clear();

    const wallTop = Math.max(WALL_MIN_HEIGHT, config.windowTopHeight + WALL_TOP_MARGIN);
    const halfPlatform = PLATFORM_SIZE / 2;
    const halfWindow = config.windowWidth / 2;

    const addPanel = (width: number, height: number, cx: number, cy: number) => {
      if (width <= 0.01 || height <= 0.01) return;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.wallMaterial);
      mesh.position.set(cx, cy, 0);
      this.wallGroup.add(mesh);
    };

    const sideWidth = halfPlatform - halfWindow;
    addPanel(sideWidth, wallTop, -(halfWindow + sideWidth / 2), wallTop / 2); // left of the window
    addPanel(sideWidth, wallTop, halfWindow + sideWidth / 2, wallTop / 2); // right of the window
    addPanel(config.windowWidth, wallTop - config.windowTopHeight, 0, config.windowTopHeight + (wallTop - config.windowTopHeight) / 2); // header above
    addPanel(config.windowWidth, config.windowSillHeight, 0, config.windowSillHeight / 2); // sill below, if any
  }

  /** Draws the current day's full sun path across the sky, with the glare portion highlighted in red. */
  setDayArc(points: DayArcPoint[], eyeHeight: number) {
    for (const child of this.dayArcGroup.children) {
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    this.dayArcGroup.clear();

    if (points.length < 2) return;

    const eyePos = new THREE.Vector3(0, eyeHeight, 0);
    const positions = points.map((p) => sunWorldPosition(p.azimuthDeg, p.elevationDeg, SUN_DISTANCE, eyePos));

    for (const run of glareRuns(points)) {
      const segment = positions.slice(run.start, run.end);
      if (segment.length < 2) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(segment),
        new THREE.LineBasicMaterial({
          color: run.glare ? 0xff3333 : 0xffdd55,
          transparent: true,
          opacity: run.glare ? 0.95 : 0.35,
        }),
      );
      this.dayArcGroup.add(line);
    }
  }
}
