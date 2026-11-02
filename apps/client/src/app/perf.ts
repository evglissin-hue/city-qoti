// Debug only (V1.0): the perf run behind `window.__qoti.perf()` and `apps/client/e2e/v1-perf.mjs`.
// For each quality preset it drives the camera along a fixed path for a while (a pan, an orbit, a
// zoom in and a zoom out, as keys and a trackpad would), then lets it rest while residents walk, and
// reports average and 95th percentile frame and GPU times for the moving and the idle part. Run it
// on a real laptop for timings; headless browsers draw in software, so only draws and triangles
// mean anything there.
import type { Quality } from '../render/quality';
import type { Renderer } from '../render/renderer';

export interface PerfOptions {
  /** Presets to run, in order (default: Low, Medium, High and Ultra). */
  presets?: Quality[];
  /** Seconds of camera movement and of rest per preset (default 10 each). */
  move?: number;
  rest?: number;
  /** A name for the table's scene column. */
  scene?: string;
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

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function summarize(samples: Sample[], gpu: number[]): PerfPart {
  const ms = samples.map((s) => s.ms);
  return {
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
): Promise<PerfPart> {
  const samples: Sample[] = [];
  const gpu: number[] = [];
  const timer = renderer.gpuTimer;
  const start = await nextFrame();
  let last = start;
  let seen = timer.total;
  for (;;) {
    const now = await nextFrame();
    const t = (now - start) / 1000;
    if (t > seconds) break;
    step(t, (now - last) / 1000);
    if (t >= skip) {
      const s = renderer.stats;
      samples.push({ ms: now - last, draws: s.drawCalls, triangles: s.triangles });
      const fresh = Math.min(timer.total - seen, timer.history.length);
      if (fresh > 0) gpu.push(...timer.history.slice(-fresh));
    }
    seen = timer.total;
    last = now;
  }
  return summarize(samples, gpu);
}

const fmt = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
const pair = (a: number | null, b: number | null): string => `${fmt(a)} / ${fmt(b)}`;

export function perfTable(rows: PerfRow[]): string {
  const head = [
    '| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles |',
    '|---|---|---|---|---|---|---|---|',
  ];
  return [
    ...head,
    ...rows.map(
      (r) =>
        `| ${r.scene} | ${r.quality} | ${pair(r.moving.frameAvg, r.moving.frameP95)} | ${pair(r.moving.gpuAvg, r.moving.gpuP95)} | ${pair(r.idle.frameAvg, r.idle.frameP95)} | ${pair(r.idle.gpuAvg, r.idle.gpuP95)} | ${r.moving.draws} | ${(r.moving.triangles / 1e6).toFixed(2)} M |`,
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
  const rows: PerfRow[] = [];
  for (const quality of presets) {
    renderer.setQuality(quality);
    goHome();
    // Let the preset settle (targets, shadow maps, levels of detail) before measuring.
    await phase(renderer, 1.5, 99, () => {});
    const quarter = move / 4;
    const moving = await phase(renderer, move, 0, (t, dt) => {
      if (t < quarter) rig.focus(home.x + (t / quarter) * 30, home.z + (t / quarter) * 12);
      else if (t < quarter * 2) rig.rotateBy(1.6 * dt, 0);
      else if (t < quarter * 3) rig.zoomBy(Math.exp(-1.6 * dt));
      else rig.zoomBy(Math.exp(1.8 * dt));
    });
    // The camera glides a moment after the last input; the idle part starts once it has stopped.
    const idle = await phase(renderer, rest, Math.min(1.5, rest / 2), () => {});
    rows.push({ scene, quality, moving, idle });
    goHome();
  }
  renderer.setQuality(before);
  const table = perfTable(rows);
  console.log(table);
  return { rows, table };
}
