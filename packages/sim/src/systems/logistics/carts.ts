// Carts (docs/spec/13-ledger.md, Logistics; docs/build/i2-wave-notes.md, Carts share the roads).
// Each built cart shed keeps one cart. While its carter is at work, an idle cart takes a long haul
// from the same needs the porters match (logistics/index.ts): 8 to 16 units between buildings whose
// doors open onto a lane or street, at least CART_MIN_TRIP tiles apart, so porters keep the short
// hops and carts the long ones. Clearing a big producer's output to a far storehouse counts too.
// C4B's traffic system drives carts along the route requestCartMove plans; this module only picks
// up, delivers and sends them home, where they park (and are not drawn).
import { content } from '@qoti/content';
import { BuildingStatus, CART_CAPACITY } from '../../constants';
import type { Building, Cart, PorterJob, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import { cartAt, cartTile, requestCartMove } from '../traffic/api';
import { defOf, isStorage, isStorehouse, outputCap, storageSpace, stowNearest, tileDistance } from './stores';

/** A cart does not roll for less than this. */
export const CART_MIN_LOAD = 8;
/** Door to door, in tiles: shorter trips are porter work. */
export const CART_MIN_TRIP = 12;

/** Logistics' view of a building (kept in step with logistics/index.ts). */
export interface CartSpot {
  b: Building;
  rt: NonNullable<Building['rt']>;
  def: NonNullable<ReturnType<typeof defOf>>;
  door: number;
}

export interface CartNeed {
  dest: CartSpot;
  /** -1: any food (market stalls). */
  good: number;
  want: number;
  cls: number;
}

export interface CartHooks {
  sourceAvail(b: Building, def: CartSpot['def'], good: number): number;
  deliver(state: WorldState, ctx: TickCtx, job: PorterJob, dst: Building): void;
  stallOrder(rt: CartSpot['rt']): number[];
  clearingClass: number;
}

export function isCartShed(b: Building): boolean {
  return !!defOf(b)?.tags?.includes('cart-shed');
}

/** The cart's home tile: the shed's door, when it opens onto a lane or street. */
export function shedTile(state: WorldState, shed: Building): number {
  const door = doorTile(shed);
  return cartTile(state, door) ? door : -1;
}

/** Status bit for cart sheds: no cart road at the door. */
export function cartShedStatus(state: WorldState, b: Building): number {
  return isCartShed(b) && b.stage === 'built' && shedTile(state, b) < 0 ? BuildingStatus.noCartRoad : 0;
}

/**
 * One cart per built shed (created when the shed is done), and none for sheds that are gone; a
 * cart that loses its shed leaves its load at the nearest storehouse.
 */
export function keepCarts(state: WorldState): void {
  let kept = 0;
  const carts = state.carts;
  for (let i = 0; i < carts.length; i++) {
    const c = carts[i]!;
    const shed = findById(state.buildings, c.home);
    if (shed && shed.stage === 'built') {
      carts[kept++] = c;
      continue;
    }
    dropJob(state, c);
  }
  carts.length = kept;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !isCartShed(b) || carts.some((c) => c.home === b.id)) continue;
    const def = content.carts[0];
    if (!def) return;
    const cart: Cart = {
      id: state.nextId++,
      def: def.id,
      home: b.id,
      tile: doorTile(b),
      move: null,
      load: [],
      job: 0,
      dir: b.rot,
      parked: true,
    };
    carts.push(cart);
    carts.sort((a, b2) => a.id - b2.id);
  }
}

function capacityOf(c: Cart): number {
  return content.cartById.get(c.def)?.capacity ?? CART_CAPACITY;
}

/** A cart free for a new trip: in or at its shed, no job, its carter at work. */
function idle(state: WorldState, c: Cart): boolean {
  if (c.job || c.move) return false;
  const shed = findById(state.buildings, c.home);
  if (!shed?.rt || shed.rt.paused || shed.rt.present === 0) return false;
  const home = shedTile(state, shed);
  return home >= 0 && c.tile === home;
}

