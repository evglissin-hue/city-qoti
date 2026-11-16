// A place's draw, the parts that move with the hour (docs/spec/19-evenings.md, Places: Draw): its
// charm (the average over its tiles, counted up to `charmCap`), its lanterns once lit, and winter's
// penalty for an open-air place with no fire and no ice. The fixed parts (site, pieces, water) are
// set by build.ts; the live part (Treats on a shelf) by placeDraw. Whole numbers throughout.
import { content } from '@qoti/content';
import { HOURS_PER_DAY, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Place, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { LIGHTS_OFF_HOUR } from '../hearth/charm/sources';
import type { PlaceExtra } from './build';

const P = content.places;
const WINTER = 3;

/** Lanterns count as lit for a place's draw from `litHour` until they go out in the morning. */
export function placeLightsLit(tick: number): boolean {
  const hour =
    Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR) % HOURS_PER_DAY;
  return hour >= P.litHour || hour < LIGHTS_OFF_HOUR;
}

/** Fills each place's charm, lit and winter parts and its draw (without the live Treats part). */
export function refreshDraws(
  state: WorldState,
  places: readonly Place[],
  extras: readonly PlaceExtra[],
): void {
  const charm = state.map.charm;
  const lit = placeLightsLit(state.tick);
  const winter = seasonAt(state.tick).season === WINTER;
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    const x = extras[i]!;
    let sum = 0;
    for (const t of p.tiles) sum += charm[t]!;
    const n = p.tiles.length;
    const avg = n > 0 ? Math.floor((sum + (n >> 1)) / n) : 0;
    const parts = p.parts;
    parts.charm = Math.min(P.charmCap, avg);
    parts.lit = lit && x.lights ? P.litBonus : 0;
    parts.winter = winter && !x.winterExempt ? -P.winterPenalty : 0;
    const total = parts.charm + parts.site + parts.pieces + parts.water + parts.lit + parts.winter;
    p.draw = Math.max(0, Math.min(100, total));
  }
}
