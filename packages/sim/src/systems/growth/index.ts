// Daily growth on lots (docs/spec/13-ledger.md, Zoning and growth). P2 (the R1 playtest): the pass
// can run at 01:00 and again at 13:00 (GROWTH_HOURS); the midday run is built and switched off
// (GROWTH_MIDDAY in constants.ts says why), so growth runs at 01:00 only until a tuning round turns
// it on. When on: The midday run only starts sites (step 4) on what
// the day's allowance has left (state.demand.starts), and only while nothing at all is under
// construction, so a town with idle builders takes up land zoned in the morning the same day
// without taking timber or builders from sites in hand; retooling and fields stay the night's. When a wanted kind does
// not start, the pass says why (Held) and the bars carry it. At 01:00 the growth pass:
//
// 1. Keeps each business's site and surplus days and retools (./retool): a failed site after three
//    days, pinned or not; one business in surplus for six days a night, to a trade that is short.
// 2. Gives grown grain farms the farm-zoned land around them as fields.
// 3. Works out what to grow (lots are scored through the day by ./desirability, a slice an hour):
//    - homes, while the town would draw newcomers (its pull is 25+) and has open jobs for them:
//      enough homes going up to keep two or so empty ones waiting;
//    - a shop, for households no outlet reaches, or one per eight households (Village rank);
//    - a workshop or a farm, while some trade of its zone scores above 0 (./trades: need x supply
//      x site x keeper) and no business of that trade is going up already.
// 4. Starts grown sites on the best lots, a couple a night and a few at a time, while the storehouses
//    can spare half their materials beyond what other sites still wait for, or the carrier may bring
//    Materials and no other site of the same kind still waits for its own (one a kind on bought
//    timber). A business
//    lot grows the trade with the best positive score (ties: the trade the town has fewest of, then
//    content order); a keen resident named by the keeper term keeps it.
// 5. Writes the four demand bars (./bars) and sends demand.updated; the zoning pass and the zone
//    commands write them again when the free lots change (refreshDemand).
import { content, type BuildingDef, type TradeDef } from '@qoti/content';
import {
  DEMAND_KINDS,
  FIELD_GOOD_FERTILITY,
  GROWTH_HOURS,
  GROWTH_MIDDAY,
  MAP_SIZE,
  TICKS_PER_DAY,
  Zone,
} from '../../constants';
import type { Building, DemandReason, Lot, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { familyIndex, jobsOf } from '../../state/zones';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { addStock, keepsNoGoods, townStock } from '../../view/hamlet';
import { businessView } from '../../view/businesses';
import { entranceTiles } from '../../rules/footprint';
import { hasBuilt } from '../innovations/api';
import { dailyOffset, dayIndex, hourOf } from '../economy/time';
import { doorTile } from '../movement/api';
import { fieldCap, fieldsOf, fieldTileProblem, isFarm, paintFields } from '../production/fields';
import { porterIndex, porterServed, type Reach } from '../logistics/range';
import { isResting } from '../levels/resting';
import { openJobs } from '../residents/jobs';
import { defsOf, syncDefs, usable, type Defs } from './defs';
import { attractiveness } from '../residents/lifecycle';
import { foodIndexes, pantryFood } from '../residents/needs';
import { announceServers } from '../specialized/announce';
import { growLot, lotPlacement } from './api';
import { BAR_ZONES, computeBars, craftPull, HOME_ZONES, writeBars, type BarInputs } from './bars';
import { mix, servicesOf } from './desirability';
import { homesPace } from './evenings';
import {
  homeDoorTiles,
  HOUSEHOLDS_PER_SHOP,
  outletCount,
  outletsCrowded,
  SHOP_HOUSEHOLDS,
  shopReach,
  unservedDoors,
  type Services,
} from './outlets';
import { retoolPass } from './retool';
import { SiteCache, unmetWant } from './site';
import {
  countMakers,
  FARM_FOOD_DAYS,
  NEED_FULL,
  needOf,
  supplyOf,
  tradeTerms,
  townNeeds,
  type TownNeeds,
} from './trades';

export { FARM_FOOD_DAYS, HOUSEHOLDS_PER_SHOP, SHOP_HOUSEHOLDS };
export { SHOP_REACH, siteFits } from './site';

const S = MAP_SIZE;

/** Grown sites going up at once, and new ones a day. */
export const GROWTH_MAX_SITES = 3;
/**
 * R1X: businesses standing built with nobody at work (not resting) at which no new business is
 * started. On oak a hamlet of 19 grew 22 businesses, most of them empty, each a coin a day of upkeep,
 * while the homes that would bring hands waited; now growth asks for newcomers first.
 */
export const HANDS_WAITING = 2;
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
/** Lots tried a night for each thing wanted, best first. */
const LOTS_TRIED = 6;

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

/** tradesOf for the Workshops, Farmland and Shops zones in one walk of the trades. */
function tradesOfBusinessZones(state: WorldState): {
  crafts: TradeDef[];
  farms: TradeDef[];
  shops: TradeDef[];
} {
  const out = { crafts: [] as TradeDef[], farms: [] as TradeDef[], shops: [] as TradeDef[] };
  for (const t of content.trades) {
    const list =
      t.zone === 'crafts'
        ? out.crafts
        : t.zone === 'farms'
          ? out.farms
          : t.zone === 'shops'
            ? out.shops
            : null;
    if (!list) continue;
    const def = content.buildingById.get(t.building);
    if (!def || !available(state, def)) continue;
    if (t.requires?.rank && !rankAtLeast(state, t.requires.rank)) continue;
    if (t.requires?.innovation && !hasInnovation(state, t.requires.innovation)) continue;
    list.push(t);
  }
  return out;
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

/** Days of food in hand: town stock and pantries over the people eating it. */
export function foodDaysInHand(state: WorldState, stock: readonly number[] = townStock(state)): number {
  let food = 0;
  for (const g of foodIndexes()) food += stock[g] ?? 0;
  for (const h of state.households) food += pantryFood(h);
  return state.residents.length > 0 ? food / state.residents.length : FARM_FOOD_DAYS;
}

/** What one walk of the buildings tells the night: open jobs, homes waiting, outlets, businesses without hands. */
interface Census {
  /** Open job slots in town (openJobCount). */
  open: number;
  /** Built businesses with nobody at work that are not resting (businessesWaitingHands). */
  handsWaiting: number;
  /** Outlets in town, built or going up (outletCount). */
  outlets: number;
  /** Vacant homes and homes going up (vacantHomes, plus housing under construction). */
  homesWaiting: number;
}

/**
 * One walk over the buildings for what the night reads of them, each as its own function has it, and
 * (with `stock`) the town's stock as townStock sums it: the walk meets each building's runtime once.
 */
function census(state: WorldState, known?: Defs, stock?: number[]): Census {
  // Households living in each home, by the home's id (buildings are kept in id order, so the last holds the largest id).
  const buildings = state.buildings;
  const households = state.households;
  const defs = usable(state, known);
  const top = buildings.length > 0 ? buildings[buildings.length - 1]!.id : 0;
  let living: Uint16Array | Map<number, number>;
  if (top < 1 << 17) {
    const counts = new Uint16Array(top + 1);
    for (let i = 0; i < households.length; i++) {
      const home = households[i]!.homeId;
      if (home > 0 && home <= top) counts[home]!++;
    }
    living = counts;
  } else {
    living = new Map<number, number>();
    for (const h of households) if (h.homeId) living.set(h.homeId, (living.get(h.homeId) ?? 0) + 1);
  }
  const livingIn = (id: number): number =>
    living instanceof Map ? (living.get(id) ?? 0) : (living[id] ?? 0);
  let open = 0;
  let handsWaiting = 0;
  let outlets = 0;
  let homesWaiting = 0;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]!;
    const def = defs ? defs[i] : content.buildingById.get(b.def);
    const rt = b.rt;
    if (stock && rt && b.stage === 'built' && !keepsNoGoods(def)) addStock(stock, rt);
    // openJobs, with the def already in hand: built, not paused, not resting, hands wanted less hands.
    if (b.stage === 'built' && rt && !rt.paused && !isResting(b)) {
      const o = Math.max(0, (b.trade || def?.levels ? jobsOf(b) : (def?.jobs?.count ?? 0)) - rt.workers.length);
      open += o;
      if (o > 0 && b.trade && rt.workers.length === 0) handsWaiting++;
    }
    if (!def) continue;
    if (def.tags?.includes('outlet')) outlets++;
    const housing = def.housing;
    if (!housing) continue;
    if (b.stage === 'built') {
      if (livingIn(b.id) < housing.households) homesWaiting++;
    } else if (b.stage === 'construction') homesWaiting++;
  }
  return { open, handsWaiting, outlets, homesWaiting };
}

