// Well Gathering Place: a well with 2+ benches within 2 tiles and a tree (on the map or
// ornamental) within 3, and 3+ homes within 8. Anchored on the well.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { EntityId } from '../../../../contracts';
import { buildingRect, expandRect, isHomeDef, rectGap2, tileGap2, within } from '../../../../conditions/geo';
import { treeStage } from '../../../../map/layers';
import { buildingHasTag, type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;

export const wellGathering: Detector = (state, def) => {
  const benchReach = param(def, 'benchReach', 2);
  const treeReach = param(def, 'treeReach', 3);
  const homeReach = param(def, 'homeReach', 8);
  const needBenches = param(def, 'benches', 2);
  const needHomes = param(def, 'homes', 3);
  const out: SiteCandidate[] = [];
  for (const well of state.buildings) {
    if (well.stage !== 'built' || !buildingHasTag(well.def, 'well')) continue;
    const r = buildingRect(well);
    const benches: EntityId[] = [];
    for (const d of taggedIn(state, expandRect(r, benchReach), 'bench')) {
      const t = tileOf(d);
      if (within(tileGap2(t % S, (t - (t % S)) / S, r), benchReach)) benches.push(d.id);
    }
    if (benches.length < needBenches) continue;

    // The nearest tree: an ornamental tree first, else a growing tree on the map.
    let treeDecor: EntityId = 0;
    let treeTile = -1;
    let best = Infinity;
    for (const d of taggedIn(state, expandRect(r, treeReach), 'tree')) {
      const t = tileOf(d);
      const g = tileGap2(t % S, (t - (t % S)) / S, r);
      if (within(g, treeReach) && g < best) {
        best = g;
        treeDecor = d.id;
      }
    }
    if (!treeDecor) {
      const a = expandRect(r, treeReach);
      for (let z = a[1]; z <= a[3]; z++) {
        for (let x = a[0]; x <= a[2]; x++) {
          const v = state.map.tree[z * S + x]!;
          if (!v || treeStage(v) < 2) continue;
          const g = tileGap2(x, z, r);
          if (within(g, treeReach) && g < best) {
            best = g;
            treeTile = z * S + x;
          }
        }
      }
    }
    if (!treeDecor && treeTile < 0) continue;

    let homes = 0;
    for (const b of state.buildings) {
      if (b.stage !== 'built' || !isHomeDef(content.buildingById.get(b.def))) continue;
      if (within(rectGap2(buildingRect(b), r), homeReach)) homes++;
    }
    if (homes < needHomes) continue;

    const members = [well.id, ...benches];
    if (treeDecor) members.push(treeDecor);
    out.push({ anchor: well.z * S + well.x, members, tiles: treeTile >= 0 ? [treeTile] : [] });
  }
  return out;
};
