// Village Green: an open lawn of `size` x `size` tiles (5; no building, road, water or field)
// holding a grown tree (a mature tree on the map or an ornamental one), with a bench on it or at its
// edge and `homes` (4) homes within `homeReach` tiles of it. Only trees near homes are looked at,
// so forests cost nothing. Overlapping greens count once; anchored on the north-west tile.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { EntityId, Rect } from '../../../../contracts';
import { buildingRect, expandRect, isHomeDef, rectGap2, within } from '../../../../conditions/geo';
import { treeStage, TREE_MATURE } from '../../../../map/layers';
import { type Detector, param, type SiteCandidate, tagged, taggedIn, tileOf } from '../shared';
import { openGround, overlaps, rectTiles } from './village';

const S = MAP_SIZE;

export const villageGreen: Detector = (state, def) => {
  const size = param(def, 'size', 5);
  const needHomes = param(def, 'homes', 4);
  const homeReach = param(def, 'homeReach', 3);
  const needBenches = param(def, 'benches', 1);
  const homes: Rect[] = [];
  const homeIds: EntityId[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !isHomeDef(content.buildingById.get(b.def))) continue;
    homes.push(buildingRect(b));
    homeIds.push(b.id);
  }
  if (homes.length < needHomes) return [];

  // Grown trees within reach of some home: [tile, ornamental decor id or 0].
  const reach = homeReach + size;
  const trees = new Map<number, EntityId>();
  for (const r of homes) {
    const a = expandRect(r, reach);
    for (let z = a[1]; z <= a[3]; z++) {
      for (let x = a[0]; x <= a[2]; x++) {
        const v = state.map.tree[z * S + x]!;
        if (v && treeStage(v) >= TREE_MATURE) trees.set(z * S + x, 0);
      }
    }
  }
  for (const d of tagged(state, 'tree')) {
    const t = tileOf(d);
    if (!trees.has(t)) trees.set(t, d.id);
  }
  const candidates = [...trees.keys()].sort((a, b) => a - b);

  const taken: Rect[] = [];
  const out: SiteCandidate[] = [];
  const green = (x0: number, z0: number, tree: number): SiteCandidate | null => {
    const r: Rect = [x0, z0, x0 + size - 1, z0 + size - 1];
    for (const t of taken) if (overlaps(t, r)) return null;
    for (let z = r[1]; z <= r[3]; z++)
      for (let x = r[0]; x <= r[2]; x++) if (!openGround(state, x, z)) return null;
    const benches = taggedIn(state, expandRect(r, 1), 'bench').map((d) => d.id);
    if (benches.length < needBenches) return null;
    const near: EntityId[] = [];
    homes.forEach((h, i) => {
      if (within(rectGap2(h, r), homeReach)) near.push(homeIds[i]!);
    });
    if (near.length < needHomes) return null;
    const members = [...benches, ...near];
    const ornamental = trees.get(tree) ?? 0;
    if (ornamental) members.push(ornamental);
    return { anchor: z0 * S + x0, members, tiles: rectTiles(r) };
  };

  for (const t of candidates) {
    const tx = t % S;
    const tz = (t - tx) / S;
    let found: SiteCandidate | null = null;
    for (let z0 = tz - size + 1; z0 <= tz && !found; z0++) {
      for (let x0 = tx - size + 1; x0 <= tx && !found; x0++) found = green(x0, z0, t);
    }
    if (!found) continue;
    const x0 = found.anchor % S;
    const z0 = (found.anchor - x0) / S;
    taken.push([x0, z0, x0 + size - 1, z0 + size - 1]);
    out.push(found);
  }
  return out;
};
