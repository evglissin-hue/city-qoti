// V4: the picture develops when you stop (docs/spec/17-presentation.md, Visual direction, 6;
// docs/build/v4-wave-notes.md). When the camera rests, the still-frame cache (cache.ts) keeps
// folding samples into its picture, one a frame: each jitters the pixel, the sun inside a small
// disc and the lens, and one in SKY_EVERY lights the scene from the sky instead of the sun.
//
// V4.0 fixes the interface with stubs that change nothing on screen: the jitter sequence (pure, and
// unused until V4A), the governor's inputs and `refineGoal`, which keeps today's still frame (0
// samples) until V4A builds the refinement. V4A owns this file.
import type { Quality } from './quality';

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
  /** `?debug&refine=0`: refinement off on this build (the before for V4X's laptop tables). */
  off: boolean;
}

/**
 * How many samples this rest develops to: 0 keeps the plain still frame. V4.0's stub always says 0,
 * so nothing on screen changes. V4A: the preset's count, none when `off`, and none while moving
 * frames already run slow or a sample frame would not fit its 12 ms (22-quality.md, Rest-frame
 * refinement); Medium falls back to 0 on a laptop where the measured cost does not fit.
 */
export function refineGoal(input: RefineGovernorInput): number {
  void input;
  return 0;
}

/** `?debug&refine=0` turns refinement off on this build, to compare before and after on one build. */
export function refineOffFromUrl(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has('debug') && q.get('refine') === '0';
}
