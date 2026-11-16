// The evenings' runs (docs/spec/19-evenings.md, Good evenings; 15-progression.md, the [R2] notes):
// fair evenings with half the grown-ups out (the Village's goal), evenings everyone went out (Out of
// an Evening), and seasons with a seat for everyone (A Seat for Everyone). Kept at 21:10 from the
// evening's tally, in every rank (a Hamlet's evenings count toward the Village's goal).
import { DAYS_PER_SEASON } from '../../constants';
import type { EveningTally, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { dayIndex } from '../economy/time';

/** Whether the season's six evenings made a season with a seat for everyone. */
function seatedSeason(state: WorldState, today: number): boolean {
  const first = today - (DAYS_PER_SEASON - 1);
  const evenings: EveningTally[] = [];
  for (const t of state.evenings.history) if (t.day >= first && t.day < today) evenings.push(t);
  evenings.push(state.evenings.tonight);
  const seen: boolean[] = [];
  for (const t of evenings) {
    seen[t.day - first] = true;
    if (t.weather !== 'storm' && t.out <= 0) return false;
  }
  for (let i = 0; i < DAYS_PER_SEASON; i++) if (!seen[i]) return false;
  return state.evenings.stoodThisSeason === 0;
}

/**
 * Counts tonight's tally into the runs. The caller has checked that `tonight.day` is today. Rain and
 * storm evenings, and evenings with no grown-ups, hold both runs (neither count nor break).
 */
export function keepRuns(state: WorldState): void {
  const ev = state.evenings;
  const t = ev.tonight;
  const today = dayIndex(state.tick);
  if (t.weather === 'fair' && t.grownups > 0) {
    ev.outRun = t.out * 2 >= t.grownups ? ev.outRun + 1 : 0;
    if (t.out * 2 >= t.grownups) ev.outFair = (ev.outFair ?? 0) + 1;
    if (t.out === t.grownups) ev.allOut += 1;
  }
  if (t.weather !== 'storm' && t.stood > 0) ev.stoodThisSeason += 1;
  if (seasonAt(state.tick).day === DAYS_PER_SEASON) {
    if (seatedSeason(state, today)) ev.seatedSeasons += 1;
    ev.stoodThisSeason = 0;
  }
}
