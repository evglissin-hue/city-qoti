import { AGENT_STRIDE, TURN_MS } from '@qoti/sim';

/**
 * Smooth playback of the worker's agent frames. Frames arrive about once a turn, but never exactly
 * on time (network turns, busy worker), so drawing them as they come makes residents stop and lurch.
 * Instead the layer plays a short way behind the newest frame on its own steady clock, measured in
 * turns, and interpolates between the two frames around it. The clock drifts gently faster or
 * slower to keep its distance, and jumps only after a long gap (a catch-up or a hidden tab).
 */

/** How far behind the newest frame playback runs, in turns. */
export const PLAYBACK_DELAY = 1.5;
/** Frames kept for interpolation. */
const KEEP = 6;
/** Further than this from where it should be (turns), playback jumps instead of drifting. */
const SNAP = 6;

export interface AgentFrame {
  t: number;
  data: Float32Array;
  /** Resident id to offset in `data`. */
  index: Map<number, number>;
}

export interface AgentSample {
  /** Older and newer frame around the playback time (the same frame when there is only one). */
  a: AgentFrame;
  b: AgentFrame;
  /** 0 at `a`, 1 at `b`. */
  alpha: number;
}

export class AgentPlayback {
  private readonly frames: AgentFrame[] = [];
  private play = Number.NaN;

  /** Adds a frame for turn `t`; frames for a turn already seen replace nothing and are skipped. */
  push(t: number, data: Float32Array): void {
    const last = this.frames[this.frames.length - 1];
    if (last && t <= last.t) {
      if (t < last.t - SNAP) this.clear();
      else return;
    }
    const index = new Map<number, number>();
    for (let o = 0; o + AGENT_STRIDE <= data.length; o += AGENT_STRIDE) index.set(data[o]!, o);
    this.frames.push({ t, data, index });
    if (this.frames.length > KEEP) this.frames.shift();
  }

  clear(): void {
    this.frames.length = 0;
    this.play = Number.NaN;
  }

  /** The playback time in turns (NaN before the first frame). */
  get time(): number {
    return this.play;
  }

  /** Moves the playback clock on by `dt` seconds of real time. */
  advance(dt: number): void {
    const last = this.frames[this.frames.length - 1];
    if (!last) return;
    const target = last.t - PLAYBACK_DELAY;
    if (!Number.isFinite(this.play) || Math.abs(target - this.play) > SNAP) {
      this.play = target;
    } else {
      // Drift towards the target: up to half again as fast when behind, half as fast when ahead.
      const rate = 1 + Math.min(0.5, Math.max(-0.5, (target - this.play) * 0.5));
      this.play += ((dt * 1000) / TURN_MS) * rate;
    }
    if (this.play > last.t) this.play = last.t;
  }

  /** The frames around the playback time, or null before any frame arrives. */
  sample(): AgentSample | null {
    const n = this.frames.length;
    if (n === 0) return null;
    const first = this.frames[0]!;
    if (!(this.play > first.t)) return { a: first, b: first, alpha: 0 };
    for (let i = n - 1; i >= 0; i--) {
      const a = this.frames[i]!;
      if (a.t <= this.play) {
        const b = this.frames[i + 1];
        if (!b) return { a, b: a, alpha: 0 };
        return { a, b, alpha: (this.play - a.t) / (b.t - a.t) };
      }
    }
    return { a: first, b: first, alpha: 0 };
  }
}
