import { createKitMaterial } from '@qoti/art';
import { calendar, MAP_SIZE, TILE_FP, type SeatId } from '@qoti/sim';
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CameraController, FOV } from '../input/camera';
import type { Mirror } from '../state/mirror';
import type { EntityPick, Ghost, RenderApi, TilePick } from './api';
import { fpToWorld, levelY } from './coords';
import { layerFactories, type GhostLayer, type PresenceLayer, type RenderLayer } from './layers';
import { lightingAt } from './lighting';
import { pickTileFromRay } from './picking';

export type Quality = 'low' | 'medium' | 'high';

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
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private needsRender = true;
  private raf = 0;
  private last = performance.now();
  private frames = 0;
  private fpsWindow = performance.now();
  private lightHour = -1;
  private readonly unsubscribe: () => void;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    readonly mirror: Mirror,
    quality: Quality = 'medium',
  ) {
    this.three = new WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.three.domElement.className = 'game-canvas';
    this.three.domElement.tabIndex = 0;
    container.appendChild(this.three.domElement);
    this.setQuality(quality);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.rig = new CameraController(this.camera, mirror, this.three.domElement);

    const ctx = { scene: this.scene, mirror, material: this.material, invalidate: () => this.invalidate() };
    this.layers = layerFactories.map((make) => make());
    for (const layer of this.layers) layer.init(ctx);
    this.unsubscribe = mirror.onChange((change) => {
      for (const layer of this.layers) layer.update(change);
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
    const h = hour + Math.floor(minute / 15) / 4;
    if (h === this.lightHour) return;
    this.lightHour = h;
    const l = lightingAt(h);
    this.scene.background = l.sky;
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
    this.invalidate();
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
    const dpr = window.devicePixelRatio || 1;
    this.three.setPixelRatio(q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    this.invalidate();
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
    this.three.dispose();
    this.three.domElement.remove();
    this.scene.background = new Color(0);
  }
}
