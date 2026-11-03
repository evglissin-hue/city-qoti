// Modules: customization phase 2 (C5C; docs/spec/10-world-and-building.md, Customization). A porch,
// a dormer, a bay window, an extra floor, a balcony, a tower, an arcade, ivy or flower boxes go in a
// slot the building's def offers. Ordering one pays its coins at once (booked as construction) and
// asks porters for its goods into rt.moduleWork, as a home upgrade does (rt.upgrade); when the last
// are in, the module appears (rt.modules), its charm and habitat count, and the building is
// handmade. A module with no goods goes on at once. Taking one off is free; calling off one still
// waiting refunds its coins and sends what was delivered back to a storehouse. One at a time.
import { content, type ModuleDef } from '@qoti/content';
import { PENNIES_PER_COIN } from '../../constants';
import type { Building, TickCtx, WorldState } from '../../contracts';
import { goodsArray, isStandard } from '../../state/hamlet';
import { book } from '../economy/api';
import { emitBuilding, emitMoney } from '../economy/emit';
import { markCharmDirty, markCharmSoon } from '../hearth/charm/dirty';
import { buildingRect } from '../../conditions/geo';
import { cancelJobsFor } from '../logistics';
import { stowNearest } from '../logistics/stores';
import { doorTile } from '../movement/api';
import { isBuildTime } from '../economy/time';

/** Coins for a module, in pennies. */
export function moduleCoins(m: ModuleDef): number {
  return (m.cost?.coins ?? 0) * PENNIES_PER_COIN;
}

/** The goods a module needs, by good index. */
export function moduleGoods(m: ModuleDef): number[] {
  const need = goodsArray();
  for (const [id, qty] of m.cost?.goods ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) need[g]! += qty;
  }
  return need;
}

/** True while a module waits for materials. */
export function moduleDue(b: Building): boolean {
  const w = b.rt?.moduleWork;
  return !!w && w.some((q) => q > 0);
}

function touched(state: WorldState, b: Building): void {
  markCharmDirty(state, buildingRect(b));
  markCharmSoon(state);
}

function setInstalled(b: Building, slot: string, module: string | null): void {
  const rt = b.rt!;
  const list = (rt.modules ?? []).filter(([s]) => s !== slot);
  if (module !== null) list.push([slot, module]);
  list.sort((a, c) => (a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : 0));
  if (list.length) rt.modules = list;
  else delete rt.modules;
}

/** Orders a module into a slot (paid now; goods by porter), or fits it at once without goods. */
export function orderModule(state: WorldState, ctx: TickCtx, b: Building, slot: string, m: ModuleDef): void {
  const rt = b.rt!;
  if (isStandard(state)) {
    book(state, 'construction', moduleCoins(m));
    emitMoney(state, ctx);
  }
  const need = moduleGoods(m);
  b.handmade = true;
  if (!isStandard(state) || !need.some((q) => q > 0)) {
    setInstalled(b, slot, m.id);
    touched(state, b);
  } else {
    rt.moduleWork = need;
    rt.moduleNext = [slot, m.id];
  }
  emitBuilding(state, ctx, b);
}

/** Takes the module out of a slot: free when fitted; a refund when it was still waiting. */
export function removeModule(state: WorldState, ctx: TickCtx, b: Building, slot: string): void {
  const rt = b.rt!;
  if (rt.moduleNext && rt.moduleNext[0] === slot) {
    const m = content.moduleById.get(rt.moduleNext[1]);
    if (m && isStandard(state)) {
      book(state, 'refunds', moduleCoins(m));
      cancelJobsFor(state, b.id, isBuildTime(state.tick));
      const need = moduleGoods(m);
      const door = doorTile(b);
      for (let g = 0; g < need.length; g++) {
        const delivered = need[g]! - (rt.moduleWork?.[g] ?? 0);
        if (delivered > 0) stowNearest(state, door, g, delivered, b.id);
      }
      emitMoney(state, ctx);
    }
    rt.moduleWork = null;
    delete rt.moduleNext;
  } else {
    setInstalled(b, slot, null);
    touched(state, b);
  }
  b.handmade = true;
  emitBuilding(state, ctx, b);
}

/** Takes delivered goods into the module under way; returns the units used. Fits it when complete. */
export function deliverModule(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  good: number,
  qty: number,
): number {
  const w = b.rt?.moduleWork;
  if (!w) return 0;
  const used = Math.min(qty, w[good] ?? 0);
  if (used <= 0) return 0;
  w[good]! -= used;
  const e = state.economy;
  e.today.consumed[good]! += used;
  e.season.consumed[good]! += used;
  if (!moduleDue(b)) finishModule(state, ctx, b);
  return used;
}

export function finishModule(state: WorldState, ctx: TickCtx, b: Building): void {
  const rt = b.rt;
  if (!rt?.moduleNext) return;
  const [slot, module] = rt.moduleNext;
  rt.moduleWork = null;
  delete rt.moduleNext;
  setInstalled(b, slot, module);
  b.handmade = true;
  touched(state, b);
  emitBuilding(state, ctx, b);
}
