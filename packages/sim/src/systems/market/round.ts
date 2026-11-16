// Evening trade (docs/spec/19-evenings.md, Evening trade). R2B owns this file; R2A's place pass reads
// which outlets serve a place through it, never the shelves itself.
//
// Treats leave the 18:00 household pass and are bought on the evening round: at a stop, from passing
// trade, and by the 21:30 doorstep errand. Free in a Hamlet; paid through `purchase` from Village rank.
// The `baskets` system (baskets.ts) dispatches the work: Treats accrue at 17:00, the trade pass runs
// every ROUND_EVERY ticks from 17:00 to 21:00, the doorstep errand and the settling run at 21:30.
//
// Which takes first (R2B decides; docs/build/r2-wave-notes.md, Evening trade and the carrier): the
// carrier comes at 10:00 and takes surplus only from makers' output buffers and the storehouses,
// never from a stall's, shop's or the tavern's shelf; the round takes only from those shelves (store
// minus reservedOut, never what porters or the carrier reserved). One stock, two buffers: porters
// restock the shelves through the day, the round sells off them in the evening, and at 21:30 the
// doorstep errand goes to the next outlet in reach when a shelf is empty.
//
// Purity: nothing is cached across ticks and nothing draws from an RNG stream here. Passing trade
// rolls a hash of (resident, outlet, day), so the odds do not depend on how long they stand by a door.
import { content } from '@qoti/content';
import { GOOD_FAMILIES, MAP_SIZE, RoundFlags, TICKS_PER_HOUR } from '../../constants';
import type { Building, EntityId, Household, RoundStop, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { GOODS_BY_FAMILY } from '../../state/zones';
import { calendar } from '../clock/calendar';
import { dayIndex, tickOfDay } from '../economy/time';
import { takeFromOutlet } from '../economy/outlets';
import { mix } from '../growth/desirability';
import { doorTile } from '../movement/api';
import { placeById, placeServes, recordSale } from '../places/api';
import { announceHousehold } from '../residents/records';
import { marketOpen, outletFree, purchase, tillPrice } from './api';
import {
  basketGroups,
  ensureBasket,
  favoriteWeights,
  likeHalves,
  perDayHundredths,
  satisfy,
  setGoodsNeed,
  tasteOf,
  valueOf,
} from './baskets';

/** The baskets system runs every this many ticks: a walker spends 4 or more on any tile (road 5, Sporty 0.8). */
export const ROUND_EVERY = 4;
/** The Treats group's id in a basket. */
export const TREATS_GROUP = 'treats';

const TREATS: readonly number[] = GOODS_BY_FAMILY[GOOD_FAMILIES.indexOf('treats')] ?? [];
const TREAT_SET: ReadonlySet<number> = new Set(TREATS);
const S = MAP_SIZE;

/**
 * Whether a building sells Treats to the round at all: the tavern, and any 'market' outlet (the
 * stall, the Market Square, the shop) where, for a business with a trade that lists what it `sells`
 * by level, its level's shelf includes Treats (a shop from level 2). Storehouses, granaries and the
 * Trading Post are 'outlet' but never sell to the round. Structural only, never stock: the place
 * index may cache it.
 */
export function sellsTreats(_state: WorldState, b: Building): boolean {
  if (b.stage !== 'built') return false;
  const tags = content.buildingById.get(b.def)?.tags ?? [];
  if (tags.includes('tavern')) return true;
  if (!tags.includes('market')) return false;
  const trade = content.tradeById.get(b.trade ?? (tags.includes('shop') ? 'shop' : ''));
  if (!trade?.sells) return true;
  const level = Math.max(1, Math.min(trade.sells.length, b.level ?? 1));
  return trade.sells[level - 1]!.includes('treats');
}

/** Whether it has a Treat on the shelf right now (read live; never cache it). */
export function treatsOnShelf(_state: WorldState, b: Building): boolean {
  const store = b.rt?.store;
  if (!store) return false;
  for (const g of TREATS) if ((store[g] ?? 0) - (b.rt?.reservedOut[g] ?? 0) > 0) return true;
  return false;
}

/** True when a good (by index) is in the Treats family. */
export function isTreat(good: number): boolean {
  return TREAT_SET.has(good);
}

/** Index of the Treats group in the household's basket, or -1. */
function treatsIndex(h: Household): number {
  const basket = ensureBasket(h);
  if (!basket) return -1;
  return basketGroups(basket).findIndex((g) => g.id === TREATS_GROUP);
}

/** 17:00: every household's Treats line accrues its day (fractions carry over, as the 18:00 pass did). */
export function accrueTreats(state: WorldState): void {
  const season = calendar(state.tick).season;
  for (const h of state.households) {
    if (!h.homeId) continue;
    const basket = ensureBasket(h);
    if (!basket) continue;
    const groups = basketGroups(basket);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      if (g.id !== TREATS_GROUP) continue;
      if (g.season !== undefined && g.season !== season) continue;
      h.owed![i]! += perDayHundredths(g, h);
    }
  }
}