/**
 * R2X: the homes the jobs would ask for tonight that quiet evenings hold back (0 when none), for the
 * audit's check that a town whose growth waits on evenings is told so.
 */
export function homesHeldNow(state: WorldState): number {
  if (homesPace(state) >= 100) return 0;
  const stock = townStock(state);
  return homesWanted(state, stock, census(state, undefined, stock)).held;
}

/**
 * Homes wanted beyond those waiting: newcomers would come, and there is work for them. R2X: past the
 * free households, only as fast as recent fair evenings send folk out (./evenings); `held` is how many
 * the jobs alone would have asked for that the evenings hold back.
 */
function homesWanted(
  state: WorldState,
  stock: readonly number[] | undefined,
  seen: Census,
): { homes: number; held: number } {
  const open = seen.open;
  if (open <= 0 || attractiveness(state, [], stock, open) < HOMES_PULL) return { homes: 0, held: 0 };
  const waiting = seen.homesWaiting;
  const target = Math.min(HOMES_WAITING + Math.floor(state.residents.length / 30), Math.ceil(open / 2));
  // R2X: the jobs always get their bare homes (growthBareHomes waiting at once); past that, homes
  // come as fast as the evenings send folk out.
  const pace = homesPace(state);
  const bare = Math.min(target, content.places.growthBareHomes ?? target);
  const paced = pace >= 100 ? target : bare + Math.floor(((target - bare) * pace) / 100);
  const homes = Math.max(0, paced - waiting);
  return { homes, held: Math.max(0, target - waiting) - homes };
}

