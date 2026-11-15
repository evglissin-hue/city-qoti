// R1B: a windmill keeps its open ground (the master's decision on R1F's openGround health check):
// nothing is placed by hand, grown or cut as a lot within the `clear` tiles of its footprint, and
// whatever tries is refused with NEEDS_OPEN_GROUND, as the windmill itself is among buildings.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, Zone } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { canPlaceBuilding } from '../../src/rules/building';
import { footprintSize } from '../../src/rules/footprint';
import { worldIndex } from '../../src/state/worldIndex';
import { insertBuilding } from '../../src/state/place';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { paintZone, zoneNow } from '../growth/helpers';
import { rejection, run } from '../helpers';

const CLEAR = 2;

/** Chebyshev gap between two footprints (0 when they touch or overlap). */
function gap(a: Building, b: Building): number {
  const [aw, ad] = footprintSize(content.buildingById.get(a.def)!, a.rot);
  const [bw, bd] = footprintSize(content.buildingById.get(b.def)!, b.rot);
  return Math.max(b.x - (a.x + aw - 1), a.x - (b.x + bw - 1), b.z - (a.z + ad - 1), a.z - (b.z + bd - 1));
}

/** A windmill across lane A from the east end, door on the lane (the fixture leaves that ground open). */
function millByTheLane(s: WorldState): Building {
  expect(
    rejection(run(s, { t: 'build.place', def: 'windmill', x: 88, z: 52, rot: 2 }, 0, 900)),
  ).toBeUndefined();
  return s.buildings.find((b) => b.def === 'windmill' && b.x === 88 && b.z === 52)!;
}

describe("a windmill's clearance", () => {
  it('refuses anything placed by hand inside it, with the windmill reason, and allows it beyond', () => {
    const f = villageFixture();
    const s = f.state;
    millByTheLane(s);
    const reader = worldIndex(s).reader;
    const cottage = content.buildingById.get('cottage')!;
    // Two tiles east of the mill's footprint (x 88 to 89): inside.
    expect(canPlaceBuilding(reader, cottage, 91, 52, 2).reason).toBe('NEEDS_OPEN_GROUND');
    expect(rejection(run(s, { t: 'build.place', def: 'cottage', x: 91, z: 52, rot: 2 }, 0, 901))).toBe(
      'NEEDS_OPEN_GROUND',
    );
    // Three tiles east: beyond it.
    expect(canPlaceBuilding(reader, cottage, 92, 52, 2).reason).not.toBe('NEEDS_OPEN_GROUND');
  });

  it('is never cut into a lot, and lots inside it go when a windmill is placed', () => {
    const f = villageFixture();
    const s = f.state;
    // Homes zoned south of lane A, east of the shops; lots are cut along the lane.
    paintZone(s, 'homes-low', [83, 51, 96, 54]);
    zoneNow(s);
    const before = s.lots.filter((l) => l.zone === Zone.homesLow && l.z >= 51 && l.x >= 83);
    expect(before.length).toBeGreaterThan(0);
    // A windmill on the zoned ground (taken by hand: its own footprint's lot goes with the tiles).
    const lot = before.find((l) => l.x <= 88 && l.x + l.w > 88);
    if (lot) {
      for (let z = lot.z; z < lot.z + lot.d; z++)
        for (let x = lot.x; x < lot.x + lot.w; x++) s.map.lot[z * 192 + x] = 0;
      s.lots.splice(s.lots.indexOf(lot), 1);
    }
    const mill = insertBuilding(s, null, content.buildingById.get('windmill')!, 88, 52, 2, 0, {
      site: false,
    });
    s.networkVersion += 1;
    zoneNow(s);
    zoneNow(s);
    for (const l of s.lots) {
      const g = Math.max(
        l.x - (mill.x + 1),
        mill.x - (l.x + l.w - 1),
        l.z - (mill.z + 1),
        mill.z - (l.z + l.d - 1),
      );
      expect(g, `lot ${l.id} at ${l.x},${l.z}`).toBeGreaterThan(CLEAR);
    }
  });

  it('holds in a zoned street through a few nights of growth', { timeout: 120_000 }, () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'homes-low', [83, 51, 96, 54]);
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    const mill = millByTheLane(s);
    advanceTo(s, s.tick + 4 * TICKS_PER_DAY, createTickCtx(s));
    // Growth happened on the street, and nothing stands or waits as a lot inside the clearance.
    expect(s.buildings.some((b) => b.lot && b.x >= 83 && b.id !== mill.id)).toBe(true);
    for (const b of s.buildings)
      if (b.id !== mill.id) expect(gap(b, mill), `${b.def} at ${b.x},${b.z}`).toBeGreaterThan(CLEAR);
    for (const l of s.lots) {
      const g = Math.max(
        l.x - (mill.x + 1),
        mill.x - (l.x + l.w - 1),
        l.z - (mill.z + 1),
        mill.z - (l.z + l.d - 1),
      );
      expect(g, `lot ${l.id}`).toBeGreaterThan(CLEAR);
    }
  });
});
