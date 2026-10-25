import { createKitMaterial } from '@qoti/art';
import { calendar, MAP_SIZE, TILE_FP, type SeatId } from '@qoti/sim';
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { CameraController, FOV } from '../input/camera';
import type { Mirror } from '../state/mirror';
import type { EntityPick, Ghost, RenderApi, TilePick } from './api';
import { fpToWorld, levelY } from './coords';
import { layerFactories, type GhostLayer, type PresenceLayer, type RenderLayer } from './layers';
import { lightingAt } from './lighting';
import { pickTileFromRay } from './picking';
import { QUALITY_PRESETS, type Quality } from './quality';

export type { Quality } from './quality';

/** Share of windows that light up at night (the rest of the town is asleep). */
const WINDOW_GLOW_SHARE = 0.62;

/**
 * Adds the night glow to a kit material: vertices with the optional `glow` attribute (window panes,
 * flames) shine warm at night, on a seeded share of windows. A missing attribute reads as 0.
 */
function addNightGlow(material: Material, night: { value: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float glow;\nvarying float vGlow;\nuniform float uNight;',
      )
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vec4 qWorld = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          'qWorld = instanceMatrix * qWorld;',
          '#endif',
          'qWorld = modelMatrix * qWorld;',
          'float qHash = fract(sin(dot(floor(qWorld.xyz * 1.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
          `vGlow = glow * step(qHash, ${WINDOW_GLOW_SHARE.toFixed(2)});`,
        ].join('\n'),
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.7, 0.36) * vGlow * uNight * 2.4;',
      );
  };
  material.customProgramCacheKey = () => 'qoti-night-glow';
  material.needsUpdate = true;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

