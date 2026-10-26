/**
 * Dynamic resolution: watches how long frames take while the view keeps moving and steps the render
 * scale down when the frame rate sags, then back up once there is room again. Busy Retina laptops
 * keep a smooth 60 fps at a slightly softer image instead of stuttering at full sharpness.
 *
 * Only intervals between back-to-back drawn frames count: an idle, on-demand view says nothing
 * about how fast frames can be drawn.
 */

/** Render scales tried in order, from full resolution down. */
export const RESOLUTION_STEPS = [1, 0.85, 0.72, 0.6, 0.5] as const;

/** Frames slower than this (ms) on average are too slow: under about 45 fps. */
const SLOW_MS = 22;
/** Frames faster than this on average leave room to step back up: about 66 fps or better. */
const FAST_MS = 15;
/** Frames per judgement while slow, and while fast (stepping up waits longer, to avoid flapping). */
const SLOW_WINDOW = 30;
const FAST_WINDOW = 180;
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
  private fastStreak = 0;

  /** The current render scale (1 = the preset's full pixel ratio). */
  get scale(): number {
    return RESOLUTION_STEPS[this.step]!;
  }

  /** Back to full resolution, for example after a quality change. */
  reset(): void {
    this.step = 0;
    this.sum = 0;
    this.count = 0;
    this.fastStreak = 0;
    this.lastDrawn = -1;
  }

  /**
   * Reports one animation frame: `now` in ms and whether it drew. Returns true when the scale
   * changed. `basePixelRatio` keeps the scale from dropping below MIN_PIXEL_RATIO.
   */
  frame(now: number, drew: boolean, basePixelRatio: number): boolean {
    if (!drew || !this.enabled) {
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
    const avg = this.sum / this.count;
    if (this.count >= SLOW_WINDOW && avg > SLOW_MS) {
      this.sum = 0;
      this.count = 0;
      this.fastStreak = 0;
      const next = this.step + 1;
      if (next < RESOLUTION_STEPS.length && basePixelRatio * RESOLUTION_STEPS[next]! >= MIN_PIXEL_RATIO) {
        this.step = next;
        return true;
      }
      return false;
    }
    if (this.count >= SLOW_WINDOW) {
      // A window that was not slow: fast ones build a streak towards stepping back up.
      this.fastStreak = avg < FAST_MS ? this.fastStreak + this.count : 0;
      this.sum = 0;
      this.count = 0;
      if (this.fastStreak >= FAST_WINDOW && this.step > 0) {
        this.fastStreak = 0;
        this.step--;
        return true;
      }
    }
    return false;
  }
}
