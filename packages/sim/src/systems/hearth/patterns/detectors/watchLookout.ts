// Watch Lookout (C5D): a built watchtower with a bench within `benchReach` tiles and a view over a
// lane (road of lane kind or better) or the river within `view` tiles. Anchored on the tower.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import { tileGap2, within } from '../../../../conditions/geo';
import { type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;

export const watchLookout: Detector = (state, def) => {
  const benchReach = param(def, 'benchReach', 3);
  const view = param(def, 'view', 6);
  const out: SiteCandidate[] = [];
  const { road, water } = state.map;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !content.buildingById.get(b.def)?.defense?.towerRange) continue;
    const benches = taggedIn(
      state,
      [b.x - benchReach, b.z - benchReach, b.x + benchReach, b.z + benchReach],
      'bench',
    )
      .filter((d) => {
        const t = tileOf(d);
        return within(tileGap2(t % S, (t - (t % S)) / S, [b.x, b.z, b.x, b.z]), benchReach);
      })
      .map((d) => d.id);
    if (benches.length === 0) continue;
    let seen = false;
    for (let z = Math.max(0, b.z - view); z <= Math.min(S - 1, b.z + view) && !seen; z++)
      for (let x = Math.max(0, b.x - view); x <= Math.min(S - 1, b.x + view) && !seen; x++) {
        const i = z * S + x;
        if (water[i] || road[i]! >= 2) seen = true;
      }
    if (!seen) continue;
    out.push({ anchor: b.z * S + b.x, members: benches, tiles: [b.z * S + b.x] });
  }
  return out;
};
