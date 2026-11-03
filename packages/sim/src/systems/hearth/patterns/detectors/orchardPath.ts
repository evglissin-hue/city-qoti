// Orchard Path (C5C): an orchard with `pathTiles` (3) or more path or lane tiles running along it
// (touching its footprint, diagonals too) and a bench within `benchReach` (2) tiles of the orchard.
// Anchored on the orchard's anchor tile; members are the orchard and the benches.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import { buildingRect, expandRect, rectGap2, within } from '../../../../conditions/geo';
import type { EntityId } from '../../../../contracts';
import { Road } from '../../../../map/layers';
import { type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;

export const orchardPath: Detector = (state, def) => {
  const needPath = param(def, 'pathTiles', 3);
  const benchReach = param(def, 'benchReach', 2);
  const out: SiteCandidate[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !content.buildingById.get(b.def)?.tags?.includes('orchard')) continue;
    const r = buildingRect(b);
    const ring = expandRect(r, 1);
    const tiles: number[] = [];
    for (let z = ring[1]; z <= ring[3]; z++) {
      for (let x = ring[0]; x <= ring[2]; x++) {
        if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) continue;
        const v = state.map.road[z * S + x]!;
        if (v === Road.path || v === Road.lane) tiles.push(z * S + x);
      }
    }
    if (tiles.length < needPath) continue;
    const benches: EntityId[] = [];
    for (const d of taggedIn(state, expandRect(r, benchReach + 1), 'bench')) {
      const t = tileOf(d);
      const x = t % S;
      const z = (t - x) / S;
      if (within(rectGap2(r, [x, z, x, z]), benchReach)) benches.push(d.id);
    }
    if (benches.length === 0) continue;
    out.push({ anchor: b.z * S + b.x, members: [b.id, ...benches], tiles });
  }
  return out;
};
