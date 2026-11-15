// R1X's dead-end hunt (docs/spec/31-parallel-development.md, step 4): each finding gets a check for
// its whole class. A door step reached only across the building's own footprint; a grown building
// on a neighbor's step; a Lodge's woods the town grew into.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { MapReader, Rot4 } from '../../src/contracts';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { canPlaceBuilding } from '../../src/rules/building';
import { footprintSize } from '../../src/rules/footprint';
import { doorFront, doorReached, reachesTile } from '../../src/rules/reach';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';
import { lotPlacement } from '../../src/systems/growth/api';
import { woodsThin } from '../../src/systems/production/forestry';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';

const S = MAP_SIZE;
const flat = { height: () => 0 } as unknown as MapReader;

describe("a door step reached only across the building's own footprint", () => {
  it('is not reached (birch: a garden bed whose step lay inside the storehouse)', () => {
    const bed = { def: 'garden-bed', x: 40, z: 40, rot: 0 as Rot4 };
    const def = content.buildingById.get(bed.def)!;
    const [w, d] = footprintSize(def, 0);
    const step = doorFront(bed);
    const sx = step % S;
    const sz = (step - sx) / S;
    // The step's neighbors: the one inside the bed's own footprint is the only one reached.
    const reach = new Uint8Array(S * S);
    const inside = [
      [sx + 1, sz],
      [sx - 1, sz],
      [sx, sz + 1],
      [sx, sz - 1],
    ].find(([x, z]) => x! >= bed.x && x! < bed.x + w && z! >= bed.z && z! < bed.z + d)!;
    expect(inside).toBeDefined();
    reach[inside[1]! * S + inside[0]!] = 1;
    // The old reading counted it; the door is not reached once the bed stands there.
    expect(reachesTile(reach, flat, step)).toBe(true);
    expect(doorReached(reach, flat, bed)).toBe(false);
    // A neighbor outside the footprint still leads in.
    const outside = [
      [sx + 1, sz],
      [sx - 1, sz],
      [sx, sz + 1],
      [sx, sz - 1],
    ].find(([x, z]) => !(x! >= bed.x && x! < bed.x + w && z! >= bed.z && z! < bed.z + d))!;
    reach[outside[1]! * S + outside[0]!] = 1;
    expect(doorReached(reach, flat, bed)).toBe(true);
  });
});

describe("a grown building on a neighbor's step", () => {
  it('is never placed: the lot grows clear of the step or not at all', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    const lots = lotsIn(s, [83, 44, 95, 49]);
    const def = content.buildingById.get('workshop')!;
    const bedDef = content.buildingById.get('garden-bed')!;
    const reader = () => worldIndex(s).reader;
    let tried = 0;
    for (const lot of lots) {
      const at = lotPlacement(s, lot, def);
      if (!at) continue;
      const [fw, fd] = footprintSize(def, lot.rot);
      const covers = (step: number) => {
        const x = step % S;
        const z = (step - x) / S;
        return x >= at[0] && x < at[0] + fw && z >= at[1] && z < at[1] + fd;
      };
      // A garden bed beside the footprint whose step falls inside it.
      let placed = false;
      for (let z = at[1] - 3; z <= at[1] + fd + 1 && !placed; z++)
        for (let x = at[0] - 3; x <= at[0] + fw + 1 && !placed; x++)
          for (const rot of [0, 1, 2, 3] as Rot4[]) {
            if (!covers(doorFront({ def: bedDef.id, x, z, rot }))) continue;
            if (!canPlaceBuilding(reader(), bedDef, x, z, rot).ok) continue;
            insertBuilding(s, null, bedDef, x, z, rot, 0, { site: false });
            placed = true;
            break;
          }
      if (!placed) continue;
      tried++;
      const again = lotPlacement(s, lot, def);
      if (again) expect(again).not.toEqual(at);
    }
    expect(tried).toBeGreaterThan(0);
  });
});

describe("a Lodge's woods the town grew into", () => {
  it('reads thin under its rule, counting trees of any age', () => {
    const f = hamletFixture();
    const s = f.state;
    const lodge = s.buildings.find((b) => b.id === f.b.sawpit)!;
    const def = content.buildingById.get(lodge.def)!;
    s.map.tree.fill(0);
    expect(woodsThin(s, lodge, def)).toBe(true);
    // Twelve saplings in its window: not thin, though none is grown.
    let n = 0;
    for (let z = lodge.z - 5; z <= lodge.z + 7 && n < 12; z++)
      for (let x = lodge.x - 5; x <= lodge.x + 7 && n < 12; x++) {
        const i = z * S + x;
        if (s.map.occupant[i] || s.map.road[i]) continue;
        s.map.tree[i] = treeValue(TREE_SPECIES.oak, 0);
        n++;
      }
    expect(woodsThin(s, lodge, def)).toBe(false);
  });
});
