/**
 * Smooth playback of a partner's cursor from the few positions a second the network carries.
 *
 * Chasing the newest position makes a cursor lurch: it dashes after each update and stalls before
 * the next. Instead, positions are stamped on a steady clock that follows their arrival loosely
 * (so network jitter does not become speed changes) and played back a little in the past, walking
 * the line through them at the speed the partner really moved. A critically damped follower then
 * rounds the corners, so the motion is smooth in speed as well as in place. The delay follows the
 * measured gap between updates (a relay that sends fewer stays smooth, only a little later) and
 * changes gently, so playback never skips or runs backward. When the cursor rests, playback
 * settles on its last position; when it moves again it sets off from there rather than replaying
 * the pause; a jump across the valley (the partner flew the camera elsewhere) is a jump.
 */

interface Sample {
  x: number;
  z: number;
  t: number;
}

/** Expected gap between updates (ms) until some have been measured. */
const START_INTERVAL = 100;
const MIN_INTERVAL = 30;
const MAX_INTERVAL = 400;
/** A gap longer than this is a rest, not a slow update. */
const REST_GAP = 450;
/** Playback runs this many gaps behind, plus a margin for jitter (ms). */
const DELAY_GAPS = 1.25;
const DELAY_MARGIN = 20;
/** The follower's smoothing time (s): long enough to round corners, short enough not to lag. */
const SMOOTH = 0.055;
/** Further than this in one update (tiles) is a jump. */
const JUMP = 24;
const KEEP = 8;

export class CursorTrack {
  private samples: Sample[] = [];
  private interval = START_INTERVAL;
  /** The delay playback actually runs at, easing toward `delay`. */
  private playing = -1;
  private lastNow = 0;
  /** The follower: where the cursor is drawn and how fast it is going (tiles a second). */
  private x = 0;
  private z = 0;
  private vx = 0;
  private vz = 0;
  private snap = true;

  /** The newest position received. */
  get latest(): { x: number; z: number } | null {
    return this.samples[this.samples.length - 1] ?? null;
  }

  /** How far behind the newest update playback aims to run (ms). */
  get delay(): number {
    return this.interval * DELAY_GAPS + DELAY_MARGIN;
  }

  /** The follower's speed (tiles a second), for leaning into the motion. */
  get velocity(): { x: number; z: number } {
    return { x: this.vx, z: this.vz };
  }

  /** True while there is still motion to play: the newest position not yet reached, or not settled. */
  moving(now: number): boolean {
    const last = this.samples[this.samples.length - 1];
    if (!last) return false;
    if (now - (this.playing < 0 ? this.delay : this.playing) < last.t) return true;
    return (
      Math.abs(this.vx) + Math.abs(this.vz) > 0.02 ||
      Math.abs(this.x - last.x) + Math.abs(this.z - last.z) > 1e-3
    );
  }

  push(x: number, z: number, now: number): void {
    const s = this.samples;
    const last = s[s.length - 1];
    let t = now;
    if (last) {
      const gap = now - last.t;
      if (Math.hypot(x - last.x, z - last.z) > JUMP) {
        s.length = 0;
        this.snap = true;
      } else if (gap > REST_GAP) {
        // Moving again after a rest: set off from where it stood, one gap ago.
        s.length = 0;
        s.push({ x: last.x, z: last.z, t: now - this.interval });
      } else {
        if (x === last.x && z === last.z) return;
        this.interval += (Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, gap)) - this.interval) * 0.1;
        // The steady clock: due one gap after the last, pulled a quarter of the way toward when it
        // really arrived, and never more than half a gap from that.
        const due = last.t + this.interval;
        const half = this.interval * 0.5;
        t = Math.max(
          last.t + MIN_INTERVAL,
          Math.min(now + half, Math.max(now - half, due + (now - due) * 0.25)),
        );
      }
    }
    s.push({ x, z, t });
    if (s.length > KEEP) s.splice(0, s.length - KEEP);
  }

  clear(): void {
    this.samples.length = 0;
    this.snap = true;
  }

  /** The cursor as it should be drawn at `now` (ms), written into `out`. False when there is none. */
  at(now: number, out: { x: number; z: number }): boolean {
    const s = this.samples;
    const n = s.length;
    if (n === 0) return false;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow) / 1000);
    // The delay moves by at most a tenth of the time passed: playback runs a touch slower or
    // faster for a moment instead of skipping.
    const target = this.delay;
    if (this.playing < 0) this.playing = target;
    else this.playing += Math.max(-dt * 100, Math.min(dt * 100, target - this.playing));
    this.lastNow = now;
    const t = now - this.playing;

    // The point on the line through the samples at playback time.
    let px: number;
    let pz: number;
    const last = s[n - 1]!;
    if (n === 1 || t >= last.t) {
      px = last.x;
      pz = last.z;
    } else if (t <= s[0]!.t) {
      px = s[0]!.x;
      pz = s[0]!.z;
    } else {
      let i = 0;
      while (s[i + 1]!.t <= t) i++;
      const a = s[i]!;
      const b = s[i + 1]!;
      const u = (t - a.t) / (b.t - a.t);
      px = a.x + (b.x - a.x) * u;
      pz = a.z + (b.z - a.z) * u;
    }

    if (this.snap) {
      this.snap = false;
      this.x = px;
      this.z = pz;
      this.vx = 0;
      this.vz = 0;
    } else if (dt > 0) {
      [this.x, this.vx] = smoothDamp(this.x, px, this.vx, dt);
      [this.z, this.vz] = smoothDamp(this.z, pz, this.vz, dt);
    }
    out.x = this.x;
    out.z = this.z;
    return true;
  }
}

/** A critically damped step toward `target` (the well-known closed form): [position, velocity]. */
function smoothDamp(current: number, target: number, velocity: number, dt: number): [number, number] {
  const omega = 2 / SMOOTH;
  const k = omega * dt;
  const decay = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * decay, (velocity - omega * temp) * decay];
}
