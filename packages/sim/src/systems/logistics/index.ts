// Porters (docs/spec/13-ledger.md, Logistics). Every PORTER_MATCH_EVERY ticks during work hours,
// each idle porter in id order takes the best job in reach of its storehouse:
//
//   priority construction > food to stalls > production inputs and construction (nearest first,
//   C4X) > clearing outputs
//
// with ties going to the nearest source. A job reserves goods at the source (reservedOut) and
// room at the destination (reservedIn), so nothing is promised twice. Trips walk through the
// movement API and never assume arrival in the same tick.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { PORTER_CARRY, PORTER_MATCH_EVERY, STALL_RESTOCK_TARGET } from '../../constants';
import type {
  Building,
  BuildingRuntime,
  EntityId,
  PorterJob,
  Resident,
  System,
  TickCtx,
  WorldState,
} from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { constructionStage } from '../../view/hamlet';
import { emitBuilding } from '../economy/emit';
import { isBuildTime, tickOfDay } from '../economy/time';
import { doorTile } from '../movement/api';
import { pathBetween } from '../movement/paths';
import { adoptStrays, staffed, storehouseReach, within, type Reach } from './range';
import {
  defOf,
  foodIncoming,
  isMarket,
  isStorage,
  isStorehouse,
  outputCap,
  storageSpace,
  stowNearest,
  tileDistance,
} from './stores';
import { deliverUpgrade } from '../tiers/api';
import { isCartJob, keepCarts, matchCarts, stepCartJob, tickIdleCarts, type CartHooks } from './carts';
import { available, finishTask, startTask, tickReturning, walkTo } from './tasks';

/** Job classes in matching order: lower is more urgent (PorterJob.priority). */
export const JobClass = { prioritySite: 0, stallFood: 1, input: 2, site: 3, clearing: 4 } as const;

/** Production inputs are topped up to this many cycles' worth. */
export const INPUT_TARGET_CYCLES = 2;

const MATCH_OFFSET = 5;
const NO_CLASS = 99;

const FOOD_GOODS: readonly number[] = content.goods.flatMap((g, i) => (g.food ? [i] : []));

interface Spot {
  b: Building;
  def: BuildingDef;
  rt: BuildingRuntime;
  door: number;
}

/** A destination wanting goods. good -1: any food (market stalls choose for variety). */
interface Need {
  dest: Spot;
  good: number;
  want: number;
  cls: number;
}

export const logistics: System = {
  id: 'logistics',
  order: 40,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const workTime = isBuildTime(state.tick);
    if (state.logistics.jobs.length > 0) tickJobs(state, ctx, workTime);
    tickReturning(state, workTime);
    // I2 (C4C): one cart per cart shed, parked when idle.
    if (state.tick % PORTER_MATCH_EVERY === MATCH_OFFSET) keepCarts(state);
    if (state.carts.length > 0) tickIdleCarts(state);
    if (workTime && state.tick % PORTER_MATCH_EVERY === MATCH_OFFSET) matchPorters(state);
    if (tickOfDay(state.tick) === 0) decayFlows(state);
  },
};

/**
 * Capability id the Wheelbarrows innovation unlocks. C4X: a wheelbarrow doubles a porter's load to 8
 * (the id keeps its I2 contract name): a Village's porters were a third of its workforce at 6.
 */
export const WHEELBARROW = 'porter-carry-6';
export const WHEELBARROW_CARRY = 8;

/** Units a porter carries of a good: its `carry`, or 8 once the town has wheelbarrows. */
export function carryOf(state: WorldState, good: number): number {
  const carry = content.goods[good]?.carry ?? PORTER_CARRY;
  return state.hearth.unlocked.includes(WHEELBARROW) ? Math.max(carry, WHEELBARROW_CARRY) : carry;
}

function spotsOf(state: WorldState): Spot[] {
  const out: Spot[] = [];
  for (const b of state.buildings) {
    const def = defOf(b);
    if (!b.rt || !def) continue;
    const door = doorTile(b, def);
    // C4C: a door that opens onto the river (a fisher's hut turned the wrong way) can never be
    // walked to; matching it would send porters on the same failed trip every round while other
    // sites wait (a Village autoplay stalled on two such huts).
    if (state.map.water[door]) continue;
    out.push({ b, def, rt: b.rt, door });
  }
  return out;
}

