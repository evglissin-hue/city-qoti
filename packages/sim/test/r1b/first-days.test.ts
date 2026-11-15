// R1B acceptance (docs/build/cycle-r1b-land-businesses.md): a fresh standard valley that zones
// Farmland, Homes and Workshops and sites a windmill grows a farm, homes and a baker in the
// windmill's reach within its first days, with no hand placement of a production building.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, MAX_ZONE_TILES } from '../../src/constants';
import type { Building, Rot4, WorldState } from '../../src/contracts';
import { canPlaceBuilding } from '../../src/rules/building';
import { entranceTiles } from '../../src/rules/footprint';
import { findById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { doorTile } from '../../src/systems/movement/api';
import { withinReach } from '../../src/systems/specialized/api';
import { rejection, run } from '../helpers';
import { playDays, standardValley } from './valley';

const S = MAP_SIZE;
const DAYS = 12;

/**
 * The Ledger's first evening, as a player would: the start path carried on along the valley on its
 * clearer side, the trees cleared beside it, Workshops along one side of the new stretch and deep
 * Farmland along the other (room for fields behind the lots), Homes along the start path. Returns
 * the middle of the Workshops stretch.
 */
function zoneTheValley(state: WorldState): [number, number] {
  run(state, { t: 'sys.seatJoined', seat: 0 }, 0);
  run(state, { t: 'sys.seatJoined', seat: 1 }, 1);
  const [ax0, az0, ax1, az1] = state.meta.startArea;
  const cx = (ax0 + ax1 + 1) >> 1;
  const cz = (az0 + az1 + 1) >> 1;
  const along: [number, number] = state.meta.flow === 'ns' ? [0, 1] : [1, 0];
  const across: [number, number] = [along[1], along[0]];
  let seq = 1;
  const send = (cmd: Parameters<typeof run>[1]) => rejection(run(state, cmd, 1, seq++));
  const at = (k: number, d: number, sign: number): [number, number] => [
    cx + along[0] * k * sign + across[0] * d,
    cz + along[1] * k * sign + across[1] * d,
  ];
  const inside = ([x, z]: [number, number]) => x >= 1 && z >= 1 && x < S - 1 && z < S - 1;
  // The clearer end of the start path: fewer water tiles in the stretch beyond it.
  const wet = (sign: number) => {
    let n = 0;
    for (let k = 10; k <= 30; k++)
      for (let d = -12; d <= 4; d++) {
        const t = at(k, d, sign);
        if (!inside(t) || state.map.water[t[1] * S + t[0]]) n++;
      }
    return n;
  };
  const sign = wet(1) <= wet(-1) ? 1 : -1;
  // Clear the corridor's trees (they give timber), then carry the path on.
  const trees: [number, number][] = [];
  for (let k = 10; k <= 30; k++)
    for (let d = -12; d <= 4; d++) {
      const t = at(k, d, sign);
      if (inside(t) && state.map.tree[t[1] * S + t[0]]) trees.push(t);
    }
  for (let i = 0; i < trees.length; i += 200) send({ t: 'tree.remove', tiles: trees.slice(i, i + 200) });
  const stretch: [number, number][] = [];
  for (let k = 10; k <= 30; k++) {
    const t = at(k, 0, sign);
    if (!inside(t)) break;
    if (state.map.road[t[1] * S + t[0]]) continue;
    if (send({ t: 'road.paint', kind: 'path', tiles: [t] })) break;
    stretch.push(t);
  }
  expect(stretch.length, 'the path carried on').toBeGreaterThan(8);
  const zone = (id: string, tiles: [number, number][]) => {
    const seen = new Set<number>();
    const uniq = tiles.filter(([x, z]) => inside([x, z]) && !seen.has(z * S + x) && !!seen.add(z * S + x));
    for (let i = 0; i < uniq.length; i += MAX_ZONE_TILES) {
      expect(send({ t: 'zone.paint', zone: id, tiles: uniq.slice(i, i + MAX_ZONE_TILES) })).toBeUndefined();
    }
  };
  const side = (tiles: readonly [number, number][], from: number, to: number) => {
    const out: [number, number][] = [];
    for (const [x, z] of tiles)
      for (let d = from; d <= to; d++) out.push([x + across[0] * d, z + across[1] * d]);
    return out;
  };
  zone('crafts', side(stretch, 1, 3));
  zone('farms', side(stretch, -12, -1));
  const path: [number, number][] = [];
  for (let k = -9; k <= 9; k++) path.push(at(k, 0, 1));
  zone('homes-low', [...side(path, 1, 3), ...side(path, -3, -1)]);
  return stretch[stretch.length >> 1]!;
}

/**
 * A legal windmill spot by the Workshops lots: its door within two tiles of a road, as near the
 * middle of the Workshops arm as the ground allows.
 */
function windmillSpot(state: WorldState, [mx, mz]: [number, number]): [number, number, Rot4] {
  const def = content.buildingById.get('windmill')!;
  const reader = worldIndex(state).reader;
  let best: [number, number, Rot4] | null = null;
  let bestD = Infinity;
  for (let z = mz - 14; z <= mz + 14; z++) {
    for (let x = mx - 14; x <= mx + 14; x++) {
      for (const rot of [0, 1, 2, 3] as Rot4[]) {
        if (!canPlaceBuilding(reader, def, x, z, rot).ok) continue;
        const { front } = entranceTiles(def, x, z, rot);
        let road = false;
        for (let dz = -2; dz <= 2 && !road; dz++)
          for (let dx = -2; dx <= 2 && !road; dx++)
            if (state.map.road[(front[1] + dz) * S + front[0] + dx]) road = true;
        if (!road) continue;
        const d = Math.abs(front[0] - mx) + Math.abs(front[1] - mz);
        if (d < bestD) {
          bestD = d;
          best = [x, z, rot];
        }
      }
    }
  }
  expect(best, 'a windmill spot').not.toBeNull();
  return best!;
}

describe('the first days of a zones-first valley', () => {
  for (const seed of ['willow', 'hazel']) {
    it(
      `${seed}: a farm, homes and a baker in the windmill's reach, none placed by hand`,
      { timeout: 120_000 },
      () => {
        const state = standardValley(seed);
        const mid = zoneTheValley(state);
        // The first evening: the Ledger sites a windmill by the workshops.
        const [x, z, rot] = windmillSpot(state, mid);
        expect(
          rejection(run(state, { t: 'build.place', def: 'windmill', x, z, rot }, 0, 900)),
        ).toBeUndefined();
        const placedByHand = new Set(state.buildings.map((b) => b.id));
        playDays(state, DAYS);
        const windmill = state.buildings.find((b) => b.def === 'windmill')!;
        expect(windmill.stage).toBe('built');
        const grown = (b: Building) => !!b.lot && !placedByHand.has(b.id);
        const farms = state.buildings.filter((b) => grown(b) && b.def === 'farmstead' && b.trade);
        const homes = state.buildings.filter((b) => grown(b) && content.buildingById.get(b.def)?.housing);
        const bakers = state.buildings.filter((b) => grown(b) && b.trade === 'baker');
        const summary = state.buildings
          .filter((b) => grown(b))
          .map((b) => `${b.trade ?? b.def}:${b.stage}`)
          .join(', ');
        expect(farms.length, summary).toBeGreaterThan(0);
        expect(homes.length, summary).toBeGreaterThan(0);
        expect(bakers.length, summary).toBeGreaterThan(0);
        for (const b of bakers) expect(withinReach(state, windmill, doorTile(b))).toBe(true);
        // Nothing that makes goods was placed by hand but the windmill (which makes nothing).
        for (const id of placedByHand) {
          const b = findById(state.buildings, id);
          expect(b && content.buildingById.get(b.def)?.methods?.length ? b.def : null).toBeNull();
        }
      },
    );
  }
});
