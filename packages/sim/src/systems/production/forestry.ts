// Woodcutters and foresters (docs/spec/13-ledger.md, I1 buildings). A woodcutter fells mature
// trees within its range, thinning the thickest stands first so lone trees and grove edges (the
// charming ones) last longest. A forester plants saplings within its range, next to existing
// trees where it can, so woods regrow as groves rather than as polka dots.
import type { BuildingDef } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, Rect, Rng, TickCtx, WorldState } from '../../contracts';
import { TREE_MATURE, TREE_SPECIES, treeSpecies, treeStage, treeValue } from '../../map/layers';
import { canPlantTree } from '../../rules/tree';
import { footprintSize } from '../../rules/footprint';
import { worldIndex } from '../../state/worldIndex';
import { markCharmDirty } from '../hearth/charm/dirty';
import { doorTile } from '../movement/api';
import { tileDistance } from '../logistics/stores';

export const FORESTRY_RANGE = 8;
/** Candidate tiles a forester considers per sapling. */
const PLANT_TRIES = 24;

/** The footprint rect grown by `range`, clamped to the map. */
export function reachRect(b: Building, def: BuildingDef, range: number): Rect {
  const [w, d] = footprintSize(def, b.rot);
  return [
    Math.max(0, b.x - range),
    Math.max(0, b.z - range),
    Math.min(MAP_SIZE - 1, b.x + w - 1 + range),
    Math.min(MAP_SIZE - 1, b.z + d - 1 + range),
  ];
}

function isMature(v: number): boolean {
  return v !== 0 && treeStage(v) >= TREE_MATURE;
}

/** Trees (any stage) on the 8 tiles around a tile. */
function treeNeighbors(tree: Uint8Array, x: number, z: number): number {
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
      if (tree[nz * MAP_SIZE + nx]) n++;
    }
  }
  return n;
}

export function countMatureTrees(state: WorldState, b: Building, def: BuildingDef, range: number): number {
  const [x0, z0, x1, z1] = reachRect(b, def, range);
  const tree = state.map.tree;
  let n = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (isMature(tree[z * MAP_SIZE + x]!)) n++;
  return n;
}

/**
 * The mature tree to fell next: the one with the most trees around it, then the nearest to the
 * door, then the lowest tile index. -1 when none is in range.
 */
export function treeToFell(state: WorldState, b: Building, def: BuildingDef, range: number): number {
  const [x0, z0, x1, z1] = reachRect(b, def, range);
  const tree = state.map.tree;
  const door = doorTile(b, def);
  let best = -1;
  let bestScore = -Infinity;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * MAP_SIZE + x;
      if (!isMature(tree[i]!)) continue;
      const score = treeNeighbors(tree, x, z) * 64 - tileDistance(door, i);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  return best;
}

function treeChanged(state: WorldState, ctx: TickCtx, i: number): void {
  const x = i % MAP_SIZE;
  const z = (i - x) / MAP_SIZE;
  const rect: Rect = [x, z, x, z];
  ctx.events.push({ e: 'tiles.changed', rect, layers: ['tree'] });
  ctx.dirty.mark('tree', rect);
  markCharmDirty(state, rect);
}

export function fellTree(state: WorldState, ctx: TickCtx, i: number): void {
  state.map.tree[i] = 0;
  treeChanged(state, ctx, i);
}

/**
 * Plants one sapling within range: of PLANT_TRIES random plantable tiles, the one with the most
 * neighboring trees (up to 4, so groves stay walkable), away from roads and doors. Species follow
 * the neighbors. False when no tile would do.
 */
export function plantSapling(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  range: number,
  rng: Rng,
): boolean {
  const [x0, z0, x1, z1] = reachRect(b, def, range);
  const reader = worldIndex(state).reader;
  const m = state.map;
  let best = -1;
  let bestScore = -Infinity;
  for (let k = 0; k < PLANT_TRIES; k++) {
    const x = rng.range(x0, x1);
    const z = rng.range(z0, z1);
    if (!canPlantTree(reader, x, z).ok || m.fieldOwner[z * MAP_SIZE + x]) continue;
    if (nearRoadOrBuilding(state, x, z)) continue;
    const n = treeNeighbors(m.tree, x, z);
    const score = Math.min(n, 4) * 4 - Math.max(0, n - 4) * 2 + rng.int(3);
    if (score > bestScore) {
      bestScore = score;
      best = z * MAP_SIZE + x;
    }
  }
  if (best < 0) return false;
  m.tree[best] = treeValue(speciesFor(state, best, rng), 0);
  treeChanged(state, ctx, best);
  return true;
}

/** Saplings stay a tile clear of roads and buildings, so frontage and doors stay open. */
function nearRoadOrBuilding(state: WorldState, x: number, z: number): boolean {
  const { road, occupant } = state.map;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
      const i = nz * MAP_SIZE + nx;
      if (road[i] || occupant[i]) return true;
    }
  }
  return false;
}

/** The most common species among the neighbors, else a random one. */
function speciesFor(state: WorldState, i: number, rng: Rng): number {
  const x = i % MAP_SIZE;
  const z = (i - x) / MAP_SIZE;
  const counts = [0, 0, 0, 0];
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
      const v = state.map.tree[nz * MAP_SIZE + nx]!;
      if (v) counts[treeSpecies(v)] = (counts[treeSpecies(v)] ?? 0) + 1;
    }
  }
  let best = 0;
  for (let s = 1; s < counts.length; s++) if (counts[s]! > counts[best]!) best = s;
  if (best > 0 && counts[best]! > 0) return best;
  const all = [TREE_SPECIES.oak, TREE_SPECIES.birch, TREE_SPECIES.pine];
  return all[rng.int(all.length)]!;
}