/**
 * Tonight's reading of the town, shared by the growth pass and the bars: read once a night and kept
 * up to date as businesses retool and grow (see `settle`), so the pass walks the town once.
 */
interface Night {
  /** The buildings' defs in building order, looked up once (defs.ts); `settle` adds the grown. */
  defs: (BuildingDef | undefined)[];
  services: Services;
  doors: [number, number][];
  needs: TownNeeds;
  cache: SiteCache;
  crafts: TradeDef[];
  farms: TradeDef[];
  shops: TradeDef[];
  /** Homes wanted beyond those waiting. */
  homes: number;
  /** R2X: homes the jobs would ask for that quiet evenings hold back (./evenings). */
  homesHeld: number;
  /** R1X: HANDS_WAITING or more businesses stand with nobody at work: no new business tonight. */
  handsShort: boolean;
  /** Trades with a business going up, and businesses of each trade in town. */
  goingUp: Set<string>;
  counts: Map<string, number>;
  /** Outlets in town, built or going up. */
  outlets: number;
  /** More households than the outlets in town can serve. */
  crowded: boolean;
  /**
   * Empty lots with a road at the frontage, best first (desirability, then id). R2F: a row lot that
   * does not carry its row on (see rowWaits) comes after all the rest.
   */
  empty: Lot[];
  /** porterServed, and the looser "about in reach" (nearAStore), for many tiles. */
  porters: (tile: number) => boolean;
  nearStore: (tile: number) => boolean;
}

/**
 * R2F: the row lots that wait their turn, so a street fills from one end and nothing stands alone on
 * a lawn: in a row with no building yet, every lot but its corner lot (else its first along the
 * road); in a row going up, every lot that touches no built one. They are still offered, after every
 * other lot, so a row whose next lot cannot take a site never stops the street. None in a town with
 * no streets.
 */
function rowWaits(state: WorldState): Set<number> {
  const waits = new Set<number>();
  const rows = new Map<number, Lot[]>();
  for (const l of state.lots) {
    if (l.kind !== 'plot' || !l.row) continue;
    let list = rows.get(l.row);
    if (!list) rows.set(l.row, (list = []));
    list.push(l);
  }
  const at = (l: Lot): number => (l.rot % 2 === 0 ? l.x : l.z);
  const len = (l: Lot): number => (l.rot % 2 === 0 ? l.w : l.d);
  for (const list of rows.values()) {
    list.sort((p, q) => at(p) - at(q) || p.id - q.id);
    const built = list.some((l) => l.buildingId);
    const start = list.find((l) => l.corner) ?? list[0]!;
    list.forEach((l, k) => {
      if (l.buildingId) return;
      if (!built) {
        if (l !== start) waits.add(l.id);
        return;
      }
      const prev = list[k - 1];
      const next = list[k + 1];
      const joins =
        (prev?.buildingId && at(prev) + len(prev) === at(l)) ||
        (next?.buildingId && at(l) + len(l) === at(next));
      if (!joins) waits.add(l.id);
    });
  }
  return waits;
}

