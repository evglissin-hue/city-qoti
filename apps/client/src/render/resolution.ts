/**
 * Dynamic resolution: watches how long frames take while the camera moves and steps the render
 * scale of moving frames down when the frame rate sags, then back up once there is room again. Busy
 * Retina laptops keep a smooth 60 fps at a slightly softer image instead of stuttering at full
 * sharpness.
 *
 * V1D: only moving frames count (an idle frame draws the still-frame cache and the moving layers,
 * which says nothing about what a pan costs), and only intervals between back-to-back drawn frames.
 * Stepping back up waits for a few seconds of headroom; a step-up that fails soon after (frames
 * turn slow again within FAIL_MS) doubles that wait for the next try, so the scale never flaps. A
 * quality change starts over. Still and idle frames always draw at the preset's own scale.
 */

/** Render scales tried in order, from full resolution down. */
export const RESOLUTION_STEPS = [1, 0.85, 0.72, 0.6, 0.5] as const;

/** Frames slower than this (ms) on average are too slow: under about 45 fps. */
const SLOW_MS = 22;
/** Frames faster than this on average leave room to step back up: about 66 fps or better. */
const FAST_MS = 15;
/** Frames per judgement. */
const WINDOW = 30;
/** Moving time (ms) with headroom before the first try at stepping back up. */
export const UP_WAIT_MS = 2500;
/** A step-up followed by slow frames within this much moving time (ms) failed. */
export const FAIL_MS = 3000;
/** The wait never grows past this (ms of moving time). */
const MAX_WAIT_MS = 40_000;
/** Intervals longer than this are pauses (tab switches, a dragged window), not frame times. */
const GAP_MS = 1000;
/** The smallest pixel ratio the scale may reach, so the valley never turns to mush. */
export const MIN_PIXEL_RATIO = 0.6;

export class DynamicResolution {
  /** Off keeps full resolution (debug screenshots: `?debug&fixedres`). */
  enabled = true;
  private step = 0;
  private sum = 0;
  private count = 0;
  private lastDrawn = -1;
  /** Moving time (ms) with headroom since the last change. */
  private headroom = 0;
  /** Moving time (ms) a step-up waits for; doubles after a failed one. */
  private upWait = UP_WAIT_MS;
  /** Moving time (ms) since the last step-up. */
  private sinceUp = Infinity;

  /** The current render scale of moving frames (1 = the preset's full pixel ratio). */
  get scale(): number {
    return RESOLUTION_STEPS[this.step]!;
  }

  /** How long a step-up waits now (ms of moving time with headroom). */
  get wait(): number {
    return this.upWait;
  }

  /** Back to full resolution and the first wait, for example after a quality change. */
  reset(): void {
    this.step = 0;
    this.sum = 0;
    this.count = 0;
    this.headroom = 0;
    this.upWait = UP_WAIT_MS;
    this.sinceUp = Infinity;
    this.lastDrawn = -1;
  }

  /**
   * Reports one animation frame: `now` in ms, whether it drew, and whether it was a moving frame
   * (the camera in motion; idle and still frames do not count). Returns true when the scale
   * changed. `basePixelRatio` keeps the scale from dropping below MIN_PIXEL_RATIO.
   */
  frame(now: number, drew: boolean, basePixelRatio: number, moving = true): boolean {
    if (!drew || !moving || !this.enabled) {
      this.lastDrawn = -1;
      return false;
    }
    const prev = this.lastDrawn;
    this.lastDrawn = now;
    if (prev < 0) return false;
    const dt = now - prev;
    if (dt > GAP_MS) return false;
    this.sum += dt;
    this.count++;
    this.sinceUp += dt;
    if (this.count < WINDOW) return false;
    const span = this.sum;
    const avg = span / this.count;
    this.sum = 0;
    this.count = 0;
    if (avg > SLOW_MS) {
      this.headroom = 0;
      // Slow again soon after stepping up: that step-up failed, so the next one waits longer.
      if (this.sinceUp < FAIL_MS) this.upWait = Math.min(MAX_WAIT_MS, this.upWait * 2);
      this.sinceUp = Infinity;
      const next = this.step + 1;
      if (next < RESOLUTION_STEPS.length && basePixelRatio * RESOLUTION_STEPS[next]! >= MIN_PIXEL_RATIO) {
        this.step = next;
        return true;
      }
      return false;
    }
    this.headroom = avg < FAST_MS ? this.headroom + span : 0;
    if (this.headroom >= this.upWait && this.step > 0) {
      this.headroom = 0;
      this.sinceUp = 0;
      this.step--;
      return true;
    }
    return false;
  }
}
