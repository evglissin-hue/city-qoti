// Kitchen Garden: a home with 2+ vegetable or herb plots within 2 tiles of its footprint and a
// fence or hedge beside them (within 1 tile of a plot). Anchored on the home.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { Building, EntityId, Rect, WorldState } from '../../../../contracts';
import {
  buildingRect,
  decorInRect,
  expandRect,
  isHomeDef,
  rectGap2,
  tileGap2,
  within as withinTiles,
} from '../../../../conditions/geo';
import { buildingHasTag, type Detector, hasTag, param, type SiteCandidate, tileOf } from '../shared';

const S = MAP_SIZE;

interface Garden {
  members: EntityId[];
  plots: number;
  fenced: number;
}

/** The plots and fencing around one home, as the detector counts them. */
function gardenAt(state: WorldState, home: Building, within: number): Garden {
  const r = buildingRect(home);
  const plots: Rect[] = [];
  const members: EntityId[] = [home.id];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !buildingHasTag(b.def, 'plot')) continue;
    const pr = buildingRect(b);
    if (!withinTiles(rectGap2(pr, r), within)) continue;
    plots.push(pr);
    members.push(b.id);
  }
  // Plots reach up to their own size past `within`, and fences one tile beyond that.
  const decor = decorInRect(state, expandRect(r, within + 4)).sort((a, b) => a.id - b.id);
  for (const d of decor) {
    if (!hasTag(d.def, 'herb')) continue;
    const t = tileOf(d);
    const x = t % S;
    const z = (t - x) / S;
    if (!withinTiles(tileGap2(x, z, r), within)) continue;
    plots.push([x, z, x, z]);
    members.push(d.id);
  }
  let fenced = 0;
  for (const d of decor) {
    if (!hasTag(d.def, 'fence') && !hasTag(d.def, 'hedge')) continue;
    const t = tileOf(d);
    const x = t % S;
    const z = (t - x) / S;
    if (!plots.some((p) => withinTiles(tileGap2(x, z, p), 1))) continue;
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