/** Matches idle carts to long hauls before porters take the rest (same needs, same reservations). */
export function matchCarts(
  state: WorldState,
  spots: readonly CartSpot[],
  needs: CartNeed[],
  hooks: CartHooks,
): void {
  if (state.carts.length === 0) return;
  const road = (s: CartSpot) => cartTile(state, s.door);
  for (const c of state.carts) {
    if (!idle(state, c)) continue;
    const cap = capacityOf(c);
    let best: {
      src: CartSpot;
      dest: CartSpot;
      good: number;
      need: CartNeed | null;
      cls: number;
      d: number;
    } | null = null;
    for (const need of needs) {
      if (need.want < CART_MIN_LOAD || !road(need.dest)) continue;
      if (best && need.cls > best.cls) continue;
      const goods = need.good >= 0 ? [need.good] : hooks.stallOrder(need.dest.rt);
      for (const g of goods) {
        for (const s of spots) {
          if (s === need.dest || !road(s)) continue;
          if (tileDistance(s.door, need.dest.door) < CART_MIN_TRIP) continue;
          if (hooks.sourceAvail(s.b, s.def, g) < CART_MIN_LOAD) continue;
          const d = tileDistance(c.tile, s.door);
          if (!best || need.cls < best.cls || d < best.d)
            best = { src: s, dest: need.dest, good: g, need, cls: need.cls, d };
        }
      }
    }
    if (!best) {
      // Clearing: a producer with a cartload waiting, to a storehouse well away.
      for (const s of spots) {
        if (s.b.stage !== 'built' || isStorage(s.def) || !road(s)) continue;
        for (let g = 0; g < s.rt.output.length; g++) {
          if (hooks.sourceAvail(s.b, s.def, g) < Math.min(CART_MIN_LOAD, outputCap(s.def))) continue;
          for (const t of spots) {
            if (t === s || t.b.stage !== 'built' || !isStorehouse(t.def) || !road(t)) continue;
            if (storageSpace(t.def, t.rt) < CART_MIN_LOAD || tileDistance(s.door, t.door) < CART_MIN_TRIP)
              continue;
            const d = tileDistance(c.tile, s.door);
            if (!best || d < best.d)
              best = { src: s, dest: t, good: g, need: null, cls: hooks.clearingClass, d };
          }
        }
      }
    }
    if (!best) continue;
    const g = best.good;
    let qty = Math.min(cap, hooks.sourceAvail(best.src.b, best.src.def, g));
    if (best.need) qty = Math.min(qty, best.need.want);
    if (isStorage(best.dest.def)) qty = Math.min(qty, storageSpace(best.dest.def, best.dest.rt));
    if (qty <= 0) continue;
    const lg = state.logistics;
    const job: PorterJob = {
      id: lg.nextJobId++,
      porter: c.id,
      from: best.src.b.id,
      to: best.dest.b.id,
      good: g,
      qty,
      stage: 0,
      priority: best.cls,
    };
    if (requestCartMove(state, c.id, best.src.door) === 'unreachable') continue;
    best.src.rt.reservedOut[g]! += qty;
    best.dest.rt.reservedIn[g]! += qty;
    if (best.need) best.need.want -= qty;
    lg.jobs.push(job);
    c.job = job.id;
  }
}

/** True when a logistics job belongs to a cart (its `porter` is a cart id). */
export function isCartJob(state: WorldState, job: PorterJob): boolean {
  return !!findById(state.carts, job.porter);
}

function release(job: PorterJob, src: Building | undefined, dst: Building | undefined): void {
  const g = job.good;
  if (job.stage === 0 && src?.rt) src.rt.reservedOut[g] = Math.max(0, src.rt.reservedOut[g]! - job.qty);
  if (dst?.rt) dst.rt.reservedIn[g] = Math.max(0, dst.rt.reservedIn[g]! - job.qty);
}

