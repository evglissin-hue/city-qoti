// Budget hooks used by commands (C3.0 contract; C3C owns the implementation).
// Sandbox valleys never charge. Standard valleys charge coins at placement and painting, refund on
// cancel or removal, and refuse new construction during lean times.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import {
  FIELD_TILE_COST,
  LEDGER_CATEGORIES,
  MAP_SIZE,
  PENNIES_PER_COIN,
  type LedgerCategoryId,
} from '../../constants';
import type { Building, RejectReason, RoadKind, Rot4, TickCtx, WorldState } from '../../contracts';
import { TREE_MATURE, treeStage } from '../../map/layers';
import { footprintTiles } from '../../rules/footprint';
import { isStandard } from '../../state/hamlet';
import { cancelJobsFor } from '../logistics';
import { stowNearest } from '../logistics/stores';
import { doorTile } from '../movement/api';
import { clearFields, fieldsOf, isFarm } from '../production/fields';
import { bookProduced } from '../production/produce';
import { emitMoney } from './emit';
import { isWorkTime } from './time';

/** The coin price of placing a building, in pennies. */
export function placementCost(def: BuildingDef): number {
  return (def.cost?.coins ?? 0) * PENNIES_PER_COIN;
}

/** The coin price of painting `tiles` new road tiles of a kind, in pennies. */
export function roadCost(kind: RoadKind, tiles: number): number {
  return (content.roadById.get(kind)?.cost?.coins ?? 0) * PENNIES_PER_COIN * tiles;
}

/** The coin price of painting `tiles` field tiles, in pennies. */
export function fieldCost(tiles: number): number {
  return FIELD_TILE_COST * PENNIES_PER_COIN * tiles;
}

/** LEAN_TIMES while the treasury is below zero, CANNOT_AFFORD when it cannot cover `pennies`. */
export function spendBlocked(state: WorldState, pennies: number): RejectReason | null {
  if (!isStandard(state)) return null;
  const e = state.economy;
  if (e.leanTimes || e.treasury < 0) return 'LEAN_TIMES';
  return pennies > e.treasury ? 'CANNOT_AFFORD' : null;
}

/** Validate hook for build.place: CANNOT_AFFORD or LEAN_TIMES, else null. Pure. */
export function placementBlocked(state: WorldState, def: BuildingDef): RejectReason | null {
  return spendBlocked(state, placementCost(def));
}

/** Logs a builder gets from each mature tree cleared off a site (a woodcutter gets 4). */
export const CLEARED_TREE_LOGS = 2;

/** Mature trees standing on a footprint: call before insertBuilding clears them. */
export function matureTreesUnder(
  state: WorldState,
  def: BuildingDef,
  x: number,
  z: number,
  rot: Rot4,
): number {
  let n = 0;
  for (const [tx, tz] of footprintTiles(def, x, z, rot)) {
    if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) continue;
    const v = state.map.tree[tz * MAP_SIZE + tx]!;
    if (v && treeStage(v) >= TREE_MATURE) n++;
  }
  return n;
}

/**
 * Apply hook for build.place, after the site exists: deducts coins, records ConstructionState.paid.
 * Mature trees cleared off the footprint (`clearedTrees`, counted before the site went in) become
 * logs: toward the site's own needs first, the rest to the nearest storehouse.
 */
export function chargePlacement(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  clearedTrees = 0,
): void {
  // A building placed over field tiles takes them over (in sandbox valleys too).
  const lost: number[] = [];
  for (const [x, z] of footprintTiles(def, b.x, b.z, b.rot)) {
    const i = z * MAP_SIZE + x;
    if (state.map.fieldOwner[i]) lost.push(i);
  }
  if (lost.length > 0) clearFields(state, ctx, lost);
  if (!isStandard(state) || !b.rt?.construction) return;
  const cost = placementCost(def);
  book(state, 'construction', cost);
  b.rt.construction.paid = cost;
  const logs = content.goodIndex.get('logs');
  if (clearedTrees > 0 && logs !== undefined) {
    const c = b.rt.construction;
    const n = clearedTrees * CLEARED_TREE_LOGS;
    const used = Math.min(n, c.needs[logs]!);
    c.needs[logs]! -= used;
    c.delivered[logs]! += used;
    if (n > used) stowNearest(state, doorTile(b, def), logs, n - used, b.id);
    bookProduced(state, ctx, b, logs, n);
  }
  emitMoney(state, ctx);
}

/**
 * Apply hook for build.remove, before the building leaves state: refunds coins for unfinished sites,
 * returns delivered materials and buffers to the nearest storehouse, cancels porter jobs.
 */
export function refundRemoval(state: WorldState, ctx: TickCtx, b: Building, def: BuildingDef): void {
  if (isFarm(def)) {
    const fields = fieldsOf(state, b, def);
    if (fields.length > 0) clearFields(state, ctx, fields);
  }
  const rt = b.rt;
  if (!isStandard(state) || !rt) return;
  cancelJobsFor(state, b.id, isWorkTime(state.tick));
  const door = doorTile(b, def);
  const c = rt.construction;
  if (c) {
    if (c.paid > 0) book(state, 'refunds', c.paid);
    c.paid = 0;
    for (let g = 0; g < c.delivered.length; g++) stowNearest(state, door, g, c.delivered[g]!, b.id);
  }
  for (let g = 0; g < rt.store.length; g++) {
    const n = rt.store[g]! + rt.input[g]! + rt.output[g]!;
    if (n > 0) stowNearest(state, door, g, n, b.id);
  }
  emitMoney(state, ctx);
}

/** Validate hook for road.paint: CANNOT_AFFORD or LEAN_TIMES, else null. Pure. */
export function roadBlocked(state: WorldState, kind: RoadKind, newTiles: number): RejectReason | null {
  if (newTiles <= 0) return null;
  return spendBlocked(state, roadCost(kind, newTiles));
}

/** Apply hook for road.paint: charges for tiles that were not road before. */
export function chargeRoad(state: WorldState, ctx: TickCtx, kind: RoadKind, newTiles: number): void {
  if (!isStandard(state) || newTiles <= 0) return;
  book(state, 'roads', roadCost(kind, newTiles));
  emitMoney(state, ctx);
}

/** Moves money and books it (pennies; positive amounts, the category says income or expense). */
export function book(state: WorldState, category: LedgerCategoryId, pennies: number): void {
  const i = LEDGER_CATEGORIES.findIndex((c) => c.id === category);
  if (i < 0 || pennies === 0) return;
  const e = state.economy;
  e.treasury += LEDGER_CATEGORIES[i]!.kind === 'income' ? pennies : -pennies;
  e.today.money[i]! += pennies;
  e.season.money[i]! += pennies;
}