/** The Three.js scene for one valley. Draws on demand: when the camera moves or something changes. */
export class Renderer implements RenderApi {
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.5, 2000);
  readonly rig: CameraController;
  readonly stats: RenderStats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0 };
  private readonly material = createKitMaterial();
  private readonly layers: RenderLayer[];
  private readonly hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private readonly sun = new DirectionalLight(0xffffff, 1.5);
  private readonly fill = new DirectionalLight(0x9cc4ff, 0.4);
  private readonly night = { value: 0 };
  private readonly skyCanvas = document.createElement('canvas');
  private readonly skyTexture: CanvasTexture;
  private quality: Quality = 'medium';
  private shadowsDirty = true;
  private readonly target = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private needsRender = true;
  private raf = 0;
  private last = performance.now();
  private frames = 0;
  private fpsWindow = performance.now();
  private lightHour = -1;
  /** Debug only (?debug&hour=19): pins the light to an hour for screenshots and look checks. */
  private readonly hourOverride = ((): number | null => {
    const q = new URLSearchParams(location.search);
    const v = q.has('debug') ? Number(q.get('hour') ?? NaN) : NaN;
    return Number.isFinite(v) ? v : null;
  })();
  private readonly unsubscribe: () => void;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    readonly mirror: Mirror,
    quality: Quality = 'medium',
  ) {
    this.three = new WebGLRenderer({
      antialias: QUALITY_PRESETS[quality].msaa,
      powerPreference: 'high-performance',
    });
    this.three.domElement.className = 'game-canvas';
    this.three.domElement.tabIndex = 0;
    this.three.toneMapping = ACESFilmicToneMapping;
    this.three.outputColorSpace = SRGBColorSpace;
    this.three.shadowMap.type = PCFShadowMap;
    container.appendChild(this.three.domElement);
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 128;
    this.skyTexture = new CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = SRGBColorSpace;
    this.scene.background = this.skyTexture;
    this.scene.fog = new Fog(0xcfe6ef, 120, 400);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.fill.position.set(-1, 0.6, -0.8);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    addNightGlow(this.material, this.night);
    this.setQuality(quality);
    this.rig = new CameraController(this.camera, mirror, this.three.domElement);

    const ctx = { scene: this.scene, mirror, material: this.material, invalidate: () => this.invalidate() };
    this.layers = layerFactories.map((make) => make());
    for (const layer of this.layers) layer.init(ctx);
    this.unsubscribe = mirror.onChange((change) => {
      for (const layer of this.layers) layer.update(change);
      this.shadowsDirty = true;
      this.invalidate();
    });

    const [x0, z0, x1, z1] = mirror.meta.startArea;
    this.rig.focus((x0 + x1 + 1) / 2, (z0 + z1 + 1) / 2, 60);
    this.rig.snap();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  private layer<T extends RenderLayer>(id: string): T {
    return this.layers.find((l) => l.id === id) as T;
  }

  invalidate(): void {
    this.needsRender = true;
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private updateLighting(): void {
    const { hour, minute } = calendar(this.mirror.tick.value);
    const h = this.hourOverride ?? hour + Math.floor(minute / 15) / 4;
    if (h === this.lightHour) return;
    this.lightHour = h;
    const l = lightingAt(h);
    this.paintSky(l.skyTop, l.sky);
    (this.scene.fog as Fog).color.copy(l.sky);
    this.three.toneMappingExposure = l.exposure;
    this.night.value = l.night;
    this.fill.color.copy(l.fill);
    this.fill.intensity = l.fillIntensity;
    this.hemi.color.copy(l.hemiSky);
    this.hemi.groundColor.copy(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.copy(l.sun);
    this.sun.intensity = l.sunIntensity;
    this.sun.position.set(
      MAP_SIZE / 2 + l.sunDir[0] * 100,
      l.sunDir[1] * 100,
      MAP_SIZE / 2 + l.sunDir[2] * 100,
    );
    this.sun.target.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    this.sunDir.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]).normalize();
    this.invalidate();
  }

  private readonly sunDir = new Vector3(0, 1, 0);

  /** A soft vertical sky gradient from the top color down to the horizon (which matches the fog). */
  private paintSky(top: Color, horizon: Color): void {
    const g = this.skyCanvas.getContext('2d');
    if (!g) return;
    const grad = g.createLinearGradient(0, 0, 0, this.skyCanvas.height);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.75, `#${horizon.getHexString()}`);
    grad.addColorStop(1, `#${horizon.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.skyCanvas.width, this.skyCanvas.height);
    this.skyTexture.needsUpdate = true;
  }

  /** Ground point the camera looks at (camera ray against the ground plane of its height). */
  private viewTarget(): Vector3 {
    const dir = this.camera.getWorldDirection(new Vector3());
    const pos = this.camera.position;
    const t = dir.y < -0.05 ? pos.y / -dir.y : 80;
    return this.target.copy(pos).addScaledVector(dir, t);
  }

  /** Keeps fog and the shadow frustum tight around what the camera sees. */
  private fitView(): void {
    const target = this.viewTarget();
    const dist = this.camera.position.distanceTo(target);
    const fog = this.scene.fog as Fog;
    fog.near = dist * 1.3 + 30;
    fog.far = dist * 3.2 + 140;
    if (!this.three.shadowMap.enabled) return;
    const half = Math.min(140, Math.max(18, dist * 0.95));
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = half * 4 + 200;
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, half * 2 + 80);
    this.sun.target.updateMatrixWorld();
    if (this.shadowsDirty) {
      this.shadowsDirty = false;
      this.scene.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        const m = o.material as Material;
        const solid = !m.transparent;
        o.castShadow = solid;
        o.receiveShadow = solid;
      });
    }
  }

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    let dirty = this.rig.update(dt);
    for (const layer of this.layers) if (layer.frame?.(dt)) dirty = true;
    this.updateLighting();
    if (dirty || this.needsRender) {
      const start = performance.now();
      this.fitView();
      this.three.render(this.scene, this.camera);
      this.needsRender = false;
      this.stats.frameMs = performance.now() - start;
      this.stats.drawCalls = this.three.info.render.calls;
      this.stats.triangles = this.three.info.render.triangles;
      this.frames++;
    }
    if (now - this.fpsWindow >= 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.fpsWindow));
      this.frames = 0;
      this.fpsWindow = now;
    }
  };

  private ray(clientX: number, clientY: number): boolean {
    const rect = this.three.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return true;
  }

  pickTile(clientX: number, clientY: number): TilePick | null {
    if (!this.ray(clientX, clientY)) return null;
    return pickTileFromRay(this.mirror, this.raycaster.ray.origin, this.raycaster.ray.direction);
  }

  pickEntity(clientX: number, clientY: number): EntityPick | null {
    const tile = this.pickTile(clientX, clientY);
    if (!tile) return null;
    const m = this.mirror;
    const occupant = m.occupant(tile.x, tile.z);
    if (occupant) return { kind: 'building', id: occupant };
    let best: EntityPick | null = null;
    let bestD = (TILE_FP * 0.45) ** 2;
    for (const d of m.decorNear(tile.fx, tile.fz, TILE_FP)) {
      const dist = (d.fx - tile.fx) ** 2 + (d.fz - tile.fz) ** 2;
      if (dist < bestD) {
        bestD = dist;
        best = { kind: 'decor', id: d.id };
      }
    }
    if (best) return best;
    for (const n of m.notes.values()) if (n.x === tile.x && n.z === tile.z) return { kind: 'note', id: n.id };
    if (m.tree(tile.x, tile.z)) return { kind: 'tree', id: tile.z * MAP_SIZE + tile.x };
    return null;
  }

  setGhost(g: Ghost | null): void {
    this.layer<GhostLayer>('ghosts').set(g);
  }

  setOverlay(_kind: string | null): void {
    // Data overlays (charm, coverage, flows) arrive in I1.
  }

  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void {
    this.layer<PresenceLayer>('presence').setPresence(seat, p);
  }

  ping(seat: SeatId, x: number, z: number, _kind: 'look' | 'help' | 'build'): void {
    this.layer<PresenceLayer>('presence').ping(seat, x, z);
  }

  focus(x: number, z: number, distance?: number): void {
    this.rig.focus(x + 0.5, z + 0.5, distance);
  }

  setQuality(q: Quality): void {
    const preset = QUALITY_PRESETS[q];
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.three.setPixelRatio(Math.min(dpr, preset.maxDpr));
    const shadows = preset.shadowMap > 0;
    if (shadows !== this.three.shadowMap.enabled) {
      this.three.shadowMap.enabled = shadows;
      this.material.needsUpdate = true;
      this.scene.traverse((o) => {
        if (o instanceof Mesh) (o.material as Material).needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== preset.shadowMap) {
      this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.shadowsDirty = true;
    this.lightHour = -1;
    this.invalidate();
  }

  /** The active quality preset. */
  get qualityLevel(): Quality {
    return this.quality;
  }

  project(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean } | null {
    const rect = this.three.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const p = new Vector3(x, y, z).project(this.camera);
    const behind = p.z > 1 || p.z < -1;
    const onScreen = !behind && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
    // Behind the camera the projection flips; mirror it so off-screen arrows point the right way.
    const sx = behind ? -p.x : p.x;
    const sy = behind ? -p.y : p.y;
    return { x: ((sx + 1) / 2) * rect.width, y: ((1 - sy) / 2) * rect.height, onScreen };
  }

  /** Client coordinates of a tile's center, or null when it is off screen (used by tests). */
  screenOf(x: number, z: number): { x: number; y: number } | null {
    const p = new Vector3(x + 0.5, levelY(this.mirror.height(x, z)), z + 0.5).project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    const rect = this.three.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  /** Client coordinates of a fixed point position (decor), or null when off screen. */
  screenOfFp(fx: number, fz: number): { x: number; y: number } | null {
    const x = fpToWorld(fx);
    const z = fpToWorld(fz);
    const p = new Vector3(x, levelY(this.mirror.height(Math.floor(x), Math.floor(z))), z).project(
      this.camera,
    );
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    const rect = this.three.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  get canvas(): HTMLCanvasElement {
    return this.three.domElement;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.rig.dispose();
    for (const layer of this.layers) layer.dispose();
    this.material.dispose();
    this.skyTexture.dispose();
    this.three.dispose();
    this.three.domElement.remove();
    this.scene.background = new Color(0);
  }
}
