// Condition DSL evaluator (C3.0 contract; C3B). Wish offers and targets and achievements are
// Conditions (types in @qoti/content). A Binding gives the places a wish was bound to;
// achievements evaluate with an empty binding. Pure: reads state, never writes.
//
// Distances are gaps between tile rectangles (conditions/geo.ts): a target on a tile touching the
// home is 0 tiles away, so "within 3" means the home's own footprint plus three rings around it.
import { type CharmCategory, type Condition, content, type PlaceRef, type Target } from '@qoti/content';
import { MAP_SIZE, NEED_IDS } from '../constants';
import type { EntityId, MapLayers, Rect, WorldState } from '../contracts';
import { treeStage } from '../map/layers';
import { findById } from '../state/entities';
import { townStock } from '../view/hamlet';
import { codePredicates } from './code';
import {
  buildingRect,
  decorInRect,
  decorTileX,
  decorTileZ,
  expandRect,
  householdIn,
  isHomeDef,
  rectGap2,
  tileGap2,
} from './geo';

export interface Binding {
  residentId?: EntityId;
  home?: EntityId;
  work?: EntityId;
  market?: EntityId;
}

/** Evaluates a condition against the world. Unknown or unbound places make spatial tests false. */
export function evaluate(state: WorldState, cond: Condition, bind: Binding = {}): boolean {
  if ('all' in cond) {
    for (const c of cond.all) if (!evaluate(state, c, bind)) return false;
    return true;
  }
  if ('any' in cond) {
    for (const c of cond.any) if (evaluate(state, c, bind)) return true;
    return false;
  }
  if ('not' in cond) return !evaluate(state, cond.not, bind);
  if ('near' in cond) {
    const n = cond.near;
    const place = placeRect(state, n.of, bind);
    if (!place) return false;
    const exclude = n.excludeSelf ? placeBuildingId(n.of, bind) : 0;
    const need = n.atLeast ?? 1;
    return countNear(state, n, place, n.within, need, exclude, n.also) >= need;
  }
  if ('count' in cond) {
    const v = countOf(state, cond.count.what, cond.count.ref);
    return inRange(v, cond.count.atLeast, cond.count.atMost);
  }
  if ('charm' in cond) {
    const c = cond.charm;
    const place = placeRect(state, c.of, bind);
    if (!place) return false;
    return inRange(charmAt(state, place, c.layer, c.radius ?? 0), c.atLeast, c.atMost);
  }
  if ('stock' in cond) {
    const s = cond.stock;
    const good = content.goodIndex.get(s.good);
    if (good === undefined) return false;
    return stockAt(state, good, s.at, bind) >= s.atLeast;
  }
  if ('resident' in cond) return residentMatches(state, cond.resident, bind);
  if ('code' in cond) {
    const fn = codePredicates.get(cond.code);
    return fn ? fn(state, bind, cond.params ?? []) : false;
  }
  return false;
}

function inRange(v: number, atLeast: number | undefined, atMost: number | undefined): boolean {
  if (atLeast !== undefined && v < atLeast) return false;
  if (atMost !== undefined && v > atMost) return false;
  return true;
}

// --- Places ------------------------------------------------------------------------------------

/** The building a place names, or 0 for tiles and unbound places. */
export function placeBuildingId(of: PlaceRef, bind: Binding): EntityId {
  if (of === 'home') return bind.home ?? 0;
  if (of === 'work') return bind.work ?? 0;
  if (of === 'nearestMarket') return bind.market ?? 0;
  if ('building' in of) return of.building;
  return 0;
}

/** The inclusive tile rect of a place, or null when it is unbound or gone. */
export function placeRect(state: WorldState, of: PlaceRef, bind: Binding): Rect | null {
  if (typeof of === 'object' && 'tile' in of) {
    const [x, z] = of.tile;
    return [x, z, x, z];
  }
  const id = placeBuildingId(of, bind);
  const b = id ? findById(state.buildings, id) : undefined;
  return b ? buildingRect(b) : null;
}

// --- Near ---------------------------------------------------------------------------------------

/**
 * Counts targets within `within` tiles of `place`, stopping early at `stopAt`. With `also`, a
 * target only counts when it has `also.target` within `also.within` tiles of itself.
 */
