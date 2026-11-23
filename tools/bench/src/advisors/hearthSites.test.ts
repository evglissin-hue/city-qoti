// P3A: the two ways the Hearth's garden bed used to be left behind (the audit's site-stalled and
// "never put first" flags on oak/newcomer and willow/year). A bed whose door the Hearth's own
// flower beds had walled off is not placed (the sim's CUT_OFF check ignores decor); and a stocked
// site is raised after four hours, not twelve.
import { content } from '@qoti/content';
import { canPlaceBuilding, doorTile, TICKS_PER_HOUR, worldIndex, type Building, type Rot4 } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { command, runTicks, startingTown } from '../hamlet';
import { Planner } from '../planner';
import { hearth } from './hearth';

const BED = 'garden-bed';

/** A spot for a bed near the first cottage with its door tile free. */
function bedSpot(h: ReturnType<typeof startingTown>): [number, number] {
  const w = h.world;
  const home = w.buildings.find((b) => b.def === 'cottage')!;
  const def = content.buildingById.get(BED)!;
  const reader = worldIndex(w).reader;
  for (let r = 2; r <= 6; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = home.x + dx;
        const z = home.z + dz;
        if (canPlaceBuilding(reader, def, x, z, 0 as Rot4).ok) return [x, z];
      }
  throw new Error('no spot for a bed');
}

describe('the Hearth and a garden bed', { timeout: 60_000 }, () => {
  it('does not set a bed down where every way to its door is walled off', () => {
    const h = startingTown('hearth-sites-1', { standIn: false });
    const w = h.world;
    w.time.connected = [0, 1];
    runTicks(h, 2 * TICKS_PER_HOUR);
    const p = new Planner(h);
    const [x, z] = bedSpot(h);
    expect(p.doorWalkable(BED, x, z, 0)).toBe(true);
    // Wall every neighbor of the door that is not the bed itself (a flower bed, a tree: decor that
    // blocks walking; the walk grid reads the occupant map the same way).
    const door = doorTile({ def: BED, x, z, rot: 0 } as Building);
    const S = 192;
    for (const n of [door + 1, door - 1, door + S, door - S]) {
      const nx = n % S;
      const nz = Math.floor(n / S);
      if (nx >= x && nx < x + 2 && nz >= z && nz < z + 2) continue;
      w.map.occupant[n] = 999_999;
    }
    w.networkVersion++;
    expect(p.doorWalkable(BED, x, z, 0)).toBe(false);
  });

  it('raises a stocked bed that no builder has touched after four hours', () => {
    const h = startingTown('hearth-sites-2', { standIn: false });
    const w = h.world;
    w.time.connected = [0, 1];
    runTicks(h, 2 * TICKS_PER_HOUR);
    const p = new Planner(h);
    const [x, z] = bedSpot(h);
    expect(command(h, [{ t: 'build.place', def: BED, x, z, rot: 0 }])).toEqual([true]);
    const bed = w.buildings.find((b) => b.def === BED)!;
    const c = bed.rt!.construction!;
    c.needs.fill(0);
    const advisor = hearth.create(p) as unknown as { nudgeSites(): void };
    advisor.nudgeSites();
    expect(c.priority).toBe(false);
    w.tick += 3 * TICKS_PER_HOUR;
    advisor.nudgeSites();
    expect(c.priority).toBe(false);
    w.tick += 2 * TICKS_PER_HOUR;
    advisor.nudgeSites();
    expect(c.priority).toBe(true);
  });
});
