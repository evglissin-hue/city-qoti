// Small Square: a paved open space of `size` x `size` tiles or more (path or street, nothing built
// on it), with buildings on `sides` (3) of its four sides within `sideReach` tiles, and at least a
// bench and a lantern on it or at its edge. Each bench looks for such a square around it;
// overlapping squares count once. Anchored on the square's north-west tile.
import { MAP_SIZE } from '../../../../constants';
import type { EntityId, Rect } from '../../../../contracts';
import { expandRect } from '../../../../conditions/geo';
import { type Detector, param, type SiteCandidate, tagged, taggedIn, tileOf } from '../shared';
import { overlaps, paved, rectTiles, sideBuildings } from './village';

const S = MAP_SIZE;

export const smallSquare: Detector = (state, def) => {
  const size = param(def, 'size', 3);
  const needSides = param(def, 'sides', 3);
  const reach = param(def, 'sideReach', 2);
  const needBenches = param(def, 'benches', 1);
  const needLanterns = param(def, 'lanterns', 1);
  const taken: Rect[] = [];
  const out: SiteCandidate[] = [];

  const square = (x0: number, z0: number): SiteCandidate | null => {
    const r: Rect = [x0, z0, x0 + size - 1, z0 + size - 1];
    for (const t of taken) if (overlaps(t, r)) return null;
    for (let z = r[1]; z <= r[3]; z++)
      for (let x = r[0]; x <= r[2]; x++) if (!paved(state, x, z)) return null;
    const edge = expandRect(r, 1);
    const benches = taggedIn(state, edge, 'bench').map((d) => d.id);
    const lanterns = taggedIn(state, edge, 'lantern').map((d) => d.id);
    if (benches.length < needBenches || lanterns.length < needLanterns) return null;
    const sides = sideBuildings(state, r, reach).filter((ids) => ids.length > 0);
    if (sides.length < needSides) return null;
    const members: EntityId[] = [...benches, ...lanterns];
    for (const ids of sides) members.push(...ids);
    return { anchor: z0 * S + x0, members, tiles: rectTiles(r) };
  };

  for (const bench of tagged(state, 'bench')) {
    const t = tileOf(bench);
    const bx = t % S;
    const bz = (t - bx) / S;
    let found: SiteCandidate | null = null;
    // Squares that hold the bench or have it at their edge, nearest corner first.
    for (let z0 = bz - size; z0 <= bz + 1 && !found; z0++) {
      for (let x0 = bx - size; x0 <= bx + 1 && !found; x0++) found = square(x0, z0);
    }
    if (!found) continue;
    const x0 = found.anchor % S;
    const z0 = (found.anchor - x0) / S;
    taken.push([x0, z0, x0 + size - 1, z0 + size - 1]);
    out.push(found);
  }
  return out;
};
