// The carrier's cross-track API (docs/build/r1-wave-notes.md, Cross-track APIs). Signatures fixed by
// R1.0; R1A owns the insides. R1B's trade score and Farmland bar, and R1F's audit, read these.
import { DAYS_PER_SEASON } from '../../constants';
import type { WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';

/** Units of a good (by index) the carrier bought over the last `days` days, today included. */
export function carrierBrought(state: WorldState, good: number, days: number): number {
  const rows = state.carrier.bought;
  let n = 0;
  for (let k = Math.max(0, rows.length - days); k < rows.length; k++) n += rows[k]![good] ?? 0;
  return n;
}

/**
 * The season plan's winter mark for a family (GOOD_FAMILIES index), in days, from Summer day 4 to
 * the end of winter; null outside that stretch. R1 stand-in (R1A): "to the thaw" is read as the end
 * of winter, and Materials have a mark like the rest.
 */
export function winterMark(state: WorldState, family: number): number | null {
  const { season, day } = seasonAt(state.tick);
  const on = (season === 1 && day >= 4 && day <= DAYS_PER_SEASON) || season === 2 || season === 3;
  if (!on) return null;
  const plan = state.seasonPlan;
  if (family === 0) return plan.food ?? plan.reserve;
  if (family === 1) return plan.fuel ?? plan.reserve;
  return plan.reserve;
}
