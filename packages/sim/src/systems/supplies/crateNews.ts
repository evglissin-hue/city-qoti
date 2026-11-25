// The Hearth's one line about the County's crate (R3X). Its own module, with nothing but content and the
// clock to import, so the evening edition (a view) can read it without the settling's imports.
import { content, lifePhrases } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { dayIndex, hourOf } from '../economy/time';

/** The Hearth's one line on the evening of the claim (derived from the Charter's history, never saved). */
export function crateNewsDay(state: WorldState): number | null {
  const last = state.charter.history[state.charter.history.length - 1];
  // A tick of 0 is a town founded as a Village: nobody claimed it, and no crate came.
  if (
    !last ||
    last.tick <= 0 ||
    last.rank !== content.supplies.fromRank ||
    content.supplies.charterCrateNights === undefined
  )
    return null;
  // The evening is scored at 21:00: a claim after it is news the next evening.
  const day = dayIndex(last.tick);
  return hourOf(last.tick) >= 21 ? day + 1 : day;
}

/** The Hearth's line about the crate, said once (on the evening `crateNewsDay` names). */
export function crateNews(): string {
  return lifePhrases.charterCrate.news[0]!;
}
