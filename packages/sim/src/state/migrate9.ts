// Save version 8 to 9 (R3.0, masters and the Town Book; docs/spec/21-networking-and-saves.md, Version
// changes). Frozen: it must turn a version 8 save into exactly what R3.0's version 9 holds, whatever
// later cycles change in the systems or the content, so it reads no system code and keeps its own small
// tables. Idempotent on what it pads (an array already long enough is left alone).
//
// What it does:
// - per-good arrays grow from R1's sixteen goods to twenty-five (the nine masters' goods appended):
//   zeros, -1 for a household's sightings, the base price for prices, 1000 for a neighbor's drift;
// - a keeper's working days in their business become their `craft` in its trade;
// - a level 3 business keeps its level (`levelKept`), and its keeper is a master if they have four
//   hearts (13-ledger.md, Levels: "its keeper is counted a master once they have four hearts"; one
//   with fewer becomes one by R3B's rule when the fourth comes, their days being there already); a
//   business whose keeper is made a master here needs no `levelKept`, and shows the sign (`masterId`);
// - a river frozen at save time keeps the skating spots it had (the version 8 rule, run once here);
// - no lit bits, pages, counts or threads yet: the R3 slices start empty.
import { MAP_SIZE } from '../constants';
import { base64ToBytes } from './base64';
import type { SaveObject } from './version';

/** Goods in a version 8 save, and in R3.0's list. */
const V8_GOODS = 16;
const V9_GOODS = 25;
/** The nine masters' goods' base prices, in pennies (R3.0's content: pies to smoked fish). */
const NEW_BASE_PRICES = [400, 400, 400, 400, 600, 1200, 800, 300, 400];
/** ResidentFlags.master (R3.0). */
const MASTER_FLAG = 16;
/** Hearts a keeper needs to be counted a master (MASTERY.hearts at R3.0). */
const MASTER_HEARTS = 4;
/** Days a season, ticks a day and the hour the clock starts at (constants at R3.0). */
const DAYS_PER_SEASON = 6;
const TICKS_PER_DAY = 4800;
const START_TICKS = 6 * 200;
/** The version 8 skating spots rule (seasons/place.ts at R2X): one bank tile in 24, at most 16. */
const SPOT_STRIDE = 24;
const SPOTS_MAX = 16;
/** Water layer values for the river (map/layers.ts Water.river, Water.riverDeep). */
const RIVER = 1;
const RIVER_DEEP = 2;

type Obj = Record<string, unknown>;

/** The base price of good index `g` past the sixteen. */
function price(g: number): number {
  return NEW_BASE_PRICES[g - V8_GOODS] ?? 0;
}

/** Pads a per-good array to V9_GOODS in place; anything else is left alone. */
function pad(v: unknown, fill: (g: number) => number | boolean): void {
  if (!Array.isArray(v)) return;
  if (v.length < V8_GOODS || v.length >= V9_GOODS) return;
  while (v.length < V9_GOODS) v.push(fill(v.length));
}

const zero = (): number => 0;

/** A deep copy of a JSON value (a save is JSON). */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** The version 8 skating spots for the saved map (row-major, at most 16). */
function skatingSpots(map: Record<string, string>): number[] {
  const S = MAP_SIZE;
  const water = base64ToBytes(map.water!);
  const tree = base64ToBytes(map.tree!);
  const occBytes = base64ToBytes(map.occupant!);
  const occupied = (i: number): boolean =>
    (occBytes[i * 4]! | occBytes[i * 4 + 1]! | occBytes[i * 4 + 2]! | occBytes[i * 4 + 3]!) !== 0;
  const isRiver = (w: number): boolean => w === RIVER || w === RIVER_DEEP;
  const spots: number[] = [];
  let seen = 0;
  for (let z = 1; z < S - 1 && spots.length < SPOTS_MAX; z++) {
    for (let x = 1; x < S - 1 && spots.length < SPOTS_MAX; x++) {
      const i = z * S + x;
      if (water[i] || occupied(i) || tree[i]) continue;
      if (
        !isRiver(water[i - 1]!) &&
        !isRiver(water[i + 1]!) &&
        !isRiver(water[i - S]!) &&
        !isRiver(water[i + S]!)
      )
        continue;
      if (seen++ % SPOT_STRIDE === 0) spots.push(i);
    }
  }
  return spots;
}

