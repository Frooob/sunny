import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AppState } from "./state.ts";
import { getSunPosition } from "./solar.ts";
import { isGlare } from "./geometry.ts";
import type { DayArcPoint } from "./dayarc.ts";

const SUN_DISTANCE = 16;
const WINDOW_WIDTH = 3;

/** Compass azimuth (deg, 0=N clockwise) -> horizontal unit vector, north=-Z, east=+X. */
function azToHorizontal(azDeg: number): THREE.Vector2 {
  const rad = (azDeg * Math.PI) / 180;
  return new THREE.Vector2(Math.sin(rad), -Math.cos(rad));
}

function sunWorldPosition(azimuthDeg: number, elevationDeg: number, distance: number): THREE.Vector3 {
  const elRad = (elevationDeg * Math.PI) / 180;
  const dir = azToHorizontal(azimuthDeg).multiplyScalar(Math.cos(elRad));
  return new THREE.Vector3(dir.x * distance, Math.sin(elRad) * distance, dir.y * distance);
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
  private windowMesh: THREE.Mesh;
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
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4f5a });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), wallMat);
    wall.position.y = 1.6;
    this.windowGroup.add(wall);

    this.windowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WINDOW_WIDTH, 1),
      new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    this.windowGroup.add(this.windowMesh);

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

    const windowHeight = Math.max(0.05, config.windowTopHeight - config.windowSillHeight);
    this.windowMesh.geometry.dispose();
    this.windowMesh.geometry = new THREE.PlaneGeometry(WINDOW_WIDTH, windowHeight);
    this.windowMesh.position.y =
      config.windowSillHeight + windowHeight / 2;

    // Sun position for the selected date/time.
    const { azimuthDeg, elevationDeg } = getSunPosition(
      date,
      config.latitude,
      config.longitude,
    );
    const sunPos = sunWorldPosition(azimuthDeg, elevationDeg, SUN_DISTANCE);
    this.sunMesh.position.copy(sunPos);
    this.sunMesh.visible = elevationDeg > -5;
    this.sunLight.position.copy(sunPos);
    this.sunLight.target.position.set(0, config.eyeHeight, 0);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.intensity = elevationDeg > 0 ? 1.2 : 0.1;

    const glare = isGlare(azimuthDeg, elevationDeg, config);

    // Ray from the sun through the eye, extended a bit further into the room.
    const eyePos = new THREE.Vector3(0, config.eyeHeight, 0);
    const beyond = eyePos
      .clone()
      .add(eyePos.clone().sub(sunPos).normalize().multiplyScalar(0.8));
    this.rayLine.geometry.setFromPoints([sunPos, beyond]);
    (this.rayLine.material as THREE.LineBasicMaterial).color.set(
      glare ? 0xff3333 : 0x888888,
    );

    (this.windowMesh.material as THREE.MeshStandardMaterial).color.set(
      glare ? 0xff5533 : 0x3b82f6,
    );
    (this.windowMesh.material as THREE.MeshStandardMaterial).opacity = glare
      ? 0.85
      : 0.55;
  }

  /** Draws the current day's full sun path across the sky, with the glare portion highlighted in red. */
  setDayArc(points: DayArcPoint[]) {
    for (const child of this.dayArcGroup.children) {
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
    this.dayArcGroup.clear();

    if (points.length < 2) return;

    const positions = points.map((p) => sunWorldPosition(p.azimuthDeg, p.elevationDeg, SUN_DISTANCE));

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