export function countNear(
  state: WorldState,
  target: Target,
  place: Rect,
  within: number,
  stopAt: number,
  exclude: EntityId = 0,
  also?: { target: Target; within: number },
): number {
  const w2 = within * within;
  const area = expandRect(place, within);
  let n = 0;
  const accept = (r: Rect): boolean => !also || countNear(state, also.target, r, also.within, 1) >= 1;

  if ('tag' in target || 'decor' in target) {
    const decor = decorInRect(state, area);
    decor.sort((a, b) => a.id - b.id);
    for (const d of decor) {
      const def = content.decorById.get(d.def);
      if (!def) continue;
      if ('tag' in target ? !def.tags.includes(target.tag) : d.def !== target.decor) continue;
      const x = decorTileX(d);
      const z = decorTileZ(d);
      if (tileGap2(x, z, place) > w2 || !accept([x, z, x, z])) continue;
      if (++n >= stopAt) return n;
    }
    return n;
  }

  if ('building' in target || 'buildingTag' in target || 'buildingCategory' in target || 'home' in target) {
    for (const b of state.buildings) {
      if (b.stage !== 'built' || b.id === exclude) continue;
      const def = content.buildingById.get(b.def);
      if (!def) continue;
      if ('building' in target && b.def !== target.building) continue;
      if ('buildingTag' in target && !(def.tags ?? []).includes(target.buildingTag)) continue;
      if ('buildingCategory' in target && def.category !== target.buildingCategory) continue;
      if ('home' in target && !(isHomeDef(def) && householdIn(state, b.id))) continue;
      const r = buildingRect(b, def);
      if (rectGap2(r, place) > w2 || !accept(r)) continue;
      if (++n >= stopAt) return n;
    }
    return n;
  }

  if ('tree' in target) {
    const mature = target.tree === 'mature';
    const m = state.map;
    for (let z = area[1]; z <= area[3]; z++) {
      for (let x = area[0]; x <= area[2]; x++) {
        const v = m.tree[z * MAP_SIZE + x]!;
        if (!v || (mature && treeStage(v) < 3)) continue;
        if (tileGap2(x, z, place) > w2 || !accept([x, z, x, z])) continue;
        if (++n >= stopAt) return n;
      }
    }
    // Ornamental trees are decor; they always count as grown.
    return n + countNear(state, { tag: 'tree' }, place, within, stopAt - n, 0, also);
  }

  // Tile layers: water and roads.
  const m = state.map;
  const want = 'road' in target ? target.road : null;
  for (let z = area[1]; z <= area[3]; z++) {
    for (let x = area[0]; x <= area[2]; x++) {
      const i = z * MAP_SIZE + x;
      if ('water' in target) {
        if (!m.water[i]) continue;
      } else {
        const r = m.road[i]!;
        if (!r || (want === 'path' && r !== 1) || (want === 'lane' && r !== 2)) continue;
      }
      if (tileGap2(x, z, place) > w2 || !accept([x, z, x, z])) continue;
      if (++n >= stopAt) return n;
    }
  }
  return n;
}

// --- Counters -----------------------------------------------------------------------------------

export function countOf(state: WorldState, what: string, ref?: string): number {
  switch (what) {
    case 'residents':
      return state.residents.length;
    case 'households':
      return state.households.length;
    case 'patternsDiscovered':
      return state.hearth.discovered.length;
    case 'pattern': {
      let n = 0;
      for (const s of state.hearth.sites) if (s.pattern === ref) n++;
      return n;
    }
    case 'wishesGranted':
      return state.stats.wishesGranted;
    case 'goodProduced': {
      const i = ref === undefined ? undefined : content.goodIndex.get(ref);
      return i === undefined ? 0 : (state.economy.everProduced[i] ?? 0);
    }
    case 'seasonsInSurplus':
      return state.economy.seasonsInSurplus;
    case 'builtTogether':
      return state.stats.builtTogether;
    case 'togetherSites': {
      let n = 0;
      for (const s of state.hearth.sites) if (s.seats.length >= 2) n++;
      return n;
    }
    default:
      return 0;
  }
}

// --- Charm and stock ----------------------------------------------------------------------------

const CHARM_LAYER: readonly [CharmCategory, keyof MapLayers][] = [
  ['nature', 'charmNature'],
  ['comfort', 'charmComfort'],
  ['light', 'charmLight'],
  ['view', 'charmView'],
  ['noise', 'charmNoise'],
];

/** Average of a charm layer over a place grown by `radius` tiles. */
export function charmAt(
  state: WorldState,
  place: Rect,
  layer: CharmCategory | undefined,
  radius: number,
): number {
  let name: keyof MapLayers = 'charm';
  for (const [c, l] of CHARM_LAYER) if (c === layer) name = l;
  const data = state.map[name];
  const r = expandRect(place, radius);
  let sum = 0;
  let n = 0;
  for (let z = r[1]; z <= r[3]; z++) {
    for (let x = r[0]; x <= r[2]; x++) {
      sum += data[z * MAP_SIZE + x]!;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

function stockAt(state: WorldState, good: number, at: PlaceRef | undefined, bind: Binding): number {
  if (at === undefined) return townStock(state)[good] ?? 0;
  const id = placeBuildingId(at, bind);
  const rt = id ? findById(state.buildings, id)?.rt : undefined;
  return rt ? (rt.store[good] ?? 0) + (rt.output[good] ?? 0) : 0;
}

// --- Residents ----------------------------------------------------------------------------------

function residentMatches(
  state: WorldState,
  q: {
    species?: string[];
    traits?: string[];
    noHome?: boolean;
    hasJob?: boolean;
    needBelow?: [need: string, value: number];
  },
  bind: Binding,
): boolean {
  const r = bind.residentId ? findById(state.residents, bind.residentId) : undefined;
  if (!r) return false;
  if (q.species && !q.species.includes(r.species)) return false;
  if (q.traits && !q.traits.some((t) => r.traits.includes(t))) return false;
  if (q.noHome !== undefined) {
    const h = findById(state.households, r.householdId);
    const homeless = !h || !h.homeId || !findById(state.buildings, h.homeId);
    if (homeless !== q.noHome) return false;
  }
  if (q.hasJob !== undefined && (r.jobId !== 0) !== q.hasJob) return false;
  if (q.needBelow) {
    const i = (NEED_IDS as readonly string[]).indexOf(q.needBelow[0]);
    if (i < 0 || (r.needs[i] ?? 0) >= q.needBelow[1]) return false;
  }
  return true;
}
