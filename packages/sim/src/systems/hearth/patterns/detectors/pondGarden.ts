// Pond Garden (C5C): a pond (4-connected pond tiles, `pondTiles` (2) or more) with `planting` (2)
// or more flower, reed or tree pieces within `reach` (2) tiles of its water, a seat within reach and
// a path or lane tile within reach. Anchored on the pond's first tile; members are the planting and
// the seats, tiles the pond.
import { MAP_SIZE } from '../../../../constants';
import { decorInRect } from '../../../../conditions/geo';
import type { EntityId } from '../../../../contracts';
import { Road, Water } from '../../../../map/layers';
import { components, type Detector, hasTag, param, type SiteCandidate, tileOf } from '../shared';

const S = MAP_SIZE;

export const pondGarden: Detector = (state, def) => {
  const needTiles = param(def, 'pondTiles', 2);
  const needPlanting = param(def, 'planting', 2);
  const reach = param(def, 'reach', 2);
  const water = state.map.water;
  const ponds: number[] = [];
  for (let i = 0; i < S * S; i++) if (water[i] === Water.pond) ponds.push(i);
  if (ponds.length < needTiles) return [];
  const out: SiteCandidate[] = [];
  for (const comp of components(ponds)) {
    if (comp.length < needTiles) continue;
    let x0 = S;
    let z0 = S;
    let x1 = -1;
    let z1 = -1;
    const set = new Set(comp);
    for (const t of comp) {
      const x = t % S;
      const z = (t - x) / S;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    // Within `reach` steps (Chebyshev) of some pond tile.
    const nearPond = (x: number, z: number) => {
      for (let dz = -reach; dz <= reach; dz++)
        for (let dx = -reach; dx <= reach; dx++) if (set.has((z + dz) * S + (x + dx))) return true;
      return false;
    };
    const planting: EntityId[] = [];
    const seats: EntityId[] = [];
    const around = decorInRect(state, [x0 - reach, z0 - reach, x1 + reach, z1 + reach]).sort(
      (a, b) => a.id - b.id,
    );
    for (const d of around) {
      const t = tileOf(d);
      const x = t % S;
      if (!nearPond(x, (t - x) / S)) continue;
      if (hasTag(d.def, 'flower') || hasTag(d.def, 'reeds') || hasTag(d.def, 'tree')) planting.push(d.id);
      else if (hasTag(d.def, 'seat')) seats.push(d.id);
    }
    if (planting.length < needPlanting || seats.length === 0) continue;
    let path = false;
    for (let z = Math.max(0, z0 - reach); z <= Math.min(S - 1, z1 + reach) && !path; z++) {
      for (let x = Math.max(0, x0 - reach); x <= Math.min(S - 1, x1 + reach) && !path; x++) {
        const r = state.map.road[z * S + x]!;
        if ((r === Road.path || r === Road.lane) && nearPond(x, z)) path = true;
      }
    }
    if (!path) continue;
    out.push({ anchor: comp[0]!, members: [...planting, ...seats], tiles: comp });
  }
  return out;
};
