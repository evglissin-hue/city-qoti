// R2 (R2.0): the evening's views (docs/spec/19-evenings.md, the evening's tally; 17-presentation.md,
// the evening edition and the Hearth's strip). R2C owns this file; R2B's score fills the numbers.
import type { EveningView, Resident, ResidentDetail, TownView, WorldState } from '../contracts';
import { eveningsNeed } from '../state/evenings';

/**
 * The last evening's tally and edition, or null before the first evening.
 *
 * R2 stand-in (R2C): no edition lines and no places list yet; R2C writes both and emits
 * evening.closed with this view at 21:00.
 */
export function eveningView(state: WorldState): EveningView | null {
  const tally = state.evenings.tonight;
  if (tally.day < 0) return null;
  return { tally: { ...tally }, lines: [], places: [] };
}

/** The Hearth's strip: the last evening's share out and average score, absent before the first. */
export function townEvenings(state: WorldState): TownView['evenings'] {
  const t = state.evenings.tonight;
  if (t.day < 0 || t.grownups === 0) return undefined;
  return { out: t.out, grownups: t.grownups, average: Math.round(t.scoreSum / t.grownups) };
}

/** The inspector's evening: the need and the last score, once they have had an evening. */
export function residentEvening(r: Resident): ResidentDetail['evening'] {
  if (!r.evening) return undefined;
  return { need: Math.round(eveningsNeed(r)), score: r.evening.score };
}
