// The walk grid (docs/spec/11-residents.md, Movement): step cost and walking speed per tile, rebuilt
// whenever the walkable network changes. A derived index: never saved, never hashed. Every input that
// changes walkability bumps state.networkVersion; the counts in the key are a second line of defense,
// so a grid always matches the state it is read from on every client.
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { WorldState } from '../../contracts';
import { Terrain } from '../../map/layers';

export interface WalkGrid {
  /** Step cost of entering a tile (road 1 to rock 4); 0 = blocked. The +1 uphill is added by A*. */
  cost: Uint8Array;
  /** Ticks to cross a tile at normal speed (road 5 to rock 20); 0 = blocked. */
  ticks: Uint8Array;
  /** Bumped every time the grid is rebuilt; the path cache keys on it. */
  epoch: number;
}

interface GridEntry {
  grid: WalkGrid;
  version: number;
  buildings: number;
  lastBuilding: number;
  decor: number;
  lastDecor: number;
}

const grids = new WeakMap<WorldState, GridEntry>();
let epochs = 0;

/** Cost and ticks per tile for terrain kinds, indexed by Terrain value. */
const TERRAIN_COST = new Uint8Array(16);
const TERRAIN_TICKS = new Uint8Array(16);
for (const [t, cost, ticks] of [
  [Terrain.grass, 2, 10],
  [Terrain.meadow, 2, 10],
  [Terrain.sand, 2, 10],
  [Terrain.forestFloor, 3, 15],
  [Terrain.field, 3, 15],
  [Terrain.rock, 4, 20],
  [Terrain.mountain, 4, 20],
  [Terrain.water, 0, 0],
] as const) {
  TERRAIN_COST[t] = cost;
  TERRAIN_TICKS[t] = ticks;
}
export const ROAD_COST = 1;
export const ROAD_TICKS = 5;

/** The walk grid for the state as it is now, rebuilt when the network changed. */
export function walkGrid(state: WorldState): WalkGrid {
  const e = grids.get(state);
  const nb = state.buildings.length;
  const nd = state.decor.length;
  const lb = nb ? state.buildings[nb - 1]!.id : 0;
  const ld = nd ? state.decor[nd - 1]!.id : 0;
  if (
    e &&
    e.version === state.networkVersion &&
    e.buildings === nb &&
    e.lastBuilding === lb &&
    e.decor === nd &&
    e.lastDecor === ld
  ) {
    return e.grid;
  }
  const grid = buildGrid(state, e?.grid);
  grids.set(state, {
    grid,
    version: state.networkVersion,
    buildings: nb,
    lastBuilding: lb,
    decor: nd,
    lastDecor: ld,
  });
  return grid;
}

function buildGrid(state: WorldState, reuse: WalkGrid | undefined): WalkGrid {
  const S = MAP_SIZE;
  const n = S * S;
  const cost = reuse?.cost ?? new Uint8Array(n);
  const ticks = reuse?.ticks ?? new Uint8Array(n);
  const { terrain, water, road, occupant } = state.map;
  for (let i = 0; i < n; i++) {
    if (occupant[i]) {
      cost[i] = 0;
      ticks[i] = 0;
    } else if (road[i]) {
      // Roads cross water as bridges.
      cost[i] = ROAD_COST;
      ticks[i] = ROAD_TICKS;
    } else if (water[i]) {
      cost[i] = 0;
      ticks[i] = 0;
    } else {
      const t = terrain[i]!;
      cost[i] = TERRAIN_COST[t] ?? 2;
      ticks[i] = TERRAIN_TICKS[t] ?? 10;
    }
  }
  for (const d of state.decor) {
    if (!content.decorById.get(d.def)?.blocksWalking) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    if (x < 0 || z < 0 || x >= S || z >= S) continue;
    cost[z * S + x] = 0;
    ticks[z * S + x] = 0;
  }
  return { cost, ticks, epoch: ++epochs };
}

/** True when a tile can be stood on (ignoring the destination exception). */
export function walkable(state: WorldState, tile: number): boolean {
  return walkGrid(state).cost[tile]! > 0;
}
