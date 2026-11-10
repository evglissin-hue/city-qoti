// Debug only (V1.0): the perf run behind `window.__qoti.perf()` and `apps/client/e2e/v1-perf.mjs`.
// For each quality preset it drives the camera along a fixed path for a while (a pan, an orbit, a
// zoom in and a zoom out, as keys and a trackpad would), then lets it rest while residents walk, and
// reports average and 95th percentile frame and GPU times for the moving and the idle part. Run it
// on a real laptop for timings; headless browsers draw in software, so only draws and triangles
// mean anything there.
//
// V2.0: Settings, Measure this laptop (`measureLaptop` below, `ui/panels/Measure.tsx`) runs it on
// every preset in the valley on screen, then in the village and town showcases, and puts the valley
// back as it was.
import type { PerfMachine } from '@qoti/protocol';
import { serialize, SIM_VERSION } from '@qoti/sim';
import { WebGLRenderTarget } from 'three';
import { villageShowcase } from '../render/showcase';
import { startSyntheticResidents } from '../render/synthetic';
import { townShowcase } from '../render/townShowcase';
import type { Quality } from '../render/quality';
import type { Renderer } from '../render/renderer';
import type { Mirror } from '../state/mirror';
import { SimHost } from '../worker/host';

export interface PerfOptions {
  /** Presets to run, in order (default: Low, Medium, High and Ultra). */
  presets?: Quality[];
  /** Seconds of camera movement and of rest per preset (default 10 each). */
  move?: number;
  rest?: number;
  /** A name for the table's scene column. */
  scene?: string;
  /** V2.0: seconds a preset settles before it is measured (default 1.5). */
  settle?: number;
  /** V2.0: stops the run at the next frame (it throws `PerfAborted`), the camera and preset back. */
  signal?: AbortSignal;
  /** V2.0: called as each preset starts, with its place in `presets`. */
  onPreset?: (quality: Quality, index: number) => void;
}

export interface PerfPart {
  frames: number;
  /** Time between animation frames, ms. */
  frameAvg: number;
  frameP95: number;
  /** GPU time per drawn frame, ms, where the browser has a GPU timer; else null. */
  gpuAvg: number | null;
  gpuP95: number | null;
  draws: number;
  triangles: number;
  /** V1D: drawn frames by mode, and sun shadow renders, in this part. */
  modes: { moving: number; still: number; idle: number };
  shadowRenders: number;
}

export interface PerfRow {
  scene: string;
  quality: Quality;
  moving: PerfPart;
  idle: PerfPart;
}

export interface PerfResult {
  rows: PerfRow[];
  /** The rows as a Markdown table, for the wave notes and PRs. */
  table: string;
}

interface Sample {
  ms: number;
  draws: number;
  triangles: number;
}

/** V1D: counts what the renderer drew during a part (from its running counters). */
interface Tally {
  modes: { moving: number; still: number; idle: number };
  shadowRenders: number;
}

/** V2.0: what a stopped run throws (Escape or Stop in Measure this laptop). */
export class PerfAborted extends Error {
  constructor() {
    super('Measuring stopped');
    this.name = 'PerfAborted';
  }
}

export const isPerfAborted = (e: unknown): e is PerfAborted => e instanceof PerfAborted;

/** The next animation frame's time; a stop rejects at once rather than waiting for a slow frame. */
const nextFrame = (signal?: AbortSignal): Promise<number> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PerfAborted());
      return;
    }
    const stop = (): void => {
      cancelAnimationFrame(id);
      reject(new PerfAborted());
    };
    const id = requestAnimationFrame((t) => {
      signal?.removeEventListener('abort', stop);
      resolve(t);
    });
    signal?.addEventListener('abort', stop, { once: true });
  });

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function summarize(samples: Sample[], gpu: number[], tally: Tally): PerfPart {
  const ms = samples.map((s) => s.ms);
  return {
    ...tally,
    frames: samples.length,
    frameAvg: mean(ms),
    frameP95: p95(ms),
    gpuAvg: gpu.length ? mean(gpu) : null,
    gpuP95: gpu.length ? p95(gpu) : null,
    draws: Math.round(mean(samples.map((s) => s.draws))),
    triangles: Math.round(mean(samples.map((s) => s.triangles))),
  };
}

