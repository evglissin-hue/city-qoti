// The four demand bars (docs/spec/13-ledger.md, Demand): Homes, Shops, Workshops, Farmland, 0 to 100,
// each with up to three reasons, strongest first. A bar is quiet while a free, suitable lot of its
// zone waits (growth is on its way) and lit when the town needs more zoned land, so it asks only when
// it needs the player. Written after the 01:00 growth pass, and again when the zoning pass or the
// zone commands change the free lots (refreshLit).
//
// P2 (the R1 playtest): a wanted bar's last reason says where it truly stands. Lit: no land zoned
// for it is free (needsLand), land is zoned but no street has cut it into lots (noRoad), the free
// lots lie beyond the porters (outOfReach), or none suits what is wanted (unsuitable). Quiet: a lot
// waits and the next pass may start it (lotWaiting, with the hour), or the last pass could not start
// it for want of materials or because enough sites are going up (materials, sitesBusy, from growSites).
import { content, type TradeDef } from '@qoti/content';
import { DEMAND_KINDS, MAP_SIZE, Zone } from '../../constants';
import type { DemandReason, Lot, TickCtx, WorldState } from '../../contracts';
import { familyIndex } from '../../state/zones';
import { rankAtLeast } from '../../state/village';
import { demandView } from '../../view/demand';
import { porterServed } from '../logistics/range';
import {
  HOUSEHOLDS_PER_SHOP,
  outletCount,
  SHOP_HOUSEHOLDS,
  shopReach,
  unservedPlaces,
  type Services,
} from './outlets';
import { recentOutShare } from './evenings';
import type { SiteCache } from './site';
import { anyRoom, siteMeets, unmetWant } from './site';
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
  /** R2X: homes the jobs would ask for that quiet evenings hold back (absent: none). */
  homesHeld?: number;
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
  /**
   * P2: what the growth pass that just ran found when a wanted kind did not start, per bar in
   * DEMAND_KINDS order (absent between passes, when a hold the last pass found still stands).
   */
  held?: readonly (DemandReason | undefined)[];
  /** P2: the hour of the next growth pass that may start a waiting lot (1 or 13). */
  nextHour?: number;
}

/** The zones each bar answers to, in DEMAND_KINDS order. */
export const BAR_ZONES: readonly (readonly number[])[] = [
  HOME_ZONES,
  [Zone.shops],
  [Zone.crafts],
  [Zone.farms],
];

/** True when the lot is still free, of one of the zones, and porters reach it. */
function freeFor(x: BarInputs, l: Lot, zones: readonly number[]): boolean {
  return !l.buildingId && l.kind !== 'garden' && zones.includes(l.zone) && x.porters(l);
}

/** A Workshops trade's pull on the bar, permille: need x supply x keeper where some site could take it. */
export function craftPull(state: WorldState, t: TradeDef, n: TownNeeds, cache: SiteCache): number {
  if (t.wants.reach !== undefined && !anyRoom(cache, t.wants.reach)) return 0;
  const { need } = needOf(state, t, n);
  const base = Math.floor((need * supplyOf(state, t, n)) / NEED_FULL);
  // No pull whatever the keeper: nobody is asked who is keen (a walk of the residents).
  if (base <= 0) return 0;
  const keeper = n.keen.has(t.id) ? KEEPER_KEEN : KEEPER_PLAIN;
  return Math.floor((base * keeper) / 100);
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
      l.kind !== 'garden' &&
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
  /** P2: free lots porters reach exist, but none suits what is wanted: why (the bar is lit). */
  unmet?: DemandReason;
  /** P2: where a wanted, zoned bar stands, its last reason (see `standing`). */
  stand?: DemandReason;
}

function homesBar(state: WorldState, x: BarInputs): Bar {
  const value = Math.min(100, x.homes * BAR_A_HOME);
  const waiting = value > 0 && x.empty.some((l) => freeFor(x, l, HOME_ZONES));
  const reasons: DemandReason[] = value > 0 ? [{ code: 'newcomers', value: x.homes }] : [];
  // R2X: newcomers follow good evenings; the Ledger's bar says what the Hearth could do for it.
  if (x.homesHeld) reasons.push({ code: 'quietEvenings', value: recentOutShare(state) ?? 0 });
  return { value, reasons, waiting, zoned: true };
}

function shopsBar(state: WorldState, x: BarInputs): Bar {
  const households = state.households.length;
  // R2B: the doors list ends with the unserved places' pseudo-doors (see outlets.ts); households only here.
  const places = unservedPlaces(state).length;
  const unserved = Math.max(0, x.doors.length - places * SHOP_HOUSEHOLDS);
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
  if (places > 0) {
    value = Math.max(value, Math.min(100, 20 + 20 * places));
    reasons.push({ code: 'unservedPlaces', value: places });
  }
  const zoned = rankAtLeast(state, 'village');
  if (value > 0 && !zoned) reasons.push({ code: 'marketStall' });
  let waiting = false;
  let unmet: DemandReason | undefined;
  if (value > 0 && zoned) {
    const free = x.empty.filter((l) => freeFor(x, l, [Zone.shops]));
    waiting = crowded ? free.length > 0 : free.some((l) => shopReach(l, x.doors) >= SHOP_HOUSEHOLDS);
    if (!waiting && free.length > 0) unmet = { code: 'unsuitable', want: 'households' };
  }
  return { value, reasons, waiting, zoned, ...(unmet && { unmet }) };
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
  let unmet: DemandReason | undefined;
  if (value > 0) {
    const want = new Set(pulls.map(([t]) => t.id));
    // A wanted trade already pulls (need x supply x keeper above 0): its site decides.
    const wanted = x.crafts.filter((t) => want.has(t.id));
    waiting = x.empty.some(
      (lot) => freeFor(x, lot, [Zone.crafts]) && wanted.some((t) => siteMeets(x.cache, lot, t)),
    );
    if (!waiting) unmet = unsuited(x, [Zone.crafts], pulls[0]![0]);
  }
  return { value, reasons, waiting, zoned: true, ...(unmet && { unmet }) };
}

