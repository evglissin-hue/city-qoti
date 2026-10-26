// Street rules (docs/spec/10-world-and-building.md, Roads; 13-ledger.md, Streets and traffic) and
// what follows any road change. Streets need their road's `requires` (Cobbles) in standard valleys
// and cost their content goods (a stone a tile) from the storehouses on top of the coins, also when
// a lane or path is cobbled over. New road takes its tiles out of any zone, and paths that climb a
// level get stairs (Flags.stairs) on the path side of the step, the lower one when both are paths.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Rect, RejectReason, RoadKind, TickCtx, WorldState } from '../../contracts';
import { clampRect, Flags, Road, tilesRect } from '../../map/layers';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { roadCost, spendBlocked, book } from '../economy/api';
import { emitMoney } from '../economy/emit';
import { isStorehouse } from '../logistics/stores';

const S = MAP_SIZE;

/** LOCKED while a road kind's rank or innovation is missing (standard valleys only). */
export function roadKindLocked(state: WorldState, kind: RoadKind): RejectReason | null {
  const def = content.roadById.get(kind);
  if (!def?.requires || !isStandard(state)) return null;
  const { rank, innovation } = def.requires;
  if (rank && !rankAtLeast(state, rank)) return 'LOCKED';
  if (innovation && !hasInnovation(state, innovation) && !state.hearth.unlocked.includes(def.id)) {
    return 'LOCKED';
  }
  return null;
}

/** Distinct tiles of a run that are road already but of another kind (cobbling a lane over). */
function upgradeTiles(state: WorldState, value: number, tiles: readonly [number, number][]): number {
  const seen = new Set<number>();
  for (const [x, z] of tiles) {
    const i = z * S + x;
    const r = state.map.road[i]!;
    if (r && r !== value) seen.add(i);
  }
  return seen.size;
}

/** Distinct tiles of a run that are not this kind yet. */
function changedTiles(state: WorldState, value: number, tiles: readonly [number, number][]): number {
  const seen = new Set<number>();
  for (const [x, z] of tiles) {
    const i = z * S + x;
    if (state.map.road[i] !== value) seen.add(i);
  }
  return seen.size;
}

/** Goods in the town's storehouses, by good index. */
function storehouseStock(state: WorldState, good: number): number {
  let n = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || !isStorehouse(content.buildingById.get(b.def))) continue;
    n += b.rt.store[good] ?? 0;
  }
  return n;
}

/**
 * Validate hook for road.paint, after the shape and coin checks: LOCKED, or CANNOT_AFFORD when the
 * storehouses lack the goods or the treasury the coins for cobbling over existing road.
 */
export function roadPaintBlocked(
  state: WorldState,
  kind: RoadKind,
  tiles: [number, number][],
): RejectReason | null {
  const locked = roadKindLocked(state, kind);
  if (locked) return locked;
  const def = content.roadById.get(kind);
  if (!def || !isStandard(state)) return null;
  // New tiles and cobbled-over ones pay together.
  const n = changedTiles(state, def.layerValue, tiles);
  if (upgradeTiles(state, def.layerValue, tiles) > 0) {
    const coins = spendBlocked(state, roadCost(kind, n));
    if (coins) return coins;
  }
  for (const [good, per] of def.cost?.goods ?? []) {
    const g = content.goodIndex.get(good);
    if (g !== undefined && storehouseStock(state, g) < per * n) return 'CANNOT_AFFORD';
  }
  return null;
}

/**
 * Apply hook for road.paint, before the tiles change: coins for cobbling over existing road (new
 * tiles are charged by chargeRoad) and the goods, taken from storehouses in id order.
 */
export function chargeRoadGoods(
  state: WorldState,
  ctx: TickCtx,
  kind: RoadKind,
  tiles: [number, number][],
): void {
  const def = content.roadById.get(kind);
  if (!def || !isStandard(state)) return;
  const upgrades = upgradeTiles(state, def.layerValue, tiles);
  if (upgrades > 0) {
    book(state, 'roads', roadCost(kind, upgrades));
    emitMoney(state, ctx);
  }
  const n = changedTiles(state, def.layerValue, tiles);
  for (const [good, per] of def.cost?.goods ?? []) {
    const g = content.goodIndex.get(good);
    if (g === undefined) continue;
    let want = per * n;
    for (const b of state.buildings) {
      if (want <= 0) break;
      if (b.stage !== 'built' || !b.rt || !isStorehouse(content.buildingById.get(b.def))) continue;
      const take = Math.min(want, b.rt.store[g] ?? 0);
      if (take <= 0) continue;
      b.rt.store[g]! -= take;
      want -= take;
    }
    const used = per * n - want;
    state.economy.today.consumed[g]! += used;
    state.economy.season.consumed[g]! += used;
  }
}

/** After road.paint or road.remove: new road leaves its zone, and stairs follow the paths. */
export function afterRoadChange(state: WorldState, ctx: TickCtx, tiles: readonly [number, number][]): void {
  const m = state.map;
  let unzoned = false;
  for (const [x, z] of tiles) {
    const i = z * S + x;
    if (m.road[i] && m.zone[i]) {
      m.zone[i] = 0;
      unzoned = true;
    }
  }
  const rect = tilesRect(tiles);
  if (!rect) return;
  if (unzoned) {
    ctx.events.push({ e: 'tiles.changed', rect, layers: ['zone'] });
    ctx.dirty.mark('zone', rect);
  }
  refreshStairs(state, ctx, [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
}

/** True when the path tile at i should carry stairs: a road beside it one level up, or a non-path road one level down. */
export function wantsStairs(map: { road: Uint8Array; height: Uint8Array }, i: number): boolean {
  if (map.road[i] !== Road.path) return false;
  const h = map.height[i]!;
  const x = i % S;
  for (let k = 0; k < 4; k++) {
    if ((k === 0 && x === S - 1) || (k === 1 && x === 0)) continue;
    const n = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + S : i - S;
    if (n < 0 || n >= S * S) continue;
    const r = map.road[n]!;
    if (!r) continue;
    const dh = map.height[n]! - h;
    if (dh === 1 || (dh === -1 && r !== Road.path)) return true;
  }
  return false;
}

/** Sets or clears Flags.stairs over a rect to match the roads and heights there. */
export function refreshStairs(state: WorldState, ctx: TickCtx | null, area: Rect): void {
  const [x0, z0, x1, z1] = clampRect(area);
  const flags = state.map.flags;
  let changed = false;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const i = z * S + x;
      const want = wantsStairs(state.map, i);
      const has = (flags[i]! & Flags.stairs) !== 0;
      if (want === has) continue;
      flags[i] = want ? flags[i]! | Flags.stairs : flags[i]! & ~Flags.stairs;
      changed = true;
    }
  }
  if (changed && ctx) {
    const rect: Rect = [x0, z0, x1, z1];
    ctx.events.push({ e: 'tiles.changed', rect, layers: ['flags'] });
    ctx.dirty.mark('flags', rect);
  }
}
