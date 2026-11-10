// Daily growth on lots (docs/spec/13-ledger.md, Zoning and growth). At 01:00 the growth pass:
//
// 1. Gives grown grain farms the farm-zoned land around them as fields.
// 2. Works out demand per zone (lots are scored through the day by ./desirability, a slice an hour):
//    - homes, while the town would draw newcomers (food, jobs and mood, before vacancies count)
//      and has open jobs for them: enough homes going up to keep two or so empty ones waiting;
//    - shops, for households no outlet reaches, or one per eight households;
//    - crafts, for a good the town is short of that a Workshops trade can make and feed;
//    - farms, while there are under four days of food in hand, or the carrier brought more than
//      a third of a day's eating at its last visit (R1 stand-in (R1B): Farmland's 'imported').
// 3. Starts grown sites on the best lots, a couple a day and a few at a time, only while the
//    storehouses can spare half their materials beyond what other sites still wait for.
// 4. Writes the four demand bars (state.demand) and sends demand.updated.
//
// R1: a Workshops, Farmland or Shops lot grows a business: its trade's building (workshop,
// farmstead, corner shop) with `Building.trade` set. A business keeps its trade (no retooling
// until R1B); the Ledger may pin another (build.pinRecipe). Home zones grow their defs by weight.
// R1 stand-in (R1B): the trade score of 13-ledger.md (need x supply x site x keeper) replaces
// chooseTrade's shortage score; the demand bars' reasons are the simple ones below.
import { content, type BuildingDef, type TradeDef } from '@qoti/content';
import {
  DEMAND_KINDS,
  FIELD_GOOD_FERTILITY,
  HABITAT_IDS,
  MAP_SIZE,
  TICKS_PER_DAY,
  Zone,
} from '../../constants';
import type { DemandReason, Lot, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { FOOD_GOODS } from '../../state/zones';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { hasBuilt } from '../innovations/api';
import { townStock } from '../../view/hamlet';
import { businessView, demandView } from '../../view/zones';
import { dailyOffset } from '../economy/time';
import { doorTile } from '../movement/api';
import { chunkOfTile, scoreAt } from '../nature/habitats';
import { fieldCap, fieldsOf, fieldTileProblem, isFarm, paintFields } from '../production/fields';
import { porterServed, type Reach } from '../logistics/range';
import { entranceTiles } from '../../rules/footprint';
import { openJobCount } from '../residents/jobs';
import { attractiveness } from '../residents/lifecycle';
import { foodIndexes, pantryFood } from '../residents/needs';
import { vacantHomes } from '../residents/places';
import { growLot, lotPlacement } from './api';
import { lotFertility, lotMiddle, mix, outletCovers, servicesOf } from './desirability';
import { methodScore, shortages, unmetShortages } from './recipes';

const S = MAP_SIZE;

/** Grown sites going up at once, and new ones a day. */
export const GROWTH_MAX_SITES = 3;
export const GROWTH_PER_DAY = 2;
/**
 * Percent of a grown site's materials that must lie free in the storehouses (beyond what other
 * sites wait for) before it starts; porters bring the rest as the town makes it.
 */
export const GROWTH_SHARE = 50;
/** Town pull (attractiveness before vacant homes count) that makes homes worth building. */
export const HOMES_PULL = 25;
/** Empty homes (built or going up) a growing town keeps waiting for newcomers, plus one per 30 folk. */
export const HOMES_WAITING = 2;
/** Households one outlet serves before the town wants another shop. */
export const HOUSEHOLDS_PER_SHOP = 8;
/** Below this many days of food in hand, farms grow. */
export const FARM_FOOD_DAYS = 4;
/** Households without an outlet in reach that make a shop worth growing, and how far a shop reaches. */
export const SHOP_HOUSEHOLDS = 2;
export const SHOP_REACH = 14;

/** True when the valley may build the def (its rank, innovation or unlock). */
function available(state: WorldState, def: BuildingDef): boolean {
  const req = def.requires;
  if (!req) return true;
  if (req.rank && !rankAtLeast(state, req.rank)) return false;
  if (req.innovation && !hasInnovation(state, req.innovation) && !state.hearth.unlocked.includes(def.id)) {
    return false;
  }
  return hasBuilt(state, req.built);
}

/** Defs that may grow in a zone now: content's `grows` defs the valley may build. */
export function growable(state: WorldState, zoneId: string): BuildingDef[] {
  return content.buildings.filter((d) => d.grows?.zone === zoneId && available(state, d));
}

/** Trades that may grow in a zone now (their rank and innovation), in content order. */
export function tradesOf(state: WorldState, zoneId: string): TradeDef[] {
  return content.trades.filter((t) => {
    if (t.zone !== zoneId) return false;
    const def = content.buildingById.get(t.building);
    if (!def || !available(state, def)) return false;
    if (t.requires?.rank && !rankAtLeast(state, t.requires.rank)) return false;
    return !t.requires?.innovation || hasInnovation(state, t.requires.innovation);
  });
}

const POLLINATOR = (HABITAT_IDS as readonly string[]).indexOf('pollinator');

/** Manhattan distance between two tile indexes. */
function tileGap(a: number, b: number): number {
  return Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));
}

