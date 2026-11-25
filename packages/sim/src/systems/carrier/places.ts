// Places draw last (R3A; docs/spec/19-evenings.md, Supplies; 13-ledger.md, The carrier and trade):
// homes are served first, then businesses, then places. A place draws only on what the town holds
// above the family's reserve and the places' winter mark, which falls through winter (the season
// plan's mark times the winter days left over the winter's length, derived, never saved; homes and
// businesses keep the flat mark), and from the storehouses and makers' output buffers first and, since R3X, the
// outlets' shelves last. The carrier buys for places only where the Ledger switched it on (`CarrierFamily.places`),
// within the day's budget and never on the County tab (carrier/index.ts, step 4b).
import { content } from '@qoti/content';
import { DAYS_PER_SEASON } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { familyIndex, methodOf } from '../../state/zones';
import { isStorehouse, tileDistance } from '../logistics/stores';
import { balanceStock, familyStock, familyUseHundredths } from '../market/balances';
import { doorTile } from '../movement/api';
import { dayIndex } from '../economy/time';
import { winterMark } from './api';

const MATERIALS = 2;

/** The families some supplied piece draws a good from (GOOD_FAMILIES indexes). */
const DRAWN_FAMILIES: ReadonlySet<number> = new Set(
  content.decor.flatMap((d) => {
    const g = d.supply?.good ? content.goodById.get(d.supply.good) : undefined;
    return g ? [familyIndex(g.family)] : [];
  }),
);

/** The mark in hundredths of a day: the season plan's mark, falling by the winter days left (whole numbers only). */
function markHundredths(state: WorldState, family: number): number | null {
  const base = winterMark(state, family);
  if (base === null) return null;
  const { season, day } = seasonAt(state.tick);
  if (season !== 3) return base * 100;
  const left = Math.max(0, DAYS_PER_SEASON - day + 1);
  return Math.floor((base * 100 * left) / DAYS_PER_SEASON);
}

/**
 * The places' winter mark for a family (GOOD_FAMILIES index), in days of use: the season plan's mark
 * while marks stand, falling through winter by the days left; null when no mark stands.
 */
export function placesMark(state: WorldState, family: number): number | null {
  const h = markHundredths(state, family);
  return h === null ? null : h / 100;
}

/** Units of a family the town keeps from places: its reserve or the places' mark, whichever is more. */
export function placesFloor(state: WorldState, family: number): number {
  // Materials are never drawn by places: the floor is the whole stock (nothing above it).
  if (family === MATERIALS) return familyStock(balanceStock(state), family);
  const reserve = state.carrier.families[family]?.reserve ?? 0;
  const mark = markHundredths(state, family) ?? 0;
  const days = Math.max(reserve * 100, mark);
  return Math.ceil((days * familyUseHundredths(state, family)) / 10000);
}

/** What places may draw now: a family's units above its floor, and each good's free units where places take from. */
export interface PlacesPurse {
  /** By GOOD_FAMILIES index: units above the places' floor (0 at or below it). */
  surplus: number[];
  /** By good index: free units in the storehouses and makers' output buffers (never a shelf). */
  free: number[];
  /** Where places take from, listed once for the purse (drawForPlaces reads it). */
  sources: readonly Source[];
  /** The sources holding each good, nearest a tile first, by `${good}:${tile}` (sorted once a purse). */
  order: Map<string, Source[]>;
}

/** A building places may take from: its door and what it can give. */
interface Source {
  b: Building;
  door: number;
  /** A storehouse or an outlet's shelf (taken from `store`, any good), or a maker (taken from `output`, its outputs only). */
  store: boolean;
  /** R3X: an outlet's shelf: drawn last, after the storehouses and the makers' buffers. */
  shelf?: boolean;
  /** A maker's outputs, by good index (empty for a storehouse). */
  makes: readonly number[];
}

/** A method's outputs by good index, by trade or def (a maker only ever holds what it makes). */
const OUTPUTS = new Map<string, number[]>();

function outputsOf(b: Building): number[] {
  const key = b.trade ? `t:${b.trade}` : `d:${b.def}`;
  let out = OUTPUTS.get(key);
  if (!out) {
    out = [];
    for (const [id] of methodOf(b)?.outputs ?? []) {
      const g = content.goodIndex.get(id);
      if (g !== undefined) out.push(g);
    }
    OUTPUTS.set(key, out);
  }
  return out;
}

