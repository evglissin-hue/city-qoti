// The carrier's cross-track API (docs/build/r1-wave-notes.md, Cross-track APIs). Signatures fixed by
// R1.0; R1A owns the insides. R1B's trade score, Farmland bar, foresters and status words, and R1F's
// audit read these. All cheap: no pass over the map, at most one over the buildings.
import { content } from '@qoti/content';
import { DAYS_PER_SEASON } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { familyIndex, methodOf } from '../../state/zones';
import { someoneSells } from './terms';

/** Units of a good (by index) the carrier bought over the last `days` days, today included. */
export function carrierBrought(state: WorldState, good: number, days: number): number {
  const rows = state.carrier.bought;
  let n = 0;
  for (let k = Math.max(0, rows.length - days); k < rows.length; k++) n += rows[k]![good] ?? 0;
  return n;
}

/** The closed pass's weather event id (content.events). */
export const PASS_EVENT = 'pass-closed';

/** True while snow closes the valley road: the carrier does not come (docs/spec/14-challenge.md). */
export function passClosed(state: WorldState): boolean {
  for (const v of state.weather.events) {
    if (v.event === PASS_EVENT && v.start <= state.tick && state.tick < v.end) return true;
  }
  return false;
}

/** True from Summer day 4 to the thaw (the end of winter): the winter marks stand. */
export function marksStand(state: WorldState): boolean {
  const { season, day } = seasonAt(state.tick);
  return (season === 1 && day >= 4 && day <= DAYS_PER_SEASON) || season === 2 || season === 3;
}

/** True from Autumn day 4 to the thaw: the carrier buys toward the marks, when the rules allow. */
export function buyingTowardMarks(state: WorldState): boolean {
  const { season, day } = seasonAt(state.tick);
  return (season === 2 && day >= 4) || season === 3;
}

/**
 * The season plan's winter mark for a family (GOOD_FAMILIES index), in days of use, from Summer
 * day 4 to the thaw (the river thaws on Spring day 1); null outside that stretch and for Materials,
 * which the carrier counts in units, not days.
 */
export function winterMark(state: WorldState, family: number): number | null {
  if (family === 2 || !marksStand(state)) return null;
  const plan = state.seasonPlan;
  if (family === 0) return plan.food ?? plan.reserve;
  if (family === 1) return plan.fuel ?? plan.reserve;
  return plan.reserve;
}

/**
 * The raw goods a building makes things from, when it is a maker (a craft method with inputs):
 * a baker's grain, a weaver's wool, the Brickworks' firewood. Empty for everything else.
 */
export function rawInputs(b: Pick<Building, 'def' | 'trade'>): number[] {
  const m = methodOf(b);
  if (!m || m.kind !== 'craft') return [];
  const out: number[] = [];
  for (const [id] of m.inputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) out.push(g);
  }
  return out;
}

/**
 * The family whose rule counts when a maker is short of its raw good: the family of what it makes
 * (a baker's grain comes under Food, a weaver's wool under Wares, the kiln's firewood under
 * Materials). Null when it makes nothing.
 */
export function makerFamily(b: Pick<Building, 'def' | 'trade'>): number | null {
  const out = methodOf(b)?.outputs[0]?.[0];
  const g = out === undefined ? undefined : content.goodById.get(out);
  return g ? familyIndex(g.family) : null;
}

/**
 * True when the carrier may bring this maker's raw good (by index) next morning: the rule for the
 * family of what it makes is not Never and some neighbor sells the good. The audit's "while its
 * family's rule lets the carrier buy" (R1F), and the status line's "the carrier brings some at ten".
 */
export function carrierCovers(state: WorldState, b: Pick<Building, 'def' | 'trade'>, good: number): boolean {
  const f = makerFamily(b);
  if (f === null || state.carrier.families[f]?.rule === 'never') return false;
  return someoneSells(state, good);
}
