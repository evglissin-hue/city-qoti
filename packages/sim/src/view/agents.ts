// Agent frames (C3.0 contract): one Float32Array row of AGENT_STRIDE per resident outdoors,
// [id, x, z, y, heading, anim, carryGood + 1, flags]. x and z are in tile units (tile centers at
// +0.5), y in height levels, heading in radians (0 faces +z, increasing clockwise seen from above).
// The client interpolates between frames. View code: floats are fine, nothing feeds back.
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE, ResidentFlags } from '../constants';
import type { Resident, WorldState } from '../contracts';
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

let scratch = new Float32Array(AGENT_STRIDE * 64);

/** Writes the frame; returns a fresh array sized to the residents outdoors (transferable). */
export function agentFrame(state: WorldState): Float32Array {
  const S = MAP_SIZE;
  const h = state.map.height;
  let n = 0;
  for (const r of state.residents) {
    if (r.inside) continue;
    if ((n + 1) * AGENT_STRIDE > scratch.length) {
      const bigger = new Float32Array(scratch.length * 2);
      bigger.set(scratch);
      scratch = bigger;
    }
    writeRow(scratch, n * AGENT_STRIDE, r, S, h);
    n++;
  }
  return scratch.slice(0, n * AGENT_STRIDE);
}

function writeRow(out: Float32Array, o: number, r: Resident, S: number, h: Uint8Array): void {
  const x0 = r.tile % S;
  const z0 = Math.floor(r.tile / S);
  let x = x0 + 0.5;
  let z = z0 + 0.5;
  let y = h[r.tile] ?? 0;
  let heading = 0;
  const m = r.move;
  if (m && m.step < m.path.length) {
    const next = m.path[m.step]!;
    const x1 = next % S;
    const z1 = Math.floor(next / S);
    const t = m.progress / 256;
    x += (x1 - x0) * t;
    z += (z1 - z0) * t;
    y += ((h[next] ?? 0) - y) * t;
    heading = headingFor(x1 - x0, z1 - z0);
  }
  const band = moodBand(r.mood);
  let flags = 0;
  if (r.wishId) flags |= AgentFlags.wish;
  if (band >= 4) flags |= AgentFlags.happy;
  if (band <= 1) flags |= AgentFlags.unhappy;
  if (r.activity.kind === 'sleep') flags |= AgentFlags.sleepy;
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
