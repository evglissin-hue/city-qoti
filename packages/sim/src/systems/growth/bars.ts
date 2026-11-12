// The four demand bars (docs/spec/13-ledger.md, Demand): Homes, Shops, Workshops, Farmland, 0 to 100,
// each with up to three reasons, strongest first. A bar is quiet while a free, suitable lot of its
// zone waits (growth is on its way) and lit when the town needs more zoned land, so it asks only when
// it needs the player. Written after the 01:00 growth pass, and again when the zoning pass or the
// zone commands change the free lots (refreshLit).
import { content, type TradeDef } from '@qoti/content';
import { DEMAND_KINDS, Zone } from '../../constants';
import type { DemandReason, Lot, TickCtx, WorldState } from '../../contracts';
import { familyIndex } from '../../state/zones';
import { rankAtLeast } from '../../state/village';
import { demandView } from '../../view/demand';
import { porterServed } from '../logistics/range';
import { HOUSEHOLDS_PER_SHOP, outletCount, SHOP_HOUSEHOLDS, shopReach, type Services } from './outlets';
import type { SiteCache } from './site';
import { anyRoom, siteMeets } from './site';
import {
  FARM_FOOD_DAYS,
  KEEPER_KEEN,
  KEEPER_PLAIN,
  NEED_FULL,
  needOf,
  supplyOf,
  type TownNeeds,
} from './trades';

export { FARM_FOOD_DAYS };

/** Farm goods whose import Farmland answers (docs/spec/13-ledger.md, Demand: Farmland). */
export const FARM_GOODS = ['grain', 'vegetables', 'fruit', 'cheese', 'wool', 'honey'] as const;
/** Bar points a home wanted. */
export const BAR_A_HOME = 34;

export const HOME_ZONES: readonly number[] = [Zone.homesLow, Zone.homesMedium];

/** What the growth pass worked out tonight, for the bars. */
export interface BarInputs {
  needs: TownNeeds;
  cache: SiteCache;
  services: Services;
  /** Homes wanted beyond those waiting (growthDemand's homes). */
  homes: number;
  /** Home doors no outlet reaches. */
  doors: [number, number][];
  /** Trades of the Workshops zone the valley allows, and of Farmland. */
  crafts: readonly TradeDef[];
  farms: readonly TradeDef[];
  /** Trades with a business going up (one answer to a need at a time). */
  goingUp: ReadonlySet<string>;
  /** Empty lots with a road at the frontage, best first. */
  empty: readonly Lot[];
  /** True when porters reach the lot's frontage (asked lazily, so a bar stops at the first). */
  porters: (lot: Lot) => boolean;
  /** R1X: businesses stand with nobody at work, so new ones wait for hands (see handsShort). */
  handsShort?: boolean;
  /** Outlets in town (outletCount), when the caller has counted them tonight. */
  outlets?: number;
}

/** True when the lot is still free, of one of the zones, and porters reach it. */
function freeFor(x: BarInputs, l: Lot, zones: readonly number[]): boolean {
  return !l.buildingId && zones.includes(l.zone) && x.porters(l);
}

/** A Workshops trade's pull on the bar, permille: need x supply x keeper where some site could take it. */
export function craftPull(state: WorldState, t: TradeDef, n: TownNeeds, cache: SiteCache): number {
  if (t.wants.reach !== undefined && !anyRoom(cache, t.wants.reach)) return 0;
  const { need } = needOf(state, t, n);
  const keeper = n.keen.has(t.id) ? KEEPER_KEEN : KEEPER_PLAIN;
  return Math.floor((Math.floor((need * supplyOf(state, t, n)) / NEED_FULL) * keeper) / 100);
}

/** True when a business of `trade` is going up already (one answer to a need at a time). */
export function siteGoingUp(state: WorldState, trade: string): boolean {
  for (const b of state.buildings) if (b.trade === trade && b.stage === 'construction') return true;
  return false;
}

/** Free lots of the zones with a road at the frontage that porters can reach. */
export function freeLots(state: WorldState, zones: readonly number[], services: Services): Lot[] {
  return state.lots.filter(
    (l) =>
      !l.buildingId &&
      zones.includes(l.zone) &&
      state.map.road[l.frontage]! > 0 &&
      porterServed(services.reach, l.frontage),
  );
}

/** Food in hand in hundredths of a day (stock and nothing else, against a resident a day). */
function foodCover(n: TownNeeds): number {
  const f = familyIndex('food');
  const use = n.famUse[f]!;
  return use > 0 ? Math.floor((n.famStock[f]! * 100) / use) : FARM_FOOD_DAYS * 100;
}

interface Bar {
  value: number;
  reasons: DemandReason[];
  /** A free, suitable lot exists. */
  waiting: boolean;
  /** The bar can be answered with zoned land at all (Shops before Village: a stall instead). */
  zoned: boolean;
  /** R1X: quiet because businesses wait for hands (its last reason says so). */
  hands?: boolean;
}

function homesBar(_state: WorldState, x: BarInputs): Bar {
  const value = Math.min(100, x.homes * BAR_A_HOME);
  const waiting = value > 0 && x.empty.some((l) => freeFor(x, l, HOME_ZONES));
  return { value, reasons: value > 0 ? [{ code: 'newcomers', value: x.homes }] : [], waiting, zoned: true };
}

