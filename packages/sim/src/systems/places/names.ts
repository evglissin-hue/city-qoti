// Place names (docs/spec/19-evenings.md, Places): generated once, when the pass first finds a place,
// and kept. Like the Chronicle's places they say what stands there and the family nearest it ("the
// bench by the Underbank cottage"). Deterministic and RNG-free: the same town reads the same names.
// Every phrase template is in content/placeWords.ts.
import { content, placeWords as W } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Place, WorldState } from '../../contracts';
import { householdIn, isHomeDef } from '../../conditions/geo';

const S = MAP_SIZE;
/** How far (Manhattan tiles) a home counts as the nearest family. */
const FAMILY_RANGE = 10;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

const lower = (s: string): string => s.toLowerCase();

/** The nearest built home with a household within FAMILY_RANGE tiles (ties by building id). */
function nearestFamily(state: WorldState, tile: number): { family: string; home: string } | null {
  const x = tile % S;
  const z = Math.floor(tile / S);
  let best: { family: string; home: string } | null = null;
  let bestDist = FAMILY_RANGE + 1;
  let bestId = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    if (!isHomeDef(def)) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.z - z);
    if (d > FAMILY_RANGE) continue;
    if (d > bestDist || (d === bestDist && b.id > bestId)) continue;
    const h = householdIn(state, b.id);
    if (!h) continue;
    best = { family: h.family, home: lower(def!.name) };
    bestDist = d;
    bestId = b.id;
  }
  return best;
}

/** The nearest street's name, if the street pass has named any. */
function nearestStreet(state: WorldState, tile: number): string | null {
  const x = tile % S;
  const z = Math.floor(tile / S);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const st of state.streets) {
    const d = Math.abs((st.anchor % S) - x) + Math.abs(Math.floor(st.anchor / S) - z);
    if (d < bestDist) {
      bestDist = d;
      best = st.name;
    }
  }
  return best;
}

/** "by the Underbank cottage", else "by the water", else "at the edge of town". */
function where(state: WorldState, place: Place): string {
  const near = nearestFamily(state, place.tile);
  if (near) return fill(W.byFamily, near);
  return place.parts.water > 0 ? W.byWater : W.atEdge;
}

/** The place's stem (what stands there) and whether its first try goes without a "where". */
function stemOf(state: WorldState, place: Place): { stem: string; bare: boolean; porch?: string } {
  const id = place.id;
  if (id.startsWith('porch:')) {
    const home = place.members[0];
    const h = home !== undefined ? householdIn(state, home) : undefined;
    return { stem: '', bare: true, porch: fill(W.porch, { family: h?.family ?? 'neighbor' }) };
  }
  if (id.startsWith('site:')) {
    const pattern = content.patternById.get(place.def)?.name ?? place.def;
    return { stem: fill(W.site, { pattern }), bare: true };
  }
  if (id.startsWith('seats:')) {
    const piece = lower(content.decorById.get(place.def)?.name ?? place.def);
    return { stem: fill(W.seats, { piece }), bare: false };
  }
  if (id.startsWith('fire:')) {
    const brazier = lower(content.decorById.get(place.def)?.name ?? place.def);
    return { stem: fill(W.fire, { brazier }), bare: false };
  }
  if (id.startsWith('ice:')) return { stem: W.ice, bare: false };
  if (id.startsWith('festival:')) {
    const festival = content.festivalById.get(place.def)?.name ?? place.def;
    return { stem: fill(W.festival, { festival }), bare: true };
  }
  const building = lower(content.buildingById.get(place.def)?.name ?? place.def);
  return { stem: fill(W.host, { building }), bare: true };
}

/** "the bench" -> "the other bench" (the template's {stem} is the stem without its article). */
function withArticle(template: string, stem: string): string {
  const bare = stem.startsWith('the ') ? stem.slice(4) : stem;
  return fill(template, { stem: bare });
}

/**
 * A place's generated name: what stands there and the nearest family. `taken` holds the generated
 * names of the rows that already exist, so two benches by one cottage read as "the bench by the
 * Underbank cottage" and "the other bench by the Underbank cottage".
 */
export function placeNameFor(state: WorldState, place: Place, taken: ReadonlySet<string>): string {
  const s = stemOf(state, place);
  if (s.porch !== undefined) {
    if (!taken.has(s.porch)) return s.porch;
    return disambiguate(s.porch, taken);
  }
  const at = where(state, place);
  const tries: string[] = [];
  if (s.bare) tries.push(s.stem);
  tries.push(`${s.stem} ${at}`);
  tries.push(`${withArticle(W.other, s.stem)} ${at}`);
  tries.push(`${withArticle(W.third, s.stem)} ${at}`);
  const street = nearestStreet(state, place.tile);
  if (street) tries.push(`${s.stem} ${fill(W.onStreet, { street })}`);
  for (const t of tries) if (!taken.has(t)) return t;
  return disambiguate(`${s.stem} ${at}`, taken);
}

/** A name that has run out of honest variants: " (the second)", " (the third)", then ", again". */
function disambiguate(base: string, taken: ReadonlySet<string>): string {
  for (const o of W.ordinals) {
    const t = `${base} (${o})`;
    if (!taken.has(t)) return t;
  }
  let t = base;
  while (taken.has(t)) t += W.again;
  return t;
}