/** Runs `step` every animation frame for `seconds`, sampling frame times and the renderer's stats. */
async function phase(
  renderer: Renderer,
  seconds: number,
  skip: number,
  step: (t: number, dt: number) => void,
  signal?: AbortSignal,
): Promise<PerfPart> {
  const samples: Sample[] = [];
  const gpu: number[] = [];
  const timer = renderer.gpuTimer;
  const tally: Tally = { modes: { moving: 0, still: 0, idle: 0 }, shadowRenders: 0 };
  const start = await nextFrame(signal);
  let last = start;
  let seen = timer.total;
  let shadows = renderer.stats.shadowRenders;
  let drawn = renderer.stats.drawn;
  for (;;) {
    const now = await nextFrame(signal);
    const t = (now - start) / 1000;
    if (t > seconds) break;
    step(t, (now - last) / 1000);
    if (t >= skip) {
      const s = renderer.stats;
      samples.push({ ms: now - last, draws: s.drawCalls, triangles: s.triangles });
      const fresh = Math.min(timer.total - seen, timer.history.length);
      if (fresh > 0) gpu.push(...timer.history.slice(-fresh));
      if (s.drawn !== drawn) tally.modes[s.mode]++;
      tally.shadowRenders += s.shadowRenders - shadows;
    }
    drawn = renderer.stats.drawn;
    shadows = renderer.stats.shadowRenders;
    seen = timer.total;
    last = now;
  }
  return summarize(samples, gpu, tally);
}

const fmt = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
const pair = (a: number | null, b: number | null): string => `${fmt(a)} / ${fmt(b)}`;

export function perfTable(rows: PerfRow[]): string {
  const head = [
    '| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  return [
    ...head,
    ...rows.map(
      (r) =>
        `| ${r.scene} | ${r.quality} | ${pair(r.moving.frameAvg, r.moving.frameP95)} | ${pair(r.moving.gpuAvg, r.moving.gpuP95)} | ${pair(r.idle.frameAvg, r.idle.frameP95)} | ${pair(r.idle.gpuAvg, r.idle.gpuP95)} | ${r.moving.draws} | ${(r.moving.triangles / 1e6).toFixed(2)} M | ${r.idle.modes.moving} / ${r.idle.modes.still} / ${r.idle.modes.idle}, ${r.idle.shadowRenders} |`,
    ),
  ].join('\n');
}

/**
 * The perf run: every preset in turn from the same view, a scripted camera path then a rest. Puts
 * the camera and the preset back as they were, and logs the table.
 */
export async function runPerf(renderer: Renderer, opts: PerfOptions = {}): Promise<PerfResult> {
  const presets = opts.presets ?? (['low', 'medium', 'high', 'ultra'] as Quality[]);
  const move = opts.move ?? 10;
  const rest = opts.rest ?? 10;
  const scene = opts.scene ?? 'current';
  const rig = renderer.rig;
  const home = rig.look;
  const before = renderer.qualityLevel;
  const goHome = (): void => {
    rig.focus(home.x, home.z, home.distance);
    rig.rotateBy(home.yaw - rig.look.yaw, 0);
    rig.snap();
    renderer.invalidate();
  };
  const settle = opts.settle ?? 1.5;
  const signal = opts.signal;
  const rows: PerfRow[] = [];
  try {
    for (const [index, quality] of presets.entries()) {
      opts.onPreset?.(quality, index);
      renderer.setQuality(quality);
      goHome();
      // Let the preset settle (targets, shadow maps, levels of detail) before measuring.
      await phase(renderer, settle, 99, () => {}, signal);
      const quarter = move / 4;
      const moving = await phase(
        renderer,
        move,
        0,
        (t, dt) => {
          if (t < quarter) rig.focus(home.x + (t / quarter) * 30, home.z + (t / quarter) * 12);
          else if (t < quarter * 2) rig.rotateBy(1.6 * dt, 0);
          else if (t < quarter * 3) rig.zoomBy(Math.exp(-1.6 * dt));
          else rig.zoomBy(Math.exp(1.8 * dt));
        },
        signal,
      );
      // The camera glides a moment after the last input; V1D: it is snapped to its goal, so the
      // idle part is a rest on any machine (in a software renderer the glide outlasts the rest,
      // since it advances at most 0.1 s a frame and a frame takes seconds).
      rig.snap();
      renderer.invalidate();
      const idle = await phase(renderer, rest, Math.min(1.5, rest / 2), () => {}, signal);
      rows.push({ scene, quality, moving, idle });
      goHome();
    }
  } finally {
    // V2.0: a stopped run leaves the view and the preset as it found them, too.
    goHome();
    renderer.setQuality(before);
  }
  const table = perfTable(rows);
  console.log(table);
  return { rows, table };
}

