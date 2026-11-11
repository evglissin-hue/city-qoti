import type { Season } from '@qoti/art';
import { calendar, MAP_SIZE, TILE_FP, type SeatId, type WeatherKind } from '@qoti/sim';
import {
  Color,
  DirectionalLight,
  FloatType,
  Fog,
  HemisphereLight,
  MathUtils,
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
  WebGLRenderTarget,
  type Material,
  type MeshLambertMaterial,
} from 'three';
import { CameraController, FOV, setFreeCamera } from '../input/camera';
import type { Mirror } from '../state/mirror';
import type { EntityPick, Ghost, RenderApi, TilePick } from './api';
import { fpToWorld, levelY } from './coords';
import { applySeasonBlend, createWorldEnv, SEASONS, setPatternAnisotropy, type WorldEnv } from './env';
import { drawLightMap, resizeLightMap } from './lightMap';
import { CLEAR_WEATHER, easeWeather, seasonBlendAt, weatherLookFor, type WeatherLook } from './seasons';
import {
  layerFactories,
  type AgentsLayer,
  type CartsLayer,
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
import { hazeFor, lightingAt } from './lighting';
import { LOOK_TONE_MAPPING } from './look';
import { createWorldMaterial } from './material';
import { pickTileFromRay } from './picking';
import { LeanFrame } from './post';
import { buildingDetailNow, pixelRatios, QUALITY_PRESETS, type Quality } from './quality';
import { DynamicResolution } from './resolution';
import { ShadowCache, type ShadowView } from './shadows';
import { shadowContentDue, StaticRevisions } from './statics';

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
  /** V1D: the engine drawing; always `lean` since V1X retired the classic chain. */
  engine: Engine;
  /** V1D: frames drawn so far (perf runs count modes per drawn frame). */
  drawn: number;
}

