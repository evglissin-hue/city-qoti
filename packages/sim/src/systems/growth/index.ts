// Daily growth on lots (docs/spec/13-ledger.md, Zoning and growth). At 01:00 the growth pass:
//
// 1. Lets grown crafts and farms change their method to whatever the town is shortest of (unless
//    the Ledger pinned one), and gives grown farms the farm-zoned land around them as fields.
// 2. Scores every empty lot (./desirability) and works out demand per zone:
//    - homes, while the town would draw newcomers (food, jobs and mood, before vacancies count)
//      and has open jobs for them: enough homes going up to keep two or so empty ones waiting;
//    - shops, for households no outlet reaches, or one per eight households;
//    - crafts, for a good the market is short of that a grown workshop can make;
//    - farms, while there are under four days of food in hand.
// 3. Starts grown sites on the best lots, a couple a day and a few at a time, only while the
//    storehouses can spare half their materials beyond what other sites still wait for (the rest
//    comes as it is made; a site waiting on planks makes planks short, so a sawpit may grow).
//
// When demand is met, growth stops; when it returns, growth starts again. Grown sites are ordinary
// construction sites (growLot); they cost the treasury nothing. What grows: content defs with
// `grows.zone` (C4C writes them); until a zone has any, the I1 buildings stand in.
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_DAY, Zone } from '../../constants';
import type { Building, Lot, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { townStock } from '../../view/hamlet';
import { lotView } from '../../view/village';
import { emitBuilding } from '../economy/emit';
import { dailyOffset } from '../economy/time';
import { doorTile } from '../movement/api';
import { fieldCap, fieldsOf, fieldTileProblem, isFarm, paintFields } from '../production/fields';
import { porterServed, type Reach } from '../logistics/range';
import { entranceTiles } from '../../rules/footprint';
import { openJobCount } from '../residents/jobs';
import { attractiveness } from '../residents/lifecycle';
import { foodIndexes, pantryFood } from '../residents/needs';
import { vacantHomes } from '../residents/places';
import { growLot, lotPlacement } from './api';
import { lotDesirability, lotFertility, mix, outletCovers, servicesOf, townSpecies } from './desirability';
import { bestMethod, methodScore, shortages, SWITCH_MARGIN, unmetShortages } from './recipes';

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

/** Stand-ins until C4C's grown content arrives: zone id to I1 defs, in preference order. */
const STAND_INS: readonly (readonly [zone: string, defs: readonly string[]])[] = [
  ['crafts', ['bakery', 'sawpit', 'windmill']],
  ['farms', ['farmhouse', 'vegetable-plot']],
  ['homes-low', ['cottage']],
  ['homes-medium', ['cottage']],
  ['shops', ['market-stall']],
];

/** True when the valley may build the def (its rank, innovation or unlock). */
function available(state: WorldState, def: BuildingDef): boolean {
  const req = def.requires;
  if (!req) return true;
  if (req.rank && !rankAtLeast(state, req.rank)) return false;
  if (req.innovation && !hasInnovation(state, req.innovation) && !state.hearth.unlocked.includes(def.id)) {
    return false;
  }
  return true;
}

/** Defs that may grow in a zone now: content's `grows` defs, or the stand-ins while it has none. */
export function growable(state: WorldState, zoneId: string): BuildingDef[] {
  const grown = content.buildings.filter((d) => d.grows?.zone === zoneId);
  const list =
    grown.length > 0
      ? grown
      : (STAND_INS.find(([z]) => z === zoneId)?.[1] ?? []).flatMap((id) => {
          const d = content.buildingById.get(id);
          return d ? [d] : [];
        });
  return list.filter((d) => available(state, d));
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

/** What the village wants grown now, in sites per zone kind (before the daily and site limits). */
export function growthDemand(state: WorldState, services = servicesOf(state)): GrowthDemand {
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
      if (!l.buildingId && l.zone === Zone.shops && shopReach(l, doors) >= SHOP_HOUSEHOLDS) shops = 1;
    }
  }
  if (Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) > outletCount(state)) shops = 1;
  // Crafts: something short that a grown workshop could make.
  const short = unmetShortages(state, shortages(state, stock));
  let crafts = 0;
  for (const def of growable(state, 'crafts')) {
    if (bestMethod(state, def, short, stock)[1] > 0) crafts = 1;
  }
  const farms = foodDaysInHand(state, stock) < FARM_FOOD_DAYS ? 1 : 0;
  return {
    homes,
    shops: Math.max(0, shops - grownSites(state, [Zone.shops])),
    crafts: Math.max(0, crafts - grownSites(state, [Zone.crafts])),
    farms: Math.max(0, farms - grownSites(state, [Zone.farms])),
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

/** The def to grow on a lot: by shortage for crafts and farms, by weight for the rest. */
function chooseDef(
  state: WorldState,
  lot: Lot,
  defs: readonly BuildingDef[],
  short: readonly number[],
  stock: readonly number[],
  free: number[],
  reach: readonly Reach[],
): BuildingDef | null {
  const fits = defs.filter((d) => {
    if (!affordable(d, free)) return false;
    const at = lotPlacement(state, lot, d);
    if (!at) return false;
    // Porters must reach the door itself, or the site would wait for its planks forever.
    const { front } = entranceTiles(d, at[0], at[1], lot.rot);
    return porterServed(reach, front[1] * S + front[0]);
  });
  if (fits.length === 0) return null;
  if (lot.zone === Zone.crafts || lot.zone === Zone.farms) {
    const fert = lotFertility(state, lot);
    let best: BuildingDef | null = null;
    let bestScore = 0;
    for (const d of fits) {
      const [, score] = bestMethod(state, d, short, stock, fert);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    // Farms grow even when nothing is short yet (food days ran low); crafts only for a shortage.
    return best ?? (lot.zone === Zone.farms ? fits[0]! : null);
  }
  let total = 0;
  for (const d of fits) total += d.grows?.weight ?? 1;
  let pick = mix(lot.id, Math.floor(state.tick / TICKS_PER_DAY)) % Math.max(1, total);
  for (const d of fits) {
    pick -= d.grows?.weight ?? 1;
    if (pick < 0) return d;
  }
  return fits[fits.length - 1]!;
}

/** Sets a grown production building's method to the best one now (pins win). */
function chooseMethod(
  state: WorldState,
  ctx: TickCtx | null,
  b: Building,
  short: readonly number[],
  stock: readonly number[],
  initial: boolean,
): void {
  const rt = b.rt;
  const def = content.buildingById.get(b.def);
  if (!rt || !def?.methods || def.methods.length < 2 || rt.pinned) return;
  const lot = b.lot ? findById(state.lots, b.lot) : undefined;
  const fert = lot ? lotFertility(state, lot) : 100;
  const [best, score] = bestMethod(state, def, short, stock, fert);
  if (best < 0 || best === rt.method) return;
  if (!initial) {
    const current = def.methods[rt.method];
    const now = current ? methodScore(state, current, short, stock, fert) : 0;
    if (score < now + SWITCH_MARGIN) return;
  }
  rt.method = best;
  rt.progress = 0;
  if (ctx && !initial) emitBuilding(state, ctx, b);
}

/** Gives built grown farms the free farm-zoned land within their reach as fields, nearest first. */
function growFields(state: WorldState, ctx: TickCtx): void {
  for (const b of state.buildings) {
    if (!b.lot || b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!def || !isFarm(def)) continue;
    const room = fieldCap(def) - fieldsOf(state, b, def).length;
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
  const stock = townStock(state);
  const short = shortages(state, stock);
  for (const b of state.buildings)
    if (b.lot && b.stage === 'built') chooseMethod(state, ctx, b, short, stock, false);
  growFields(state, ctx);
  // New workshops answer only shortages the town's makers are not already catching up on.
  const unmet = unmetShortages(state, short);

  const empty = state.lots.filter((l) => !l.buildingId && state.map.road[l.frontage]);
  if (empty.length === 0) return 0;
  const species = townSpecies(state);
  const services = servicesOf(state);
  for (const lot of empty) {
    const d = lotDesirability(state, lot, species, services);
    if (d === lot.desirability) continue;
    lot.desirability = d;
    ctx.events.push({ e: 'lot.updated', l: lotView(lot) });
  }

  const demand = growthDemand(state, services);
  const free = freeMaterials(state, stock);
  let started = 0;
  const wants: [zones: readonly number[], n: number][] = [
    [[Zone.farms], demand.farms],
    [HOME_ZONES, demand.homes],
    [[Zone.shops], demand.shops],
    [[Zone.crafts], demand.crafts],
  ];
  const doors = demand.shops > 0 ? unservedDoors(state, services) : [];
  // Shops wanted only for households out of reach must stand where they reach them.
  const reachOnly =
    Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) <= outletCount(state) ? SHOP_HOUSEHOLDS : 0;
  for (const [zones, n] of wants) {
    for (let k = 0; k < n; k++) {
      if (started >= GROWTH_PER_DAY || grownSites(state) >= GROWTH_MAX_SITES) return started;
      const shop = zones[0] === Zone.shops;
      // Shops go where they reach the most households without one, then by desirability.
      // Only lots porters can about reach (chooseDef checks the very door).
      const lots = empty
        .filter((l) => !l.buildingId && zones.includes(l.zone) && nearAStore(services.reach, l.frontage))
        .filter((l) => !shop || shopReach(l, doors) >= reachOnly)
        .sort(
          (p, q) =>
            (shop ? shopReach(q, doors) - shopReach(p, doors) : 0) ||
            q.desirability - p.desirability ||
            p.id - q.id,
        );
      let grew = false;
      for (const lot of lots.slice(0, 6)) {
        const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
        const need = lot.zone === Zone.crafts ? unmet : short;
        const def = chooseDef(state, lot, growable(state, zoneId), need, stock, free, services.reach);
        if (!def) continue;
        const b = growLot(state, ctx, lot.id, def.id);
        if (!b) continue;
        for (const [id, qty] of def.cost?.goods ?? []) {
          const g = content.goodIndex.get(id);
          if (g !== undefined) free[g]! -= qty;
        }
        chooseMethod(state, null, b, need, stock, true);
        started++;
        grew = true;
        break;
      }
      if (!grew) break;
    }
  }
  return started;
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