/**
 * Triangles each render layer draws from the current camera (the camera pass only, no shadows or
 * post), by drawing each layer's root alone into a small off-screen target. For the before and
 * after numbers per track (trees for V1C, buildings for V1B); a render per layer, so it is slow in
 * a software renderer.
 */
export function layerTriangles(renderer: Renderer): Record<string, number> {
  const { three, scene, camera } = renderer;
  const roots = scene.children.filter((c) => c.name.startsWith('layer:'));
  const shown = roots.map((r) => r.visible);
  const autoShadow = three.shadowMap.autoUpdate;
  const autoReset = three.info.autoReset;
  const before = three.getRenderTarget();
  const target = new WebGLRenderTarget(64, 64);
  three.shadowMap.autoUpdate = false;
  three.info.autoReset = false;
  three.setRenderTarget(target);
  const out: Record<string, number> = {};
  try {
    for (const root of roots) {
      roots.forEach((r) => (r.visible = r === root));
      three.info.reset();
      three.render(scene, camera);
      out[root.name.slice('layer:'.length)] = three.info.render.triangles;
    }
  } finally {
    roots.forEach((r, i) => (r.visible = shown[i]!));
    three.setRenderTarget(before);
    three.shadowMap.autoUpdate = autoShadow;
    three.info.autoReset = autoReset;
    target.dispose();
    renderer.invalidate();
  }
  return out;
}

// --- V2.0: Measure this laptop ----------------------------------------------------------------

/** The build a run was taken on: the sim's version (as the debug overlay shows it), and dev or not. */
export const BUILD_ID = `${SIM_VERSION}${import.meta.env.DEV ? '-dev' : ''}`;

export const MEASURE_PRESETS: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

/** The valley on screen, then V1's two showcase scenes (`v1-perf.mjs`: village and town). */
export type MeasureScene = 'valley' | 'village' | 'town';
export const MEASURE_SCENES: readonly MeasureScene[] = ['valley', 'village', 'town'];

/** Every run takes the light at the same hour, so tables from two laptops compare. */
export const MEASURE_HOUR = 11;

/** What a run needs from the session (the Session itself, in the game). */
export interface MeasureHost {
  readonly mirror: Mirror;
  readonly renderer: Renderer | null;
  /** Live turns wait instead of reaching the sim, so the Mirror can hold a stand-in scene. */
  holdTurns(): void;
  /** The Mirror back exactly as the sim has it, then any held turns through. */
  reloadMirror(): Promise<void>;
}

export interface MeasureProgress {
  stage: 'loading' | 'measuring' | 'restoring';
  scene: MeasureScene;
  quality: Quality | null;
  /** Rows started so far (1 to `total` while measuring), and how many there are. */
  step: number;
  total: number;
}

export interface MeasureOptions {
  /** Seconds of movement, rest and settling per preset (default 10, 10 and 1.5). */
  move?: number;
  rest?: number;
  settle?: number;
  /** Most seconds to wait for a showcase to stream in before measuring it (default 20). */
  settleMax?: number;
  presets?: readonly Quality[];
  scenes?: readonly MeasureScene[];
  signal?: AbortSignal;
  onProgress?: (p: MeasureProgress) => void;
}

/** What the Mirror holds, for checking the valley came back as it was. */
export interface MirrorCounts {
  buildings: number;
  decor: number;
  residents: number;
  roads: number;
  trees: number;
}

export interface MeasureResult extends PerfResult {
  /** The Mirror before the showcases and after the reload (null when no showcase ran). */
  restored: { before: MirrorCounts; after: MirrorCounts; same: boolean } | null;
}