/** Storehouses and makers (a built building with a method and no store of its own), in building order. */
function sources(state: WorldState): Source[] {
  const out: Source[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    const def = content.buildingById.get(b.def);
    if (isStorehouse(def)) out.push({ b, door: doorTile(b, def), store: true, makes: [] });
    // R3X: a shelf holds goods above the floor too. Candles stood on the stalls' shelves all week while the
    // lanterns went dark (willow, 22 on the shelves and none in a storehouse, a Village's lanterns unlit),
    // and the carrier, counting them as stock, bought none. The floor keeps the households' share.
    else if (def?.tags?.includes('outlet'))
      out.push({ b, door: doorTile(b, def), store: true, shelf: true, makes: [] });
    else if (!def?.storage) {
      const makes = outputsOf(b);
      if (makes.length > 0) out.push({ b, door: doorTile(b, def), store: false, makes });
    }
  }
  return out;
}

function sourceFree(s: Source, g: number): number {
  if (!s.store && !s.makes.includes(g)) return 0;
  const rt = s.b.rt!;
  return Math.max(0, ((s.store ? rt.store[g] : rt.output[g]) ?? 0) - (rt.reservedOut[g] ?? 0));
}

/** Units the carrier bought for places today and places have not drawn yet, by good index (or null). */
function carriedToday(state: WorldState): number[] | null {
  const c = state.supplies.carried;
  return c && c.day === dayIndex(state.tick) ? c.units : null;
}

/** Notes units the carrier bought for places today (its places switch): places may draw them under the floor. */
export function carryForPlaces(state: WorldState, good: number, qty: number): void {
  if (qty <= 0) return;
  const day = dayIndex(state.tick);
  let c = state.supplies.carried;
  if (!c || c.day !== day) {
    c = { day, units: new Array<number>(content.goods.length).fill(0) };
    state.supplies.carried = c;
  }
  c.units[good] = (c.units[good] ?? 0) + qty;
}

/**
 * The purse for one settling (or one carrier visit): read once, spent by drawForPlaces. What the
 * carrier bought for places today is theirs: it is left out of the stock the floor is measured
 * against and added to the surplus whole (as far as it is still in town).
 */
export function placesPurse(state: WorldState): PlacesPurse {
  const stock = balanceStock(state);
  const carried = carriedToday(state);
  const surplus: number[] = [];
  for (let f = 0; f < state.carrier.families.length; f++) {
    // Only the families some piece draws from have a floor to work out (Wares, Fuel).
    if (!DRAWN_FAMILIES.has(f)) {
      surplus.push(0);
      continue;
    }
    const have = familyStock(stock, f);
    const mine = carried ? Math.min(have, familyStock(carried, f)) : 0;
    surplus.push(Math.max(0, have - mine - placesFloor(state, f)) + mine);
  }
  const free = new Array<number>(content.goods.length).fill(0);
  const list = sources(state);
  for (const s of list) {
    if (s.store) for (let g = 0; g < free.length; g++) free[g]! += sourceFree(s, g);
    else for (const g of s.makes) free[g]! += sourceFree(s, g);
  }
  return { surplus, free, sources: list, order: new Map() };
}

/**
 * Takes up to `qty` units of good index `good` for places, within the purse (its family's surplus and
 * the good's free units), from the storehouses nearest tile `from` first, then makers' output buffers
 * nearest first (ties by building id). Spends the purse; returns the units taken.
 */
export function drawForPlaces(
  state: WorldState,
  purse: PlacesPurse,
  good: number,
  qty: number,
  from: number,
): number {
  const family = familyIndex(content.goods[good]!.family);
  let want = Math.min(qty, purse.free[good] ?? 0, purse.surplus[family] ?? 0);
  if (want <= 0) return 0;
  const key = `${good}:${from}`;
  let list = purse.order.get(key);
  if (!list) {
    list = purse.sources
      .filter((s) => sourceFree(s, good) > 0)
      .sort(
        (a, b) =>
          Number(!!a.shelf) - Number(!!b.shelf) ||
          Number(b.store) - Number(a.store) ||
          tileDistance(a.door, from) - tileDistance(b.door, from) ||
          a.b.id - b.b.id,
      );
    purse.order.set(key, list);
  }
  let taken = 0;
  for (const s of list) {
    if (want <= 0) break;
    const n = Math.min(want, sourceFree(s, good));
    const buf = s.store ? s.b.rt!.store : s.b.rt!.output;
    buf[good]! -= n;
    want -= n;
    taken += n;
  }
  purse.free[good]! -= taken;
  purse.surplus[family]! -= taken;
  // What the carrier brought for places is spent first.
  const carried = carriedToday(state);
  if (carried) carried[good] = Math.max(0, (carried[good] ?? 0) - taken);
  state.economy.today.consumed[good]! += taken;
  state.economy.season.consumed[good]! += taken;
  return taken;
}
