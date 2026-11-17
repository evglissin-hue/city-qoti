// A place's draw, the parts that move with the hour (docs/spec/19-evenings.md, Places: Draw): its
// charm (the average over its tiles, counted up to `charmCap`), its lanterns once lit, and winter's
// penalty for an open-air place with no fire and no ice. Also the taste bits that move with the map
// (a mature tree on its tiles, no road among them), so nothing in a place lags the saved state. The fixed parts (site, pieces, water) are
// set by build.ts; the live part (Treats on a shelf) by placeDraw. Whole numbers throughout.
import { content } from '@qoti/content';
import { HOURS_PER_DAY, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Place, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { LIGHTS_OFF_HOUR } from '../hearth/charm/sources';
import { TREE_MATURE, treeStage } from '../../map/layers';
import { PlaceFeature, type PlaceExtra } from './build';
import { findById } from '../../state/entities';
import { decorLit, pieceRests } from '../supplies/api';
import { customToday, placeSpecialty } from '../townbook/api';

const P = content.places;
const WINTER = 3;

/** Lanterns count as lit for a place's draw from `litHour` until they go out in the morning. */
export function placeLightsLit(tick: number): boolean {
  const hour =
    Math.floor(((tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY) / TICKS_PER_HOUR) % HOURS_PER_DAY;
  return hour >= P.litHour || hour < LIGHTS_OFF_HOUR;
}

/** True when one of these light pieces burns now (supplies' decorLit; R3A settles them). */
function anyLit(state: WorldState, ids: readonly number[]): boolean {
  for (const id of ids) {
    const d = findById(state.decor, id);
    if (d && decorLit(state, d)) return true;
  }
  return false;
}

/** True when one of these fires burns tonight (not resting cold: supplies' pieceRests). */
function anyBurning(state: WorldState, ids: readonly number[]): boolean {
  for (const id of ids) {
    const d = findById(state.decor, id);
    if (d && pieceRests(state, d) !== 'cold') return true;
  }
  return false;
}

/**
 * Fills each place's charm, lit, winter, specialty and custom parts, its warmth and its draw (without
 * the live Treats part). R3.0: a place's lit part needs a lantern that burns (a candle tonight), its
 * warmth a fire that is not cold, and the Town Book's parts come from R3C's specialties and customs.
 */
export function refreshDraws(
  state: WorldState,
  places: readonly Place[],
  extras: readonly PlaceExtra[],
): void {
  const { charm, road, tree } = state.map;
  const lit = placeLightsLit(state.tick);
  const winter = seasonAt(state.tick).season === WINTER;
  const cap = P.charmCap;
  const litBonus = P.litBonus;
  const cold = -P.winterPenalty;
  const book = state.townBook.pages.length > 0;
  for (let i = 0; i < places.length; i++) {
    const p = places[i]!;
    const x = extras[i]!;
    const tiles = p.tiles;
    const n = tiles.length;
    let sum = 0;
    let quiet = true;
    let mature = false;
    for (let k = 0; k < n; k++) {
      const t = tiles[k]!;
      sum += charm[t]!;
      if (road[t]) quiet = false;
      const tv = tree[t]!;
      if (tv && treeStage(tv) >= TREE_MATURE) mature = true;
    }
    // The bits that move with the map, for a resident's taste.
    x.features = x.base | (quiet ? PlaceFeature.quiet : 0) | (mature ? PlaceFeature.tree : 0);
    const avg = n > 0 ? Math.floor((sum + (n >> 1)) / n) : 0;
    const parts = p.parts;
    parts.charm = avg < cap ? avg : cap;
    parts.lit = lit && x.lights && anyLit(state, x.lamps) ? litBonus : 0;
    // Warm: a heated host, or a fire that burns tonight (a cold one warms nothing).
    p.warm = x.hostWarm || (x.fires.length > 0 && anyBurning(state, x.fires));
    parts.winter = winter && !(x.exempt || p.warm) ? cold : 0;
    // The Town Book's parts: none before its first page (the draw runs each tick; keep it cheap).
    parts.specialty = book ? placeSpecialty(state, p) : 0;
    parts.custom = book ? customToday(state, p) : 0;
    const total =
      parts.charm +
      parts.site +
      parts.pieces +
      parts.water +
      parts.lit +
      parts.winter +
      parts.specialty +
      parts.custom;
    p.draw = Math.max(0, Math.min(100, total));
  }
}
