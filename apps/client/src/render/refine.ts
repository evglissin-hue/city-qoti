// V4: the picture develops when you stop (docs/spec/17-presentation.md, Visual direction, 6;
// docs/build/v4-wave-notes.md). When the camera rests, the still-frame cache (cache.ts) keeps
// folding samples into its picture, one a frame: each jitters the pixel, the sun inside a small
// disc and the lens, and one in SKY_EVERY lights the scene from the sky instead of the sun.
//
// V4.0 fixed the interface (the jitter sequence, the governor's inputs); V4A builds the governor
// (`refineGoal`), the meter of sample frames it reads (`SampleMeter`) and the pure math of a
// sample's camera (`sampleProjection`). The accumulation is cache.ts's, the drawing the renderer's
// `drawSample`. V4A owns this file.
import { QUALITY_PRESETS, type Quality } from './quality';

/** Photo mode saves the developed picture at this many samples (V4B; `capture`'s `samples`). */
export const PHOTO_SAMPLES = 64;
/** The development settles inside this long on High at 60 fps (30-roadmap.md, V4 acceptance). */
export const SETTLE_MS = 600;
/** One sample in this many lights the scene from a random part of the sky instead of the sun. */
export const SKY_EVERY = 4;

/** What one sample of the development jitters. Sample 0 is the plain still frame: no jitter. */
export interface RefineJitter {
  /** The sample's place in the sequence, from 0. */
  index: number;
  /** The pixel's offset in pixels, each in [-0.5, 0.5): crisp brick courses and roof tiles. */
  pixel: [number, number];
  /** Where the sun sits inside its disc, a point in the unit disc (V4A scales it: soft shadows). */
  sun: [number, number];
  /** Where the lens samples its aperture, a point in the unit disc (true depth of field). */
  lens: [number, number];
  /**
   * One sample in SKY_EVERY: light from this direction of the sky instead of the sun (a unit
   * vector, y up), for the soft shadow of alleys, eaves and courtyards; null on the others.
   */
  sky: [number, number, number] | null;
}