/** Empty lots with a road at the frontage, best first (Night.empty); never a garden. */
function emptyLots(state: WorldState): Lot[] {
  const waits = rowWaits(state);
  return state.lots
    .filter((l) => l.kind !== 'garden' && !l.buildingId && state.map.road[l.frontage])
    .sort(
      (p, q) =>
        Number(waits.has(p.id)) - Number(waits.has(q.id)) || q.desirability - p.desirability || p.id - q.id,
    );
}

/** A tile question whose index is built when it is first asked (a night that asks nothing builds nothing). */
function lazily(make: () => (tile: number) => boolean): (tile: number) => boolean {
  let index: ((tile: number) => boolean) | null = null;
  return (tile) => (index ??= make())(tile);
}

/** A per-lot question asked once a pass, however many bars ask it. */
function memoByLot(ask: (l: Lot) => boolean): (l: Lot) => boolean {
  const seen = new Map<number, boolean>();
  return (l) => {
    let v = seen.get(l.id);
    if (v === undefined) {
      v = ask(l);
      seen.set(l.id, v);
    }
    return v;
  };
}

/** Trades going up and businesses by trade, written into the night. */
function countTrades(state: WorldState, night: Pick<Night, 'goingUp' | 'counts'>): void {
  night.goingUp.clear();
  night.counts.clear();
  for (const b of state.buildings) {
    if (!b.trade) continue;
    night.counts.set(b.trade, (night.counts.get(b.trade) ?? 0) + 1);
    if (b.stage === 'construction') night.goingUp.add(b.trade);
  }
}

/** Built businesses with nobody at work that are not resting (waiting for their first hands). */
export function businessesWaitingHands(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) {
    if (!b.trade || b.stage !== 'built' || !b.rt || b.rt.paused) continue;
    if (b.rt.workers.length === 0 && openJobs(b) > 0) n++;
  }
  return n;
}

function readNight(state: WorldState): Night {
  const defs = defsOf(state);
  const services = servicesOf(state, defs);
  const village = rankAtLeast(state, 'village');
  const homes = homeDoorTiles(state);
  const doors = unservedDoors(state, services, homes);
  const stock = new Array<number>(content.goods.length).fill(0);
  const seen = census(state, defs, stock);
  const outlets = seen.outlets;
  const crowded = outletsCrowded(state, outlets);
  const zoned = tradesOfBusinessZones(state);
  const night: Night = {
    defs,
    services,
    doors,
    needs: townNeeds(
      state,
      village && (doors.length >= SHOP_HOUSEHOLDS || crowded) ? NEED_FULL : 0,
      defs,
      stock,
    ),
    cache: new SiteCache(state, homes, defs),
    crafts: zoned.crafts,
    farms: zoned.farms,
    shops: zoned.shops,
    homes: 0,
    homesHeld: 0,
    handsShort: seen.handsWaiting >= HANDS_WAITING,
    goingUp: new Set(),
    counts: new Map(),
    outlets,
    crowded,
    empty: emptyLots(state),
    porters: lazily(() => porterIndex(services.reach)),
    nearStore: lazily(() => porterIndex(services.reach, NEAR_STORE_SLACK)),
  };
  const wanted = homesWanted(state, night.needs.stock, seen);
  night.homes = wanted.homes;
  night.homesHeld = wanted.held;
  countTrades(state, night);
  return night;
}

/**
 * Brings the night up to date after a business retooled or grew: who each specialized building
 * serves, the makers of each good, the trades going up, and (for a new business with a keeper)
 * the keen residents; a new shop moves the outlets.
 */
function settle(state: WorldState, night: Night, grown?: Building): void {
  // Who each specialized building serves is kept up to date in place (addBusiness, retooled).
  // A grown building went on the end of the buildings: its def joins the night's list (the cache holds the same list).
  syncDefs(state, night.defs);
  if (grown) night.cache.addBusiness(grown);
  countMakers(state, night.needs, night.defs);
  countTrades(state, night);
  if (grown?.keeperId) {
    night.needs.keen.forget(grown.keeperId);
  }
  if (grown && content.buildingById.get(grown.def)?.coverage?.some((c) => c.kind === 'food')) {
    night.services = servicesOf(state, night.defs);
    night.doors = unservedDoors(state, night.services);
    night.outlets = outletCount(state);
    night.crowded = outletsCrowded(state, night.outlets);
  }
}

