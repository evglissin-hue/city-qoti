// R2X (the dead-end hunt's site-cut-off on R2E's trial merge): a building set down by hand after a
// lot was cut, with its door facing that lot, must not be walled in when the lot grows. The zoning
// pass drops an empty lot that covers any building's door tile, and the cutter never cuts one there.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, Lot } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { doorTile } from '../../src/systems/movement/api';
import { zoningPass } from '../../src/systems/zoning/lots';
import { villageFixture } from '../fixtures/village';
import { HealthWatch } from '../../src/view/health';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { S } from '../helpers';

const inLot = (l: Lot, i: number) =>
  i % S >= l.x && i % S < l.x + l.w && Math.floor(i / S) >= l.z && Math.floor(i / S) < l.z + l.d;

describe('a door facing an empty lot', () => {
  it('drops the lot, and no lot is cut on the door tile again', () => {
    const f = villageFixture();
    const s = f.state;
    zoningPass(s, null);
    // An empty homes lot on street B (z 71 to 73, facing north); a garden bed set behind it, facing
    // north, so its door tile is the lot's back row.
    const lot = s.lots.find((l) => f.lots.homes.includes(l.id) && !l.buildingId)!;
    expect(lot).toBeTruthy();
    const def = content.buildingById.get('garden-bed')!;
    const [w, d] = def.size;
    const free = (x: number, z: number) => {
      for (let tz = z; tz < z + d; tz++)
        for (let tx = x; tx < x + w; tx++) {
          const i = tz * S + tx;
          if (s.map.road[i] || s.map.occupant[i] || s.map.lot[i] || s.map.water[i]) return false;
        }
      return true;
    };
    let spot: [number, number, 0 | 1 | 2 | 3] | null = null;
    for (let z = lot.z - 3; z <= lot.z + lot.d + 1 && !spot; z++)
      for (let x = lot.x - 3; x <= lot.x + lot.w + 1 && !spot; x++)
        for (const rot of [0, 1, 2, 3] as const) {
          if (!free(x, z)) continue;
          if (inLot(lot, doorTile({ def: def.id, x, z, rot } as Building))) {
            spot = [x, z, rot];
            break;
          }
        }
    expect(spot).toBeTruthy();
    const bed = insertBuilding(s, null, def, spot![0], spot![1], spot![2], 0, { site: false });
    const door = doorTile(bed);
    expect(inLot(lot, door)).toBe(true);
    s.networkVersion++;
    zoningPass(s, null);
    expect(s.lots.some((l) => !l.buildingId && inLot(l, door))).toBe(false);
    expect(s.map.lot[door]).toBe(0);
  });
});

describe('the dead-end hunt', () => {
  it('flags a built building nobody can walk to after a day (building-cut-off)', () => {
    const f = villageFixture();
    const s = f.state;
    const watch = new HealthWatch();
    const cut = () => watch.check(s).filter((i) => i.kind === 'building-cut-off');
    expect(cut()).toEqual([]);
    // Wall in the first cottage: something stands on the tile before its door and all around it.
    const home = s.buildings.find((b) => b.id === f.b.cottages[0])!;
    const door = doorTile(home);
    for (const t of [door, door + 1, door - 1, door + S, door - S])
      if (s.map.occupant[t] !== home.id) s.map.occupant[t] = 999_999;
    s.networkVersion++;
    s.tick += TICKS_PER_HOUR;
    expect(cut()).toEqual([]);
    s.tick += TICKS_PER_DAY;
    expect(cut().map((i) => i.id)).toEqual([home.id]);
  });
});