/** The radical inverse of `index` in `base`: a Halton sequence's value, in [0, 1). */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = Math.max(0, Math.floor(index));
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** A point of the unit square to the unit disc, keeping the spread even (Shirley's concentric map). */
export function toDisc(u: number, v: number): [number, number] {
  const a = 2 * u - 1;
  const b = 2 * v - 1;
  if (a === 0 && b === 0) return [0, 0];
  if (Math.abs(a) > Math.abs(b)) {
    const t = (Math.PI / 4) * (b / a);
    return [a * Math.cos(t), a * Math.sin(t)];
  }
  const t = Math.PI / 2 - (Math.PI / 4) * (a / b);
  return [b * Math.cos(t), b * Math.sin(t)];
}

/**
 * The jitter of sample `index`: low-discrepancy points (Halton in bases 2 and 3 for the pixel, 5
 * and 7 for the sun, 11 and 13 for the lens, 17 and 19 for the sky), so any first n samples cover
 * their ranges evenly. Pure; V4A may retune it, keeping the shape.
 */
export function refineJitter(index: number): RefineJitter {
  if (index <= 0) return { index: 0, pixel: [0, 0], sun: [0, 0], lens: [0, 0], sky: null };
  const pixel: [number, number] = [halton(index, 2) - 0.5, halton(index, 3) - 0.5];
  const sun = toDisc(halton(index, 5), halton(index, 7));
  const lens = toDisc(halton(index, 11), halton(index, 13));
  let sky: [number, number, number] | null = null;
  if (index % SKY_EVERY === 0) {
    // Cosine-weighted over the upper hemisphere: a point of the disc lifted onto the dome.
    const [x, z] = toDisc(halton(index, 17), halton(index, 19));
    sky = [x, Math.sqrt(Math.max(0, 1 - x * x - z * z)), z];
  }
  return { index, pixel, sun, lens, sky };
}

/** What the governor reads each rest (the renderer gathers it when it keeps a still frame). */
export interface RefineGovernorInput {
  /** The preset, and its own sample count (`QualityPreset.refineSamples`). */
  quality: Quality;
  presetSamples: number;
  /**
   * Mean ms between moving frames over the last judged window (`DynamicResolution.movingMs`), or
   * null before the first window: a slow pan says the laptop has no room for samples.
   */
  movingFrameMs: number | null;
  /** Moving frames' dynamic resolution step (`DynamicResolution.stepIndex`; 0 is full resolution). */
  resolutionStep: number;
  /** GPU ms per drawn frame, the recent average (`GpuTimer.ms`), or null with no GPU timer. */
  gpuMs: number | null;
  /** GPU ms of the last sample frames, or null before any (V4A measures them; null in V4.0). */
  sampleGpuMs: number | null;
  /**
   * Photo mode is on: the still frame develops to PHOTO_SAMPLES whatever the moving frames said (a
   * photo is taken at rest and may wait for it), and Save PNG waits until `samples` reaches the goal.
   */
  photo: boolean;
  /** `?debug&refine=0`: refinement off on this build (the before for V4X's laptop tables). */
  off: boolean;
}

/** V4A: moving frames further apart than this (ms, under about 55 fps) leave no room for samples. */
export const SLOW_MOVING_MS = 18;
/** V4A: a sample frame's GPU budget (22-quality.md, Rest-frame refinement: each within 12 ms). */
export const SAMPLE_BUDGET_MS = 12;

/**
 * How many samples this rest develops to: 0 keeps the plain still frame. None on a preset without
 * the still-frame cache (Low) or when `off` (`?debug&refine=0`); PHOTO_SAMPLES in photo mode on
 * every other preset, whatever the frames said (a photo is taken at rest and may wait for it);
 * else none while moving frames already run slow (`movingFrameMs` over SLOW_MOVING_MS, or dynamic
 * resolution stepped down) or a sample frame would not fit its SAMPLE_BUDGET_MS (`sampleGpuMs`,
 * measured on earlier rests; before any, the recent frames' `gpuMs`), and otherwise the preset's
 * count. Medium's fallback is its preset count of 0 (`QualityPreset.refineSamples`), taken if the
 * laptops' tables say its sample frames do not fit Kat's laptop; on any laptop the measured sample
 * frames turn it off by themselves.
 */
export function refineGoal(input: RefineGovernorInput): number {
  if (input.off || !QUALITY_PRESETS[input.quality].stillCache) return 0;
  if (input.photo) return PHOTO_SAMPLES;
  if (input.presetSamples <= 0 || input.resolutionStep > 0) return 0;
  if (input.movingFrameMs !== null && input.movingFrameMs > SLOW_MOVING_MS) return 0;
  const sample = input.sampleGpuMs ?? input.gpuMs;
  if (sample !== null && sample > SAMPLE_BUDGET_MS) return 0;
  return input.presetSamples;
}

/** V4A: results that arrive before this many sample frames have drawn may belong to earlier frames. */
const METER_SKIP = 4;
/** V4A: a measure older than this (ms) is forgotten, so a laptop that was busy gets another try. */
export const METER_STALE_MS = 60_000;

/**
 * V4A: the GPU ms of sample frames, for the governor's `sampleGpuMs`. The frame timer (`GpuTimer`)
 * reads each frame's result back a frame or three later, in order; a development's frames are all
 * sample frames, so the results that arrive from its fourth sample frame on are theirs. A running
 * mean across rests, for one preset at a time, forgotten after METER_STALE_MS.
 */
export class SampleMeter {
  private value: number | null = null;
  private at = -Infinity;
  private seen = 0;
  private frames = 0;
  private quality: Quality | null = null;

  /** A development starts: the timer has delivered `total` results so far. */
  start(total: number): void {
    this.seen = total;
    this.frames = 0;
  }

  /**
   * A sample frame drew at `now` on `quality`; `total` and `history` are the timer's (`GpuTimer`).
   * A new preset starts the measure over (it meant another preset).
   */
  sample(total: number, history: readonly number[], now: number, quality: Quality): void {
    if (quality !== this.quality) {
      this.value = null;
      this.at = -Infinity;
      this.quality = quality;
    }
    this.frames++;
    const fresh = Math.min(total - this.seen, history.length);
    this.seen = total;
    if (this.frames < METER_SKIP || fresh <= 0) return;
    for (const ms of history.slice(history.length - fresh)) {
      this.value = this.value === null ? ms : this.value + (ms - this.value) * 0.25;
    }
    this.at = now;
  }

  /** The estimate on `quality` at `now`, or null before any (or once it is stale). */
  read(now: number, quality: Quality): number | null {
    return quality !== this.quality || now - this.at > METER_STALE_MS ? null : this.value;
  }
}

/**
 * V4A: the sun's disc, its angular radius in radians: each sample moves the sun inside it, so
 * shadows soften with distance from what casts them (a real sun is about a quarter of a degree;
 * the miniature's is wider) *(tune)*.
 */
export const SUN_DISC = 1.6 * (Math.PI / 180);

/**
 * V4A: how a sample moves the camera: `eye` is the lens offset in the camera's own x and y
 * (world units), `shift` what is added to the projection matrix's elements 8 and 9 (its off-axis
 * terms), which moves the picture by `jitter.pixel` pixels and keeps the focus plane (`focus` world
 * units along the view axis) where it was, so everything there stays sharp while nearer and farther
 * things blur by their depth.
 * `p00` and `p11` are the projection matrix's scales, `width` and `height` the target in pixels,
 * `aperture` the lens's radius in world units (0 for none).
 */
export function sampleProjection(
  jitter: RefineJitter,
  width: number,
  height: number,
  aperture: number,
  focus: number,
  p00: number,
  p11: number,
): { eye: [number, number]; shift: [number, number] } {
  const ex = jitter.lens[0] * aperture;
  const ey = jitter.lens[1] * aperture;
  const f = Math.max(1e-3, focus);
  return {
    eye: [ex, ey],
    shift: [
      (2 * jitter.pixel[0]) / Math.max(1, width) - (p00 * ex) / f,
      (2 * jitter.pixel[1]) / Math.max(1, height) - (p11 * ey) / f,
    ],
  };
}

/** `?debug&refine=0` turns refinement off on this build, to compare before and after on one build. */
export function refineOffFromUrl(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('debug') && q.get('refine') === '0';
}
