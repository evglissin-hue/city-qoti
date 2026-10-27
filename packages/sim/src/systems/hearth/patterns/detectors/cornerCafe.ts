// Corner Cafe: a building tagged 'cafe' (tavern, bakery, corner shop) whose door lies within
// `cornerReach` tiles of a corner, a road tile where roads leave in two directions at right angles,
// with `seats` (2) seats and `flowers` (1) flower pieces within `seatReach` tiles of it. Anchored on
// the building's north-west tile.
import { MAP_SIZE } from '../../../../constants';
import { buildingRect, expandRect, tileGap2, within } from '../../../../conditions/geo';
import { doorTile } from '../../../movement/api';
import { type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';
import { hasBuildingTag, roadArms, roadAt } from './village';

const S = MAP_SIZE;

export const cornerCafe: Detector = (state, def) => {
  const cornerReach = param(def, 'cornerReach', 2);
  const needSeats = param(def, 'seats', 2);
  const seatReach = param(def, 'seatReach', 2);
  const needFlowers = param(def, 'flowers', 1);
  const out: SiteCandidate[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !hasBuildingTag(b, 'cafe')) continue;
    const door = doorTile(b);
    const dx = door % S;
    const dz = (door - dx) / S;
    let corner = -1;
    for (let z = dz - cornerReach; z <= dz + cornerReach && corner < 0; z++) {
      for (let x = dx - cornerReach; x <= dx + cornerReach && corner < 0; x++) {
        if (!roadAt(state, x, z)) continue;
        const [n, e, s, w] = roadArms(state, x, z);
        if ((n || s) && (e || w)) corner = z * S + x;
      }
    }
    if (corner < 0) continue;
    const r = buildingRect(b);
    const area = expandRect(r, seatReach);
    const near = (t: number) => within(tileGap2(t % S, (t - (t % S)) / S, r), seatReach);
    const seats = taggedIn(state, area, 'seat').filter((d) => near(tileOf(d)));
    const flowers = taggedIn(state, area, 'flower').filter((d) => near(tileOf(d)));
    if (seats.length < needSeats || flowers.length < needFlowers) continue;
    out.push({
      anchor: b.z * S + b.x,
      members: [b.id, ...seats.map((d) => d.id), ...flowers.map((d) => d.id)],
      tiles: [corner],
    });
  }
  return out;
};
