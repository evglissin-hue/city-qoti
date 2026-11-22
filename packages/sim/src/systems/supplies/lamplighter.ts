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

/** A lamplighter at the settling: who, and the tile he sets out from (where he stands at 17:30). */
export interface Walker {
  id: EntityId;
  tile: number;
}

/**
 * Tonight's lamps (sorted by id) with the tick each comes on. Each lamplighter (in id order) sets out
 * from where he stands and goes to the nearest lamp nobody has taken yet (the kept ones first while
 * he can reach one; ties by id), at `SUPPLIES.walkTicks` a tile, a moment (`lightTicks`) to take up
 * his pole and as long at each lamp, until the next would come after `litHour`. A lamp he reaches
 * comes on then and carries his `by` (lamps on one tile share the tick); every other lamp comes on at
 * `litHour` sharp with the town, as all do with nobody in the job. So every reach lies between the
 * settling and `litHour`: the walk is there to be watched, and the rules never wait for it. Only the
 * lamps he reaches are planned, so a City's settling stays cheap.
 */
export function walkLamps(
  lit: readonly LitLantern[],
  walkers: readonly Walker[],
  night: number,
): LampState[] {
  const S = content.supplies;
  const litTick = tickAt(night, S.litHour);
  const out: LampState[] = lit.map((l) => ({ id: l.id, reach: litTick }));
  if (walkers.length > 0 && lit.length > 0) {
    const settle = settleTick(night);
    const pace = S.walkTicks ?? 5;
    const taken = new Uint8Array(lit.length);
    let keptLeft = 0;
    for (const l of lit) if (l.rank >= Rank.keep) keptLeft++;
    // The nearest lamp not taken (only kept ones when `kept`), ties by id; -1 when none.
    const nearest = (at: number, kept: boolean): number => {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < lit.length; i++) {
        const l = lit[i]!;
        if (taken[i] || (kept && l.rank < Rank.keep)) continue;
        const d = tileDist(at, l.tile);
        if (d < bestD || (d === bestD && l.id < lit[best]!.id)) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };
    for (const w of walkers) {
      let at = w.tile;
      // He takes up the candles and his pole first (and sets off at his next thought).
      let cum = S.lightTicks;
      let last = -1;
      for (;;) {
        // When the lamp lands: on the tile he stands at, with the last one; else after the steps there.
        const when = (i: number): number => {
          const steps = tileDist(at, lit[i]!.tile);
          if (steps === 0 && last >= 0) return last;
          return (last >= 0 ? cum + S.lightTicks : cum) + steps * pace;
        };
        let pick = keptLeft > 0 ? nearest(at, true) : -1;
        if (pick >= 0 && settle + when(pick) >= litTick) pick = -1;
        if (pick < 0) pick = nearest(at, false);
        if (pick < 0 || settle + when(pick) >= litTick) break;
        const t = when(pick);
        if (t !== last) cum = t;
        last = t;
        taken[pick] = 1;
        if (lit[pick]!.rank >= Rank.keep) keptLeft--;
        out[pick] = { id: lit[pick]!.id, reach: settle + t, by: w.id };
        at = lit[pick]!.tile;
      }
    }
  }
  return out.sort((x, y) => x.id - y.id);
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
