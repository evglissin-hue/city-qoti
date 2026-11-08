// Kitchen Garden: a home with 2+ vegetable or herb plots within 2 tiles of its footprint (or of a
// plot that is) and a fence or hedge beside them (within 1 tile of a plot). Anchored on the home.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { Building, EntityId, Rect, WorldState } from '../../../../contracts';
import { buildingRect, decorInRect, expandRect, isHomeDef } from '../../../../conditions/geo';
import { buildingHasTag, type Detector, hasTag, param, type SiteCandidate, tileOf } from '../shared';

const S = MAP_SIZE;
/**
 * Tiles from a plot a fence or hedge may stand and still keep it (playtest round six: a fence run
 * with a tile of path inside it is still the garden's fence).
 */
const FENCE_REACH = 2;

/**
 * Steps between two inclusive rects counted the way a player counts them on the grid, diagonals
 * included (playtest round six: a plot two tiles across and one down was "too far" as the crow
 * flies). 1 means touching.
 */
function squareGap(a: Rect, b: Rect): number {
  return Math.max(0, a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
}

export interface Garden {
  members: EntityId[];
  plots: number;
  fenced: number;
}

/**
 * The plots and fencing around one home, as the detector counts them. Playtest round six: plots
 * chain on from the home, so a row of plots beside the door is one garden even when the far one
 * is more than `within` tiles from the house itself.
 */
export function gardenAt(state: WorldState, home: Building, within: number): Garden {
  const r = buildingRect(home);
  const plots: Rect[] = [];
  const members: EntityId[] = [home.id];
  const candidates: { id: EntityId; rect: Rect }[] = [];
  for (const b of state.buildings) {
    if (b.stage === 'built' && buildingHasTag(b.def, 'plot'))
      candidates.push({ id: b.id, rect: buildingRect(b) });
  }
  const near = (rect: Rect) =>
    squareGap(rect, r) <= within || plots.some((p) => squareGap(rect, p) <= within);
  // Grow the garden outward from the home until no plot or herb planter is left within reach of
  // it. Herbs join the same growth as built plots, so a planter that links a far plot (or a far
  // planter) counts whatever order they were placed in.
  const herbs = new Set<EntityId>();
  let decor: ReturnType<typeof decorInRect> = [];
  let queried: Rect | null = null;
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      if (!near(c.rect)) continue;
      plots.push(c.rect);
      members.push(c.id);
      candidates.splice(i--, 1);
      grew = true;
    }
    // Herb planters, and later the fences just past the plots, within the garden's bounds.
    let area = r;
    for (const p of plots)
      area = [
        Math.min(area[0], p[0]),
        Math.min(area[1], p[1]),
        Math.max(area[2], p[2]),
        Math.max(area[3], p[3]),
      ];
    // The same bounds as the last pass find the same decor.
    if (!queried || area.some((v, i) => v !== queried![i])) {
      decor = decorInRect(state, expandRect(area, within + 4)).sort((a, b) => a.id - b.id);
      queried = area;
    }
    for (const d of decor) {
      if (herbs.has(d.id) || !hasTag(d.def, 'herb')) continue;
      const t = tileOf(d);
      const x = t % S;
      const z = (t - x) / S;
      if (!near([x, z, x, z])) continue;
      plots.push([x, z, x, z]);
      members.push(d.id);
      herbs.add(d.id);
      grew = true;
    }
  }
  let fenced = 0;
  for (const d of decor) {
    if (!hasTag(d.def, 'fence') && !hasTag(d.def, 'hedge')) continue;
    const t = tileOf(d);
    const x = t % S;
    const z = (t - x) / S;
    if (!plots.some((p) => squareGap([x, z, x, z], p) <= FENCE_REACH)) continue;
    fenced++;
    members.push(d.id);
  }
  return { members, plots: plots.length, fenced };
}

export const kitchenGarden: Detector = (state, def) => {
  const need = param(def, 'plots', 2);
  const within = param(def, 'within', 2);
  const out: SiteCandidate[] = [];
  for (const home of state.buildings) {
    if (home.stage !== 'built' || !isHomeDef(content.buildingById.get(home.def))) continue;
    const g = gardenAt(state, home, within);
    if (g.plots < need || g.fenced === 0) continue;
    out.push({ anchor: home.z * S + home.x, members: g.members, tiles: [] });
  }
  return out;
};

/**
 * Playtest round five: what a home still lacks to be a Kitchen Garden, for its inspector ("two
 * plots and no pattern"): 'fence' with the plots in, 'plot' with one of two, or null.
 */
export function kitchenGardenMissing(state: WorldState, home: Building): 'fence' | 'plot' | null {
  const def = content.patternById.get('kitchen-garden');
  if (!def || !isHomeDef(content.buildingById.get(home.def))) return null;
  const need = param(def, 'plots', 2);
  const g = gardenAt(state, home, param(def, 'within', 2));
  if (g.plots >= need) return g.fenced === 0 ? 'fence' : null;
  return g.plots === need - 1 ? 'plot' : null;
}