/** V1D: the engine drawing. V1X retired the classic chain (`?engine=classic`), so only the lean one. */
export type Engine = 'lean';

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
  /** V1D: which engine draws (only the lean one since V1X). */
  readonly engine: Engine = 'lean';
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
  private readonly material: MeshLambertMaterial;
  private readonly layers: RenderLayer[];
  /** Each render layer's root, and whether it is a moving layer. */
  private readonly roots: { root: Scene; moving: boolean }[] = [];
  private readonly hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private readonly sun = new DirectionalLight(0xffffff, 1.5);
  private readonly fill = new DirectionalLight(0x9cc4ff, 0.4);
  private readonly night = { value: 0 };
  /** C3D-1: shared look state for world layers (time, night, sky, ground lights, camera). */
  readonly env: WorldEnv;
  private quality: Quality = 'medium';
  /** The preset's pixel ratio for this screen; dynamic resolution scales it down when frames lag. */
  private basePixelRatio = 1;
  private readonly resolution = ((): DynamicResolution => {
    const r = new DynamicResolution();
    const q = new URLSearchParams(location.search);
    r.enabled = !(q.has('debug') && q.has('fixedres'));
    return r;
  })();
  /** V1D: the lean frame graph (targets, blur chain, final pass). */
  private readonly lean: LeanFrame;
  /** V1D: the still-frame cache and the cached sun shadows. */
  private readonly still: StillCache;
  private readonly shadowCache = new ShadowCache();
  /** `?debug&dpr=2` overrides the moving cap (17-presentation.md, Quality presets). */
  private readonly dprCap = dprCapFromUrl();
  /** Bumped whenever the light changes (the still picture depends on it). */
  private lightRevision = 0;
  /** V2A: the static-change counters (statics.ts): the still frame's and the shadow map's. */
  private readonly statics = new StaticRevisions();
  /** When shadows last rendered (ms). */
  private shadowAt = -Infinity;
  /** `statics.casters` when the shadow map last rendered. */
  private shadowStatic = -1;
  private viewDistance = 60;
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
  /**
   * C5E, debug only: `?debug&season=autumn&day=3` pins the season's look and `&weather=storm` (or
   * `drought`, `frozen`) the weather's, for screenshots and look checks; the sim is untouched.
   */
  private readonly lookOverride = ((): { season: number | null; day: number; weather: string | null } => {
    const q = new URLSearchParams(location.search);
    if (!q.has('debug')) return { season: null, day: 1, weather: null };
    const si = SEASONS.indexOf((q.get('season') ?? '') as Season);
    return {
      season: si >= 0 ? si : null,
      day: Math.max(1, Math.min(6, Number(q.get('day') ?? 3) || 3)),
      weather: q.get('weather'),
    };
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
    // V1D: animation inside static layers runs on a clock of its own, which stops while the camera
    // rests so the still-frame cache stays true (docs/build/v1-wave-notes.md). Set before any
    // material or layer binds it.
    this.env.staticTime = { value: 0 };
    this.material = createWorldMaterial(this.env);
    // V1D: only the final pass draws to the canvas, so it needs no antialiasing, depth or stencil;
    // multisampling lives on the scene target.
    this.three = new WebGLRenderer({
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.gpuTimer = new GpuTimer(this.three.getContext() as WebGL2RenderingContext);
    this.three.domElement.className = 'game-canvas';
    this.three.domElement.tabIndex = 0;
    this.three.toneMapping = LOOK_TONE_MAPPING;
    this.three.outputColorSpace = SRGBColorSpace;
    this.three.shadowMap.type = PCFShadowMap;
    this.three.shadowMap.autoUpdate = false;
    container.appendChild(this.three.domElement);
    // The sky layer's dome covers the whole view, so the scene has no background under it.
    this.scene.background = null;
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
    this.lean = new LeanFrame(this.three, QUALITY_PRESETS.ultra.msaa);
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
        invalidate: () =>
          moving ? this.invalidate() : this.invalidateStatic(layer.id, layer.shadowless === true),
        camera: this.camera,
        env: this.env,
      });
    }
    this.layer<EffectsLayer>('effects').setSmoke(QUALITY_PRESETS[quality].ambientMotion);
    this.layer<AgentsLayer>('agents').setDetail(QUALITY_PRESETS[quality].residentDetail);
    this.layer<AgentsLayer>('agents').setCarts(this.layer<CartsLayer>('carts'));
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

  /**
   * V1.0: bumped whenever a static layer changes (it called its context's `invalidate`, or its
   * `frame` reported a change). V1D: the still-frame cache keeps the revision it drew at and draws
   * again when it differs; at rest a change also re-renders the sun's shadows, unless (V2A) it
   * came from a `shadowless` layer.
   */
  get staticRevision(): number {
    return this.statics.revision;
  }

  /**
   * V1X: what bumped `staticRevision`, per static layer id (its `invalidate` or a `frame()` that
   * returned true) and `renderer` for changes from outside a layer, so a resting view that keeps
   * drawing still frames can be traced (`__qoti.staticChanges()` in a `?debug` valley).
   */
  get staticChanges(): ReadonlyMap<string, number> {
    return this.statics.bySource;
  }

  /**
   * V1D: a change to the static picture (a static layer's `ctx.invalidate()`, or, from outside a
   * layer, a texture or material uniform that changes what static layers look like, such as a
   * ground AO swap): drops the still-frame cache, re-renders shadows at rest, and draws again.
   * V2A: a `shadowless` change (light only, nothing that casts moved) drops the still frame and
   * leaves the shadow map alone.
   */
  invalidateStatic(source = 'renderer', shadowless = false): void {
    this.statics.note(source, shadowless, performance.now());
    this.needsRender = true;
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyLayout();
    this.invalidate();
  }

  /**
   * V1D: sizes the canvas (at the still ratio) and the frame's targets (moving frames at the
   * preset's ratio times the dynamic resolution step) for the container and preset.
   */
  private applyLayout(): void {
    const lean = this.lean;
    const preset = QUALITY_PRESETS[this.quality];
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const r = pixelRatios(preset, window.devicePixelRatio || 1, this.dprCap);
    r.still *= this.photoBoost;
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
    const cal = calendar(this.mirror.tick.value);
    const { hour, minute } = cal;
    const season = this.lookOverride.season ?? cal.season;
    const day = this.lookOverride.season !== null ? this.lookOverride.day : cal.day;
    const quarter = hour + Math.floor(minute / 15) / 4;
    this.applySeason(SEASONS[season]!, season, day, quarter);
    const h = this.timeOfDay ?? this.hourOverride ?? quarter;
    this.env.shown.season = season;
    this.env.shown.day = day;
    this.env.shown.hour = h;
    if (h === this.lightHour) return;
    this.lightHour = h;
    this.lightRevision++;
    const l = lightingAt(h);
    this.lean.setNight(l.night);
    this.lean.setWarmth(l.warmth);
    this.lean.setExposure(l.exposure);
    this.three.setClearColor(l.sky);
    (this.scene.fog as Fog).color.copy(l.sky);
    this.three.toneMappingExposure = l.exposure;
    this.night.value = l.night;
    this.fill.color.copy(l.fill);
    this.fill.intensity = l.fillIntensity;
    this.hemi.color.copy(l.hemiSky);
    this.hemi.groundColor.copy(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.copy(l.sun);
    // C5E: an overcast sky softens the sun and lifts the sky's fill, so rain and storms read as
    // soft grey days with gentle shadows.
    const over = this.env.overcast.value;
    this.sun.intensity = l.sunIntensity * (1 - 0.7 * over);
    this.hemi.intensity = l.hemiIntensity * (1 + 0.35 * over);
    this.sunDir.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]).normalize();
    // The light's direction for shading. Where the shadow camera sits is set when the shadow map
    // renders (shadows.ts), along the same direction;
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
    this.env.clouds.value = (1 - l.night) * (1 - 0.8 * this.env.overcast.value);
    this.env.windowShare.value = l.windowShare;
    this.invalidate();
  }

  private readonly sunDir = new Vector3(0, 1, 0);

  /**
   * V1A: the season's look (snow, foliage tint, the grade); drops the still frame on a change.
   * C5E: blended through the day (render/seasons.ts), stepping at most once a quarter hour.
   */
  private applySeason(name: Season, season: number, day: number, hour: number): void {
    const key = `${season}|${day}|${hour}`;
    if (key === this.seasonKey) return;
    this.seasonKey = key;
    let changed = applySeasonBlend(this.env, seasonBlendAt(season, day, hour));
    if (name !== this.season) {
      this.season = name;
      this.lean.setSeason(name);
      changed = true;
    }
    if (changed) this.invalidateStatic('season');
  }

  private season: Season | null = null;
  private seasonKey = '';

  /** C5E: the weather's look, eased toward today's over a few seconds. */
  private readonly weatherNow: WeatherLook = { ...CLEAR_WEATHER };
  private weatherStep = '';

  /** C5E: eases the weather's look and drops the still frame when a step shows. */
  private weatherAt = -1;

  private updateWeather(): boolean {
    // Wall time, not the frame's capped step: a slow frame must not stretch the change out.
    const now = performance.now();
    const dt = this.weatherAt < 0 ? 0 : Math.min(2, (now - this.weatherAt) / 1000);
    this.weatherAt = now;
    const w = this.mirror.weather.value;
    const pin = this.lookOverride.weather;
    const drought = pin === 'drought' || !!w?.events.some((e) => e.event === 'drought' && e.active);
    const kind = pin && pin !== 'drought' && pin !== 'frozen' ? (pin as WeatherKind) : w?.today;
    const to = weatherLookFor(kind, drought);
    const ice = w?.frozen || pin === 'frozen' ? 1 : 0;
    const f = this.env.frozen;
    let iced = false;
    if (f.value !== ice) {
      f.value =
        Math.abs(ice - f.value) < 0.01
          ? ice
          : f.value + Math.sign(ice - f.value) * Math.min(Math.abs(ice - f.value), dt * 0.5);
      iced = true;
    }
    if (!easeWeather(this.weatherNow, to, dt)) return iced;
    const n = this.weatherNow;
    const e = this.env;
    e.wet.value = n.rain;
    e.snowfall.value = n.snowfall;
    e.fog.value = n.fog;
    e.storm.value = n.storm;
    e.overcast.value = n.overcast;
    e.dry.value = n.dry;
    this.lean.setWeather(n);
    // Static pictures read wetness, dryness and overcast: step them in twentieths.
    const step = [n.rain, n.dry, n.overcast, n.fog].map((v) => Math.round(v * 20)).join('|');
    if (step !== this.weatherStep) {
      this.weatherStep = step;
      // The light depends on the overcast: recompute it (a light change redraws the still frame).
      this.lightHour = -1;
      this.invalidateStatic('weather');
    }
    return true;
  }

  /** C5E: photo mode's time of day (light only; the sim's clock never moves), or null. */
  private timeOfDay: number | null = null;

  /** Ground point the camera looks at (camera ray against the ground plane of its height). */
  private viewTarget(): Vector3 {
    const dir = this.camera.getWorldDirection(new Vector3());
    const pos = this.camera.position;
    const t = dir.y < -0.05 ? pos.y / -dir.y : 80;
    return this.target.copy(pos).addScaledVector(dir, t);
  }

  /** Keeps the haze tight around what the camera sees (the shadow frustum is shadows.ts's). */
  private fitView(): void {
    const target = this.viewTarget();
    const dist = this.camera.position.distanceTo(target);
    this.viewDistance = dist;
    const fog = this.scene.fog as Fog;
    this.env.focus.copy(target);
    this.lean.setViewDistance(dist);
    Object.assign(fog, hazeFor(dist));
    // C5E: fog days pull the haze in (a weather step drops the still frame).
    const thick = this.env.fog.value;
    if (thick > 0) {
      fog.near *= 1 - 0.6 * thick;
      fog.far *= 1 - 0.45 * thick;
    }
  }

  /**
   * Which meshes cast and receive the sun's shadows: solid ones, unless they opt out (scattered
   * grass and flowers, figures with their own blob shadows). V1D: nothing in a moving layer casts,
   * since the shadow map is kept between frames.
   */
  private updateShadowFlags(): void {
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as Material;
      const solid = !m.transparent;
      const moving = o.layers.isEnabled(MOVING_LAYER);
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
    const resting = this.still.resting(now);
    if (this.env.motion) {
      this.env.time.value += dt;
      // V1D: animation in static layers holds still while the camera rests (the cache is true).
      if (this.env.staticTime !== this.env.time && !resting) this.env.staticTime.value += dt;
    }
    let dirty = moved;
    for (const layer of this.layers) {
      if (!layer.frame?.(dt)) continue;
      dirty = true;
      if (layer.motion !== 'moving') this.statics.note(layer.id, layer.shadowless === true);
    }
    // V2.0: the light map redraws only when a writer changed it (a static-layer event already).
    if (drawLightMap(this.three, this.env)) dirty = true;
    this.updateLighting();
    if (this.updateWeather()) dirty = true;
    // C5E: the storm's glow behind the clouds: a slow swell every eleven seconds or so, a few
    // percent of brightness over more than a second, never a flash (accessibility).
    const storm = this.env.storm.value;
    let glow = 0;
    if (storm > 0 && this.env.motion) {
      const t = this.env.time.value / 11.3;
      const phase = t - Math.floor(t);
      const which = Math.floor(t) % 3;
      if (phase < 0.22 && which !== 1) glow = storm * Math.sin((Math.PI * phase) / 0.22) ** 2;
      dirty = true;
    }
    this.lean.setWeatherFrame(glow, this.env.sky.value, this.env.time.value);
    if (this.env.fog.value > 0 && this.env.motion) dirty = true;
    this.drawLean(now, dirty, resting);
    this.stats.gpuMs = this.gpuTimer.ms;
    if (now - this.fpsWindow >= 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / (now - this.fpsWindow));
      this.frames = 0;
      this.fpsWindow = now;
    }
  };

  /**
   * What the still-frame cache was drawn for: the targets, the preset, the view, every static
   * layer, the light, the shadow map and (V2A) the light map. Any change means drawing it again.
   */
  private stillKey(): string {
    return [
      this.lean?.revision ?? 0,
      this.quality,
      this.env.viewRevision,
      this.statics.revision,
      this.lightRevision,
      this.shadowCache.renders,
      this.env.lightMapRevision,
    ].join('|');
  }

  /** The lean engine's frame: a moving, still or idle scene pass, then the blur and final pass. */
  private drawLean(now: number, dirty: boolean, resting: boolean): void {
    const lean = this.lean;
    // At rest, the still frame is drawn once even if nothing else moves: it is the preset's own
    // sharpness (not the moving step's) and, on Ultra, has its ambient occlusion.
    const stillDue = resting && !this.still.valid(this.stillKey());
    // With the camera at rest, shadows catch up with static changes made while it moved (on Low,
    // with no still frame to draw, this is the only frame that would).
    const shadowsDue =
      this.three.shadowMap.enabled && this.still.rested(now) && this.statics.casters !== this.shadowStatic;
    if (!dirty && !this.needsRender && !stillDue && !shadowsDue) {
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
    const content = shadowContentDue(this.statics, this.shadowStatic, this.shadowAt, now, resting);
    const reason = this.shadowCache.due(view, content);
    if (!reason) return;
    this.updateShadowFlags();
    this.shadowCache.apply(this.sun, view, reason);
    this.three.shadowMap.needsUpdate = true;
    this.shadowStatic = this.statics.casters;
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
    if (setPatternAnisotropy(this.env, q, this.three.capabilities.getMaxAnisotropy()))
      this.invalidateStatic();
    resizeLightMap(this.env, q);
    this.env.motion = preset.ambientMotion;
    this.env.detailDistance = preset.decorDistance;
    this.env.critters = preset.critters;
    this.env.buildingDetail = buildingDetailNow(q);
    this.env.viewRevision++;
    if (shadows && this.sun.shadow.mapSize.x !== preset.shadowMap) {
      this.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.lightHour = -1;
    this.still.enabled = preset.stillCache;
    this.still.ao = preset.stillAo;
    this.still.invalidate();
    this.shadowCache.force();
    this.lean.setBloom(preset.bloom);
    // The constructor applies the first preset before the container is laid out; resize() follows.
    if ((this.layers as RenderLayer[] | undefined) !== undefined) this.applyLayout();
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

  /**
   * C5E: photo mode (17-presentation.md, Camera; C5F's strip drives it through `SeasonRender`): a
   * free camera beyond the play clamp, depth of field (a stronger tilt-shift about the focus), a
   * time of day for the light alone (the sim's clock never moves), and a PNG at one and a half times
   * the still frame's resolution (up to the GPU's limit).
   */
  readonly photo = {
    setPhoto: (on: boolean): void => {
      setFreeCamera(on);
      if (!on) {
        this.timeOfDay = null;
        this.lean.setDepthOfField(0);
        this.lightHour = -1;
      }
      this.invalidate();
    },
    setDepthOfField: (amount: number): void => {
      this.lean.setDepthOfField(Math.min(1, Math.max(0, amount)));
      this.invalidate();
    },
    setTimeOfDay: (hour: number | null): void => {
      this.timeOfDay = hour !== null && Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : null;
      this.lightHour = -1;
      this.invalidate();
    },
    savePng: (): Promise<Blob> => this.savePng(),
  };

  /** C5E: extra resolution for photo mode's PNG (1 otherwise). */
  private photoBoost = 1;

  private async savePng(): Promise<Blob> {
    const canvas = this.three.domElement;
    const max = this.three.capabilities.maxTextureSize || 4096;
    const big = Math.max(canvas.width, canvas.height) || 1;
    this.photoBoost = Math.max(1, Math.min(1.5, (max * 0.9) / big));
    this.applyLayout();
    // Draw the picture now, at rest, and take the canvas in the same task (before it is cleared).
    this.updateLighting();
    this.drawLean(performance.now(), true, QUALITY_PRESETS[this.quality].stillCache);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    this.photoBoost = 1;
    this.applyLayout();
    this.invalidate();
    return blob ?? new Blob([], { type: 'image/png' });
  }

  private captureTarget: WebGLRenderTarget | null = null;
  private readonly captureCamera = new PerspectiveCamera(FOV, 1.6, 0.5, 2000);

  /**
   * C5E: a small picture of the valley about `focus` (tiles), `radius` tiles across, for the
   * Chronicle's snapshots. Drawn offscreen in one scene pass at twice the size into a float target,
   * then tone mapped, graded to sRGB and halved on the CPU into a PNG; the canvas never shows it.
   * The camera looks from the player's own bearing at 50 degrees. What the main view's culling has
   * put away (far chunks) may be missing from a snapshot of somewhere else.
   */
  async capture(opts: {
    focus: [number, number];
    radius: number;
    size: [number, number];
  }): Promise<Blob | null> {
    const [w, h] = opts.size;
    const sw = Math.max(2, Math.round(w * 2));
    const sh = Math.max(2, Math.round(h * 2));
    if (!this.captureTarget || this.captureTarget.width !== sw || this.captureTarget.height !== sh) {
      this.captureTarget?.dispose();
      this.captureTarget = new WebGLRenderTarget(sw, sh, { type: FloatType, depthBuffer: true });
    }
    const cam = this.captureCamera;
    cam.aspect = w / h;
    cam.fov = FOV;
    const [fx, fz] = opts.focus;
    const tx = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(fx)));
    const tz = Math.min(MAP_SIZE - 1, Math.max(0, Math.floor(fz)));
    const y = levelY(this.mirror.height(tx, tz));
    const dist = (Math.max(10, opts.radius) / Math.tan(MathUtils.degToRad(FOV / 2))) * 0.62;
    const dir = this.camera.getWorldDirection(new Vector3());
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = MathUtils.degToRad(50);
    cam.position.set(
      fx - Math.sin(yaw) * Math.cos(pitch) * dist,
      y + Math.sin(pitch) * dist,
      fz - Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    cam.lookAt(fx, y, fz);
    cam.near = Math.max(0.5, dist * 0.05);
    cam.far = dist * 6;
    cam.updateProjectionMatrix();
    cam.layers.mask = this.camera.layers.mask;
    const three = this.three;
    const prev = three.getRenderTarget();
    const fog = this.scene.fog as Fog;
    const fogSave = { near: fog.near, far: fog.far };
    Object.assign(fog, hazeFor(dist));
    three.setRenderTarget(this.captureTarget);
    three.clear();
    three.render(this.scene, cam);
    three.setRenderTarget(prev);
    Object.assign(fog, fogSave);
    const px = new Float32Array(sw * sh * 4);
    three.readRenderTargetPixels(this.captureTarget, 0, 0, sw, sh, px);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(w, h);
    const exposure = this.lean.exposure;
    const sky = this.env.sky.value;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let r = 0;
        let gg = 0;
        let b = 0;
        for (let dj = 0; dj < 2; dj++)
          for (let di = 0; di < 2; di++) {
            const o = ((sh - 1 - (j * 2 + dj)) * sw + (i * 2 + di)) * 4;
            // Where nothing drew (beyond the valley), the sky's haze.
            const a = px[o + 3]!;
            r += a > 0 ? px[o]! : sky.r;
            gg += a > 0 ? px[o + 1]! : sky.g;
            b += a > 0 ? px[o + 2]! : sky.b;
          }
        const [tr, tg, tb] = neutralToneMap(r / 4, gg / 4, b / 4, exposure);
        const q = (j * w + i) * 4;
        img.data[q] = srgb8(tr);
        img.data[q + 1] = srgb8(tg);
        img.data[q + 2] = srgb8(tb);
        img.data[q + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
    this.env.lightMap.dispose();
    this.gpuTimer.dispose();
    this.lean.dispose();
    this.still.dispose();
    this.three.dispose();
    this.three.domElement.remove();
    this.scene.background = new Color(0);
  }
}

/** C5E: Khronos PBR Neutral, as look.ts `lookToneMap` (for `capture`, on the CPU). */
function neutralToneMap(r: number, g: number, b: number, exposure: number): [number, number, number] {
  r *= exposure;
  g *= exposure;
  b *= exposure;
  const start = 0.8 - 0.04;
  const desat = 0.15;
  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset;
  g -= offset;
  b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < start) return [r, g, b];
  const d = 1 - start;
  const np = 1 - (d * d) / (peak + d - start);
  const k = np / peak;
  r *= k;
  g *= k;
  b *= k;
  const t = 1 - 1 / (desat * (peak - np) + 1);
  return [r + (np - r) * t, g + (np - g) * t, b + (np - b) * t];
}

/** Linear to an sRGB byte. */
function srgb8(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
}
