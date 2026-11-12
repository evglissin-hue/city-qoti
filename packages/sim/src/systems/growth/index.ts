// Daily growth on lots (docs/spec/13-ledger.md, Zoning and growth). At 01:00 the growth pass:
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
import { FIELD_GOOD_FERTILITY, MAP_SIZE, TICKS_PER_DAY, Zone } from '../../constants';
import type { Building, Lot, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { familyIndex } from '../../state/zones';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { townStock } from '../../view/hamlet';
import { businessView } from '../../view/businesses';
import { entranceTiles } from '../../rules/footprint';
import { hasBuilt } from '../innovations/api';
import { dailyOffset } from '../economy/time';
import { doorTile } from '../movement/api';
import { fieldCap, fieldsOf, fieldTileProblem, isFarm, paintFields } from '../production/fields';
import { porterIndex, porterServed, type Reach } from '../logistics/range';
import { openJobCount, openJobs } from '../residents/jobs';
import { attractiveness } from '../residents/lifecycle';
import { foodIndexes, pantryFood } from '../residents/needs';
import { vacantHomes } from '../residents/places';
import { announceServers } from '../specialized/announce';
import { growLot, lotPlacement } from './api';
import { computeBars, craftPull, HOME_ZONES, writeBars, type BarInputs } from './bars';
import { mix, servicesOf } from './desirability';
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
import { SiteCache } from './site';
import { countMakers, FARM_FOOD_DAYS, NEED_FULL, tradeTerms, townNeeds, type TownNeeds } from './trades';

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

/** Homes wanted beyond those waiting: newcomers would come, and there is work for them. */
function homesWanted(state: WorldState, stock?: readonly number[]): number {
  const open = openJobCount(state);
  if (open <= 0 || attractiveness(state, [], stock, open) < HOMES_PULL) return 0;
  let waiting = vacantHomes(state).length;
  for (const b of state.buildings) {
    if (b.stage === 'construction' && content.buildingById.get(b.def)?.housing) waiting++;
  }
  const target = Math.min(HOMES_WAITING + Math.floor(state.residents.length / 30), Math.ceil(open / 2));
  return Math.max(0, target - waiting);
}

/**
 * Tonight's reading of the town, shared by the growth pass and the bars: read once a night and kept
 * up to date as businesses retool and grow (see `settle`), so the pass walks the town once.
 */
interface Night {
  services: Services;
  doors: [number, number][];
  needs: TownNeeds;
  cache: SiteCache;
  crafts: TradeDef[];
  farms: TradeDef[];
  shops: TradeDef[];
  /** Homes wanted beyond those waiting. */
  homes: number;
  /** R1X: HANDS_WAITING or more businesses stand with nobody at work: no new business tonight. */
  handsShort: boolean;
  /** Trades with a business going up, and businesses of each trade in town. */
  goingUp: Set<string>;
  counts: Map<string, number>;
  /** Outlets in town, built or going up. */
  outlets: number;
  /** More households than the outlets in town can serve. */
  crowded: boolean;
  /** Empty lots with a road at the frontage, best first (desirability, then id). */
  empty: Lot[];
  /** porterServed, and the looser "about in reach" (nearAStore), for many tiles. */
  porters: (tile: number) => boolean;
  nearStore: (tile: number) => boolean;
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
  const services = servicesOf(state);
  const village = rankAtLeast(state, 'village');
  const homes = homeDoorTiles(state);
  const doors = unservedDoors(state, services, homes);
  const outlets = outletCount(state);
  const crowded = outletsCrowded(state, outlets);
  const night: Night = {
    services,
    doors,
    needs: townNeeds(state, village && (doors.length >= SHOP_HOUSEHOLDS || crowded) ? NEED_FULL : 0),
    cache: new SiteCache(state, homes),
    crafts: tradesOf(state, 'crafts'),
    farms: tradesOf(state, 'farms'),
    shops: tradesOf(state, 'shops'),
    homes: 0,
    handsShort: businessesWaitingHands(state) >= HANDS_WAITING,
    goingUp: new Set(),
    counts: new Map(),
    outlets,
    crowded,
    empty: state.lots
      .filter((l) => !l.buildingId && state.map.road[l.frontage])
      .sort((p, q) => q.desirability - p.desirability || p.id - q.id),
    porters: porterIndex(services.reach),
    nearStore: porterIndex(services.reach, NEAR_STORE_SLACK),
  };
  night.homes = homesWanted(state, night.needs.stock);
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
  if (grown) night.cache.addBusiness(grown);
  countMakers(state, night.needs);
  countTrades(state, night);
  if (grown?.keeperId) {
    night.needs.keen.forget(grown.keeperId);
  }
  if (grown && content.buildingById.get(grown.def)?.coverage?.some((c) => c.kind === 'food')) {
    night.services = servicesOf(state);
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
function affordable(state: WorldState, def: BuildingDef, free: number[], zones: readonly number[]): boolean {
  let short = false;
  for (const [id, qty] of def.cost?.goods ?? []) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && (free[g] ?? 0) * 100 < qty * GROWTH_SHARE) short = true;
  }
  if (!short) return true;
  if (state.carrier.families[familyIndex('materials')]?.rule === 'never') return false;
  return !siteWaiting(state, zones);
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
): boolean {
  const kind = lot.zone === Zone.homesLow || lot.zone === Zone.homesMedium ? HOME_ZONES : [lot.zone];
  if (!affordable(state, def, free, kind)) return false;
  const at = lotPlacement(state, lot, def);
  if (!at) return false;
  // Porters must reach the door itself, or the site would wait for its timber forever.
  const { front } = entranceTiles(def, at[0], at[1], lot.rot);
  return porterServed(reach, front[1] * S + front[0]);
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
): { trade: TradeDef; keeperId: number } | null {
  const counts = night.counts;
  let best: { trade: TradeDef; keeperId: number } | null = null;
  let bestScore = 0;
  let bestCount = 0;
  for (const t of trades) {
    if (night.goingUp.has(t.id)) continue;
    const terms = tradeTerms(state, lot, t, night.needs, night.cache);
    if (terms.score <= 0) continue;
    const count = counts.get(t.id) ?? 0;
    if (best && (terms.score < bestScore || (terms.score === bestScore && count >= bestCount))) continue;
    const def = content.buildingById.get(t.building);
    if (!def || !canGrow(state, lot, def, free, night.services.reach)) continue;
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

/** One night's growth. Returns the sites started. */
export function growthPass(state: WorldState, ctx: TickCtx): number {
  if (!isStandard(state)) return 0;
  const night = readNight(state);
  const started = growSites(state, ctx, night);
  writeDemand(state, ctx, night);
  night.cache.persist();
  return started;
}

/** Retools, then starts the night's grown sites. Returns how many sites started. */
function growSites(state: WorldState, ctx: TickCtx, night: Night): number {
  const tradesFor = (zoneId: string): TradeDef[] =>
    zoneId === 'crafts'
      ? night.crafts
      : zoneId === 'farms'
        ? night.farms
        : zoneId === 'shops'
          ? night.shops
          : [];
  if (retoolPass(state, ctx, night.needs, night.cache, tradesFor) > 0) {
    settle(state, night);
  }
  growFields(state, ctx);

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
  for (const [zones, n] of wants) {
    for (let k = 0; k < n; k++) {
      if (started >= GROWTH_PER_DAY || grownSites(state) >= GROWTH_MAX_SITES) return started;
      const shop = zones[0] === Zone.shops;
      // Shops go where they reach the most households without one, then by desirability; only lots
      // porters can about reach (canGrow checks the very door), the best few.
      const lots: Lot[] = [];
      for (const l of night.empty) {
        if (l.buildingId || !zones.includes(l.zone)) continue;
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
          pick = chooseTrade(state, lot, trades, night, free);
          def = pick ? (content.buildingById.get(pick.trade.building) ?? null) : null;
        } else {
          const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
          def = chooseHome(state, lot, growable(state, zoneId), free, night.services.reach);
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
      if (!grew) break;
    }
  }
  return started;
}

/** The four demand bars, written to state.demand, with demand.updated when there is a ctx. */
export function writeDemand(state: WorldState, ctx: TickCtx | null, night: Night = readNight(state)): void {
  const inputs: BarInputs = {
    needs: night.needs,
    cache: night.cache,
    services: night.services,
    homes: night.homes,
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

export const growth: System = {
  id: 'growth',
  order: 26,
  every: TICKS_PER_DAY,
  offset: dailyOffset(1),
  tick(state, ctx) {
    growthPass(state, ctx);
  },
};
