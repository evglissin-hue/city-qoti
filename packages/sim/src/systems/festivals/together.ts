// Together moments (C5B; docs/spec/16-coop.md, Together moments): small cozy beats that happen only
// while both seats are connected (state.time.connected.length >= 2), counted in
// state.seasons.together. They never gate progress (P5) and never change an outcome: a valley with
// one seat runs exactly the same apart from the events and the counter.
// - dance: the festival's closing dance, at 21:00 on the festival evening.
// - fireworks: at 21:00 on an evening after a rank-up or a sealed Charter (a 'rank-up' or
//   'trial-passed' Chronicle entry in the last day).
// - stroll: an evening stroll, at 20:00 on day 3 of each season when the weather is clear or cloudy.
import { TICKS_PER_DAY } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';

export function bothConnected(state: WorldState): boolean {
  return state.time.connected.length >= 2;
}

/** Emits a together moment and counts it; false (and nothing at all) unless both seats are here. */
export function togetherMoment(state: WorldState, ctx: TickCtx, kind: string): boolean {
  if (!bothConnected(state)) return false;
  const list = state.seasons.together;
  const row = list.find(([k]) => k === kind);
  if (row) row[1] += 1;
  else {
    list.push([kind, 1]);
    list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  ctx.events.push({ e: 'together.moment', kind });
  return true;
}

/** How many of a kind have happened. */
export function togetherCount(state: WorldState, kind: string): number {
  return state.seasons.together.find(([k]) => k === kind)?.[1] ?? 0;
}

/** A rank-up or a sealed Charter in the last day (Chronicle entries are state, so both laptops agree). */
export function celebrationDue(state: WorldState): boolean {
  const since = state.tick - TICKS_PER_DAY;
  const c = state.chronicle;
  for (let i = c.length - 1; i >= 0; i--) {
    const e = c[i]!;
    if (e.tick <= since) break;
    if (e.kind === 'rank-up' || e.kind === 'trial-passed') return true;
  }
  return false;
}