/** Units a porter may pick up here: storehouse stock or a producer's output. Stalls keep theirs. */
export function sourceAvail(b: Building, def: BuildingDef | undefined, good: number): number {
  const rt = b.rt;
  if (!rt || b.stage !== 'built') return 0;
  if (isStorehouse(def)) return (rt.store[good] ?? 0) - (rt.reservedOut[good] ?? 0);
  if (isStorage(def)) return 0;
  return (rt.output[good] ?? 0) - (rt.reservedOut[good] ?? 0);
}

function needsOf(spots: readonly Spot[]): Need[] {
  const out: Need[] = [];
  for (const s of spots) {
    const { b, def, rt } = s;
    const c = rt.construction;
    if (b.stage === 'construction') {
      if (!c || rt.paused) continue;
      for (let g = 0; g < c.needs.length; g++) {
        const want = c.needs[g]! - rt.reservedIn[g]!;
        if (want > 0)
          out.push({ dest: s, good: g, want, cls: c.priority ? JobClass.prioritySite : JobClass.site });
      }
      continue;
    }
    // I2 (C4C): a home upgrading to the next tier waits for its materials like a site.
    if (rt.upgrade) {
      for (let g = 0; g < rt.upgrade.length; g++) {
        const want = rt.upgrade[g]! - rt.reservedIn[g]!;
        if (want > 0) out.push({ dest: s, good: g, want, cls: JobClass.site });
      }
      continue;
    }
    if (isMarket(def)) {
      const want = Math.min(STALL_RESTOCK_TARGET - foodIncoming(rt), storageSpace(def, rt));
      if (want > 0) out.push({ dest: s, good: -1, want, cls: JobClass.stallFood });
      continue;
    }
    const method = def.methods?.[rt.method];
    if (rt.paused || !method || method.kind !== 'craft') continue;
    for (const [id, qty] of method.inputs) {
      const g = content.goodIndex.get(id);
      if (g === undefined) continue;
      const want = INPUT_TARGET_CYCLES * qty - rt.input[g]! - rt.reservedIn[g]!;
      if (want > 0) out.push({ dest: s, good: g, want, cls: JobClass.input });
    }
  }
  return out;
}

/** Food goods in the order a stall wants them: what it holds least of first (variety). */
function stallOrder(rt: BuildingRuntime): number[] {
  return [...FOOD_GOODS].sort(
    (a, b) => rt.store[a]! + rt.reservedIn[a]! - (rt.store[b]! + rt.reservedIn[b]!) || a - b,
  );
}

function matchPorters(state: WorldState): void {
  const reaches = storehouseReach(state);
  const idle: { r: Resident; reach: Reach }[] = [];
  for (const reach of reaches) {
    // A paused storehouse keeps its porters indoors.
    if (reach.b.rt!.paused) continue;
    for (const id of reach.b.rt!.workers) {
      const r = findById(state.residents, id);
      if (r && available(r, reach.b)) idle.push({ r, reach });
    }
  }
  if (idle.length === 0 && state.carts.length === 0) return;
  idle.sort((a, b) => a.r.id - b.r.id);
  const spots = spotsOf(state);
  adoptStrays(
    reaches,
    spots.map((s) => s.door),
  );
  const needs = needsOf(spots);
  // Carts take the long hauls first; porters share what is left (same needs, same reservations).
  if (state.carts.length > 0) matchCarts(state, spots, needs, CART_HOOKS);
  for (const { r, reach } of idle) assign(state, spots, needs, r, reach, reaches);
}

