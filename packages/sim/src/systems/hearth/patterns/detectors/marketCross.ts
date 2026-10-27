// Market Cross: a crossroads (a road tile with roads leaving in all four directions) with a well or
// a grown tree within `markReach` tiles of the crossing, and `stalls` (2) market buildings (stalls,
// shops) within `stallReach` tiles. A wide crossing counts once. Anchored on the crossing tile.
import { MAP_SIZE } from '../../../../constants';
import type { EntityId } from '../../../../contracts';
import { buildingRect, tileGap2, within } from '../../../../conditions/geo';
import { treeStage, TREE_MATURE } from '../../../../map/layers';
import { type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';
import { hasBuildingTag, roadArms } from './village';

const S = MAP_SIZE;

export const marketCross: Detector = (state, def) => {
  const needStalls = param(def, 'stalls', 2);
  const stallReach = param(def, 'stallReach', 4);
  const markReach = param(def, 'markReach', 1);
  const markets = state.buildings.filter((b) => b.stage === 'built' && hasBuildingTag(b, 'market'));
  if (markets.length < needStalls) return [];
  const wells = state.buildings.filter((b) => b.stage === 'built' && hasBuildingTag(b, 'well'));
  const out: SiteCandidate[] = [];
  const taken: number[] = [];
  const road = state.map.road;
  for (let i = 0; i < road.length; i++) {
    if (!road[i]) continue;
    const x = i % S;
    const z = (i - x) / S;
    const [n, e, s, w] = roadArms(state, x, z);
    if (!(n && e && s && w)) continue;
    if (taken.some((t) => Math.abs((t % S) - x) + Math.abs(Math.floor(t / S) - z) <= 2)) continue;
    const stalls: EntityId[] = [];
    for (const b of markets) if (within(tileGap2(x, z, buildingRect(b)), stallReach)) stalls.push(b.id);
    if (stalls.length < needStalls) continue;
    // The mark: a well, then an ornamental tree, then a grown tree on the map.
    let mark: EntityId = 0;
    let markTile = -1;
    for (const b of wells) if (!mark && within(tileGap2(x, z, buildingRect(b)), markReach)) mark = b.id;
    if (!mark) {
      for (const d of taggedIn(state, [x - markReach, z - markReach, x + markReach, z + markReach], 'tree')) {
        const t = tileOf(d);
        if (within(tileGap2(t % S, (t - (t % S)) / S, [x, z, x, z]), markReach)) {
          mark = d.id;
          break;
        }
      }
    }
    if (!mark) {
      for (let dz = -markReach; dz <= markReach && markTile < 0; dz++) {
        for (let dx = -markReach; dx <= markReach && markTile < 0; dx++) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
          const v = state.map.tree[nz * S + nx]!;
          if (v && treeStage(v) >= TREE_MATURE) markTile = nz * S + nx;
        }
      }
    }
    if (!mark && markTile < 0) continue;
    taken.push(i);
    out.push({
      anchor: i,
      members: mark ? [...stalls, mark] : stalls,
      tiles: markTile >= 0 ? [i, markTile] : [i],
    });
  }
  return out;
};
