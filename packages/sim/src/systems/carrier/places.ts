// Places draw last (R3A; docs/spec/19-evenings.md, Supplies; 13-ledger.md, The carrier and trade):
// homes are served first, then businesses, then places. A place draws only on what the town holds
// above the family's reserve and the places' winter mark, which falls through winter (the season
// plan's mark times the winter days left over the winter's length, derived, never saved; homes and
// businesses keep the flat mark), and only from the storehouses and makers' output buffers, never a
// shelf. The carrier buys for places only where the Ledger switched it on (`CarrierFamily.places`),
// within the day's budget and never on the County tab (carrier/index.ts, step 4b).
import { content } from '@qoti/content';
import { DAYS_PER_SEASON } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { familyIndex, methodOf } from '../../state/zones';
import { isStorehouse, tileDistance } from '../logistics/stores';
import { balanceStock, familyStock, familyUseHundredths } from '../market/balances';
import { doorTile } from '../movement/api';
import { winterMark } from './api';

const MATERIALS = 2;

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
}

/** A building places may take from: its door and what it can give. */
interface Source {
  b: Building;
  door: number;
  /** True for a storehouse (taken from `store`), false for a maker (taken from `output`). */
  store: boolean;
}

/** Storehouses and makers (a built building with a method and no store of its own), in building order. */
function sources(state: WorldState): Source[] {
  const out: Source[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    const def = content.buildingById.get(b.def);
    if (isStorehouse(def)) out.push({ b, door: doorTile(b, def), store: true });
    else if (!def?.storage && methodOf(b)) out.push({ b, door: doorTile(b, def), store: false });
  }
  return out;
}

/** Whether a maker's method outputs the good (a maker only ever holds what it makes). */
function makes(b: Building, g: number): boolean {
  const m = methodOf(b);
  if (!m) return false;
  for (const [id] of m.outputs) if (content.goodIndex.get(id) === g) return true;
  return false;
}

function sourceFree(s: Source, g: number): number {
  if (!s.store && !makes(s.b, g)) return 0;
  const rt = s.b.rt!;
  return Math.max(0, ((s.store ? rt.store[g] : rt.output[g]) ?? 0) - (rt.reservedOut[g] ?? 0));
}

/** The purse for one settling (or one carrier visit): read once, spent by drawForPlaces. */
export function placesPurse(state: WorldState): PlacesPurse {
  const stock = balanceStock(state);
  const surplus: number[] = [];
  for (let f = 0; f < state.carrier.families.length; f++) {
    surplus.push(Math.max(0, familyStock(stock, f) - placesFloor(state, f)));
  }
  const free = new Array<number>(content.goods.length).fill(0);
  for (const s of sources(state)) for (let g = 0; g < free.length; g++) free[g]! += sourceFree(s, g);
  return { surplus, free };
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
  const list = sources(state)
    .filter((s) => sourceFree(s, good) > 0)
    .sort(
      (a, b) =>
        Number(b.store) - Number(a.store) ||
        tileDistance(a.door, from) - tileDistance(b.door, from) ||
        a.b.id - b.b.id,
    );
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
  state.economy.today.consumed[good]! += taken;
  state.economy.season.consumed[good]! += taken;
  return taken;
}