/** Household doors within SHOP_REACH of the lot's middle (the shop's footfall). */
function householdsNear(state: WorldState, lot: Lot): number {
  const [x, z] = lotMiddle(lot);
  let n = 0;
  for (const h of state.households) {
    const home = findById(state.buildings, h.homeId);
    if (!home) continue;
    const door = doorTile(home);
    const dx = (door % S) - x;
    const dz = Math.floor(door / S) - z;
    if (dx * dx + dz * dz <= SHOP_REACH * SHOP_REACH) n++;
  }
  return n;
}

/**
 * True when a built `defId` building has the lot in its reach (Manhattan between doors) and room
 * under its capacity for another business of the trades it enables.
 */
function inReachWithRoom(state: WorldState, lot: Lot, defId: string): boolean {
  const def = content.buildingById.get(defId);
  if (!def) return false;
  const reach = def.reach ?? 24;
  for (const b of state.buildings) {
    if (b.def !== defId || b.stage !== 'built') continue;
    const door = doorTile(b, def);
    if (tileGap(door, lot.frontage) > reach) continue;
    if (!def.capacity) return true;
    let served = 0;
    for (const o of state.buildings) {
      if (o.trade && (def.enables ?? []).includes(o.trade) && tileGap(door, doorTile(o)) <= reach) served++;
    }
    if (served < def.capacity) return true;
  }
  return false;
}

/** True when the lot meets what the trade wants of its site (TradeWants). */
export function siteFits(state: WorldState, lot: Lot, t: TradeDef): boolean {
  const w = t.wants;
  if (w.fertility !== undefined && lotFertility(state, lot) < w.fertility) return false;
  if (w.pollinators !== undefined) {
    const [x, z] = lotMiddle(lot);
    if (scoreAt(state, POLLINATOR, chunkOfTile(x, z)) < w.pollinators) return false;
  }
  if (w.reach !== undefined && !inReachWithRoom(state, lot, w.reach)) return false;
  if (w.households !== undefined && householdsNear(state, lot) < w.households) return false;
  return true;
}

/** Grown buildings of a zone kind still under construction. */
function grownSites(state: WorldState, zones?: readonly number[]): number {
  let n = 0;
  for (const b of state.buildings) {
    if (!b.lot || b.stage !== 'construction') continue;
    if (!zones) {
      n++;
      continue;
    }
    const lot = findById(state.lots, b.lot);
    if (lot && zones.includes(lot.zone)) n++;
  }
  return n;
}

export interface GrowthDemand {
  homes: number;
  shops: number;
  crafts: number;
  farms: number;
}

