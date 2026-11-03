import { calendar, MAP_SIZE, TILE_FP, type SeatId } from '@qoti/sim';
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
  type WebGLRenderTarget,
} from 'three';
import { CameraController, FOV } from '../input/camera';
import type { Mirror } from '../state/mirror';
import type { EntityPick, Ghost, RenderApi, TilePick } from './api';
import { fpToWorld, levelY } from './coords';
import { createWorldEnv, type WorldEnv } from './env';
import {
  layerFactories,
  type AgentsLayer,
  type EffectsLayer,
  type GhostLayer,
  type HighlightArea,
  type OverlaysLayer,
  type PresenceLayer,
  type RenderLayer,
} from './layers';
import { StillCache } from './cache';
import { GpuTimer } from './gpuTimer';
import { layerRoot, MOVING_LAYER, STATIC_LAYER } from './layerTags';
import { lightingAt } from './lighting';
import { LOOK_TONE_MAPPING } from './look';
import { createWorldMaterial } from './material';
import { pickTileFromRay } from './picking';
import { LeanFrame } from './post';
import { PostChain } from './postClassic';
import { buildingDetailNow, pixelRatios, QUALITY_PRESETS, type Quality } from './quality';
import { DynamicResolution } from './resolution';
import { ShadowCache, type ShadowView } from './shadows';

export type { Quality } from './quality';

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  /** Pixel ratio the frame is drawn at, after dynamic resolution. */
  pixelRatio: number;
  /**
   * V1.0: GPU time per drawn frame in ms (an average of the last 30), from
   * `EXT_disjoint_timer_query_webgl2`; null where the browser has no GPU timer.
   */
  gpuMs: number | null;
  /**
   * V1.0: what the last frame drew: `moving` (the whole scene), `still` (the static layers into the
   * still-frame cache, then as idle) or `idle` (the cache plus the moving layers).
   */
  mode: 'moving' | 'still' | 'idle';
  /** V1D: sun shadow map renders so far (cached shadows; the `?debug` overlay counts them). */
  shadowRenders: number;
  /** V1D: still frames drawn so far (the still-frame cache drawn again). */
  stillRenders: number;
  /** V1D: the engine drawing: `lean`, or `classic` (`?engine=classic`, until V1X). */
  engine: Engine;
  /** V1D: frames drawn so far (perf runs count modes per drawn frame). */
  drawn: number;
}

/** V1D: the lean renderer, or the classic chain kept behind `?engine=classic` until V1X. */
export type Engine = 'lean' | 'classic';

/**
 * During camera moves, a static layer's content change (its `ctx.invalidate()`) re-renders the
 * shadow map once it has settled for this long (ms), so chunk rebuilds a frame or two later are in
 * it. At rest, any static change re-renders it on the frame it happens.
 */
const CONTENT_SETTLE_MS = 300;

/** Whether the URL asks for the classic engine (`?engine=classic`, kept until V1X to compare). */
function engineFromUrl(): Engine {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  return q.get('engine') === 'classic' ? 'classic' : 'lean';
}

