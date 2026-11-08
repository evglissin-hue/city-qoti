// Decor costs (playtest round seven). A piece whose def has `cost` is paid for when it is placed
// and refunded in full when it is removed, so undo and a change of mind are fair: coins from and to
// the treasury (booked as construction and refunds), goods taken from the storehouses in id order
// and returned to the storehouse nearest the piece. Sandbox valleys charge nothing, and pieces
// with no cost (all the older ones) never touch the books.
import type { DecorDef } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE, PENNIES_PER_COIN, TILE_FP } from '../../constants';
import type { RejectReason, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { isStorehouse, stowNearest } from '../logistics/stores';
import { book, spendBlocked } from './api';
import { emitMoney } from './emit';

/** True when this piece costs anything in this valley. */
function priced(state: WorldState, def: DecorDef): boolean {
  return isStandard(state) && !!def.cost && ((def.cost.coins ?? 0) > 0 || (def.cost.goods?.length ?? 0) > 0);
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

/** CANNOT_AFFORD or LEAN_TIMES for `n` pieces of a def, else null. Pure. */
export function decorBlocked(state: WorldState, def: DecorDef, n = 1): RejectReason | null {
  if (!priced(state, def)) return null;
  const coins = spendBlocked(state, (def.cost!.coins ?? 0) * PENNIES_PER_COIN * n);
  if (coins) return coins;
  for (const [good, per] of def.cost!.goods ?? []) {
    const g = content.goodIndex.get(good);
    if (g !== undefined && storehouseStock(state, g) < per * n) return 'CANNOT_AFFORD';
  }
  return null;
}

/** Charges `n` pieces of a def: coins to the books, goods out of the storehouses. */
export function chargeDecor(state: WorldState, ctx: TickCtx, def: DecorDef, n = 1): void {
  if (!priced(state, def)) return;
  const coins = (def.cost!.coins ?? 0) * PENNIES_PER_COIN * n;
  if (coins > 0) book(state, 'construction', coins);
  for (const [good, per] of def.cost!.goods ?? []) {
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
  emitMoney(state, ctx);
}

/** Refunds one piece in full: coins to the treasury, goods to the nearest storehouse. */
export function refundDecor(state: WorldState, ctx: TickCtx, def: DecorDef, fx: number, fz: number): void {
  if (!priced(state, def)) return;
  const coins = (def.cost!.coins ?? 0) * PENNIES_PER_COIN;
  if (coins > 0) book(state, 'refunds', coins);
  const tile = Math.floor(fz / TILE_FP) * MAP_SIZE + Math.floor(fx / TILE_FP);
  for (const [good, per] of def.cost!.goods ?? []) {
    const g = content.goodIndex.get(good);
    if (g === undefined) continue;
    stowNearest(state, tile, g, per, -1);
    // The goods were not used up after all: take them back off today's and the season's tally.
    const e = state.economy;
    e.today.consumed[g] = Math.max(0, e.today.consumed[g]! - per);
    e.season.consumed[g] = Math.max(0, e.season.consumed[g]! - per);
  }
  emitMoney(state, ctx);
}
