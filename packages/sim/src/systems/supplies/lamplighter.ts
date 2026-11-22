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

/**
 * Tonight's lamps (sorted by id) with the tick each is reached: the walk from `start` (the storehouse
 * the candles came from) split among `held` (the lamplighters, sorted), each lamp's `by` set; with
 * nobody holding the job every lamp comes on at `litHour` sharp and has no `by`. `night` is the day
 * index settled.
 */
export function walkLamps(
  lit: readonly LitLantern[],
  start: number,
  held: readonly EntityId[],
  night: number,
): LampState[] {
  const S = content.supplies;
  const lampOut: LampState[] = [];
  if (held.length === 0) {
    const reach = tickAt(night, S.litHour);
    for (const l of lit) lampOut.push({ id: l.id, reach });
    return lampOut.sort((a, b) => a.id - b.id);
  }
  // The walking order: the kept lanterns first, then the rest, each walked nearest-next.
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
  const span = tickAt(night, S.litHour) - settle;
  const k = held.length;
  const base = Math.floor(order.length / k);
  const extra = order.length % k;
  let from = 0;
  for (let h = 0; h < k; h++) {
    const n = base + (h < extra ? 1 : 0);
    const run = order.slice(from, from + n);
    from += n;
    // Walk the run from the start: each lamp is reached after the steps to it, then lit.
    const raw: number[] = [];
    let cum = 0;
    let prev = start;
    for (const l of run) {
      cum += tileDist(prev, l.tile) * S.walkTicks!;
      raw.push(cum);
      cum += S.lightTicks;
      prev = l.tile;
    }
    const total = raw.length > 0 ? raw[raw.length - 1]! : 0;
    run.forEach((l, i) => {
      const t = total > span ? Math.floor((raw[i]! * span) / total) : raw[i]!;
      lampOut.push({ id: l.id, reach: settle + t, by: held[h]! });
    });
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

/** Where a lamplighter is bound this tick: the lamp he is at (or on his way to), or null off his round. */
function roundTarget(state: WorldState, r: Resident): { tile: number } | null {
  const sup = state.supplies;
  if (!holds(sup.lamplighters, r.id) || sup.night < 0) return null;
  const tick = state.tick;
  if (tick < settleTick(sup.night)) return null;
  const mine: LampState[] = [];
  for (const l of sup.lamps) if (l.by === r.id) mine.push(l);
  if (mine.length === 0) return null;
  mine.sort((a, b) => a.reach - b.reach || a.id - b.id);
  const lightTicks = content.supplies.lightTicks;
  const last = mine[mine.length - 1]!;
  const end = Math.min(last.reach + lightTicks, tickAt(sup.night, content.supplies.litHour) + TICKS_PER_HOUR);
  if (tick >= end) return null;
  let target = last;
  for (const l of mine) {
    if (l.reach + lightTicks > tick) {
      target = l;
      break;
    }
  }
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