/** True when some trade of the list pulls (need x supply x keeper) and has no site going up. */
function pulls(state: WorldState, trades: readonly TradeDef[], night: Night): boolean {
  return trades.some((t) => !night.goingUp.has(t.id) && craftPull(state, t, night.needs, night.cache) > 0);
}

function demandOf(state: WorldState, night: Night): GrowthDemand {
  let shops = 0;
  if (night.shops.length > 0) {
    if (night.doors.length >= SHOP_HOUSEHOLDS) {
      for (const l of state.lots) {
        if (
          l.kind !== 'garden' &&
          !l.buildingId &&
          l.zone === Zone.shops &&
          shopReach(l, night.doors, SHOP_HOUSEHOLDS) >= SHOP_HOUSEHOLDS
        ) {
          shops = 1;
          break;
        }
      }
    }
    if (night.crowded) shops = 1;
  }
  // R1X: while businesses wait for hands, no new one starts (homes bring the hands first).
  if (night.handsShort) shops = 0;
  const crafts = !night.handsShort && pulls(state, night.crafts, night) ? 1 : 0;
  const farms = !night.handsShort && pulls(state, night.farms, night) ? 1 : 0;
  return {
    homes: night.homes,
    shops: Math.max(0, shops - grownSites(state, [Zone.shops])),
    crafts: Math.max(0, crafts - grownSites(state, [Zone.crafts])),
    farms: Math.max(0, farms - grownSites(state, [Zone.farms])),
  };
}

/** What the village wants grown now, in sites per zone kind (before the daily and site limits). */
export function growthDemand(state: WorldState): GrowthDemand {
  return demandOf(state, readNight(state));
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

/** True when a grown site on a lot of these zones is still waiting for materials. */
function siteWaiting(state: WorldState, zones: readonly number[]): boolean {
  for (const b of state.buildings) {
    if (!b.lot || b.stage !== 'construction' || !b.rt?.construction?.needs.some((n) => n > 0)) continue;
    const lot = findById(state.lots, b.lot);
    if (lot && zones.includes(lot.zone)) return true;
  }
  return false;
}

/**
 * True when the site may start: half its materials lie free in the storehouses, or the carrier may
 * bring Materials (its rule is not Never) and no other site of its kind is still waiting for its
 * own, so each kind of land has one site at a time going up on bought timber (docs/spec/13-ledger.md,
 * Construction: building is dearer on bought timber and never stuck for want of it).
 */
function affordable(
  state: WorldState,
  def: BuildingDef,
  free: number[],
  zones: readonly number[],
  why?: Why,
): boolean {
  let short = -1;
  for (const [id, qty] of def.cost?.goods ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && short < 0 && (free[g] ?? 0) * 100 < qty * GROWTH_SHARE) short = g;
  }
  if (short < 0) return true;
  if (state.carrier.families[familyIndex('materials')]?.rule !== 'never' && !siteWaiting(state, zones)) {
    return true;
  }
  if (why && why.short < 0) why.short = short;
  return false;
}

/**
 * P2: why the lots tried for a kind could not take a site, noted as canGrow turns them down: the
 * first material the stores were short of (a good index, or -1), a door porters do not reach, a
 * building that does not fit the lot.
 */
interface Why {
  short: number;
  reach: boolean;
  fit: boolean;
}

/** Tiles past a storehouse's range a lot may lie and still be tried ("about in reach", a lot's width). */
const NEAR_STORE_SLACK = 2;

/** True when the def can go up on the lot now: materials to spare, it fits, porters reach its door. */
function canGrow(
  state: WorldState,
  lot: Lot,
  def: BuildingDef,
  free: number[],
  reach: readonly Reach[],
  why?: Why,
): boolean {
  const kind = lot.zone === Zone.homesLow || lot.zone === Zone.homesMedium ? HOME_ZONES : [lot.zone];
  if (!affordable(state, def, free, kind, why)) return false;
  const at = lotPlacement(state, lot, def);
  if (!at) {
    if (why) why.fit = true;
    return false;
  }
  // Porters must reach the door itself, or the site would wait for its timber forever.
  const { front } = entranceTiles(def, at[0], at[1], lot.rot);
  if (porterServed(reach, front[1] * S + front[0])) return true;
  if (why) why.reach = true;
  return false;
}

/**
 * The trade for a business lot: the best positive score among the zone's trades whose building can
 * go up here and which have no site going up already; ties to the trade the town has fewest of,
 * then content order. Null when none scores above 0.
 */