export function mirrorCounts(m: Mirror): MirrorCounts {
  return {
    buildings: m.buildings.size,
    decor: m.decor.size,
    residents: m.residents.size,
    roads: m.roadCount(),
    trees: m.treeCount(),
  };
}

export function sameCounts(a: MirrorCounts, b: MirrorCounts): boolean {
  return (
    a.buildings === b.buildings &&
    a.decor === b.decor &&
    a.residents === b.residents &&
    a.roads === b.roads &&
    a.trees === b.trees
  );
}

/** About how long a run takes, in seconds: each row settles, moves and rests; showcases load. */
export function measureSeconds(
  opts: Pick<MeasureOptions, 'move' | 'rest' | 'settle' | 'settleMax'> = {},
): number {
  const row = (opts.settle ?? 1.5) + (opts.move ?? 10) + (opts.rest ?? 10) + 1;
  const load = Math.min(opts.settleMax ?? 20, 12) + 3;
  return MEASURE_SCENES.length * MEASURE_PRESETS.length * row + (MEASURE_SCENES.length - 1) * load;
}

/** The browser, screen, GPU and build, for the stored run and the copied table. */
export function perfMachine(renderer: Renderer | null): PerfMachine {
  let gpu: string | null = null;
  try {
    const gl = renderer?.three.getContext();
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || null;
  } catch {
    // Some browsers keep it to themselves; the run is still worth keeping.
  }
  return {
    browser: navigator.userAgent,
    screen: [screen.width, screen.height],
    pixelRatio: devicePixelRatio,
    gpu,
    build: BUILD_ID,
  };
}

/** The table as the panel copies it: a line on the machine, the browser, then the Markdown table. */
export function measureMarkdown(table: string, machine: PerfMachine): string {
  const [w, h] = machine.screen;
  return [
    `Measure this laptop: ${machine.gpu ?? 'GPU not named by the browser'}, screen ${w} x ${h} at ${machine.pixelRatio}x, build ${machine.build}, light at ${MEASURE_HOUR}:00.`,
    `Browser: ${machine.browser}`,
    '',
    table,
  ].join('\n');
}

/** The hour the light is pinned to (`?debug&hour=` or `__qoti.setHour`), or null. */
function pinnedHour(renderer: Renderer): number | null {
  return (renderer as unknown as { hourOverride?: number | null }).hourOverride ?? null;
}

/** Waits until the view has streamed in (no static layer changed over three looks), or `max` s. */
async function settleView(renderer: Renderer, max: number, signal?: AbortSignal): Promise<void> {
  const start = await nextFrame(signal);
  const revs: number[] = [];
  for (;;) {
    let now = start;
    for (let i = 0; i < 3; i++) now = await nextFrame(signal);
    revs.push(renderer.staticRevision);
    const last = revs.slice(-3);
    const waited = (now - start) / 1000;
    if (waited >= max) return;
    if (waited >= 1 && last.length === 3 && last[0] === last[2]) return;
  }
}

interface StandIn {
  center: [number, number];
  distance: number;
  stop: () => void;
}

/**
 * A showcase in this client's Mirror only, on the village fixture's ground (the flat test world
 * V1's showcases were written for), so its rows mean the same on every valley and match
 * `v1-perf.mjs`. The fixture runs in a sim worker of its own, so its residents walk as they do there.
 */
async function showcase(mirror: Mirror, scene: 'village' | 'town'): Promise<StandIn> {
  const { villageFixture } = await import('../../../../packages/sim/test/fixtures/village');
  const host = new SimHost();
  let timer: ReturnType<typeof setInterval> | 0 = 0;
  const stops: (() => void)[] = [];
  const stop = (): void => {
    if (timer) clearInterval(timer);
    timer = 0;
    for (const s of stops.reverse()) s();
    stops.length = 0;
    host.onUpdate = null;
    host.onAgents = null;
    host.terminate();
  };
  try {
    const view = await host.init({ kind: 'snapshot', data: serialize(villageFixture().state) });
    mirror.load(view);
    host.onUpdate = (u) => mirror.apply(u);
    host.onAgents = (t, data) => mirror.applyAgents(t, data, performance.now());
    let t = view.lastTurn;
    timer = setInterval(() => host.turns([{ t: ++t, cmds: [] }]), 100);
    if (scene === 'village') {
      stops.push(villageShowcase(mirror, { dense: true }).stop);
      return { center: [64, 60], distance: 70, stop };
    }
    const r = townShowcase(mirror);
    const [x0, z0, x1, z1] = r.rect;
    stops.push(
      startSyntheticResidents(mirror, 2000, {
        center: [r.center[0], (z0 + z1) / 2],
        radius: Math.max(x1 - x0, z1 - z0) / 2,
      }),
    );
    return { center: r.center, distance: 90, stop };
  } catch (e) {
    stop();
    throw e;
  }
}

