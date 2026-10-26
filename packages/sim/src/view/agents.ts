// Agent frames (C3.0 contract): one Float32Array row of AGENT_STRIDE per resident outdoors,
// [id, x, z, y, heading, anim, carryGood + 1, flags]. x and z are in tile units (tile centers at
// +0.5), y in height levels, heading in radians (0 faces +z, increasing clockwise seen from above).
// The client interpolates between frames. View code: floats are fine, nothing feeds back.
// C3A: walks are smoothed (diagonals and rounded corners), walkers keep left, residents sharing a
// tile spread round it, and idle residents face what they came to see.
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE, ResidentFlags, TICKS_PER_HOUR } from '../constants';
import type { Resident, WorldState } from '../contracts';
import { tickOfDay } from '../systems/residents/time';
import { moodBand } from './hamlet';

/** Headings for the four grid directions: +x, +z, -x, -z. */
const HEAD_PX = Math.PI / 2;
const HEAD_PZ = 0;
const HEAD_NX = -Math.PI / 2;
const HEAD_NZ = Math.PI;

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

/** Half-width of the path smoothing window, and how far ahead and behind the heading looks (tiles). */
const SMOOTH = 0.45;
const LOOK = 0.75;
const P0 = [0, 0];
const P1 = [0, 0];
const P2 = [0, 0];

/** Path node i as a tile: -1 the tile before the current one, 0 the current tile, 1 path[step]... */
function nodeTile(r: Resident, m: NonNullable<Resident['move']>, i: number): number {
  if (i <= -1) return m.path[m.step - 2] ?? r.tile;
  if (i === 0) return r.tile;
  return m.path[Math.min(m.path.length - 1, m.step + i - 1)]!;
}

/** The tile-center polyline point q tiles along the walk from the current tile (center coordinates). */
function pointAt(r: Resident, m: NonNullable<Resident['move']>, S: number, q: number, out: number[]): void {
  const i = Math.floor(q);
  const f = q - i;
  const a = nodeTile(r, m, i);
  const b = nodeTile(r, m, i + 1);
  out[0] = (a % S) + 0.5 + ((b % S) - (a % S)) * f;
  out[1] = Math.floor(a / S) + 0.5 + (Math.floor(b / S) - Math.floor(a / S)) * f;
}

/** Heading for any direction, snapped to eight (0 faces +z, clockwise from above). */
function headingFor8(dx: number, dz: number): number {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  // tan(22.5 degrees) is about 0.414: within that of an axis, face along the axis.
  if (az <= 0.414 * ax) return dx > 0 ? HEAD_PX : HEAD_NX;
  if (ax <= 0.414 * az) return dz > 0 ? HEAD_PZ : HEAD_NZ;
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
    const t = m.progress / 256;
    y += ((h[next] ?? 0) - y) * t;
    // Smooth the grid walk: average the point with points a little behind and ahead on the path,
    // so diagonal staircases read as a diagonal stroll and corners are rounded. The window shrinks
    // to nothing at either end of the walk, so nobody pops at a door.
    const back = m.step >= 2 ? 1 + t : t;
    const ahead = m.path.length - m.step - t;
    const w = Math.min(SMOOTH, back, ahead);
    pointAt(r, m, S, t - w, P0);
    pointAt(r, m, S, t, P1);
    pointAt(r, m, S, t + w, P2);
    x = (P0[0]! + P1[0]! + P2[0]!) / 3;
    z = (P0[1]! + P1[1]! + P2[1]!) / 3;
    pointAt(r, m, S, t - Math.min(LOOK, back), P0);
    pointAt(r, m, S, t + Math.min(LOOK, Math.max(ahead, 0.01)), P2);
    let dx = P2[0]! - P0[0]!;
    let dz = P2[1]! - P0[1]!;
    if (dx === 0 && dz === 0) {
      dx = (next % S) - x0;
      dz = Math.floor(next / S) - z0;
    }
    heading = headingFor8(dx, dz);
    // Keep left; ease onto the lane over the first tile and off it over the last.
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    let lane = LANE;
    if (m.step === 0 && m.path.length > 1) lane *= t;
    if (m.step === m.path.length - 1) lane *= 1 - t;
    x += (dz / len) * lane;
    z -= (dx / len) * lane;
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