function shopsBar(state: WorldState, x: BarInputs): Bar {
  const households = state.households.length;
  const unserved = x.doors.length;
  const outlets = x.outlets ?? outletCount(state);
  const over = households - HOUSEHOLDS_PER_SHOP * outlets;
  const crowded = Math.floor(households / HOUSEHOLDS_PER_SHOP) > outlets;
  const reasons: DemandReason[] = [];
  let value = 0;
  if (unserved >= SHOP_HOUSEHOLDS) {
    value = Math.min(100, Math.floor((unserved * 100) / Math.max(1, households)) + 20);
    reasons.push({ code: 'noOutlet', value: unserved });
  }
  if (crowded) {
    value = Math.max(value, Math.min(100, Math.floor((over * 100) / HOUSEHOLDS_PER_SHOP)));
    reasons.push({ code: 'crowded' });
  }
  const zoned = rankAtLeast(state, 'village');
  if (value > 0 && !zoned) reasons.push({ code: 'marketStall' });
  let waiting = false;
  if (value > 0 && zoned) {
    const free = x.empty.filter((l) => freeFor(x, l, [Zone.shops]));
    waiting = crowded ? free.length > 0 : free.some((l) => shopReach(l, x.doors) >= SHOP_HOUSEHOLDS);
  }
  return { value, reasons, waiting, zoned };
}

function workshopsBar(state: WorldState, x: BarInputs): Bar {
  const pulls: [TradeDef, number][] = [];
  let sum = 0;
  for (const t of x.crafts) {
    if (x.goingUp.has(t.id)) continue;
    const p = craftPull(state, t, x.needs, x.cache);
    if (p <= 0) continue;
    pulls.push([t, p]);
    sum += p;
  }
  pulls.sort((a, b) => b[1] - a[1]);
  const reasons: DemandReason[] = [];
  for (const [t, p] of pulls.slice(0, 2)) {
    const code = needOf(state, t, x.needs).code === 'firstMaker' ? 'firstMaker' : 'short';
    const r: DemandReason = { code, good: t.makes ?? undefined, value: p };
    if (t.from[0] !== undefined) r.from = t.from[0];
    reasons.push(r);
  }
  const value = Math.min(100, Math.floor(sum / 10));
  let waiting = false;
  if (value > 0) {
    const want = new Set(pulls.map(([t]) => t.id));
    // A wanted trade already pulls (need x supply x keeper above 0): its site decides.
    const wanted = x.crafts.filter((t) => want.has(t.id));
    waiting = x.empty.some(
      (lot) => freeFor(x, lot, [Zone.crafts]) && wanted.some((t) => siteMeets(x.cache, lot, t)),
    );
  }
  return { value, reasons, waiting, zoned: true };
}

function farmlandBar(_state: WorldState, x: BarInputs): Bar {
  const n = x.needs;
  const reasons: [DemandReason, number][] = [];
  const cover = foodCover(n);
  if (cover < FARM_FOOD_DAYS * 100) {
    reasons.push([
      { code: 'foodCover', value: cover },
      Math.floor(((FARM_FOOD_DAYS * 100 - cover) * 100) / (FARM_FOOD_DAYS * 100)),
    ]);
  }
  // More than a third of a farm good's use coming by carrier (over the last three days).
  for (const id of FARM_GOODS) {
    const g = content.goodIndex.get(id);
    if (g === undefined) continue;
    const use = Math.max(1, n.want[g]!);
    const brought = n.brought[g]!;
    if (brought <= use) continue;
    reasons.push([{ code: 'imported', good: id }, Math.min(100, Math.floor((brought * 50) / use))]);
  }
  reasons.sort((a, b) => b[1] - a[1]);
  const value = reasons.length > 0 ? reasons[0]![1] : 0;
  // A free farm lot where some farm trade's site wants are met.
  const waiting =
    value > 0 &&
    x.empty.some((l) => freeFor(x, l, [Zone.farms]) && x.farms.some((t) => siteMeets(x.cache, l, t)));
  return {
    value: Math.max(value, reasons.length > 0 ? 1 : 0),
    reasons: reasons.slice(0, 2).map(([r]) => r),
    waiting,
    zoned: true,
  };
}

/** The bars in DEMAND_KINDS order. */
export function computeBars(state: WorldState, x: BarInputs): Bar[] {
  const bars = [homesBar(state, x), shopsBar(state, x), workshopsBar(state, x), farmlandBar(state, x)];
  // R1X: while businesses stand empty for want of hands, the business bars stay quiet and say so;
  // land would not help, newcomers would (the Homes bar asks for them).
  if (x.handsShort) {
    for (const bar of bars.slice(1)) {
      if (bar.value <= 0 || !bar.zoned) continue;
      bar.waiting = true;
      bar.hands = true;
      bar.reasons = [...bar.reasons.slice(0, 1), { code: 'hands' }];
    }
  }
  return bars;
}

/** Writes the bars to state.demand and sends demand.updated (when there is a ctx). */
export function writeBars(state: WorldState, ctx: TickCtx | null, bars: readonly Bar[]): void {
  const d = state.demand;
  for (let i = 0; i < DEMAND_KINDS.length; i++) {
    const bar = bars[i]!;
    const wanted = bar.value > 0;
    const lit = wanted && !bar.waiting;
    const reasons = bar.reasons.slice(0, bar.zoned ? 2 : 3);
    if (wanted && bar.zoned && !bar.hands) reasons.push({ code: lit ? 'needsLand' : 'lotWaiting' });
    d.bars[i] = bar.value;
    d.lit[i] = lit;
    d.reasons[i] = reasons.slice(0, 3);
  }
  ctx?.events.push({ e: 'demand.updated', d: demandView(state) });
}