const HOME_ZONES = [Zone.homesLow, Zone.homesMedium];

/** Days of food in hand: town stock and pantries over the people eating it. */
export function foodDaysInHand(state: WorldState, stock: readonly number[] = townStock(state)): number {
  let food = 0;
  for (const g of foodIndexes()) food += stock[g] ?? 0;
  for (const h of state.households) food += pantryFood(h);
  return state.residents.length > 0 ? food / state.residents.length : FARM_FOOD_DAYS;
}

/** Home doors no food outlet reaches (outlets going up count already), as [x, z]. */
function unservedDoors(state: WorldState, services: ReturnType<typeof servicesOf>): [number, number][] {
  const out: [number, number][] = [];
  for (const h of state.households) {
    const home = findById(state.buildings, h.homeId);
    if (!home) continue;
    const door = doorTile(home);
    const x = door % S;
    const z = Math.floor(door / S);
    if (!outletCovers(services, x, z)) out.push([x, z]);
  }
  return out;
}

/** Unserved doors a shop on this lot would reach (the stall's food radius). */
function shopReach(lot: Lot, doors: readonly [number, number][]): number {
  const [x, z] = [lot.x + (lot.w >> 1), lot.z + (lot.d >> 1)];
  let n = 0;
  for (const [dx, dz] of doors) if ((dx - x) * (dx - x) + (dz - z) * (dz - z) <= SHOP_REACH * SHOP_REACH) n++;
  return n;
}

/** Outlets in town, built or going up. */
function outletCount(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) if (content.buildingById.get(b.def)?.tags?.includes('outlet')) n++;
  return n;
}

/**
 * The Food good the carrier brought most of at its last visit, when that visit brought more than a
 * third of a day's eating (a resident a day); else -1. R1 stand-in (R1B): Farmland's 'imported'.
 */
export function importedFood(state: WorldState): number {
  const last = state.carrier.bought[state.carrier.bought.length - 1];
  if (!last) return -1;
  let total = 0;
  let most = -1;
  for (const g of FOOD_GOODS) {
    const n = last[g] ?? 0;
    total += n;
    if (n > 0 && (most < 0 || n > (last[most] ?? 0))) most = g;
  }
  return total * 3 > state.residents.length ? most : -1;
}

/** What the village wants grown now, in sites per zone kind (before the daily and site limits). */
export function growthDemand(state: WorldState, services = servicesOf(state)): GrowthDemand {
  return demandDetail(state, services).demand;
}

/** growthDemand, with the unserved home doors and the craft trade it found on the way. */
function demandDetail(
  state: WorldState,
  services: ReturnType<typeof servicesOf>,
): {
  demand: GrowthDemand;
  doors: [number, number][];
  craft: TradeDef | null;
  foodDays: number;
  imported: number;
} {
  const stock = townStock(state);
  const pop = state.residents.length;
  // Homes: newcomers would come, and there is work for them.
  let homes = 0;
  const open = openJobCount(state);
  if (attractiveness(state, []) >= HOMES_PULL && open > 0) {
    let waiting = vacantHomes(state).length;
    for (const b of state.buildings) {
      if (b.stage === 'construction' && content.buildingById.get(b.def)?.housing) waiting++;
    }
    const target = Math.min(HOMES_WAITING + Math.floor(pop / 30), Math.ceil(open / 2));
    homes = Math.max(0, target - waiting);
  }
  // Shops: households no outlet reaches, when some shop lot would reach them; or more households
  // than the outlets in town can serve.
  const doors = unservedDoors(state, services);
  let shops = 0;
  if (doors.length >= SHOP_HOUSEHOLDS) {
    for (const l of state.lots) {
      if (!l.buildingId && l.zone === Zone.shops && shopReach(l, doors) >= SHOP_HOUSEHOLDS) {
        shops = 1;
        break;
      }
    }
  }
  if (Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) > outletCount(state)) shops = 1;
  // Crafts: something short that a Workshops trade could make and feed (the best of them names it).
  const short = unmetShortages(state, shortages(state, stock));
  let crafts = 0;
  let craft: TradeDef | null = null;
  let craftScore = 0;
  for (const t of tradesOf(state, 'crafts')) {
    const score = t.method ? methodScore(state, t.method, short, stock) : 0;
    if (score > craftScore) {
      craftScore = score;
      craft = t;
      crafts = 1;
    }
  }
  const foodDays = foodDaysInHand(state, stock);
  const imported = importedFood(state);
  const farms = foodDays < FARM_FOOD_DAYS || imported >= 0 ? 1 : 0;
  return {
    craft,
    foodDays,
    imported,
    demand: {
      homes,
      shops: Math.max(0, shops - grownSites(state, [Zone.shops])),
      crafts: Math.max(0, crafts - grownSites(state, [Zone.crafts])),
      farms: Math.max(0, farms - grownSites(state, [Zone.farms])),
    },
    doors,
  };
}

