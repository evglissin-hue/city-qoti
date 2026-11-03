// Reading Nook (C5C): a bench in a quiet, enclosed garden nook: `enclosure` (3) or more wall, hedge
// or fence pieces within `reach` (2) tiles of it, a flower piece and a lantern within reach, and
// noise at its tile of `maxNoise` (2) or less. Benches within 2 tiles of a nook already found
// belong to it. Anchored on the bench's tile.
import { MAP_SIZE } from '../../../../constants';
import type { Decor, EntityId } from '../../../../contracts';
import { decorInRect } from '../../../../conditions/geo';
import { dist2, type Detector, hasTag, param, type SiteCandidate, tagged, tileOf } from '../shared';

const S = MAP_SIZE;

export const readingNook: Detector = (state, def) => {
  const needWalls = param(def, 'enclosure', 3);
  const reach = param(def, 'reach', 2);
  const maxNoise = param(def, 'maxNoise', 2);
  const r2 = reach * reach + reach;
  const out: SiteCandidate[] = [];
  const found: Decor[] = [];
  for (const bench of tagged(state, 'bench')) {
    const t = tileOf(bench);
    if (state.map.charmNoise[t]! > maxNoise) continue;
    if (found.some((f) => dist2(f.fx, f.fz, bench.fx, bench.fz) <= 4)) continue;
    const x = t % S;
    const z = (t - x) / S;
    const near = decorInRect(state, [x - reach - 1, z - reach - 1, x + reach + 1, z + reach + 1])
      .filter((d) => d.id !== bench.id && dist2(d.fx, d.fz, bench.fx, bench.fz) <= r2)
      .sort((a, b) => a.id - b.id);
    const walls = near.filter(
      (d) => hasTag(d.def, 'wall') || hasTag(d.def, 'hedge') || hasTag(d.def, 'fence'),
    );
    const flower = near.find((d) => hasTag(d.def, 'flower'));
    const lantern = near.find((d) => hasTag(d.def, 'lantern'));
    if (walls.length < needWalls || !flower || !lantern) continue;
    found.push(bench);
    const members: EntityId[] = [bench.id, ...walls.map((d) => d.id), flower.id, lantern.id];
    out.push({ anchor: t, members, tiles: [] });
  }
  return out;
};
