// Kitchen Garden: a home with 2+ vegetable or herb plots within 2 tiles of its footprint and a
// fence or hedge beside them (within 1 tile of a plot). Anchored on the home.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { EntityId, Rect } from '../../../../contracts';
import {
  buildingRect,
  decorInRect,
  expandRect,
  isHomeDef,
  rectGap2,
  tileGap2,
} from '../../../../conditions/geo';
import { buildingHasTag, type Detector, hasTag, param, type SiteCandidate, tileOf } from '../shared';

const S = MAP_SIZE;

export const kitchenGarden: Detector = (state, def) => {
  const need = param(def, 'plots', 2);
  const within = param(def, 'within', 2);
  const w2 = within * within;
  const out: SiteCandidate[] = [];
  for (const home of state.buildings) {
    if (home.stage !== 'built' || !isHomeDef(content.buildingById.get(home.def))) continue;
    const r = buildingRect(home);
    const plots: Rect[] = [];
    const members: EntityId[] = [home.id];
    for (const b of state.buildings) {
      if (b.stage !== 'built' || !buildingHasTag(b.def, 'plot')) continue;
      const pr = buildingRect(b);
      if (rectGap2(pr, r) > w2) continue;
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
      if (tileGap2(x, z, r) > w2) continue;
      plots.push([x, z, x, z]);
      members.push(d.id);
    }
    if (plots.length < need) continue;
    let fenced = 0;
    for (const d of decor) {
      if (!hasTag(d.def, 'fence') && !hasTag(d.def, 'hedge')) continue;
      const t = tileOf(d);
      const x = t % S;
      const z = (t - x) / S;
      if (!plots.some((p) => tileGap2(x, z, p) <= 1)) continue;
      fenced++;
      members.push(d.id);
    }
    if (fenced === 0) continue;
    out.push({ anchor: home.z * S + home.x, members, tiles: [] });
  }
  return out;
};
