// Pocket Park: a square of 2x2 to 4x4 free tiles (no building, road or water) holding 1+ tree,
// 1+ bench and 2+ flower pieces, with buildings on 2+ sides within 2 tiles. Each bench looks for
// the smallest such square around it; overlapping squares count once. Anchored on the square's
// north-west tile.
import { MAP_SIZE } from '../../../../constants';
import type { EntityId, Rect } from '../../../../contracts';
import { decorInRect } from '../../../../conditions/geo';
import { type Detector, hasTag, param, type SiteCandidate, tagged, tileOf } from '../shared';

const S = MAP_SIZE;

export const pocketPark: Detector = (state, def) => {
  const minSize = param(def, 'minSize', 2);
  const maxSize = param(def, 'maxSize', 4);
  const needTrees = param(def, 'trees', 1);
  const needBenches = param(def, 'benches', 1);
  const needFlowers = param(def, 'flowers', 2);
  const needSides = param(def, 'sides', 2);
  const m = state.map;
  const taken: Rect[] = [];
  const out: SiteCandidate[] = [];

  const free = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= S || z >= S) return false;
    const i = z * S + x;
    return !m.occupant[i] && !m.road[i] && !m.water[i];
  };
  const builtAt = (x: number, z: number) => x >= 0 && z >= 0 && x < S && z < S && m.occupant[z * S + x] !== 0;

  const tryPark = (x0: number, z0: number, s: number): SiteCandidate | null => {
    const x1 = x0 + s - 1;
    const z1 = z0 + s - 1;
    for (const r of taken) if (x0 <= r[2] && x1 >= r[0] && z0 <= r[3] && z1 >= r[1]) return null;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!free(x, z)) return null;
    let trees = 0;
    const tiles: number[] = [];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        tiles.push(z * S + x);
        if (m.tree[z * S + x]) trees++;
      }
    }
    let benches = 0;
    let flowers = 0;
    const members: EntityId[] = [];
    const inside = decorInRect(state, [x0, z0, x1, z1]).sort((a, b) => a.id - b.id);
    for (const d of inside) {
      const bench = hasTag(d.def, 'bench');
      const flower = hasTag(d.def, 'flower');
      const tree = hasTag(d.def, 'tree');
      if (bench) benches++;
      if (flower) flowers++;
      if (tree) trees++;
      if (bench || flower || tree) members.push(d.id);
    }
    if (trees < needTrees || benches < needBenches || flowers < needFlowers) return null;
    let sides = 0;
    const strip = (ax: number, az: number, bx: number, bz: number) => {
      for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) if (builtAt(x, z)) return true;
      return false;
    };
    if (strip(x0, z0 - 2, x1, z0 - 1)) sides++;
    if (strip(x0, z1 + 1, x1, z1 + 2)) sides++;
    if (strip(x0 - 2, z0, x0 - 1, z1)) sides++;
    if (strip(x1 + 1, z0, x1 + 2, z1)) sides++;
    if (sides < needSides) return null;
    return { anchor: z0 * S + x0, members, tiles };
  };

  for (const bench of tagged(state, 'bench')) {
    const t = tileOf(bench);
    const bx = t % S;
    const bz = (t - bx) / S;
    let found: SiteCandidate | null = null;
    for (let s = minSize; s <= maxSize && !found; s++) {
      for (let z0 = bz - s + 1; z0 <= bz && !found; z0++) {
        for (let x0 = bx - s + 1; x0 <= bx && !found; x0++) found = tryPark(x0, z0, s);
      }
    }
    if (!found) continue;
    const x0 = found.anchor % S;
    const z0 = (found.anchor - x0) / S;
    const side = Math.round(Math.sqrt(found.tiles.length));
    taken.push([x0, z0, x0 + side - 1, z0 + side - 1]);
    out.push(found);
  }
  return out;
};
