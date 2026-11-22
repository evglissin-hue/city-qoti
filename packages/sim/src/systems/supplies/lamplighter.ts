// The lamplighter's round (R3A; docs/spec/19-evenings.md, Supplies): from the settling (17:30) he takes
// the night's candles from the nearest storehouse and walks the lanterns, the places kept first, nearest
// first, each lamp coming on as he reaches it (`LampState.reach`). A schedule override puts the residents
// holding the job on their round (registered in residents/overrides.ts, priority 60), returning at once
// for anyone not a lamplighter (every override costs every resident a call); the walk is there to be
// watched, and the rules never wait for it.
import { content } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Activity, EntityId, LampState, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { rankAtLeast } from '../../state/village';
import { Kind, Rank, pieceTile, suppliedIndex, tileDist } from './pieces';

/** A lantern given a candle at the settling, in the settled order (keep first, then as it comes; nearest first; ties by id). */
export interface LitLantern {
  id: EntityId;
  tile: number;
  /** Its rank (pieces.ts Rank): the walk takes the kept ones first. */
  rank: number;
}

/** The absolute tick of `hour`:`minute` on day index `day`. */
function tickAt(day: number, hour: number, minute = 0): number {
  return (
    day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR + Math.floor((minute * TICKS_PER_HOUR) / 60)
  );
}

/** The tick the settling runs on night `night`. */
function settleTick(night: number): number {
  return tickAt(night, content.supplies.settleHour, content.supplies.settleMinute);
}

/** A greedy nearest-next walk over `group` from tile `from` (ties by id), appended to `out`. */
function walkOrder(group: LitLantern[], from: number, out: LitLantern[]): number {
  const left = group.slice().sort((a, b) => a.id - b.id);
  let at = from;
  while (left.length > 0) {
    let best = 0;
    let bestD = tileDist(at, left[0]!.tile);
    for (let i = 1; i < left.length; i++) {
      const d = tileDist(at, left[i]!.tile);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const [next] = left.splice(best, 1);
    out.push(next!);
    at = next!.tile;
  }
  return at;
}

/** A lamplighter at the settling: who, and the tile he sets out from (where he stands at 17:30). */
export interface Walker {
  id: EntityId;
  tile: number;
}

/**
 * Tonight's lamps (sorted by id) with the tick each is reached. The lit lanterns are shared among the
 * `walkers` (the lamplighters, by id) in contiguous runs of the town's walking order from `start` (the
 * storehouse the candles came from: the kept lanterns first, then the rest, each walked nearest-next);
 * each walks his own run from where he stands, the kept ones first, nearest-next, at
 * `SUPPLIES.walkTicks` a tile and `lightTicks` at each lamp (and as long to take up his pole). A lamp he reaches before `litHour` comes
 * on then (lamps on one tile share the tick); the rest of his run comes on at `litHour` sharp with the
 * town, as every lamp does with nobody in the job (and then no `by`). So every reach lies between the
 * settling and `litHour`: the walk is there to be watched, and the rules never wait for it.
 */
export function walkLamps(
  lit: readonly LitLantern[],
  start: number,
  walkers: readonly Walker[],
  night: number,
): LampState[] {
  const S = content.supplies;
  const lampOut: LampState[] = [];
  const litTick = tickAt(night, S.litHour);
  if (walkers.length === 0) {
    for (const l of lit) lampOut.push({ id: l.id, reach: litTick });
    return lampOut.sort((a, b) => a.id - b.id);
  }
  // The town's walking order, shared out in contiguous runs (the first runs one longer).
  const order: LitLantern[] = [];
  const at = walkOrder(
    lit.filter((l) => l.rank >= Rank.keep),
    start,
    order,
  );
  walkOrder(
    lit.filter((l) => l.rank < Rank.keep),
    at,
    order,
  );
  const settle = settleTick(night);
  const pace = S.walkTicks ?? 5;
  const k = walkers.length;
  const base = Math.floor(order.length / k);
  const extra = order.length % k;
  let from = 0;
  for (let h = 0; h < k; h++) {
    const n = base + (h < extra ? 1 : 0);
    const run = order.slice(from, from + n);
    from += n;
    const w = walkers[h]!;
    // His own walk over his run, from where he stands: the kept ones first, nearest-next.
    const route: LitLantern[] = [];
    const then = walkOrder(
      run.filter((l) => l.rank >= Rank.keep),
      w.tile,
      route,
    );
    walkOrder(
      run.filter((l) => l.rank < Rank.keep),
      then,
      route,
    );
    // He takes up the candles and his pole first (and sets off at his next thought).
    let cum = S.lightTicks;
    let prev = w.tile;
    let last = -1;
    for (const l of route) {
      const steps = tileDist(prev, l.tile);
      // A second lamp on the same tile is lit in the same breath.
      if (steps > 0 || last < 0) {
        if (last >= 0) cum += S.lightTicks;
        cum += steps * pace;
        last = settle + cum;
      }
      lampOut.push({ id: l.id, reach: last < litTick ? last : litTick, by: w.id });
      prev = l.tile;
    }
  }
  return lampOut.sort((a, b) => a.id - b.id);
}

/** Lamplighter jobs the town has now: the ceiling of tonight's lamps over 40, at least one from Village rank once a lantern stands. */
export function lamplighterJobs(state: WorldState): number {
  if (!rankAtLeast(state, content.supplies.fromRank)) return 0;
  const ix = suppliedIndex(state);
  if (!ix.kind.includes(Kind.nightly)) return 0;
  return Math.max(1, Math.ceil(state.supplies.lamps.length / content.supplies.lanternsPerLamplighter));
}

/** True when `id` is on the sorted list. */
function holds(list: readonly EntityId[], id: EntityId): boolean {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid]!;
    if (v === id) return true;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/**
 * Where a lamplighter is bound this tick: the next lamp of his he reaches before `litHour` (by reach,
 * then id), staying at each for `lightTicks`; null off his round (not a lamplighter, before the
 * settling, after his last such lamp, or with none he can reach before the town lights up).
 */
function roundTarget(state: WorldState, r: Resident): { tile: number } | null {
  const sup = state.supplies;
  if (!holds(sup.lamplighters, r.id) || sup.night < 0) return null;
  const tick = state.tick;
  if (tick < settleTick(sup.night)) return null;
  const litTick = tickAt(sup.night, content.supplies.litHour);
  const lightTicks = content.supplies.lightTicks;
  let target: LampState | null = null;
  let any = false;
  for (const l of sup.lamps) {
    if (l.by !== r.id || l.reach >= litTick) continue;
    any = true;
    if (l.reach + lightTicks <= tick) continue;
    if (!target || l.reach < target.reach || (l.reach === target.reach && l.id < target.id)) target = l;
  }
  if (!any || !target) return null;
  const d = findById(state.decor, target.id);
  return d ? { tile: pieceTile(d) } : null;
}

/** The agent row's lamplighter bits: 0 not on his round, 1 walking it, 2 lighting a lamp. */
export function lamplighterPose(state: WorldState, r: Resident): number {
  const t = roundTarget(state, r);
  if (!t) return 0;
  return !r.move && r.tile === t.tile ? 2 : 1;
}

/** The schedule override: what a lamplighter does this hour, or null for the day table. */
export function lamplighterRound(state: WorldState, r: Resident, _hour: number): Activity | null {
  if (state.supplies.lamplighters.length === 0) return null;
  const t = roundTarget(state, r);
  return t ? { kind: 'leisure', tile: t.tile } : null;
}
