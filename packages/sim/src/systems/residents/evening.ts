// A resident's evening and the evenings need (docs/spec/19-evenings.md, Good evenings). R2B owns the
// score and the need; R2A fills `Resident.round` with what happened at each stop.
import { content } from '@qoti/content';
import type { Resident, WorldState } from '../../contracts';

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