function goHome(state: WorldState, c: Cart): void {
  c.job = 0;
  c.load = [];
  const shed = findById(state.buildings, c.home);
  const home = shed ? shedTile(state, shed) : -1;
  if (home < 0 || c.tile === home) {
    c.move = null;
    c.parked = home >= 0;
    return;
  }
  // Cut off from its shed (a road went): the carter walks the pony home.
  if (requestCartMove(state, c.id, home) === 'unreachable') parkAt(c, home);
}

function parkAt(c: Cart, home: number): void {
  c.move = null;
  c.tile = home;
  c.parked = true;
}

/** A cart losing its job (its shed went): reservations released, the load stowed. */
function dropJob(state: WorldState, c: Cart): void {
  const jobs = state.logistics.jobs;
  const i = jobs.findIndex((j) => j.id === c.job);
  if (i >= 0) {
    const job = jobs[i]!;
    release(job, findById(state.buildings, job.from), findById(state.buildings, job.to));
    jobs.splice(i, 1);
  }
  for (const [g, q] of c.load) stowNearest(state, c.tile, g, q, 0);
  c.load = [];
  c.job = 0;
}

/**
 * Advances one cart job. False when it is over (delivered or abandoned); the cart then heads home.
 */
export function stepCartJob(state: WorldState, ctx: TickCtx, job: PorterJob, hooks: CartHooks): boolean {
  const c = findById(state.carts, job.porter)!;
  const src = findById(state.buildings, job.from);
  const dst = findById(state.buildings, job.to);
  if (job.stage === 0) {
    if (!src?.rt || !dst?.rt) {
      release(job, src, dst);
      goHome(state, c);
      return false;
    }
    const door = doorTile(src);
    if (!cartAt(state, c.id, door)) {
      if (c.move) return true;
      if (requestCartMove(state, c.id, door) === 'unreachable') {
        release(job, src, dst);
        goHome(state, c);
        return false;
      }
      return true;
    }
    const g = job.good;
    const pile = isStorage(defOf(src)) ? src.rt.store : src.rt.output;
    const got = Math.max(0, Math.min(job.qty, pile[g]!));
    pile[g]! -= got;
    src.rt.reservedOut[g] = Math.max(0, src.rt.reservedOut[g]! - job.qty);
    if (got < job.qty) dst.rt.reservedIn[g] = Math.max(0, dst.rt.reservedIn[g]! - (job.qty - got));
    job.qty = got;
    if (got === 0) {
      goHome(state, c);
      return false;
    }
    c.load = [[g, got]];
    job.stage = 1;
    requestCartMove(state, c.id, doorTile(dst));
    return true;
  }
  if (!dst?.rt) {
    stowNearest(state, c.tile, job.good, job.qty, 0);
    goHome(state, c);
    return false;
  }
  const door = doorTile(dst);
  if (!cartAt(state, c.id, door)) {
    if (c.move) return true;
    if (requestCartMove(state, c.id, door) === 'unreachable') {
      dst.rt.reservedIn[job.good] = Math.max(0, dst.rt.reservedIn[job.good]! - job.qty);
      stowNearest(state, c.tile, job.good, job.qty, dst.id);
      goHome(state, c);
      return false;
    }
    return true;
  }
  hooks.deliver(state, ctx, job, dst);
  goHome(state, c);
  return false;
}

/** Carts with no job: park once home, and drop a job that logistics cancelled. */
export function tickIdleCarts(state: WorldState): void {
  for (const c of state.carts) {
    if (c.job) {
      if (!state.logistics.jobs.some((j) => j.id === c.job)) goHome(state, c);
      continue;
    }
    if (c.parked || c.move) continue;
    const shed = findById(state.buildings, c.home);
    const home = shed ? shedTile(state, shed) : -1;
    if (home < 0) continue;
    if (c.tile === home) c.parked = true;
    else if (requestCartMove(state, c.id, home) === 'unreachable') parkAt(c, home);
  }
}
