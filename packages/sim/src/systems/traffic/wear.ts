// Desire paths (docs/spec/10-world-and-building.md, Roads): every step a resident takes onto grass,
// meadow, sand or forest floor wears the `wear` layer a little, and the grass grows back a little
// every night. A tile walked a dozen or more times a day wears in over a few days; a tile crossed
// now and then never does. Worn tiles show where people really walk, and the Ledger can pave them
// (road.paint with paths). Wear under a road stays put, so paved desire lines can be counted.
// The movement system (C3A) calls wearStep for each step; the traffic system runs the regrowth.
import { MAP_SIZE } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';
import { Terrain } from '../../map/layers';

/** Wear added by one step onto a wearable tile. */
export const WEAR_STEP = 4;
/** Wear the grass takes back each night. */
export const WEAR_REGROWTH = 24;
/** From here the grass looks trodden (the renderer's faint stage). */
export const WEAR_VISIBLE = 64;
/** From here a tile is a desire path: bare earth the overlay suggests paving. */
export const DESIRE_PATH_WEAR = 128;
/** Patches go out when wear crosses a multiple of this, not on every step. */
const WEAR_BAND_SHIFT = 5;

const WEARABLE = new Uint8Array(16);
for (const t of [Terrain.grass, Terrain.meadow, Terrain.sand, Terrain.forestFloor]) WEARABLE[t] = 1;

/** One step onto `tile`: wears it in if it is open ground (not road, field, water or rock). */
export function wearStep(state: WorldState, ctx: TickCtx | null, tile: number): void {
  const m = state.map;
  if (m.road[tile] || !WEARABLE[m.terrain[tile]!]) return;
  const v = m.wear[tile]!;
  if (v >= 255) return;
  const next = v + WEAR_STEP > 255 ? 255 : v + WEAR_STEP;
  m.wear[tile] = next;
  if (ctx && v >> WEAR_BAND_SHIFT !== next >> WEAR_BAND_SHIFT) {
    const x = tile % MAP_SIZE;
    const z = (tile - x) / MAP_SIZE;
    ctx.dirty.mark('wear', [x, z, x, z]);
  }
}

/** The nightly regrowth: worn ground off the roads heals by WEAR_REGROWTH. */
export function regrow(state: WorldState, ctx: TickCtx): void {
  const { wear, road } = state.map;
  let x0 = MAP_SIZE;
  let z0 = MAP_SIZE;
  let x1 = -1;
  let z1 = -1;
  for (let i = 0; i < wear.length; i++) {
    const v = wear[i]!;
    if (v === 0 || road[i]) continue;
    const next = v > WEAR_REGROWTH ? v - WEAR_REGROWTH : 0;
    wear[i] = next;
    if (v >> WEAR_BAND_SHIFT === next >> WEAR_BAND_SHIFT) continue;
    const x = i % MAP_SIZE;
    const z = (i - x) / MAP_SIZE;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (x1 >= 0) ctx.dirty.mark('wear', [x0, z0, x1, z1]);
}

/** Desire path tiles (worn to DESIRE_PATH_WEAR, not road yet) in a rect, row by row, for paving. */
export function desirePathTiles(
  map: { wear: Uint8Array; road: Uint8Array },
  x0 = 0,
  z0 = 0,
  x1 = MAP_SIZE - 1,
  z1 = MAP_SIZE - 1,
): [number, number][] {
  const out: [number, number][] = [];
  for (let z = Math.max(0, z0); z <= Math.min(MAP_SIZE - 1, z1); z++) {
    for (let x = Math.max(0, x0); x <= Math.min(MAP_SIZE - 1, x1); x++) {
      const i = z * MAP_SIZE + x;
      if (map.wear[i]! >= DESIRE_PATH_WEAR && !map.road[i]) out.push([x, z]);
    }
  }
  return out;
}

/** Paths laid over desire lines: path tiles whose ground was worn to a desire path first. */
export function pavedDesireTiles(state: WorldState): number {
  const { wear, road } = state.map;
  let n = 0;
  for (let i = 0; i < wear.length; i++) if (road[i] === 1 && wear[i]! >= DESIRE_PATH_WEAR) n++;
  return n;
}
