// Terraforming (C4.0 baseline; C4B owns it). docs/spec/10-world-and-building.md, Terrain rules.
// Raise or lower land one level per command, never under buildings, roads, water or decor, within
// the map's heights; standard valleys pay per tile. C4B: the land stays walkable, so no tile may end
// up two or more levels from a neighbor unless it already was (and then no further); trees on the
// tiles are uprooted, fields are turned over and sown again, worn ground starts fresh, and paths
// that now climb a level get stairs.
import {
  MAP_SIZE,
  MAX_HEIGHT,
  PENNIES_PER_COIN,
  TERRAFORM_COST,
  TERRAFORM_MAX_TILES,
  TILE_FP,
} from '../constants';
import type { LayerName, RejectReason, WorldState } from '../contracts';
import { tilesRect, Water } from '../map/layers';
import { MAX_DECOR_RADIUS } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { worldIndex } from '../state/worldIndex';
import { book, spendBlocked } from '../systems/economy/api';
import { emitMoney } from '../systems/economy/emit';
import { refreshStairs } from '../systems/traffic/streets';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

const S = MAP_SIZE;

/** Distinct tile indexes of a command's tile list, in the order given. */
function distinct(tiles: [number, number][]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const [x, z] of tiles) {
    const i = z * S + x;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out;
}

function terraformBlocked(state: WorldState, tiles: [number, number][], dir: 1 | -1): RejectReason | null {
  const bad = checkTiles(tiles, TERRAFORM_MAX_TILES);
  if (bad) return bad;
  const m = state.map;
  const set = new Set(distinct(tiles));
  const reader = worldIndex(state).reader;
  for (const i of set) {
    const x = i % S;
    const z = (i - x) / S;
    if (m.water[i] !== Water.none) return 'WATER';
    if (m.occupant[i] || m.road[i]) return 'OCCUPIED';
    if (!reader.parcelUnlocked(x, z)) return 'LOCKED_PARCEL';
    const h = m.height[i]! + dir;
    if (h < 1 || h > MAX_HEIGHT - 1) return 'TOO_STEEP';
    // Decor stands on the ground it was placed on.
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
      if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return 'OCCUPIED';
    }
    // No new cliffs: a neighbor two or more levels away must already have been at least as far.
    for (let k = 0; k < 4; k++) {
      if (
        (k === 0 && x === S - 1) ||
        (k === 1 && x === 0) ||
        (k === 2 && z === S - 1) ||
        (k === 3 && z === 0)
      )
        continue;
      const n = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + S : i - S;
      const before = Math.abs(m.height[i]! - m.height[n]!);
      const after = Math.abs(h - (m.height[n]! + (set.has(n) ? dir : 0)));
      if (after >= 2 && after > before) return 'TOO_STEEP';
    }
  }
  return spendBlocked(state, terraformCost(set.size));
}

/** Pennies to move `tiles` tiles one level. */
export function terraformCost(tiles: number): number {
  return TERRAFORM_COST * PENNIES_PER_COIN * tiles;
}

function terraform(dir: 1 | -1): HandlerFor<'terrain.raise' | 'terrain.lower'>['apply'] {
  return (state, _seat, cmd, ctx) => {
    const m = state.map;
    const tiles: [number, number][] = [];
    const layers: LayerName[] = ['height'];
    for (const i of distinct(cmd.tiles)) {
      m.height[i]! += dir;
      if (m.tree[i]) {
        m.tree[i] = 0;
        if (!layers.includes('tree')) layers.push('tree');
      }
      if (m.fieldOwner[i] && m.crop[i]) {
        m.crop[i] = 0;
        if (!layers.includes('crop')) layers.push('crop');
      }
      if (m.wear[i]) {
        m.wear[i] = 0;
        if (!layers.includes('wear')) layers.push('wear');
      }
      tiles.push([i % S, Math.floor(i / S)]);
    }
    if (isStandard(state)) {
      book(state, 'terraforming', terraformCost(tiles.length));
      emitMoney(state, ctx);
    }
    tilesChangedFor(ctx, tiles, layers);
    const rect = tilesRect(tiles);
    const around = rect && ([rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1] as const);
    worldChanged(state, around && [...around]);
    if (around) refreshStairs(state, ctx, [...around]);
  };
}

export const raise: HandlerFor<'terrain.raise'> = {
  type: 'terrain.raise',
  validate: (state, _seat, cmd) => terraformBlocked(state, cmd.tiles, 1),
  apply: terraform(1),
};

export const lower: HandlerFor<'terrain.lower'> = {
  type: 'terrain.lower',
  validate: (state, _seat, cmd) => terraformBlocked(state, cmd.tiles, -1),
  apply: terraform(-1),
};
