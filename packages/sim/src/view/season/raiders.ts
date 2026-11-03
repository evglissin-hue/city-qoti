// Raiders and wolves in the agent frame (C5D; C5E draws them). Raiders are sim agents (state.raid,
// ids from nextId): a row each while on the map, running, with the first good they carry. The wolf
// pack is derived from the clock (systems/raids/wolves): view-only rows with ids from
// WOLF_ID_BASE, never saved or hashed. View code: floats are fine, nothing feeds back.
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { PACK, packTile, wolfNight, wolvesCome } from '../../systems/raids/wolves';
import { headingFor8 } from '../agents';

/** Wolf row ids (well clear of entity ids and the circus visitors at 1 << 23). */
export const WOLF_ID_BASE = (1 << 23) + (1 << 20);

const S = MAP_SIZE;
const SPREAD: readonly [number, number][] = [
  [0, 0],
  [0.8, 0.5],
  [-0.6, 0.7],
];

function heading(dx: number, dz: number): number {
  return dx === 0 && dz === 0 ? 0 : headingFor8(dx, dz);
}

export function writeRaiderRows(
  state: WorldState,
  out: Float32Array<ArrayBuffer>,
  n: number,
  grow: (rows: number) => Float32Array<ArrayBuffer>,
): { out: Float32Array<ArrayBuffer>; n: number } {
  const h = state.map.height;
  const raid = state.raid;
  const wolves = wolfNight(state) && wolvesCome(state);
  const rows = (raid ? raid.raiders.length : 0) + (wolves ? PACK : 0);
  if (rows === 0) return { out, n };
  if ((n + rows) * AGENT_STRIDE > out.length) out = grow(n + rows);
  if (raid) {
    for (const r of raid.raiders) {
      if (r.state === 'gone') continue;
      let x = (r.tile % S) + 0.5;
      let z = Math.floor(r.tile / S) + 0.5;
      let y = h[r.tile] ?? 0;
      let head = 0;
      const m = r.move;
      if (m && m.step < m.path.length) {
        const next = m.path[m.step]!;
        const t = Math.max(0, m.progress) / 256;
        const nx = (next % S) + 0.5;
        const nz = Math.floor(next / S) + 0.5;
        head = heading(nx - x, nz - z);
        x += (nx - x) * t;
        z += (nz - z) * t;
        y += ((h[next] ?? 0) - y) * t;
      }
      const o = n * AGENT_STRIDE;
      out[o] = r.id;
      out[o + 1] = x;
      out[o + 2] = z;
      out[o + 3] = y;
      out[o + 4] = head;
      out[o + 5] = r.state === 'captured' ? AgentAnim.idle : AgentAnim.run;
      out[o + 6] = r.load.length > 0 ? r.load[0]![0] + 1 : 0;
      out[o + 7] = AgentFlags.raider;
      n++;
    }
  }
  if (wolves) {
    const t = packTile(state);
    const ahead = packTile(state, state.tick + 20);
    const head = heading((ahead % S) - (t % S), Math.floor(ahead / S) - Math.floor(t / S));
    for (let k = 0; k < PACK; k++) {
      const o = n * AGENT_STRIDE;
      out[o] = WOLF_ID_BASE + k;
      out[o + 1] = (t % S) + 0.5 + SPREAD[k]![0];
      out[o + 2] = Math.floor(t / S) + 0.5 + SPREAD[k]![1];
      out[o + 3] = h[t] ?? 0;
      out[o + 4] = head;
      out[o + 5] = ahead === t ? AgentAnim.idle : AgentAnim.walk;
      out[o + 6] = 0;
      out[o + 7] = AgentFlags.wolf;
      n++;
    }
  }
  return { out, n };
}