export function migrate8to9(save: SaveObject): SaveObject {
  // Buildings: their per-good buffers; level 3 businesses keep their level.
  const buildings = clone(save.buildings) as Obj[];
  for (const b of buildings) {
    const rt = b.rt as Obj | undefined;
    if (rt) {
      for (const k of [
        'input',
        'output',
        'store',
        'reservedIn',
        'reservedOut',
        'producedToday',
        'upgrade',
        'moduleWork',
      ])
        pad(rt[k], zero);
      const c = rt.construction as Obj | null | undefined;
      if (c) {
        pad(c.needs, zero);
        pad(c.delivered, zero);
      }
    }
    const counters = b.counters as Obj | undefined;
    if (b.trade && counters && (b.level as number | undefined) === 3) counters.levelKept = true;
  }

  // Households: pantries and sightings.
  const households = clone(save.households) as Obj[];
  for (const h of households) {
    pad(h.pantry, zero);
    pad(h.seen, () => -1);
  }

  // The books, prices, levers, neighbors and the carrier's log.
  const economy = clone(save.economy) as Obj;
  for (const k of ['today', 'yesterday', 'season', 'lastSeason']) {
    const period = economy[k] as Obj | undefined;
    if (!period) continue;
    pad(period.produced, zero);
    pad(period.consumed, zero);
  }
  for (const day of (economy.stockHistory as unknown[] | undefined) ?? []) pad(day, zero);
  pad(economy.everProduced, zero);
  const market = clone(save.market) as Obj;
  pad(market.prices, price);
  for (const k of ['demand', 'demandToday', 'cover', 'bought', 'boughtToday']) pad(market[k], zero);
  for (const day of (market.history as unknown[] | undefined) ?? []) pad(day, price);
  const levers = clone(save.levers) as Obj;
  pad(levers.priceCaps, zero);
  pad(levers.subsidies, zero);
  const trade = clone(save.trade) as Obj;
  for (const nb of (trade.neighbors as Obj[] | undefined) ?? []) {
    pad(nb.drift, () => 1000);
    pad(nb.impact, () => 1000);
  }
  const carrier = clone(save.carrier) as Obj;
  for (const day of (carrier.bought as unknown[] | undefined) ?? []) pad(day, zero);
  for (const day of (carrier.sold as unknown[] | undefined) ?? []) pad(day, zero);

  // Keepers: their days become their craft; a level 3 keeper with four hearts is a master.
  const residents = clone(save.residents) as Obj[];
  const byId = new Map<number, Obj>();
  for (const r of residents) byId.set(r.id as number, r);
  // The absolute season index (year * 4 + season) of the save's day.
  const season = Math.floor(
    Math.floor(((save.tick as number) + START_TICKS) / TICKS_PER_DAY) / DAYS_PER_SEASON,
  );
  const lastMade: [string, number][] = [];
  let made = 0;
  for (const b of buildings) {
    const trade = b.trade as string | undefined;
    const keeper = byId.get((b.keeperId as number | undefined) ?? 0);
    const counters = b.counters as Obj | undefined;
    if (!trade || !keeper || !counters) continue;
    const days = (counters.keeperDays as number | undefined) ?? 0;
    if (days > 0) {
      const craft = ((keeper.craft as [string, number][] | undefined) ?? []).map(
        ([t, d]) => [t, d] as [string, number],
      );
      const row = craft.find(([t]) => t === trade);
      if (row) row[1] = Math.max(row[1], days);
      else craft.push([trade, days]);
      craft.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      keeper.craft = craft;
    }
    if ((b.level as number | undefined) !== 3) continue;
    if (((keeper.bond as number | undefined) ?? 0) < MASTER_HEARTS) continue;
    if (((keeper.flags as number) & MASTER_FLAG) !== 0) continue;
    keeper.flags = (keeper.flags as number) | MASTER_FLAG;
    keeper.mastery = trade;
    // The sign over the door, while the keeper works there.
    const workers = ((b.rt as Obj | undefined)?.workers as number[] | undefined) ?? [];
    if (workers.includes(keeper.id as number)) b.masterId = keeper.id;
    made += 1;
    if (!lastMade.some(([t]) => t === trade)) lastMade.push([trade, season]);
    delete counters.levelKept;
  }
  lastMade.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

  // The river: a frozen one keeps the spots it had at the freeze, read once from the saved map.
  const weather = clone(save.weather) as Obj;
  const river = weather.river as Obj | undefined;
  if (river && river.frozen === true && !Array.isArray(river.spots)) {
    river.spots = skatingSpots(save.map as Record<string, string>);
  }

  return {
    ...save,
    saveVersion: 9,
    buildings,
    households,
    economy,
    market,
    levers,
    trade,
    carrier,
    residents,
    weather,
    supplies: {
      night: -1,
      lamps: [],
      pieces: [],
      drawn: [],
      lamplighters: [],
      roundSeasons: 0,
      roundSeason: -1,
      roundBroken: false,
    },
    masters: { lastMade, made },
    townBook: { pages: [], hints: [], callings: [] },
    threads: { pairs: [] },
  };
}
