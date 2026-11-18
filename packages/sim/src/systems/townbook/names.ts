// A specialty page's name (docs/spec/19-evenings.md, The Town Book): the def's name with {street} and
// {family} filled from the place, and a fallback when another page already has it. The places' own
// naming helpers are private to systems/places, so these are small copies of the same ideas.
// Deterministic and RNG-free.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Place, PlaceState, WorldState } from '../../contracts';
import { householdIn, isHomeDef } from '../../conditions/geo';
import { shownName } from '../../state/evenings';
import { streetDistance } from '../places/streets';

const S = MAP_SIZE;
/** How far (Manhattan tiles) a home counts as the nearest family. */
const FAMILY_RANGE = 10;
/** How far a street's run counts as beside a place. */
const STREET_RANGE = 3;

function capital(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** The family name of the nearest built home with a household within range (ties by building id). */
function nearestFamilyName(state: WorldState, tile: number): string | null {
  const x = tile % S;
  const z = Math.floor(tile / S);
  let best: string | null = null;
  let bestDist = FAMILY_RANGE + 1;
  let bestId = 0;
  for (const b of state.buildings) {
    const d = Math.abs(b.x - x) + Math.abs(b.z - z);
    if (d > FAMILY_RANGE || d > bestDist || (d === bestDist && b.id > bestId)) continue;
    if (b.stage !== 'built' || !isHomeDef(content.buildingById.get(b.def))) continue;
    const h = householdIn(state, b.id);
    if (!h) continue;
    best = h.family;
    bestDist = d;
    bestId = b.id;
  }
  return best;
}

/** A street whose run passes near the place, else the nearest street by anchor, else null. */
function streetNear(state: WorldState, tile: number): string | null {
  const x = tile % S;
  const z = Math.floor(tile / S);
  let beside: string | null = null;
  let besideDist = STREET_RANGE + 1;
  for (const st of state.streets) {
    const d = streetDistance(state, st, x, z);
    if (d < besideDist) {
      besideDist = d;
      beside = shownName(st);
    }
  }
  if (beside !== null) return beside;
  let near: string | null = null;
  let nearDist = Infinity;
  for (const st of state.streets) {
    const d = Math.abs((st.anchor % S) - x) + Math.abs(Math.floor(st.anchor / S) - z);
    if (d < nearDist) {
      nearDist = d;
      near = shownName(st);
    }
  }
  return near;
}

/**
 * The page's name for a specialty at a place. {street} and {family} are filled from the place; when
 * one cannot be, the name falls back to the place's own name and the good ("the old orchard Cider").
 * `taken` holds the names of the pages already in the book: a repeat becomes `<place> <Good>` too.
 */
export function specialtyName(
  state: WorldState,
  template: string,
  goodName: string,
  place: Place,
  row: PlaceState,
  taken: ReadonlySet<string>,
): string {
  const shown = capital(shownName(row));
  const fallback = `${shown} ${goodName}`;
  let name = template;
  if (name.includes('{street}')) {
    const street = streetNear(state, place.tile);
    name = street === null ? '' : name.split('{street}').join(street);
  }
  if (name !== '' && name.includes('{family}')) {
    const family = nearestFamilyName(state, place.tile);
    name = family === null ? '' : name.split('{family}').join(family);
  }
  if (name === '') return fallback;
  if (!taken.has(name)) return name;
  if (!taken.has(fallback)) return fallback;
  for (let n = 2; ; n++) {
    const t = `${fallback} ${n}`;
    if (!taken.has(t)) return t;
  }
}