function farmlandBar(state: WorldState, x: BarInputs): Bar {
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
  // No lot suits any farm: say what the first farm the town could use is missing.
  const first = x.farms.find((t) => needOf(state, t, n).need > 0) ?? x.farms[0];
  const unmet = value > 0 && !waiting && first ? unsuited(x, [Zone.farms], first) : undefined;
  return {
    value: Math.max(value, reasons.length > 0 ? 1 : 0),
    reasons: reasons.slice(0, 2).map(([r]) => r),
    waiting,
    zoned: true,
    ...(unmet && { unmet }),
  };
}

/**
 * P2: why the first free lot of the zones that porters reach does not suit the trade (its first
 * unmet site want), or undefined when no such lot exists (the land itself is the trouble).
 */
function unsuited(x: BarInputs, zones: readonly number[], t: TradeDef): DemandReason | undefined {
  const lot = x.empty.find((l) => freeFor(x, l, zones));
  if (!lot) return undefined;
  const want = unmetWant(x.cache, lot, t);
  const r: DemandReason = { code: 'unsuitable' };
  if (t.makes) r.good = t.makes;
  if (want) r.want = want;
  return r;
}

/** True when some tile is zoned for one of the zones. */
function anyZoned(state: WorldState, zones: readonly number[]): boolean {
  const zone = state.map.zone;
  for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) if (zones.includes(zone[i]!)) return true;
  return false;
}

/** Why a wanted bar with no suitable lot waiting is lit: what is wrong with the land (P2). */
function landReason(state: WorldState, x: BarInputs, i: number, bar: Bar): DemandReason {
  const zones = BAR_ZONES[i]!;
  let onRoad = false;
  for (const l of x.empty) {
    if (l.buildingId || l.kind === 'garden' || !zones.includes(l.zone)) continue;
    onRoad = true;
    // A free lot on a street that porters reach: the land is there, it does not suit.
    if (x.porters(l)) return bar.unmet ?? { code: 'unsuitable' };
  }
  if (onRoad) return { code: 'outOfReach' };
  let lots = false;
  for (const l of state.lots) {
    if (l.kind === 'garden' || !zones.includes(l.zone)) continue;
    // A free lot whose street is gone.
    if (!l.buildingId) return { code: 'noRoad' };
    lots = true;
  }
  // Land zoned for it that no street has ever cut into lots (zoned in the open, away from a road).
  if (!lots && anyZoned(state, zones)) return { code: 'noRoad' };
  return { code: 'needsLand' };
}

/** A hold the growth pass found that the player must answer on the land, so the bar is lit. */
const LAND_HOLDS: readonly DemandReason['code'][] = ['outOfReach', 'unsuitable'];
/** A hold that passes by itself (the bar stays quiet). */
const QUIET_HOLDS: readonly DemandReason['code'][] = ['materials', 'sitesBusy'];

/**
 * P2: where a wanted, zoned bar stands (its last reason). With a lot waiting: what the pass that
 * just ran found (x.held), else a hold the last pass left in state.demand while no pass has run
 * since, else the hour the next pass may start it. With none waiting: what is wrong with the land.
 */
function standing(state: WorldState, x: BarInputs, i: number, bar: Bar): DemandReason {
  if (!bar.waiting) return landReason(state, x, i, bar);
  const held = x.held ? x.held[i] : undefined;
  if (held) {
    // The pass tried the lots and the land failed it: the bar asks after all.
    if (LAND_HOLDS.includes(held.code)) bar.waiting = false;
    return held;
  }
  if (!x.held) {
    const was = state.demand.reasons[i];
    const last = was?.[was.length - 1];
    if (last && QUIET_HOLDS.includes(last.code)) return last;
  }
  return x.nextHour !== undefined ? { code: 'lotWaiting', value: x.nextHour } : { code: 'lotWaiting' };
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
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    if (bar.value > 0 && bar.zoned && !bar.hands) bar.stand = standing(state, x, i, bar);
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
    if (wanted && bar.zoned && !bar.hands) {
      reasons.push(bar.stand ?? { code: lit ? 'needsLand' : 'lotWaiting' });
    }
    d.bars[i] = bar.value;
    d.lit[i] = lit;
    d.reasons[i] = reasons.slice(0, 3);
  }
  ctx?.events.push({ e: 'demand.updated', d: demandView(state) });
}