/** Materials free in the storehouses: stock less what every site still waits for. */
function freeMaterials(state: WorldState, stock: readonly number[]): number[] {
  const free = [...stock];
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
  }
  return free;
}

function affordable(def: BuildingDef, free: number[]): boolean {
  for (const [id, qty] of def.cost?.goods ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && (free[g] ?? 0) * 100 < qty * GROWTH_SHARE) return false;
  }
  return true;
}

/** True when a storehouse with porters lies within its range of the tile, give or take a lot's width. */
function nearAStore(reach: readonly Reach[], tile: number): boolean {
  const x = tile % S;
  const z = Math.floor(tile / S);
  for (const r of reach) {
    const d = Math.abs((r.door % S) - x) + Math.abs(Math.floor(r.door / S) - z);
    if (r.porters > 0 && d <= r.radius + 2) return true;
  }
  return false;
}

/** True when the def can go up on the lot now: materials to spare, it fits, porters reach its door. */
function canGrow(
  state: WorldState,
  lot: Lot,
  def: BuildingDef,
  free: number[],
  reach: readonly Reach[],
): boolean {
  if (!affordable(def, free)) return false;
  const at = lotPlacement(state, lot, def);
  if (!at) return false;
  // Porters must reach the door itself, or the site would wait for its timber forever.
  const { front } = entranceTiles(def, at[0], at[1], lot.rot);
  return porterServed(reach, front[1] * S + front[0]);
}

/**
 * The trade for a business lot (R1 stand-in (R1B): the trade score of 13-ledger.md, need x supply
 * x site x keeper, replaces this). Candidates are the zone's trades whose requirements and site
 * wants the lot meets and whose building can go up; each is scored by the shortage of what it
 * makes (methodScore: 0 when it cannot be fed), the best wins, ties to the first in content order.
 * Crafts need a score above 0; farms and shops fall back to the first that fits.
 */
