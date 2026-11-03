// Festival API (C5.0 contract; C5B owns festivals). docs/spec/12-hearth.md, Festivals.
// - festivalMorale: the Watch's share of the last festivals (C5D reads it).
// - reserveMenu: at noon on the festival day the plan's menu is put by from town stock (no porters:
//   the stock is set aside, and stays the town's own, so no money moves). Food is never put by
//   below a day's eating for the town (FESTIVAL_FOOD_FLOOR), so a festival never empties a larder.
// - Who comes: residents whose home door is within walking reach of the site, each with a chance of
//   mood x weather (content festivalTuning), drawn by id and day so both laptops agree.
import { content, festivalTuning, type FestivalTuning } from '@qoti/content';
import { FESTIVAL, MAP_SIZE } from '../../constants';
import type { EntityId, Rect, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { festivalView } from '../../view/seasons';
import { dayIndex, hourOf } from '../economy/time';
import { pay } from '../economy/money';
import { stowNearest } from '../logistics/stores';
import { priceOf } from '../market/api';
import { doorOf } from '../residents/places';
import { seasonNow, weatherToday } from '../seasons/api';
import { siteRect } from './site';

/** The tuning the sim reads (tests swap it with withFestivalTuning). */
let tuning: FestivalTuning = festivalTuning;

export function festivalTuningNow(): FestivalTuning {
  return tuning;
}

/** Tests only: runs `fn` with a changed tuning. */
export function withFestivalTuning<T>(t: FestivalTuning, fn: () => T): T {
  const before = tuning;
  tuning = t;
  try {
    return fn();
  } finally {
    tuning = before;
  }
}

/** How many recent festivals count toward the Watch's morale. */
export const FESTIVAL_MORALE_SEASONS = 2;
/** Food put by for a festival leaves at least this many units a resident in town stock. */
export const FESTIVAL_FOOD_FLOOR = 1;
/** The hour the menu is put by on the festival day. */
export const RESERVE_HOUR = 12;

/**
 * The Watch's morale from recent festivals (C5D reads it): -10 to +10, from the stars of the last
 * FESTIVAL_MORALE_SEASONS festivals (3 stars is neutral).
 */
export function festivalMorale(state: WorldState): number {
  const recent = state.festival.history.slice(-FESTIVAL_MORALE_SEASONS);
  if (recent.length === 0) return 0;
  let sum = 0;
  for (const f of recent) sum += f.stars - 3;
  return Math.max(-10, Math.min(10, Math.round((sum * 10) / (2 * recent.length))));
}

/** True on the season's festival day (day 6). */
export function isFestivalDay(state: WorldState): boolean {
  return seasonNow(state).day === FESTIVAL.day;
}

/** True from 18:00 to 22:00 on the festival day. */
export function isFestivalEvening(state: WorldState): boolean {
  if (!isFestivalDay(state)) return false;
  const h = hourOf(state.tick);
  return h >= FESTIVAL.from && h < FESTIVAL.to;
}

/** This season's plan, or null when there is none (or it is a stale one from an earlier season). */
export function currentPlan(state: WorldState) {
  const p = state.festival.plan;
  if (!p) return null;
  const { season, year } = seasonNow(state);
  return p.season === season && p.year === year ? p : null;
}

/** The current plan's site rect, or null. */
export function currentSite(state: WorldState): Rect | null {
  const p = currentPlan(state);
  return p ? siteRect(state, p.site) : null;
}

function isFood(good: number): boolean {
  return !!content.goods[good]?.food;
}

/** Units a building can give up of a good now (store and output, less porters' promises). */
function free(b: WorldState['buildings'][number], good: number): number {
  const rt = b.rt!;
  return Math.max(0, (rt.store[good] ?? 0) + (rt.output[good] ?? 0) - (rt.reservedOut[good] ?? 0));
}

/** Takes up to `qty` of a good out of town stock (stores first, then output buffers, by id). */
export function takeFromTown(state: WorldState, good: number, qty: number): number {
  let left = qty;
  for (const b of state.buildings) {
    if (left <= 0) break;
    if (b.stage !== 'built' || !b.rt) continue;
    let n = Math.min(left, free(b, good));
    if (n <= 0) continue;
    const rt = b.rt;
    const s = Math.min(n, Math.max(0, (rt.store[good] ?? 0) - (rt.reservedOut[good] ?? 0)));
    rt.store[good]! -= s;
    left -= s;
    n -= s;
    if (n > 0) {
      const o = Math.min(n, rt.output[good] ?? 0);
      rt.output[good]! -= o;
      left -= o;
    }
  }
  return qty - left;
}

/** Units of a good in town stock that could be put by now. */
export function availableInTown(state: WorldState, good: number): number {
  let n = 0;
  for (const b of state.buildings) if (b.stage === 'built' && b.rt) n += free(b, good);
  return n;
}

/** Food units across every food good in town stock. */
function foodInTown(state: WorldState): number {
  let n = 0;
  for (let g = 0; g < content.goods.length; g++) if (isFood(g)) n += availableInTown(state, g);
  return n;
}

/** How much of a good the menu may still take: stock, less the food floor for food goods. */
function canReserve(state: WorldState, good: number, food: number): number {
  const have = availableInTown(state, good);
  if (!isFood(good)) return have;
  const spare = food - FESTIVAL_FOOD_FLOOR * state.residents.length;
  return Math.max(0, Math.min(have, spare));
}

/**
 * Puts by the plan's menu from town stock, as far as it goes: what is missing of each line is taken
 * now, food never below the floor. Called at noon on the festival day (and safe to call again).
 */
export function reserveMenu(state: WorldState, ctx: TickCtx | null): void {
  const p = currentPlan(state);
  if (!p) return;
  let food = foodInTown(state);
  let moved = false;
  for (const [good, qty] of p.menu) {
    let line = p.reserved.find(([g]) => g === good);
    const have = line?.[1] ?? 0;
    const want = Math.min(qty - have, canReserve(state, good, food));
    if (want <= 0) continue;
    const got = takeFromTown(state, good, want);
    if (got <= 0) continue;
    if (!line) {
      line = [good, 0];
      p.reserved.push(line);
    }
    line[1] += got;
    if (isFood(good)) food -= got;
    moved = true;
  }
  p.reserved.sort((a, b) => a[0] - b[0]);
  if (moved) ctx?.events.push({ e: 'festival.updated', f: festivalView(state) });
}

/** Puts reserved goods back into the storehouses nearest the site (or the town's middle). */
export function returnReserved(state: WorldState, lines: readonly [number, number][], near: number): void {
  for (const [good, qty] of lines) {
    if (qty <= 0) continue;
    const stowed = stowNearest(state, near, good, qty, 0);
    if (stowed < qty) {
      // No storehouse room: the rest goes back to the first building that keeps a store.
      const b = state.buildings.find(
        (x) => x.stage === 'built' && x.rt && content.buildingById.get(x.def)?.storage,
      );
      if (b) b.rt!.store[good]! += qty - stowed;
    }
  }
}

/**
 * Generous residents give a little to the menu (11-residents.md, traits): at noon each Generous
 * grown-up whose household can pay buys `donation` units of the cheapest menu good still short at
 * market price (pay to the treasury, `sales`), and it goes straight onto the festival table.
 * Returns the units given.
 */
export function generousDonations(state: WorldState): number {
  const p = currentPlan(state);
  const t = tuning;
  if (!p || t.donation <= 0 || p.menu.length === 0) return 0;
  let given = 0;
  let food = foodInTown(state);
  for (const r of state.residents) {
    if (r.stage !== 'adult' || !r.traits.includes('generous')) continue;
    const h = findById(state.households, r.householdId);
    if (!h) continue;
    let best = -1;
    let bestPrice = Infinity;
    for (const [good, qty] of p.menu) {
      const have = p.reserved.find(([g]) => g === good)?.[1] ?? 0;
      if (have >= qty || canReserve(state, good, food) < t.donation) continue;
      const price = priceOf(state, good);
      if (price < bestPrice) {
        best = good;
        bestPrice = price;
      }
    }
    if (best < 0) continue;
    const cost = bestPrice * t.donation;
    if (h.savings < cost) continue;
    const got = takeFromTown(state, best, t.donation);
    if (got <= 0) continue;
    pay(state, { household: h.id }, 'treasury', priceOf(state, best) * got, 'sales');
    let line = p.reserved.find(([g]) => g === best);
    if (!line) {
      line = [best, 0];
      p.reserved.push(line);
    }
    line[1] += got;
    if (isFood(best)) food -= got;
    given += got;
  }
  p.reserved.sort((a, b) => a[0] - b[0]);
  return given;
}

/** Chebyshev tiles from a resident's home door to the site, or Infinity when homeless. */
export function homeDistance(state: WorldState, r: Resident, site: Rect): number {
  const h = findById(state.households, r.householdId);
  if (!h) return Infinity;
  const door = doorOf(state, h.homeId);
  if (door < 0) return Infinity;
  const x = door % MAP_SIZE;
  const z = Math.floor(door / MAP_SIZE);
  const dx = x < site[0] ? site[0] - x : x > site[2] ? x - site[2] : 0;
  const dz = z < site[1] ? site[1] - z : z > site[3] ? z - site[3] : 0;
  return Math.max(dx, dz);
}

/** Residents within walking reach of the site (sorted by id, as state.residents is). */
export function inReach(state: WorldState, site: Rect): Resident[] {
  const reach = tuning.reach;
  return state.residents.filter((r) => homeDistance(state, r, site) <= reach);
}

/** Today's weather's attendance, permille. */
export function weatherPermille(state: WorldState): number {
  const kind = weatherToday(state);
  for (const [k, v] of tuning.weather) if (k === kind) return v;
  return 1000;
}

/** A resident's chance to come, permille: mood (moodFloor to 1000) x weather. */
export function attendChance(state: WorldState, r: Resident): number {
  const mood = Math.max(0, Math.min(100, r.mood));
  const m = tuning.moodFloor + Math.trunc(((1000 - tuning.moodFloor) * mood) / 100);
  return Math.trunc((m * weatherPermille(state)) / 1000);
}

/** A resident's draw for the day, 0 to 999 (a hash of id and day, no RNG stream). */
export function attendRoll(r: Resident, day: number): number {
  let h = Math.imul(r.id ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(day + 7, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) % 1000;
}

/** Tonight's guests: residents in reach whose draw falls under their chance (sorted ids). */
export function chooseGuests(state: WorldState, site: Rect): EntityId[] {
  const day = dayIndex(state.tick);
  const out: EntityId[] = [];
  for (const r of inReach(state, site)) if (attendRoll(r, day) < attendChance(state, r)) out.push(r.id);
  return out;
}

/** The resident who plays tonight: Juniper Reed (the musician's arc) when in town, else an Artistic grown-up. */
export function musicianFor(state: WorldState): EntityId {
  const arc = state.stories.find((s) => s.arc === 'musician');
  if (arc?.residentId && findById(state.residents, arc.residentId)) return arc.residentId;
  for (const r of state.residents) if (r.stage === 'adult' && r.traits.includes('artistic')) return r.id;
  return 0;
}

/** A bandstand plays once Juniper Reed's finale has given the town its bandstand green. */
export function hasBandstand(state: WorldState): boolean {
  return state.hearth.unlocked.includes('bandstand-green');
}