/** A stop that belongs to tonight: arrived today, or still ahead (the plan is replaced each evening). */
function isTonight(stop: RoundStop, today: number): boolean {
  return stop.arrived < 0 || dayIndex(stop.arrived) === today;
}

/** True when a stop of tonight carries the treat flag (bought there, or passing on the way to it). */
function boughtTonight(round: readonly RoundStop[], today: number): boolean {
  for (const stop of round) if (isTonight(stop, today) && (stop.flags & RoundFlags.treat) !== 0) return true;
  return false;
}

/** The stop a resident is at: the last arrived, if today and not turned away. */
function currentStop(round: readonly RoundStop[], today: number): RoundStop | undefined {
  for (let i = round.length - 1; i >= 0; i--) {
    const stop = round[i]!;
    if ((stop.flags & RoundFlags.arrived) === 0 || stop.arrived < 0) continue;
    if (dayIndex(stop.arrived) !== today || (stop.flags & RoundFlags.turnedAway) !== 0) return undefined;
    return stop;
  }
  return undefined;
}

/**
 * The outlets a stop sells from, ascending by id: a `shop:<id>` stop uses that building when it
 * sells Treats and has some on the shelf; any other stop, the outlets serving its place.
 */
function stopOutlets(state: WorldState, stop: RoundStop): EntityId[] {
  if (stop.place.startsWith('shop:')) {
    const b = findById(state.buildings, Number(stop.place.slice(5)));
    return b && sellsTreats(state, b) && treatsOnShelf(state, b) ? [b.id] : [];
  }
  const place = placeById(state, stop.place);
  if (!place) return [];
  return [...placeServes(state, place)].sort((a, b) => a - b);
}

/**
 * The flavor a household likes best among the Treats free on these outlets: liking, and from
 * Village rank liking per till price (goods dearer than the purse are skipped). Ties go to the lower
 * outlet id, then the lower good index.
 */
function bestTreat(
  state: WorldState,
  h: Household,
  outlets: readonly EntityId[],
): { outlet: EntityId; good: number } | null {
  const paid = marketOpen(state);
  const taste = tasteOf(state, h);
  const likes = favoriteWeights(state, h);
  let best: { outlet: EntityId; good: number } | null = null;
  let bestValue = -1;
  for (const outlet of outlets) {
    for (const g of TREATS) {
      if (outletFree(state, outlet, g) <= 0) continue;
      const liking = likeHalves(likes[g] ?? 1, taste.thrifty, taste.comfortable);
      let value = liking;
      if (paid) {
        const price = tillPrice(state, g);
        if (price > h.savings) continue;
        value = valueOf(liking, price);
      }
      if (value > bestValue) {
        bestValue = value;
        best = { outlet, good: g };
      }
    }
  }
  return best;
}

/** Sells `qty` of a Treat: paid through `purchase` from Village rank, free in a Hamlet. Counts what was eaten. */
function sellTreat(
  state: WorldState,
  h: Household,
  outlet: EntityId,
  good: number,
  qty: number,
): { got: number; pennies: number } {
  const before = h.savings;
  const got = marketOpen(state)
    ? purchase(state, h, good, qty, outlet)
    : takeFromOutlet(state, outlet, good, qty);
  if (got > 0) {
    state.economy.today.consumed[good]! += got;
    state.economy.season.consumed[good]! += got;
  }
  return { got, pennies: Math.max(0, before - h.savings) };
}

/** Tiles within `passingRadius` (Manhattan) of the door of each outlet that sells Treats and has some on the shelf. Built fresh. */
function passingMap(state: WorldState): Map<number, EntityId[]> {
  const map = new Map<number, EntityId[]>();
  const R = content.places.passingRadius;
  for (const b of state.buildings) {
    if (!sellsTreats(state, b) || !treatsOnShelf(state, b)) continue;
    const door = doorTile(b);
    const dx0 = door % S;
    const dz0 = Math.floor(door / S);
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > R) continue;
        const x = dx0 + dx;
        const z = dz0 + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const key = z * S + x;
        const list = map.get(key);
        if (list) list.push(b.id);
        else map.set(key, [b.id]);
      }
    }
  }
  return map;
}

/**
 * The evening trade pass (every ROUND_EVERY ticks from 17:00 to 21:00): treats in hand are eaten,
 * residents at a stop that serves Treats buy one (two when comfortable), and walkers within
 * `passingRadius` of an outlet buy on a deterministic one-in-`passingOneIn` roll.
 */