function chooseTrade(
  state: WorldState,
  lot: Lot,
  zoneId: string,
  short: readonly number[],
  stock: readonly number[],
  free: number[],
  reach: readonly Reach[],
): TradeDef | null {
  const fits = tradesOf(state, zoneId).filter((t) => {
    const def = content.buildingById.get(t.building);
    return !!def && siteFits(state, lot, t) && canGrow(state, lot, def, free, reach);
  });
  if (fits.length === 0) return null;
  const fert = lotFertility(state, lot);
  let best: TradeDef | null = null;
  let bestScore = 0;
  for (const t of fits) {
    const score = t.method ? methodScore(state, t.method, short, stock, fert) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best ?? (lot.zone === Zone.crafts ? null : fits[0]!);
}

/** The def to grow on a home lot, by weight. */
function chooseHome(
  state: WorldState,
  lot: Lot,
  defs: readonly BuildingDef[],
  free: number[],
  reach: readonly Reach[],
): BuildingDef | null {
  const fits = defs.filter((d) => canGrow(state, lot, d, free, reach));
  if (fits.length === 0) return null;
  let total = 0;
  for (const d of fits) total += d.grows?.weight ?? 1;
  let pick = mix(lot.id, Math.floor(state.tick / TICKS_PER_DAY)) % Math.max(1, total);
  for (const d of fits) {
    pick -= d.grows?.weight ?? 1;
    if (pick < 0) return d;
  }
  return fits[fits.length - 1]!;
}

/** True for the zones whose lots grow businesses. */
function businessZone(zone: number): boolean {
  return zone === Zone.crafts || zone === Zone.farms || zone === Zone.shops;
}

/** Gives built grown farms the free farm-zoned land within their reach as fields, nearest first. */
function growFields(state: WorldState, ctx: TickCtx): void {
  for (const b of state.buildings) {
    if (!b.lot || b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!def || !isFarm(b)) continue;
    const room = fieldCap(b) - fieldsOf(state, b, def).length;
    if (room <= 0) continue;
    const door = doorTile(b, def);
    const dx0 = door % S;
    const dz0 = Math.floor(door / S);
    const options: [d: number, i: number][] = [];
    const m = state.map;
    for (let z = Math.max(0, b.z - 8); z < Math.min(S, b.z + 10); z++) {
      for (let x = Math.max(0, b.x - 8); x < Math.min(S, b.x + 10); x++) {
        const i = z * S + x;
        if (m.zone[i] !== Zone.farms || m.lot[i] || m.fieldOwner[i]) continue;
        // Grown farms keep to good soil; thin soil is the players' to sow if they like.
        if (m.fertility[i]! < FIELD_GOOD_FERTILITY) continue;
        if (fieldTileProblem(state, b, def, x, z)) continue;
        options.push([Math.abs(x - dx0) + Math.abs(z - dz0), i]);
      }
    }
    if (options.length === 0) continue;
    options.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    paintFields(
      state,
      ctx,
      b,
      options.slice(0, room).map(([, i]) => i),
    );
  }
}

/** One night's growth. Returns the sites started. */
export function growthPass(state: WorldState, ctx: TickCtx): number {
  if (!isStandard(state)) return 0;
  const started = growSites(state, ctx);
  writeDemand(state, ctx);
  return started;
}

/** Starts the night's grown sites. Returns how many. */
function growSites(state: WorldState, ctx: TickCtx): number {
  const stock = townStock(state);
  const short = shortages(state, stock);
  growFields(state, ctx);
  // New workshops answer only shortages the town's makers are not already catching up on.
  const unmet = unmetShortages(state, short);

  // Lots are scored through the day, a slice an hour (refreshDesirability, from the zoning pass).
  const empty = state.lots.filter((l) => !l.buildingId && state.map.road[l.frontage]);
  if (empty.length === 0) return 0;
  const services = servicesOf(state);
  const { demand, doors } = demandDetail(state, services);
  const free = freeMaterials(state, stock);
  let started = 0;
  const wants: [zones: readonly number[], n: number][] = [
    [[Zone.farms], demand.farms],
    [HOME_ZONES, demand.homes],
    [[Zone.shops], demand.shops],
    [[Zone.crafts], demand.crafts],
  ];
  // Shops wanted only for households out of reach must stand where they reach them.
  const reachOnly =
    Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) <= outletCount(state) ? SHOP_HOUSEHOLDS : 0;
  const reachOf = new Map<number, number>();
  if (demand.shops > 0)
    for (const l of empty) if (l.zone === Zone.shops) reachOf.set(l.id, shopReach(l, doors));
  for (const [zones, n] of wants) {
    for (let k = 0; k < n; k++) {
      if (started >= GROWTH_PER_DAY || grownSites(state) >= GROWTH_MAX_SITES) return started;
      const shop = zones[0] === Zone.shops;
      // Shops go where they reach the most households without one, then by desirability.
      // Only lots porters can about reach (canGrow checks the very door).
      const lots = empty
        .filter((l) => !l.buildingId && zones.includes(l.zone) && nearAStore(services.reach, l.frontage))
        .filter((l) => !shop || (reachOf.get(l.id) ?? 0) >= reachOnly)
        .sort(
          (p, q) =>
            (shop ? (reachOf.get(q.id) ?? 0) - (reachOf.get(p.id) ?? 0) : 0) ||
            q.desirability - p.desirability ||
            p.id - q.id,
        );
      let grew = false;
      for (const lot of lots.slice(0, 6)) {
        const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
        let def: BuildingDef | null;
        let trade: TradeDef | null = null;
        if (businessZone(lot.zone)) {
          const need = lot.zone === Zone.crafts ? unmet : short;
          trade = chooseTrade(state, lot, zoneId, need, stock, free, services.reach);
          def = trade ? (content.buildingById.get(trade.building) ?? null) : null;
        } else def = chooseHome(state, lot, growable(state, zoneId), free, services.reach);
        if (!def) continue;
        const b = growLot(state, ctx, lot.id, def.id, undefined, trade?.id);
        if (!b) continue;
        for (const [id, qty] of def.cost?.goods ?? []) {
          const g = content.goodIndex.get(id);
          if (g !== undefined) free[g]! -= qty;
        }
        if (trade) ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
        started++;
        grew = true;
        break;
      }
      if (!grew) break;
    }
  }
  return started;
}

