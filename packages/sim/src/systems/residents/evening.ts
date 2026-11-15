// A resident's evening and the evenings need (docs/spec/19-evenings.md, Good evenings). R2B owns the
// score and the need; R2A fills `Resident.round` with what happened at each stop.
import { content } from '@qoti/content';
import type { Resident, TickCtx, WorldState } from '../../contracts';

/**
 * The score of the resident's evening now, 0 to 100: the draw of their best stop as found, plus a
 * friend met there, a treat, a second kind of stop, less standing; staying in scores
 * `PLACES.stayInScore`, which is also every evening's floor.
 *
 * R2 stand-in (R2B): every evening scores the floor (no places on stand-ins, so nobody goes out).
 */
export function eveningScore(_state: WorldState, _r: Resident): number {
  return content.places.stayInScore;
}

/**
 * 21:00, as folk set off home: scores each grown-up's evening (eveningScore), moves the evenings
 * need a third of the way to it, keeps `Resident.evening` (this season's good evenings and the bond
 * heart) and adds the scores to `state.evenings.tonight`. An evening lost to weather does not count.
 *
 * R2 stand-in (R2B): nothing yet; the need stays where it started.
 */
export function closeEvening(_state: WorldState, _ctx: TickCtx): void {}
