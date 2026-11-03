// The raiders' walk grid (C5D): like the residents' grid, except that walls and shut gates are
// obstacles raiders break (a high step cost, so they go round when a way round is short), traps
// and open gates are ground, and fences and hedges are crossed (slowly, through the walk hook)
// rather than walked round. A derived index: never saved or hashed, rebuilt when the network
// changes or a wall piece is breached or mended (`invalidateRaiderGrid`).
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { ROAD_TICKS, TERRAIN_COST, TERRAIN_TICKS, walkGrid, type WalkGrid } from '../movement/grid';
import { hpOf } from '../threats/api';

const S = MAP_SIZE;
/** Step cost of a wall piece still standing (raiders would rather walk ten tiles round). */
export const WALL_COST = 20;

interface Entry {
  grid: WalkGrid;
  base: number;
  rev: number;
}

const grids = new WeakMap<WorldState, Entry>();
const revs = new WeakMap<WorldState, number>();
let epochs = 1 << 20;

/** Marks the raider grid stale (a wall breached, a gate shut). */
export function invalidateRaiderGrid(state: WorldState): void {
  revs.set(state, (revs.get(state) ?? 0) + 1);
}

/** What a building tile is to a raider. */
export type Obstacle = 'ground' | 'wall' | 'block';

export function obstacleOf(b: Building): Obstacle {
  const def = content.buildingById.get(b.def);
  const d = def?.defense;
  if (!d) return 'block';
  if (d.trap) return 'ground';
  if (d.passable === 'gate') {
    if (b.rt?.open !== false) return 'ground';
    return hpOf(b) > 0 ? 'wall' : 'ground';
  }
  if (d.blocks) return hpOf(b) > 0 ? 'wall' : 'ground';
  return 'block';
}

export function raiderGrid(state: WorldState): WalkGrid {
  const base = walkGrid(state);
  const rev = revs.get(state) ?? 0;
  const e = grids.get(state);
  if (e && e.base === base.epoch && e.rev === rev) return e.grid;
  const n = S * S;
  const cost = e?.grid.cost ?? new Uint8Array(n);
  const ticks = e?.grid.ticks ?? new Uint8Array(n);
  cost.set(base.cost);
  ticks.set(base.ticks);
  const { occupant, terrain, road, water } = state.map;
  // Ground under defense pieces, by the terrain (roads cross as roads).
  const ground = (i: number, c: number) => {
    if (road[i]) {
      cost[i] = c === 0 ? 1 : c;
      ticks[i] = ROAD_TICKS;
      return;
    }
    if (water[i]) {
      cost[i] = 0;
      ticks[i] = 0;
      return;
    }
    const t = terrain[i]!;
    cost[i] = c === 0 ? (TERRAIN_COST[t] ?? 2) : c;
    ticks[i] = TERRAIN_TICKS[t] ?? 10;
  };
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const o = obstacleOf(b);
    if (o === 'block') continue;
    const i = b.z * S + b.x;
    if (occupant[i] !== b.id) continue;
    ground(i, o === 'wall' ? WALL_COST : 0);
  }
  // Fences and hedges: crossed, not walked round (they slow through the walk hook).
  for (const d of state.decor) {
    if (!content.decorById.get(d.def)?.slows) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    if (x < 0 || z < 0 || x >= S || z >= S) continue;
    const i = z * S + x;
    if (occupant[i]) continue;
    ground(i, 0);
  }
  const grid: WalkGrid = { cost, ticks, epoch: ++epochs };
  grids.set(state, { grid, base: base.epoch, rev });
  return grid;
}

/** The standing wall piece (or shut gate) on a tile a raider must break, or null. */
export function wallAt(state: WorldState, tile: number): Building | null {
  const id = state.map.occupant[tile]!;
  if (!id) return null;
  const b = findById(state.buildings, id);
  return b && b.stage === 'built' && obstacleOf(b) === 'wall' ? b : null;
}