/** Finds the best job for one porter and starts it. */
function assign(
  state: WorldState,
  spots: readonly Spot[],
  needs: Need[],
  r: Resident,
  reach: Reach,
  reaches: readonly Reach[],
  tries = 0,
): void {
  const from = r.inside ? reach.door : r.tile;
  let bestCls: number = NO_CLASS;
  let bestD = Infinity;
  let bestNeed: Need | null = null;
  let bestSrc: Spot | null = null;
  let bestDest: Spot | null = null;
  let bestGood = -1;

  // C4X: from Village rank, sites and workshop inputs share a class (the nearer source wins; among
  // sites the oldest, so they finish one at a time). With inputs strictly first, a busy Village
  // always had some workshop wanting logs, and its sites waited for good (a tavern stood at 0 of 42
  // materials for weeks with 69 bricks and 121 planks in store). A Hamlet keeps I1's order, which
  // its first evenings are tuned to.
  const fair = rankAtLeast(state, 'village');
  for (const need of needs) {
    const cls = fair && need.cls === JobClass.site ? JobClass.input : need.cls;
    if (need.want <= 0 || cls > bestCls || !within(reach, need.dest.door)) continue;
    const goods = need.good >= 0 ? [need.good] : stallOrder(need.dest.rt);
    for (const g of goods) {
      let found = false;
      for (const s of spots) {
        if (s === need.dest || sourceAvail(s.b, s.def, g) <= 0 || !within(reach, s.door)) continue;
        found = true;
        const d = tileDistance(from, s.door);
        if (cls < bestCls || d < bestD) {
          bestCls = cls;
          bestD = d;
          bestNeed = need;
          bestSrc = s;
          bestDest = need.dest;
          bestGood = g;
        }
      }
      // A stall takes the food it lacks most, even when another kind sits closer.
      if (found && need.good < 0) break;
    }
  }

  if (!bestNeed) {
    // I2 (C4C): a relay. A need beyond this storehouse's reach, at a place another storehouse
    // reaches, gets the goods carried to that storehouse when it holds too few: its own porters
    // take them on. Without it, goods piled at one end of a long village never reach a site at the
    // other (a Village autoplay deadlocked with 400 planks in store and three sites waiting).
    const relay = findRelay(state, spots, needs, reach, reaches, from);
    if (relay) {
      bestCls = JobClass.clearing;
      bestNeed = relay.need;
      bestSrc = relay.src;
      bestDest = relay.dest;
      bestGood = relay.good;
    }
  }

  if (!bestNeed) {
    // Clearing outputs: a full enough output buffer goes to the nearest storehouse with room.
    for (const s of spots) {
      if (s.b.stage !== 'built' || isStorage(s.def) || !within(reach, s.door)) continue;
      const min = Math.min(PORTER_CARRY, outputCap(s.def));
      for (let g = 0; g < s.rt.output.length; g++) {
        if (sourceAvail(s.b, s.def, g) < min) continue;
        const d = tileDistance(from, s.door);
        if (d >= bestD) continue;
        const dest = nearestStorehouse(spots, reach, s);
        if (!dest) continue;
        bestCls = JobClass.clearing;
        bestD = d;
        bestSrc = s;
        bestDest = dest;
        bestGood = g;
      }
    }
  }
  if (!bestSrc || !bestDest || bestGood < 0) return;
  // I2 (C4C): a destination porters cannot walk to from the source (a site across the river with
  // no bridge) is dropped for this round, so it cannot hold up every other job.
  if (bestSrc.door !== bestDest.door && !pathBetween(state, bestSrc.door, bestDest.door)) {
    if (!bestNeed || tries >= 4) return;
    bestNeed.want = 0;
    assign(state, spots, needs, r, reach, reaches, tries + 1);
    return;
  }

  const g = bestGood;
  let qty = Math.min(carryOf(state, g), sourceAvail(bestSrc.b, bestSrc.def, g));
  if (bestNeed) qty = Math.min(qty, bestNeed.want);
  if (isStorage(bestDest.def)) qty = Math.min(qty, storageSpace(bestDest.def, bestDest.rt));
  if (qty <= 0) return;

  const lg = state.logistics;
  const job: PorterJob = {
    id: lg.nextJobId++,
    porter: r.id,
    from: bestSrc.b.id,
    to: bestDest.b.id,
    good: g,
    qty,
    stage: 0,
    priority: bestCls,
  };
  bestSrc.rt.reservedOut[g]! += qty;
  bestDest.rt.reservedIn[g]! += qty;
  if (bestNeed) bestNeed.want -= qty;
  lg.jobs.push(job);
  if (startTask(state, r, job.id, bestSrc.door) === 'unreachable') {
    unreserve(job, bestSrc.b, bestDest.b);
    lg.jobs.pop();
    finishTask(state, r, false);
  }
}

/**
 * A relay job for a porter of `reach`: an open need outside its range whose destination another
 * storehouse in its range reaches, that storehouse short of the good, and a source in range.
 */