export function tradePass(state: WorldState, ctx: TickCtx): void {
  const P = content.places;
  const today = dayIndex(state.tick);
  const tod = tickOfDay(state.tick);
  let doors: Map<number, EntityId[]> | null = null;
  for (const r of state.residents) {
    if (r.carry && isTreat(r.carry[0]) && (r.move || r.inside || tod >= P.homeHour * TICKS_PER_HOUR)) {
      r.carry = null;
    }
    const round = r.round;
    if (!round || round.length === 0) continue;
    const h = findById(state.households, r.householdId);
    const group = h ? treatsIndex(h) : -1;
    if (!h || group < 0 || h.owed![group]! < 100) continue;
    if (boughtTonight(round, today)) continue;
    if (!r.move) {
      const stop = currentStop(round, today);
      if (!stop) continue;
      const pick = bestTreat(state, h, stopOutlets(state, stop));
      if (!pick) continue;
      const qty = 1 + (tasteOf(state, h).comfortable ? 1 : 0);
      const { got, pennies } = sellTreat(state, h, pick.outlet, pick.good, qty);
      if (got <= 0) continue;
      h.owed![group]! -= 100;
      recordSale(state, stop.place, pick.outlet, pick.good, got, pennies);
      stop.flags |= RoundFlags.treat;
      if (r.carry === null) r.carry = [pick.good, got];
      if (pennies > 0) announceHousehold(state, ctx, h.id);
      continue;
    }
    // Walking with a stop still ahead: passing trade.
    const ahead = round.find((stop) => stop.arrived < 0);
    if (!ahead) continue;
    doors ??= passingMap(state);
    const near = doors.get(r.tile);
    if (!near) continue;
    for (const outlet of near) {
      if (mix(mix(r.id, outlet), today) % P.passingOneIn !== 0) continue;
      const pick = bestTreat(state, h, [outlet]);
      if (!pick) continue;
      const { got, pennies } = sellTreat(state, h, outlet, pick.good, 1);
      if (got <= 0) continue;
      h.owed![group]! -= 100;
      recordSale(state, null, outlet, pick.good, got, pennies);
      ahead.flags |= RoundFlags.treat;
      if (r.carry === null) r.carry = [pick.good, got];
      if (pennies > 0) announceHousehold(state, ctx, h.id);
      break;
    }
  }
}

/** Outlets in reach of a home door that sell Treats and have some on the shelf: nearest first, ties by id. */
function outletsInReach(state: WorldState, home: Building): EntityId[] {
  const door = doorTile(home);
  const x = door % S;
  const z = Math.floor(door / S);
  const found: { id: EntityId; d: number }[] = [];
  for (const b of state.buildings) {
    if (!sellsTreats(state, b) || !treatsOnShelf(state, b)) continue;
    const def = content.buildingById.get(b.def);
    const r = def?.coverage?.find((c) => c.kind === 'food')?.radius ?? 14;
    const od = doorTile(b, def);
    const dx = (od % S) - x;
    const dz = Math.floor(od / S) - z;
    if (dx * dx + dz * dz > r * r) continue;
    found.push({ id: b.id, d: Math.abs(dx) + Math.abs(dz) });
  }
  found.sort((a, b) => a.d - b.d || a.id - b.id);
  return found.map((f) => f.id);
}

/**
 * 21:30: households none of whose members bought on the round send to the nearest outlet in reach
 * for a third of what they are owed (hundredths in `doorstep`, eaten at home); then every household
 * settles its Treats line: what fell due is let go, and the line's satisfaction moves halfway to the
 * share that was bought. Every Treat in hand is eaten.
 */
export function doorstepErrand(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const P = content.places;
  for (const r of state.residents) if (r.carry && isTreat(r.carry[0])) r.carry = null;
  for (const h of state.households) {
    if (!h.homeId) continue;
    const group = treatsIndex(h);
    if (group < 0) continue;
    let roundUnits = 0;
    for (const id of h.members) {
      const round = findById(state.residents, id)?.round;
      if (round && boughtTonight(round, today)) roundUnits++;
    }
    const due = Math.floor(h.owed![group]! / 100);
    const before = h.savings;
    let bought = 0;
    if (roundUnits === 0 && due > 0) {
      h.doorstep = (h.doorstep ?? 0) + due * P.doorstepPercent;
      const units = Math.floor(h.doorstep / 100);
      const home = findById(state.buildings, h.homeId);
      if (units > 0 && home) {
        for (const outlet of outletsInReach(state, home)) {
          while (bought < units) {
            const pick = bestTreat(state, h, [outlet]);
            if (!pick) break;
            const { got } = sellTreat(state, h, outlet, pick.good, 1);
            if (got <= 0) break;
            bought += got;
            state.evenings.tonight.treatsDoorstep += got;
          }
          if (bought >= units) break;
        }
      }
      h.doorstep = Math.min(100, h.doorstep - bought * 100);
    }
    h.owed![group]! -= due * 100;
    if (roundUnits + due > 0) {
      satisfy(h, group, Math.min(100, Math.round((100 * (roundUnits + bought)) / (roundUnits + due))));
    }
    setGoodsNeed(state, h);
    if (h.savings !== before) announceHousehold(state, ctx, h.id);
  }
}
