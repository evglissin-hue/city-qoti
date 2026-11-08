// Ponds (C5.0 baseline; C5C owns them). docs/spec/10-world-and-building.md, Terrain rules (Ponds).
// The Hearth digs fertile low land (grass or meadow at height 1 or less, fertility POND_FERTILITY or
// more) down to level 0 and fills it with still water (`water` 3). Never on roads, buildings, fields
// or decor, never while the water is frozen, and no pond grows past POND_MAX_TILES (the new tiles
// and any pond they join). Standard valleys pay POND_COST coins a tile, booked as terraforming.
// Trees, worn ground and walkers' routes go (networkVersion), charm counts it as water in view and
// the habitats as wetland. Ponds freeze with the river (isFrozen).
import { MAP_SIZE, PENNIES_PER_COIN, TERRAFORM_MAX_TILES, TILE_FP } from '../constants';
import type { LayerName, RejectReason, WorldState } from '../contracts';
import { Terrain, tilesRect, Water } from '../map/layers';
import { MAX_DECOR_RADIUS } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { worldIndex } from '../state/worldIndex';
import { book, spendBlocked } from '../systems/economy/api';
import { emitMoney } from '../systems/economy/emit';
import { isFrozen } from '../systems/seasons/api';
import { refreshStairs } from '../systems/traffic/streets';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

const S = MAP_SIZE;
/** Coins a tile. */
export const POND_COST = 3;
/** Largest pond, in tiles, counting a pond the new tiles join. */
export const POND_MAX_TILES = 24;
/** Highest land a pond may be dug in. */
export const POND_MAX_HEIGHT = 1;
/** Fertility (0 to 100) a tile needs: ponds go in good, damp soil. */
export const POND_FERTILITY = 20;

function distinct(tiles: [number, number][]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const [x, z] of tiles) {
    const i = z * S + x;
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

/** Tiles in the pond the new tiles would make: themselves plus every pond tile joined to them. */
export function pondSizeAfter(state: WorldState, tiles: readonly number[]): number {
  const water = state.map.water;
  const set = new Set(tiles);
  const queue = [...tiles];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]!;
    const x = i % S;
    for (const j of [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, i - S, i + S]) {
      if (j < 0 || j >= S * S || set.has(j) || water[j] !== Water.pond) continue;
      set.add(j);
      queue.push(j);
    }
  }
  return set.size;
}

export function pondCost(tiles: number): number {
  return POND_COST * PENNIES_PER_COIN * tiles;
}

export function pondBlocked(state: WorldState, tiles: [number, number][]): RejectReason | null {
  const bad = checkTiles(tiles, TERRAFORM_MAX_TILES);
  if (bad) return bad;
  if (isFrozen(state)) return 'FROZEN';
  const m = state.map;
  const reader = worldIndex(state).reader;
  const list = distinct(tiles);
  for (const i of list) {
    const x = i % S;
    const z = (i - x) / S;
    if (m.water[i] !== Water.none) return 'WATER';
    if (m.occupant[i] || m.road[i] || m.fieldOwner[i]) return 'OCCUPIED';
    if (!reader.parcelUnlocked(x, z)) return 'LOCKED_PARCEL';
    if (m.terrain[i] !== Terrain.grass && m.terrain[i] !== Terrain.meadow) return 'NOT_ALLOWED';
    if (m.height[i]! > POND_MAX_HEIGHT) return 'TOO_STEEP';
    if (m.fertility[i]! < POND_FERTILITY) return 'NEEDS_FERTILITY';
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
      if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return 'OCCUPIED';
    }
  }
  if (pondSizeAfter(state, list) > POND_MAX_TILES) return 'TOO_MANY';
  return spendBlocked(state, pondCost(list.length));
}

export const pond: HandlerFor<'terrain.pond'> = {
  type: 'terrain.pond',
  validate: (state, _seat, cmd) => pondBlocked(state, cmd.tiles),
  apply(state, _seat, cmd, ctx) {
    const m = state.map;
    const layers: LayerName[] = ['water', 'terrain', 'height'];
    const list = distinct(cmd.tiles);
    for (const i of list) {
      m.water[i] = Water.pond;
      m.terrain[i] = Terrain.water;
      m.height[i] = 0;
      if (m.tree[i]) {
        m.tree[i] = 0;
        if (!layers.includes('tree')) layers.push('tree');
      }
      if (m.wear[i]) {
        m.wear[i] = 0;
        if (!layers.includes('wear')) layers.push('wear');
      }
    }
    if (isStandard(state)) {
      book(state, 'terraforming', pondCost(list.length));
      emitMoney(state, ctx);
    }
    tilesChangedFor(ctx, cmd.tiles, layers);
    const rect = tilesRect(cmd.tiles);
    const around = rect && ([rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1] as const);
    worldChanged(state, around && [...around]);
    if (around) refreshStairs(state, ctx, [...around]);
  },
};