function chooseTrade(
  state: WorldState,
  lot: Lot,
  trades: readonly TradeDef[],
  night: Night,
  free: number[],
  why?: Why,
): { trade: TradeDef; keeperId: number } | null {
  const counts = night.counts;
  let best: { trade: TradeDef; keeperId: number } | null = null;
  let bestScore = 0;
  let bestCount = 0;
  for (const t of trades) {
    if (night.goingUp.has(t.id)) continue;
    // A trade with no need or no supply scores 0 whoever would keep it: skip it unread.
    if (Math.floor((needOf(state, t, night.needs).need * supplyOf(state, t, night.needs)) / NEED_FULL) <= 0)
      continue;
    const terms = tradeTerms(state, lot, t, night.needs, night.cache);
    if (terms.score <= 0) continue;
    const count = counts.get(t.id) ?? 0;
    if (best && (terms.score < bestScore || (terms.score === bestScore && count >= bestCount))) continue;
    const def = content.buildingById.get(t.building);
    if (!def || !canGrow(state, lot, def, free, night.services.reach, why)) continue;
    best = { trade: t, keeperId: terms.keeperId };
    bestScore = terms.score;
    bestCount = count;
  }
  return best;
}

/** The def to grow on a home lot, by weight. */
function chooseHome(
  state: WorldState,
  lot: Lot,
  defs: readonly BuildingDef[],
  free: number[],
  reach: readonly Reach[],
  why?: Why,
): BuildingDef | null {
  const fits = defs.filter((d) => canGrow(state, lot, d, free, reach, why));
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

/** business.updated for a new business and for the specialized buildings whose reach now serves it. */
function announceBusiness(state: WorldState, ctx: TickCtx, b: Building): void {
  ctx.events.push({ e: 'business.updated', b: businessView(state, b) });
  announceServers(state, ctx, b, [b.trade]);
}

/** The trade of the list the town most needs (need x supply) that has no site going up, or null. */
function mostNeeded(state: WorldState, trades: readonly TradeDef[], night: Night): TradeDef | null {
  let best: TradeDef | null = null;
  let bestPull = 0;
  for (const t of trades) {
    if (night.goingUp.has(t.id)) continue;
    const pull = Math.floor(
      (needOf(state, t, night.needs).need * supplyOf(state, t, night.needs)) / NEED_FULL,
    );
    if (pull > bestPull) {
      best = t;
      bestPull = pull;
    }
  }
  return best;
}

/** What a pass found when a wanted kind did not start, per bar in DEMAND_KINDS order (P2). */
type Held = (DemandReason | undefined)[];

/** The bar a zone kind answers to: its index in DEMAND_KINDS. */
function barOf(zones: readonly number[]): number {
  return BAR_ZONES.findIndex((z) => z[0] === zones[0]);
}

/** Grown sites started so far on the tick's day (the allowance the day's two passes share). */
function startedToday(state: WorldState): number {
  const s = state.demand.starts;
  return s.day === dayIndex(state.tick) ? s.n : 0;
}

/** True when nothing in town is under construction, grown or placed by hand. */
function noSites(state: WorldState): boolean {
  for (const b of state.buildings) if (b.stage === 'construction') return false;
  return true;
}

/**
 * P2: the midday pass starts sites only while nothing at all is being built. It is there so a town
 * with idle builders answers the morning's zoning the same day, not to take timber and builders
 * from sites in hand. Run every day, it left hazel's one builder with seven sites, five of them
 * waiting two days; run whenever no grown site was going up, it started lots on the first afternoon
 * beside the players' first essentials (the lodge, the quarry), and the town ate and grew less.
 */
function middayMayStart(state: WorldState): boolean {
  return GROWTH_MIDDAY && startedToday(state) < GROWTH_PER_DAY && noSites(state);
}

/**
 * P2: the hour of the next growth pass that may start a waiting lot: 13:00 in the morning while the
 * midday pass may start one (middayMayStart), else the night's 01:00.
 */
export function nextGrowthHour(state: WorldState): number {
  const h = hourOf(state.tick);
  const before = h >= GROWTH_HOURS[0] && h < GROWTH_HOURS[1];
  return before && middayMayStart(state) ? GROWTH_HOURS[1] : GROWTH_HOURS[0];
}

/**
 * One growth pass. Returns the sites started. The night's pass (01:00) retools, grows fields and
 * starts sites; `midday` (13:00, P2) only starts sites, on what the day's allowance has left and
 * only while nothing is under construction (middayMayStart). A midday pass that may not start leaves
 * the night's findings standing and says the lots wait for the night.
 */
export function growthPass(state: WorldState, ctx: TickCtx, midday = false): number {
  if (!isStandard(state)) return 0;
  const night = readNight(state);
  const already = startedToday(state);
  if (midday && !middayMayStart(state)) {
    state.demand.starts = { day: dayIndex(state.tick), n: already };
    writeDemand(state, ctx, night);
    night.cache.persist();
    return 0;
  }
  const held: Held = DEMAND_KINDS.map(() => undefined);
  const started = growSites(state, ctx, night, midday, already, held);
  state.demand.starts = { day: dayIndex(state.tick), n: already + started };
  writeDemand(state, ctx, night, held);
  // Homes grown tonight went on the end of the buildings too: the cache signs the town as it now stands.
  syncDefs(state, night.defs);
  night.cache.persist();
  return started;
}

/**
 * Retools and grows fields (the night's pass only), then starts grown sites. Returns how many sites
 * started; `held` takes the reason for each wanted kind that did not start.
 */
function growSites(
  state: WorldState,
  ctx: TickCtx,
  night: Night,
  midday: boolean,
  already: number,
  held: Held,
): number {
  const tradesFor = (zoneId: string): TradeDef[] =>
    zoneId === 'crafts'
      ? night.crafts
      : zoneId === 'farms'
        ? night.farms
        : zoneId === 'shops'
          ? night.shops
          : [];
  if (!midday) {
    if (retoolPass(state, ctx, night.needs, night.cache, tradesFor) > 0) {
      settle(state, night);
    }
    growFields(state, ctx);
  }
  const started = startSites(state, ctx, night, already, held, tradesFor);
  // One business of a kind goes up at a time: a kind with its site going up waits on that one.
  for (const zones of BAR_ZONES) {
    if (zones === HOME_ZONES) continue;
    const bar = barOf(zones);
    const up = grownSites(state, zones);
    if (up > 0 && !held[bar]) held[bar] = { code: 'sitesBusy', value: up };
  }
  return started;
}

/** Starts grown sites on the best lots, within the day's and the at-once limits. */
function startSites(
  state: WorldState,
  ctx: TickCtx,
  night: Night,
  already: number,
  held: Held,
  tradesFor: (zoneId: string) => TradeDef[],
): number {
  // Lots are scored through the day, a slice an hour (refreshDesirability, from the zoning pass).
  if (night.empty.length === 0) return 0;
  const demand = demandOf(state, night);
  const free = freeMaterials(state, night.needs.stock);
  let started = 0;
  const wants: [zones: readonly number[], n: number][] = [
    [[Zone.farms], demand.farms],
    [HOME_ZONES, demand.homes],
    [[Zone.shops], demand.shops],
    [[Zone.crafts], demand.crafts],
  ];
  // Shops wanted only for households out of reach must stand where they reach them.
  const reachOnly = night.crowded ? 0 : SHOP_HOUSEHOLDS;
  const reachOf = new Map<number, number>();
  if (demand.shops > 0)
    for (const l of night.empty) if (l.zone === Zone.shops) reachOf.set(l.id, shopReach(l, night.doors));
  for (let w = 0; w < wants.length; w++) {
    const [zones, n] = wants[w]!;
    for (let k = 0; k < n; k++) {
      // The day's starts are used up, or the most sites at once are going up: every kind still
      // wanted waits its turn behind the sites in hand (crafts come last and can wait some nights).
      const up = grownSites(state);
      if (already + started >= GROWTH_PER_DAY || up >= GROWTH_MAX_SITES) {
        for (let v = w; v < wants.length; v++) {
          const bar = barOf(wants[v]![0]);
          if (wants[v]![1] > 0 && !held[bar] && up > 0) held[bar] = { code: 'sitesBusy', value: up };
        }
        return started;
      }
      const why: Why = { short: -1, reach: false, fit: false };
      const shop = zones[0] === Zone.shops;
      // Shops go where they reach the most households without one, then by desirability; only lots
      // porters can about reach (canGrow checks the very door), the best few.
      const lots: Lot[] = [];
      for (const l of night.empty) {
        if (l.kind === 'garden' || l.buildingId || !zones.includes(l.zone)) continue;
        if (shop && (reachOf.get(l.id) ?? 0) < reachOnly) continue;
        if (!night.nearStore(l.frontage)) continue;
        lots.push(l);
        if (!shop && lots.length >= LOTS_TRIED) break;
      }
      if (shop) lots.sort((p, q) => (reachOf.get(q.id) ?? 0) - (reachOf.get(p.id) ?? 0)); // stable
      let grew = false;
      for (const lot of lots.slice(0, LOTS_TRIED)) {
        let def: BuildingDef | null;
        let pick: { trade: TradeDef; keeperId: number } | null = null;
        if (lot.zone === Zone.crafts || lot.zone === Zone.farms || lot.zone === Zone.shops) {
          const trades =
            lot.zone === Zone.crafts ? night.crafts : lot.zone === Zone.farms ? night.farms : night.shops;
          pick = chooseTrade(state, lot, trades, night, free, why);
          def = pick ? (content.buildingById.get(pick.trade.building) ?? null) : null;
        } else {
          const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
          def = chooseHome(state, lot, growable(state, zoneId), free, night.services.reach, why);
        }
        if (!def) continue;
        const b = growLot(state, ctx, lot.id, def.id, undefined, pick?.trade.id);
        if (!b) continue;
        for (const [id, qty] of def.cost?.goods ?? []) {
          const g = content.goodIndex.get(id);
          if (g !== undefined) free[g]! -= qty;
        }
        if (pick) {
          // The resident whose trait or apprenticeship tipped the choice keeps it (jobs seat them).
          if (pick.keeperId) b.keeperId = pick.keeperId;
          announceBusiness(state, ctx, b);
          // Reach, makers and keepers moved.
          settle(state, night, b);
        } else if (def.housing) night.homes = Math.max(0, night.homes - 1);
        started++;
        grew = true;
        break;
      }
      if (!grew) {
        // Why the lots tried took nothing: materials first (it passes), then the land.
        const bar = barOf(zones);
        if (why.short >= 0) held[bar] = { code: 'materials', good: content.goods[why.short]!.id };
        else if (lots.length === 0 || why.reach) held[bar] = { code: 'outOfReach' };
        else if (why.fit) held[bar] = { code: 'unsuitable' };
        else if (zones !== HOME_ZONES) {
          // No trade scored on any lot: say what the trade the town most needs misses on the best one.
          const zoneId = content.zoneByValue.get(zones[0]!)?.id ?? '';
          const t = mostNeeded(state, tradesFor(zoneId), night);
          const want = t ? unmetWant(night.cache, lots[0]!, t) : null;
          if (t && want) held[bar] = { code: 'unsuitable', ...(t.makes && { good: t.makes }), want };
        }
        break;
      }
    }
  }
  return started;
}

/** The four demand bars, written to state.demand, with demand.updated when there is a ctx. */
export function writeDemand(
  state: WorldState,
  ctx: TickCtx | null,
  night: Night = readNight(state),
  held?: Held,
): void {
  const inputs: BarInputs = {
    ...(held && { held }),
    nextHour: nextGrowthHour(state),
    needs: night.needs,
    cache: night.cache,
    services: night.services,
    homes: night.homes,
    homesHeld: night.homesHeld,
    doors: night.doors,
    crafts: night.crafts,
    farms: night.farms,
    goingUp: night.goingUp,
    empty: night.empty,
    porters: memoByLot((l) => night.porters(l.frontage)),
    handsShort: night.handsShort,
    outlets: night.outlets,
  };
  writeBars(state, ctx, computeBars(state, inputs));
}

/**
 * The free lots changed (the zoning pass cut or dropped some, or a zone command cleared them): the
 * bars read again whether land waits for them, so a lit bar goes quiet as soon as land is zoned.
 */
export function refreshDemand(state: WorldState, ctx: TickCtx | null): void {
  if (!isStandard(state)) return;
  writeDemand(state, ctx);
}

/**
 * The two passes are half a day apart, so with the midday pass on (GROWTH_MIDDAY) one system with
 * half a day's `every` runs both; with it off the system runs at 01:00 only, as before P2.
 */
const HALF_DAY = TICKS_PER_DAY / 2;

export const growth: System = {
  id: 'growth',
  order: 26,
  every: GROWTH_MIDDAY ? HALF_DAY : TICKS_PER_DAY,
  offset: GROWTH_MIDDAY ? dailyOffset(GROWTH_HOURS[0]) % HALF_DAY : dailyOffset(GROWTH_HOURS[0]),
  tick(state, ctx) {
    growthPass(state, ctx, hourOf(state.tick) === GROWTH_HOURS[1]);
  },
};