function findRelay(
  _state: WorldState,
  spots: readonly Spot[],
  needs: readonly Need[],
  reach: Reach,
  reaches: readonly Reach[],
  from: number,
): { need: Need; src: Spot; dest: Spot; good: number } | null {
  for (const need of needs) {
    if (need.want <= 0 || need.good < 0 || within(reach, need.dest.door)) continue;
    const g = need.good;
    for (const other of reaches) {
      if (other.b === reach.b || !staffed(other) || !within(reach, other.door)) continue;
      if (!within(other, need.dest.door)) continue;
      const dest = spots.find((s) => s.b === other.b);
      if (!dest || storageSpace(dest.def, dest.rt) <= 0) continue;
      if (dest.rt.store[g]! + dest.rt.reservedIn[g]! - dest.rt.reservedOut[g]! >= need.want) continue;
      let src: Spot | null = null;
      let bestD = Infinity;
      for (const s of spots) {
        if (s === dest || s === need.dest || sourceAvail(s.b, s.def, g) <= 0 || !within(reach, s.door))
          continue;
        const d = tileDistance(from, s.door);
        if (d < bestD) {
          bestD = d;
          src = s;
        }
      }
      if (src) return { need, src, dest, good: g };
    }
  }
  return null;
}

function nearestStorehouse(spots: readonly Spot[], reach: Reach, src: Spot): Spot | null {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of spots) {
    if (s === src || s.b.stage !== 'built' || !isStorehouse(s.def)) continue;
    if (storageSpace(s.def, s.rt) <= 0 || !within(reach, s.door)) continue;
    const d = tileDistance(src.door, s.door);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function tickJobs(state: WorldState, ctx: TickCtx, workTime: boolean): void {
  const jobs = state.logistics.jobs;
  let kept = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const going = isCartJob(state, job)
      ? stepCartJob(state, ctx, job, CART_HOOKS)
      : stepJob(state, ctx, job, workTime);
    if (going) jobs[kept++] = job;
  }
  jobs.length = kept;
}

/** Advances one trip. False when the job is over (delivered or abandoned). */
function stepJob(state: WorldState, ctx: TickCtx, job: PorterJob, workTime: boolean): boolean {
  const r = findById(state.residents, job.porter);
  const src = findById(state.buildings, job.from);
  const dst = findById(state.buildings, job.to);
  if (!r) {
    abandon(state, job, src, dst);
    return false;
  }
  if (job.stage === 0) {
    if (!src?.rt || !dst?.rt) {
      abandon(state, job, src, dst);
      finishTask(state, r, workTime);
      return false;
    }
    const at = walkTo(state, r, doorTile(src));
    if (at === null) {
      abandon(state, job, src, dst);
      finishTask(state, r, workTime);
      return false;
    }
    if (!at) return true;
    const g = job.good;
    const pile = isStorage(defOf(src)) ? src.rt.store : src.rt.output;
    const got = Math.max(0, Math.min(job.qty, pile[g]!));
    pile[g]! -= got;
    src.rt.reservedOut[g] = Math.max(0, src.rt.reservedOut[g]! - job.qty);
    if (got < job.qty) dst.rt.reservedIn[g] = Math.max(0, dst.rt.reservedIn[g]! - (job.qty - got));
    job.qty = got;
    if (got === 0) {
      finishTask(state, r, workTime);
      return false;
    }
    r.carry = [g, got];
    job.stage = 1;
    walkTo(state, r, doorTile(dst));
    return true;
  }
  if (!dst?.rt) {
    stowNearest(state, r.tile, job.good, job.qty, 0);
    finishTask(state, r, workTime);
    return false;
  }
  const at = walkTo(state, r, doorTile(dst));
  if (at === null) {
    dst.rt.reservedIn[job.good] = Math.max(0, dst.rt.reservedIn[job.good]! - job.qty);
    stowNearest(state, r.tile, job.good, job.qty, dst.id);
    finishTask(state, r, workTime);
    return false;
  }
  if (!at) return true;
  deliver(state, ctx, job, dst);
  finishTask(state, r, workTime);
  return false;
}