/** Sites wanted to bar height: 50 a site, at most 100. */
function barOf(sites: number): number {
  return Math.min(100, 50 * sites);
}

/**
 * The four demand bars after the night's growth. R1 stand-in (R1B): each bar is 50 a site the
 * town wants, lit when it wants one and no empty lot of that zone has a road; a reason or two each.
 */
export function writeDemand(state: WorldState, ctx: TickCtx | null): void {
  const services = servicesOf(state);
  const { demand, doors, craft, foodDays, imported } = demandDetail(state, services);
  const waiting = (zones: readonly number[]): boolean =>
    state.lots.some((l) => !l.buildingId && zones.includes(l.zone) && state.map.road[l.frontage]! > 0);
  const craftReason: DemandReason | null = craft?.makes
    ? craft.from[0] !== undefined
      ? { code: 'short', good: craft.makes, from: craft.from[0] }
      : { code: 'short', good: craft.makes }
    : null;
  const kinds: [sites: number, zones: readonly number[], first: DemandReason | null][] = [
    [demand.homes, HOME_ZONES, { code: 'newcomers' }],
    [
      demand.shops,
      [Zone.shops],
      doors.length >= SHOP_HOUSEHOLDS ? { code: 'noOutlet', value: doors.length } : { code: 'crowded' },
    ],
    [demand.crafts, [Zone.crafts], craftReason],
    [
      demand.farms,
      [Zone.farms],
      foodDays < FARM_FOOD_DAYS
        ? { code: 'foodCover', value: Math.floor(foodDays * 100) }
        : { code: 'imported', good: content.goods[imported]?.id ?? 'grain' },
    ],
  ];
  const d = state.demand;
  for (let i = 0; i < DEMAND_KINDS.length; i++) {
    const [sites, zones, first] = kinds[i]!;
    const wanted = sites > 0;
    const lit = wanted && !waiting(zones);
    const reasons: DemandReason[] = [];
    if (wanted && first) reasons.push(first);
    if (lit) reasons.push({ code: 'needsLand' });
    else if (wanted) reasons.push({ code: 'lotWaiting' });
    d.bars[i] = barOf(sites);
    d.lit[i] = lit;
    d.reasons[i] = reasons;
  }
  ctx?.events.push({ e: 'demand.updated', d: demandView(state) });
}

export const growth: System = {
  id: 'growth',
  order: 26,
  every: TICKS_PER_DAY,
  offset: dailyOffset(1),
  tick(state, ctx) {
    growthPass(state, ctx);
  },
};