/**
 * Measure this laptop: `runPerf` on every preset in the valley on screen, then in the village and
 * town showcases, then the valley back as it was. The showcases live in this client's Mirror only:
 * live turns wait meanwhile (`holdTurns`) and the Mirror is reloaded from the sim worker at the end
 * (`reloadMirror`), so the sim never sees any of it. The camera, the preset and the hour pin go back
 * too, also when the run is stopped (it then throws `PerfAborted`).
 */
export async function measureLaptop(host: MeasureHost, opts: MeasureOptions = {}): Promise<MeasureResult> {
  const renderer = host.renderer;
  if (!renderer) throw new Error('No valley on screen to measure');
  const mirror = host.mirror;
  const presets = [...(opts.presets ?? MEASURE_PRESETS)];
  const scenes = opts.scenes ?? MEASURE_SCENES;
  const total = presets.length * scenes.length;
  const { signal, onProgress } = opts;
  const rig = renderer.rig;
  const look = rig.look;
  const quality = renderer.qualityLevel;
  const hour = pinnedHour(renderer);
  // The showcases wrap the Mirror's agent feed; whatever it was goes back at the end.
  const feed = Object.getOwnPropertyDescriptor(mirror, 'applyAgents');
  const rows: PerfRow[] = [];
  let before: MirrorCounts | null = null;
  let after: MirrorCounts | null = null;
  let stand: StandIn | null = null;
  renderer.setDebugHour(MEASURE_HOUR);
  try {
    for (const [si, scene] of scenes.entries()) {
      if (signal?.aborted) throw new PerfAborted();
      if (scene !== 'valley') {
        onProgress?.({ stage: 'loading', scene, quality: null, step: si * presets.length, total });
        if (!before) {
          before = mirrorCounts(mirror);
          host.holdTurns();
        }
        stand?.stop();
        stand = null;
        stand = await showcase(mirror, scene);
        if (signal?.aborted) throw new PerfAborted();
        rig.focus(stand.center[0] + 0.5, stand.center[1] + 0.5, stand.distance);
        // The default view's turn, so two laptops look down the same streets.
        rig.rotateBy(0.5 - rig.look.yaw, 0);
        rig.snap();
        renderer.invalidate();
        await settleView(renderer, opts.settleMax ?? 20, signal);
      }
      const r = await runPerf(renderer, {
        scene,
        presets,
        ...(opts.move !== undefined && { move: opts.move }),
        ...(opts.rest !== undefined && { rest: opts.rest }),
        ...(opts.settle !== undefined && { settle: opts.settle }),
        ...(signal && { signal }),
        onPreset: (q, i) =>
          onProgress?.({ stage: 'measuring', scene, quality: q, step: si * presets.length + i + 1, total }),
      });
      rows.push(...r.rows);
    }
  } finally {
    onProgress?.({ stage: 'restoring', scene: 'valley', quality: null, step: rows.length, total });
    stand?.stop();
    if (feed) Object.defineProperty(mirror, 'applyAgents', feed);
    else delete (mirror as { applyAgents?: unknown }).applyAgents;
    try {
      if (before) {
        await host.reloadMirror();
        after = mirrorCounts(mirror);
      }
    } finally {
      rig.focus(look.x, look.z, look.distance);
      rig.rotateBy(look.yaw - rig.look.yaw, 0);
      rig.snap();
      renderer.setQuality(quality);
      renderer.setDebugHour(hour);
      renderer.invalidate();
    }
  }
  return {
    rows,
    table: perfTable(rows),
    restored: before && after ? { before, after, same: sameCounts(before, after) } : null,
  };
}