function deliver(state: WorldState, ctx: TickCtx, job: PorterJob, dst: Building): void {
  const rt = dst.rt!;
  const g = job.good;
  const n = job.qty;
  rt.reservedIn[g] = Math.max(0, rt.reservedIn[g]! - n);
  const c = rt.construction;
  if (dst.stage === 'construction' && c) {
    const before = constructionStage(rt);
    const used = Math.min(n, c.needs[g]!);
    c.needs[g]! -= used;
    c.delivered[g]! += used;
    const e = state.economy;
    e.today.consumed[g]! += used;
    e.season.consumed[g]! += used;
    if (n > used) stowNearest(state, doorTile(dst), g, n - used, dst.id);
    if (constructionStage(rt) !== before) emitBuilding(state, ctx, dst);
  } else if (rt.upgrade) {
    const used = deliverUpgrade(state, ctx, dst, g, n);
    if (n > used) stowNearest(state, doorTile(dst), g, n - used, dst.id);
  } else if (isStorage(defOf(dst))) {
    rt.store[g]! += n;
  } else {
    rt.input[g]! += n;
  }
  addFlow(state, job.from, job.to, n);
}

const CART_HOOKS: CartHooks = {
  sourceAvail,
  deliver,
  stallOrder,
  clearingClass: JobClass.clearing,
};

function unreserve(job: PorterJob, src: Building | undefined, dst: Building | undefined): void {
  const g = job.good;
  if (job.stage === 0 && src?.rt) src.rt.reservedOut[g] = Math.max(0, src.rt.reservedOut[g]! - job.qty);
  if (dst?.rt) dst.rt.reservedIn[g] = Math.max(0, dst.rt.reservedIn[g]! - job.qty);
}

/** Drops a job whose porter is gone: reservations released, carried goods back to a storehouse. */
function abandon(
  state: WorldState,
  job: PorterJob,
  src: Building | undefined,
  dst: Building | undefined,
): void {
  unreserve(job, src, dst);
  if (job.stage === 1) {
    const at = src ? doorTile(src) : dst ? doorTile(dst) : 0;
    stowNearest(state, at, job.good, job.qty, 0);
  }
}

/**
 * Cancels or reroutes the porter jobs touching a building that is about to be removed
 * (refundRemoval). Goods already carried toward it go to the nearest other storehouse instead.
 */
export function cancelJobsFor(state: WorldState, id: EntityId, workTime: boolean): void {
  const jobs = state.logistics.jobs;
  let kept = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const touches = job.from === id || job.to === id;
    if (!touches || (job.stage === 1 && job.from === id && job.to !== id)) {
      jobs[kept++] = job;
      continue;
    }
    const src = findById(state.buildings, job.from);
    const dst = findById(state.buildings, job.to);
    const r = findById(state.residents, job.porter);
    if (job.stage === 1 && job.to === id && r) {
      const next = rerouteTarget(state, r.tile, job.qty, id);
      if (next) {
        job.to = next.id;
        next.rt!.reservedIn[job.good]! += job.qty;
        walkTo(state, r, doorTile(next));
        jobs[kept++] = job;
        continue;
      }
    }
    abandon(state, job, src, dst);
    if (r) finishTask(state, r, workTime);
  }
  jobs.length = kept;
}

function rerouteTarget(state: WorldState, tile: number, qty: number, exclude: EntityId): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of state.buildings) {
    if (b.id === exclude || b.stage !== 'built' || !b.rt) continue;
    const def = defOf(b);
    if (!isStorehouse(def) || storageSpace(def, b.rt) < qty) continue;
    const d = tileDistance(tile, doorTile(b, def));
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function addFlow(state: WorldState, from: EntityId, to: EntityId, units: number): void {
  const flows = state.logistics.flows;
  for (const f of flows) {
    if (f[0] === from && f[1] === to) {
      f[2] += units;
      return;
    }
  }
  flows.push([from, to, units]);
  flows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * At midnight flows halve, so the overlay weighs recent days most (a decaying count of about two
 * days of deliveries). Pairs that fade out or lost a building drop off.
 */
function decayFlows(state: WorldState): void {
  const flows = state.logistics.flows;
  let kept = 0;
  for (let i = 0; i < flows.length; i++) {
    const f = flows[i]!;
    f[2] = Math.floor(f[2] / 2);
    if (f[2] > 0 && findById(state.buildings, f[0]) && findById(state.buildings, f[1])) flows[kept++] = f;
  }
  flows.length = kept;
}