/** `?debug&dpr=2`: overrides the preset's cap on moving frames (to compare caps on one screen). */
function dprCapFromUrl(): number | undefined {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const v = q.has('debug') ? Number(q.get('dpr') ?? NaN) : NaN;
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * The Three.js scene for one valley. Draws on demand: when the camera moves or something changes.
 *
 * V1D, the lean renderer (docs/spec/20-architecture.md, Lean renderer): each drawn frame is one
 * scene pass into a float target, the quarter resolution blur chain and one final pass (post.ts).
 * While the camera moves the scene pass draws every layer; once it has rested for REST_MS the
 * static layers are drawn once into the still-frame cache (cache.ts) and each idle frame restores
 * them and draws only the moving layers. The sun's shadow map renders only when it has to
 * (shadows.ts), and dynamic resolution judges only moving frames (resolution.ts).
 */
export class Renderer implements RenderApi {
  readonly three: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.5, 2000);
  readonly rig: CameraController;
  /** V1D: which engine draws (`?engine=classic` for the chain before V1D, until V1X). */
  readonly engine: Engine = engineFromUrl();
  readonly stats: RenderStats = {
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    pixelRatio: 1,
    gpuMs: null,
    mode: 'moving',
    shadowRenders: 0,
    stillRenders: 0,
    engine: this.engine,
    drawn: 0,
  };
  /** V1.0: GPU time per drawn frame, where the browser offers a timer (`?debug` overlay, perf). */
  readonly gpuTimer: GpuTimer;
  /** The kit material every layer shares (material.ts). */
  private readonly material: MeshStandardMaterial;
  private readonly layers: RenderLayer[];
  /** Each render layer's root, and whether it is a moving layer. */
  private readonly roots: { root: Scene; moving: boolean }[] = [];
  private readonly hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private readonly sun = new DirectionalLight(0xffffff, 1.5);
  private readonly fill = new DirectionalLight(0x9cc4ff, 0.4);
  private readonly night = { value: 0 };
  /** C3D-1: shared look state for world layers (time, night, sky, ground lights, camera). */
  readonly env: WorldEnv;
  private readonly skyCanvas = document.createElement('canvas');
  private readonly skyTexture: CanvasTexture;
  private quality: Quality = 'medium';
  /** The preset's pixel ratio for this screen; dynamic resolution scales it down when frames lag. */
  private basePixelRatio = 1;
  private readonly resolution = ((): DynamicResolution => {
    const r = new DynamicResolution();
    const q = new URLSearchParams(location.search);
    r.enabled = !(q.has('debug') && q.has('fixedres'));
    return r;
  })();
  /** V1D: the lean frame graph (targets, blur chain, final pass); null on the classic engine. */
  private readonly lean: LeanFrame | null;
  /** The classic engine's post chain on Medium and up (`?engine=classic`); Low draws to the canvas. */
  private post: PostChain | null = null;
  /** V1D: the still-frame cache and the cached sun shadows. */
  private readonly still: StillCache;
  private readonly shadowCache = new ShadowCache();
  /** `?debug&dpr=2` overrides the moving cap (17-presentation.md, Quality presets). */
  private readonly dprCap = dprCapFromUrl();
  /** Bumped whenever the light changes (the still picture depends on it). */
  private lightRevision = 0;
  /** When a static layer last reported a content change, and when shadows last rendered (ms). */
  private contentAt = -Infinity;
  private shadowAt = -Infinity;
  /** `staticRevision` when the shadow map last rendered. */
  private shadowStatic = -1;
  private viewDistance = 60;
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
  private hourOverride = ((): number | null => {
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
    this.env = createWorldEnv(this.camera);
    this.env.night = this.night;
    const classic = this.engine === 'classic';
    // V1D: animation inside static layers runs on a clock of its own, which stops while the camera
    // rests so the still-frame cache stays true (docs/build/v1-wave-notes.md). Set before any
    // material or layer binds it.
    if (!classic) this.env.staticTime = { value: 0 };
    this.material = createWorldMaterial(this.env);
    // V1D: only the final pass draws to the canvas, so it needs no antialiasing, depth or stencil;
    // multisampling lives on the scene target.
    this.three = new WebGLRenderer(
      classic
        ? { antialias: QUALITY_PRESETS[quality].msaa > 0, powerPreference: 'high-performance' }
        : { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' },
    );
    this.gpuTimer = new GpuTimer(this.three.getContext() as WebGL2RenderingContext);
    this.three.domElement.className = 'game-canvas';
    this.three.domElement.tabIndex = 0;
    this.three.toneMapping = LOOK_TONE_MAPPING;
    this.three.outputColorSpace = SRGBColorSpace;
    this.three.shadowMap.type = PCFShadowMap;
    this.three.shadowMap.autoUpdate = classic;
    container.appendChild(this.three.domElement);
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 128;
    this.skyTexture = new CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = SRGBColorSpace;
    // The sky layer's dome covers the whole view; the lean engine skips the background under it.
    this.scene.background = classic ? this.skyTexture : null;
    this.scene.fog = new Fog(0xcfe6ef, 120, 400);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.fill.position.set(-1, 0.6, -0.8);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);
    // V1.0: layers draw on Three.js layer 1 (static) or 2 (moving); the camera and lights see both.
    for (const o of [this.camera, this.hemi, this.sun, this.fill]) {
      o.layers.enable(STATIC_LAYER);
      o.layers.enable(MOVING_LAYER);
    }
    this.still = new StillCache(this.scene, this.camera);
    this.lean = classic ? null : new LeanFrame(this.three, QUALITY_PRESETS.ultra.msaa);
    this.setQuality(quality);
    this.rig = new CameraController(this.camera, mirror, this.three.domElement);

    this.layers = layerFactories.map((make) => make());
    for (const layer of this.layers) {
      // V1.0: each layer adds to a root of its own, which tags what it holds static or moving, and
      // its invalidate says which kind of layer changed.
      const root = layerRoot(layer);
      const moving = layer.motion === 'moving';
      this.scene.add(root);
      this.roots.push({ root, moving });
      layer.init({
        scene: root,
        mirror,
        material: this.material,
        invalidate: () => (moving ? this.invalidate() : this.invalidateStatic()),
        camera: this.camera,
        env: this.env,
      });
    }
    this.layer<EffectsLayer>('effects').setSmoke(QUALITY_PRESETS[quality].ambientMotion);
    this.layer<AgentsLayer>('agents').setDetail(QUALITY_PRESETS[quality].residentDetail);
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

  /**
   * V1.0: bumped whenever a static layer changes (it called its context's `invalidate`, or its
   * `frame` reported a change). V1D: the still-frame cache keeps the revision it drew at and draws
   * again when it differs; at rest a change also re-renders the sun's shadows.
   */
  staticRevision = 0;

  /**
   * V1D: a change to the static picture (a static layer's `ctx.invalidate()`, or, from outside a
   * layer, a texture or material uniform that changes what static layers look like, such as a
   * ground AO swap): drops the still-frame cache, re-renders shadows at rest, and draws again.
   */
  invalidateStatic(): void {
    this.staticRevision++;
    this.contentAt = performance.now();
    this.needsRender = true;
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lean) this.applyLayout();
    else {
      this.three.setSize(w, h, false);
      this.post?.setSize(w, h, this.three.getPixelRatio());
    }
    this.invalidate();
  }

  /**
   * V1D: sizes the canvas (at the still ratio) and the frame's targets (moving frames at the
   * preset's ratio times the dynamic resolution step) for the container and preset.
   */
  private applyLayout(): void {
    const lean = this.lean;
    if (!lean) return;
    const preset = QUALITY_PRESETS[this.quality];
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const r = pixelRatios(preset, window.devicePixelRatio || 1, this.dprCap);
    this.basePixelRatio = r.moving;
    const moving = r.moving * this.resolution.scale;
    // Without the still-frame cache every frame is a moving one: one target, and the canvas follows.
    const still = preset.stillCache ? r.still : moving;
    this.three.setPixelRatio(still);
    this.three.setSize(w, h, false);
    lean.configure({
      width: w,
      height: h,
      movingRatio: moving,
      stillRatio: still,
      msaa: preset.msaa,
      stillDepth: preset.stillCache,
    });
    this.stats.pixelRatio = moving;
    this.invalidate();
  }

  private updateLighting(): void {
    const { hour, minute } = calendar(this.mirror.tick.value);
    const h = this.hourOverride ?? hour + Math.floor(minute / 15) / 4;
    if (h === this.lightHour) return;
    this.lightHour = h;
    this.lightRevision++;
    const l = lightingAt(h);
    if (this.lean) {
      this.lean.setNight(l.night);
      this.lean.setWarmth(l.warmth);
      this.lean.setExposure(l.exposure);
      this.three.setClearColor(l.sky);
    } else this.paintSky(l.skyTop, l.sky);
    (this.scene.fog as Fog).color.copy(l.sky);
    this.three.toneMappingExposure = l.exposure;
    this.night.value = l.night;
    this.post?.setNight(l.night);
    this.post?.setWarmth(l.warmth);
    this.fill.color.copy(l.fill);
    this.fill.intensity = l.fillIntensity;
    this.hemi.color.copy(l.hemiSky);
    this.hemi.groundColor.copy(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.copy(l.sun);
    this.sun.intensity = l.sunIntensity;
    this.sunDir.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]).normalize();
    // The light's direction for shading. Where the shadow camera sits is set when the shadow map
    // renders (fitView on the classic engine, shadows.ts on the lean one), along the same direction;
    // the map's own matrix only changes when it renders, so moving the light here never shifts it.
    this.sun.position.set(
      MAP_SIZE / 2 + l.sunDir[0] * 100,
      l.sunDir[1] * 100,
      MAP_SIZE / 2 + l.sunDir[2] * 100,
    );
    this.sun.target.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    this.env.sky.value.copy(l.sky);
    this.env.skyTop.value.copy(l.skyTop);
    this.env.sunDir.value.copy(this.sunDir);
    this.env.sunColor.value.copy(l.sun);
    this.env.clouds.value = 1 - l.night;
    this.env.windowShare.value = l.windowShare;
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

  /** Keeps fog (and, on the classic engine, the shadow frustum) tight around what the camera sees. */
  private fitView(): void {
    const target = this.viewTarget();
    const dist = this.camera.position.distanceTo(target);
    this.viewDistance = dist;
    const fog = this.scene.fog as Fog;
    this.env.focus.copy(target);
    this.post?.setViewDistance(dist);
    this.lean?.setViewDistance(dist);
    fog.near = dist * 1.3 + 30;
    fog.far = dist * 3.2 + 140;
    if (this.lean || !this.three.shadowMap.enabled) return;
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
  }

  /**
   * Which meshes cast and receive the sun's shadows: solid ones, unless they opt out (scattered
   * grass and flowers, figures with their own blob shadows). V1D: nothing in a moving layer casts,
   * since the shadow map is kept between frames.
   */
  private updateShadowFlags(): void {
    this.shadowsDirty = false;
    const lean = this.lean !== null;
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as Material;
      const solid = !m.transparent;
      const moving = lean && o.layers.isEnabled(MOVING_LAYER);
      // C3D-1: scattered grass and flowers opt out (userData.qotiShadows false); C3D-2: noCast.
      o.castShadow = solid && !moving && !o.userData.noCast && o.userData.qotiShadows !== false;
      o.receiveShadow = solid;
    });
  }

  private readonly lastCamPos = new Vector3(Number.NaN, 0, 0);
  private readonly lastCamQuat = new Quaternion();
  private lastCamProj = '';

  /** Whether the camera's pose or lens changed since the last call. */
  private cameraChanged(): boolean {
    const c = this.camera;
    const proj = `${c.fov}|${c.aspect}|${c.zoom}|${c.near}|${c.far}`;
    if (
      c.position.equals(this.lastCamPos) &&
      c.quaternion.equals(this.lastCamQuat) &&
      proj === this.lastCamProj
    )
      return false;
    this.lastCamPos.copy(c.position);
    this.lastCamQuat.copy(c.quaternion);
    this.lastCamProj = proj;
    return true;
  }

  private readonly loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.followStep();
    // V1D: any change to the camera counts, including jumps made outside the controller's glide
    // (a snap, a focus from the interface), or the still-frame cache would show the old view.
    const glided = this.rig.update(dt);
    const moved = this.cameraChanged() || glided;
    if (moved) {
      this.env.viewRevision++;
      this.still.noteMove(now);
    }
    const resting = this.lean !== null && this.still.resting(now);
    if (this.env.motion) {
      this.env.time.value += dt;
      // V1D: animation in static layers holds still while the camera rests (the cache is true).
      if (this.env.staticTime !== this.env.time && !resting) this.env.staticTime.value += dt;
    }
    let dirty = moved;
    for (const layer of this.layers) {
      if (!layer.frame?.(dt)) continue;
      dirty = true;
      if (layer.motion !== 'moving') this.staticRevision++;
    }
    this.updateLighting();
    if (this.lean) this.drawLean(now, dirty, resting);
    else this.drawClassic(now, dirty);
    this.stats.gpuMs = this.gpuTimer.ms;
    if (now - this.fpsWindow >= 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.fpsWindow));
      this.frames = 0;
      this.fpsWindow = now;
    }
  };

  /** The classic engine's frame (`?engine=classic`): the chain and shadows as before V1D. */
  private drawClassic(now: number, dirty: boolean): void {
    const drew = dirty || this.needsRender;
    if (drew) {
      const start = performance.now();
      this.fitView();
      if (this.shadowsDirty && this.three.shadowMap.enabled) this.updateShadowFlags();
      // Count every pass of the frame, not just the last one, so stats stay honest with post on.
      this.three.info.autoReset = false;
      this.three.info.reset();
      this.gpuTimer.begin();
      if (this.post) this.post.render();
      else this.three.render(this.scene, this.camera);
      this.gpuTimer.end();
      this.needsRender = false;
      this.stats.frameMs = performance.now() - start;
      this.stats.drawCalls = this.three.info.render.calls;
      this.stats.triangles = this.three.info.render.triangles;
      this.stats.mode = 'moving';
      this.stats.drawn++;
      this.frames++;
    } else this.gpuTimer.poll();
    if (this.resolution.frame(now, drew, this.basePixelRatio)) this.applyPixelRatio();
  }

  /**
   * What the still-frame cache was drawn for: the targets, the preset, the view, every static
   * layer, the light and the shadow map. Any change means drawing it again.
   */
  private stillKey(): string {
    return [
      this.lean?.revision ?? 0,
      this.quality,
      this.env.viewRevision,
      this.staticRevision,
      this.lightRevision,
      this.shadowCache.renders,
    ].join('|');
  }

  /** The lean engine's frame: a moving, still or idle scene pass, then the blur and final pass. */
  private drawLean(now: number, dirty: boolean, resting: boolean): void {
    const lean = this.lean!;
    // At rest, the still frame is drawn once even if nothing else moves: it is the preset's own
    // sharpness (not the moving step's) and, on Ultra, has its ambient occlusion.
    const stillDue = resting && !this.still.valid(this.stillKey());
    if (!dirty && !this.needsRender && !stillDue) {
      this.gpuTimer.poll();
      this.resolution.frame(now, false, this.basePixelRatio);
      return;
    }
    const start = performance.now();
    this.fitView();
    this.planShadows(now, this.still.rested(now));
    this.three.info.autoReset = false;
    this.three.info.reset();
    this.gpuTimer.begin();
    let target: WebGLRenderTarget;
    let mode: RenderStats['mode'];
    if (!resting) {
      target = lean.target('moving');
      this.scenePass(target, 'all');
      mode = 'moving';
    } else {
      target = lean.target('still');
      const key = this.stillKey();
      mode = 'idle';
      if (!this.still.valid(key)) {
        target.resolveDepthBuffer = true;
        this.scenePass(target, 'static');
        target.resolveDepthBuffer = false;
        this.still.keep(this.three, lean, target, key);
        mode = 'still';
      }
      this.scenePass(target, 'idle');
    }
    lean.finish(target);
    this.gpuTimer.end();
    this.needsRender = false;
    this.stats.frameMs = performance.now() - start;
    this.stats.drawCalls = this.three.info.render.calls;
    this.stats.triangles = this.three.info.render.triangles;
    this.stats.mode = mode;
    this.stats.pixelRatio = lean.ratio(mode === 'moving' ? 'moving' : 'still');
    this.stats.shadowRenders = this.shadowCache.renders;
    this.stats.stillRenders = this.still.renders;
    this.stats.drawn++;
    this.frames++;
    if (this.resolution.frame(now, true, this.basePixelRatio, mode === 'moving')) this.applyLayout();
  }

  /**
   * V1D: decides whether the sun's shadow map renders this frame (shadows.ts) and, if so, places the
   * light and asks three for one render. With the camera at rest (on any preset) any static change
   * counts; while it moves, only a content change that has settled (layers refill as the view
   * moves, which the frustum re-fit and the next rest catch up with).
   */
  private planShadows(now: number, resting: boolean): void {
    if (!this.three.shadowMap.enabled) return;
    const view: ShadowView = {
      target: this.target,
      distance: this.viewDistance,
      sunDir: this.sunDir,
      size: QUALITY_PRESETS[this.quality].shadowMap,
    };
    const content = resting
      ? this.staticRevision !== this.shadowStatic
      : this.contentAt > this.shadowAt && now - this.contentAt > CONTENT_SETTLE_MS;
    const reason = this.shadowCache.due(view, content);
    if (!reason) return;
    this.updateShadowFlags();
    this.shadowCache.apply(this.sun, view, reason);
    this.three.shadowMap.needsUpdate = true;
    this.shadowStatic = this.staticRevision;
    this.shadowAt = now;
  }

  /**
   * One scene pass into `target`: `all` layers (a moving frame), the `static` ones alone (the
   * still-frame cache), or `idle` (the cache restored, then the moving layers). Layers the pass
   * does not draw are hidden for it, so three does not even walk them.
   */
  private scenePass(target: WebGLRenderTarget, which: 'all' | 'static' | 'idle'): void {
    const cam = this.camera;
    if (which === 'static') cam.layers.set(STATIC_LAYER);
    else if (which === 'idle') cam.layers.set(MOVING_LAYER);
    for (const r of this.roots)
      r.root.visible = which === 'all' || (which === 'static' ? !r.moving : r.moving);
    this.still.restore.visible = which === 'idle';
    this.three.setRenderTarget(target);
    this.three.render(this.scene, cam);
    for (const r of this.roots) r.root.visible = true;
    this.still.restore.visible = false;
    cam.layers.set(STATIC_LAYER);
    cam.layers.enable(MOVING_LAYER);
  }

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
    // I1: residents stand in front of everything, so they win when the ray passes close to one.
    if (this.ray(clientX, clientY)) {
      const r = this.layer<AgentsLayer>('agents').pick(
        this.raycaster.ray.origin,
        this.raycaster.ray.direction,
      );
      if (r !== null) return { kind: 'resident', id: r };
    }
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

  setOverlay(kind: string | null): void {
    this.layer<OverlaysLayer>('overlays').set(kind);
  }

  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void {
    this.layer<PresenceLayer>('presence').setPresence(seat, p);
  }

  presenceAt(seat: SeatId): { x: number; y: number; z: number; alpha: number } | null {
    return this.layer<PresenceLayer>('presence').presenceAt(seat);
  }

  ping(seat: SeatId, x: number, z: number, _kind: 'look' | 'help' | 'build'): void {
    this.layer<PresenceLayer>('presence').ping(seat, x, z);
  }

  focus(x: number, z: number, distance?: number): void {
    this.rig.focus(x + 0.5, z + 0.5, distance);
  }

  /** The classic engine: applies the dynamic resolution scale to the canvas and the post chain. */
  private applyPixelRatio(): void {
    const ratio = this.basePixelRatio * this.resolution.scale;
    this.three.setPixelRatio(ratio);
    this.stats.pixelRatio = ratio;
    this.post?.setSize(this.container.clientWidth || 1, this.container.clientHeight || 1, ratio);
    this.invalidate();
  }

  setQuality(q: Quality): void {
    const preset = QUALITY_PRESETS[q];
    this.quality = q;
    this.resolution.reset();
    const shadows = preset.shadowMap > 0;
    if (shadows !== this.three.shadowMap.enabled) {
      this.three.shadowMap.enabled = shadows;
      this.material.needsUpdate = true;
      this.scene.traverse((o) => {
        if (o instanceof Mesh) (o.material as Material).needsUpdate = true;
      });
    }
    this.sun.castShadow = shadows;
    this.env.motion = preset.ambientMotion;
    this.env.detailDistance = preset.decorDistance;
    this.env.buildingDetail = buildingDetailNow(q);
    this.env.viewRevision++;
    if (shadows && this.sun.shadow.mapSize.x !== preset.shadowMap) {
      this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.shadowsDirty = true;
    this.lightHour = -1;
    if (this.lean) {
      this.still.enabled = preset.stillCache;
      this.still.ao = preset.stillAo;
      this.still.invalidate();
      this.shadowCache.force();
      this.lean.setBloom(preset.bloom);
      // The constructor applies the first preset before the container is laid out; resize() follows.
      if ((this.layers as RenderLayer[] | undefined) !== undefined) this.applyLayout();
    } else {
      // The classic engine (`?engine=classic`): as before V1D.
      const dpr = window.devicePixelRatio || 1;
      this.basePixelRatio = Math.min(dpr, preset.maxDpr);
      this.three.setPixelRatio(this.basePixelRatio);
      this.stats.pixelRatio = this.basePixelRatio;
      const wantPost = q !== 'low';
      if (wantPost && !this.post) {
        try {
          this.post = new PostChain(this.three, this.scene, this.camera);
          this.post.setSize(
            this.container.clientWidth || 1,
            this.container.clientHeight || 1,
            this.three.getPixelRatio(),
          );
        } catch {
          this.post = null;
        }
      } else if (!wantPost && this.post) {
        this.post.dispose();
        this.post = null;
      }
    }
    // Layers do not exist yet while the constructor applies the first preset.
    (this.layers as RenderLayer[] | undefined)
      ?.find((l): l is EffectsLayer => l.id === 'effects')
      ?.setSmoke(preset.ambientMotion);
    (this.layers as RenderLayer[] | undefined)
      ?.find((l): l is AgentsLayer => l.id === 'agents')
      ?.setDetail(preset.residentDetail);
    this.invalidate();
  }

  // --- I1 (C3D): following residents and bubbles. ---------------------------------------------

  private followId: number | null = null;

  follow(residentId: number | null): void {
    this.followId = residentId;
    this.followStep();
  }

  /** Keeps the camera gliding after the followed resident (it waits at the door while they are inside). */
  private followStep(): void {
    if (this.followId === null) return;
    if (!this.mirror.residents.has(this.followId) && this.mirror.residents.size > 0) {
      this.followId = null;
      return;
    }
    const p = this.layer<AgentsLayer>('agents').positionOf(this.followId);
    if (p) this.rig.focus(p.x, p.z);
  }

  setBubbles(on: boolean): void {
    this.layer<AgentsLayer>('agents').setBubbles(on);
  }

  highlight(area: HighlightArea): void {
    this.layer<OverlaysLayer>('overlays').highlight(area);
  }

  /**
   * Debug only: pins the lighting phase to an hour of the day (fractional is fine), for screenshots
   * and look checks. null returns to the sim clock.
   */
  setDebugHour(hour: number | null): void {
    this.hourOverride = hour !== null && Number.isFinite(hour) ? hour : null;
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
    this.gpuTimer.dispose();
    this.post?.dispose();
    this.lean?.dispose();
    this.still.dispose();
    this.skyTexture.dispose();
    this.three.dispose();
    this.three.domElement.remove();
    this.scene.background = new Color(0);
  }
}
