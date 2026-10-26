// Agent frames (C3.0 contract): one Float32Array row of AGENT_STRIDE per resident outdoors,
// [id, x, z, y, heading, anim, carryGood + 1, flags]. x and z are in tile units (tile centers at
// +0.5), y in height levels, heading in radians (0 faces +z, increasing clockwise seen from above).
// The client interpolates between frames. View code: floats are fine, nothing feeds back.
// C3A: walkers keep left, residents sharing a tile spread round it, and idle residents face what
// they came to see.
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE, ResidentFlags, TICKS_PER_HOUR } from '../constants';
import type { Resident, WorldState } from '../contracts';
import { tickOfDay } from '../systems/residents/time';
import { moodBand } from './hamlet';

/** Headings for the four grid steps: +x, +z, -x, -z. */
const HEAD_PX = Math.PI / 2;
const HEAD_PZ = 0;
const HEAD_NX = -Math.PI / 2;
const HEAD_NZ = Math.PI;

function headingFor(dx: number, dz: number): number {
  if (dx > 0) return HEAD_PX;
  if (dx < 0) return HEAD_NX;
  return dz < 0 ? HEAD_NZ : HEAD_PZ;
}

/** Walkers keep to the left of the way they are going (tiles), easing in and out at the ends. */
const LANE = 0.16;
/** Residents standing on a shared tile spread round it (tiles). */
const SCATTER = 0.24;
const RING: readonly [number, number][] = [
  [0.7, 0.7],
  [-0.7, -0.7],
  [0.7, -0.7],
  [-0.7, 0.7],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

let scratch = new Float32Array(AGENT_STRIDE * 64);

/** Writes the frame; returns a fresh array sized to the residents outdoors (transferable). */
export function agentFrame(state: WorldState): Float32Array {
  const S = MAP_SIZE;
  const h = state.map.height;
  const night = isNight(state.tick);
  const standing = new Map<number, number>();
  let n = 0;
  for (const r of state.residents) {
    if (r.inside) continue;
    if ((n + 1) * AGENT_STRIDE > scratch.length) {
      const bigger = new Float32Array(scratch.length * 2);
      bigger.set(scratch);
      scratch = bigger;
    }
    let crowd = 0;
    if (!r.move) {
      crowd = standing.get(r.tile) ?? 0;
      standing.set(r.tile, crowd + 1);
    }
    writeRow(scratch, n * AGENT_STRIDE, r, S, h, crowd, night);
    n++;
  }
  return scratch.slice(0, n * AGENT_STRIDE);
}

function isNight(tick: number): boolean {
  const tod = tickOfDay(tick);
  return tod < 6 * TICKS_PER_HOUR || tod >= 22 * TICKS_PER_HOUR;
}

/** Where an idle resident looks: at what they came for, else somewhere of their own choosing. */
function idleHeading(r: Resident, S: number): number {
  const a = r.activity;
  const target = a.kind === 'leisure' || a.kind === 'stroll' || a.kind === 'play' ? a.tile : -1;
  if (target >= 0 && target !== r.tile) {
    const dx = (target % S) - (r.tile % S);
    const dz = Math.floor(target / S) - Math.floor(r.tile / S);
    return headingFor8(dx, dz);
  }
  return ((r.look >>> 24) & 7) * (Math.PI / 4);
}

/** Heading for any direction, snapped to eight (0 faces +z, clockwise from above). */
function headingFor8(dx: number, dz: number): number {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (ax > 2 * az) return dx > 0 ? HEAD_PX : HEAD_NX;
  if (az > 2 * ax) return dz > 0 ? HEAD_PZ : HEAD_NZ;
  if (dx > 0) return dz > 0 ? Math.PI / 4 : (3 * Math.PI) / 4;
  return dz > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
}

function writeRow(
  out: Float32Array,
  o: number,
  r: Resident,
  S: number,
  h: Uint8Array,
  crowd: number,
  night: boolean,
): void {
  const x0 = r.tile % S;
  const z0 = Math.floor(r.tile / S);
  let x = x0 + 0.5;
  let z = z0 + 0.5;
  let y = h[r.tile] ?? 0;
  let heading: number;
  const m = r.move;
  if (m && m.step < m.path.length) {
    const next = m.path[m.step]!;
    const x1 = next % S;
    const z1 = Math.floor(next / S);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const t = m.progress / 256;
    x += dx * t;
    z += dz * t;
    y += ((h[next] ?? 0) - y) * t;
    heading = headingFor(dx, dz);
    // Keep left; ease onto the lane over the first tile and off it over the last.
    let lane = LANE;
    if (m.step === 0 && m.path.length > 1) lane *= t;
    if (m.step === m.path.length - 1) lane *= 1 - t;
    x += dz * lane;
    z -= dx * lane;
  } else {
    heading = idleHeading(r, S);
    if (crowd > 0) {
      const [rx, rz] = RING[(crowd - 1) % RING.length]!;
      x += rx * SCATTER;
      z += rz * SCATTER;
    }
  }
  const band = moodBand(r.mood);
  let flags = 0;
  if (r.wishId) flags |= AgentFlags.wish;
  if (band >= 4) flags |= AgentFlags.happy;
  if (band <= 1) flags |= AgentFlags.unhappy;
  const owl = r.species === 'hedgehog' || r.traits.includes('night-owl');
  if (r.activity.kind === 'sleep' || (night && !owl)) flags |= AgentFlags.sleepy;
  if (r.stage === 'child') flags |= AgentFlags.child;
  if (band <= 1) flags |= AgentFlags.slow;
  const anim =
    r.flags & ResidentFlags.hop
      ? AgentAnim.hop
      : m
        ? r.carry
          ? AgentAnim.carry
          : AgentAnim.walk
        : r.activity.kind === 'work' || r.activity.kind === 'task'
          ? AgentAnim.work
          : AgentAnim.idle;
  out[o] = r.id;
  out[o + 1] = x;
  out[o + 2] = z;
  out[o + 3] = y;
  out[o + 4] = heading;
  out[o + 5] = anim;
  out[o + 6] = r.carry ? r.carry[0] + 1 : 0;
  out[o + 7] = flags;
}
