// R3H: the readers read the level. Crew, felling range, storage, reach, food coverage and capacity
// each come from the level's entry in the def's `levels` (state/zones.ts atLevel, never a multiplier).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { Road, TREE_MATURE, TREE_SPECIES, treeStage, treeValue } from '../../src/map/layers';
import { atLevel, coverageAt, jobsOf, storageOf } from '../../src/state/zones';
import { nearestOutletWithFood } from '../../src/systems/economy/outlets';
import { storageSpace } from '../../src/systems/logistics/stores';
import { doorTile } from '../../src/systems/movement/api';
import { crewWork } from '../../src/systems/production';
import { capacityOf, specializedReach, withinReach } from '../../src/systems/specialized/api';
import { hamletFixture } from '../fixtures/hamlet';
import { hire, stockOf, ticks, toWork } from '../ledger/helpers';
import { good, spot } from './helpers';

const S = MAP_SIZE;
const H = TICKS_PER_HOUR;

function atLevelOf(state: WorldState, def: string, level: number, x: number, z: number): Building {
  return spot(state, def, x, z, level);
}

describe('crew', () => {
  it("jobsOf reads the level: a Forester's Lodge 3, 4, 5", () => {
    const { state } = hamletFixture();
    expect([1, 2, 3].map((l) => jobsOf(atLevelOf(state, 'foresters-lodge', l, 120, 80)))).toEqual([3, 4, 5]);
  });

  it('every def with crew levels reads them through jobsOf, one level at a time', () => {
    const { state } = hamletFixture();
    let n = 0;
    for (const def of content.buildings) {
      const crew = def.levels?.crew;
      if (!crew) continue;
      for (let l = 1; l <= crew.length; l++) {
        n++;
        expect(jobsOf(atLevelOf(state, def.id, l, 120, 100)), `${def.id} level ${l}`).toBe(crew[l - 1]);
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  /** A Lodge at (120, 80) with its woods and a grove to fell, four hands at work. */
  function lodgeWithHands(level: number) {
    const f = hamletFixture();
    f.state.buildings.find((b) => b.id === f.b.stall)!.rt!.store[good('firewood')] = 500;
    const lodge = spot(f.state, 'foresters-lodge', 120, 80, level);
    let n = 0;
    for (const z of [72, 73])
      for (let x = 112; x <= 130 && n < 12; x++) {
        const i = z * S + x;
        if (f.state.map.occupant[i] || f.state.map.road[i] || f.state.map.tree[i]) continue;
        f.state.map.tree[i] = treeValue(TREE_SPECIES.oak, 0);
        n++;
      }
    for (let z = 84; z < 90; z++)
      for (let x = 122; x < 130; x++) f.state.map.tree[z * S + x] = treeValue(TREE_SPECIES.oak, 3);
    toWork(f.state, hire(f.state, lodge.id, 4));
    return { f, lodge };
  }

  it('a level 2 Lodge works with four hands, a level 1 with three: trees felled in three hours show it', () => {
    const one = lodgeWithHands(1);
    const two = lodgeWithHands(2);
    const def = content.buildingById.get('foresters-lodge')!;
    const method = def.methods![0]!;
    const w1 = crewWork(one.f.state, one.lodge, def, one.lodge.rt!, method);
    const w2 = crewWork(two.f.state, two.lodge, def, two.lodge.rt!, method);
    // The crew's power is the hands at work up to the level's crew: four to three.
    expect(w1 * 4).toBe(w2 * 3);
    // A tree a hand every three hours: three trees down at level 1, four at level 2.
    const grove = (s: WorldState): number => {
      let n = 0;
      for (let z = 84; z < 90; z++)
        for (let x = 122; x < 130; x++) if (treeStage(s.map.tree[z * S + x]!) >= TREE_MATURE) n++;
      return n;
    };
    expect(grove(one.f.state)).toBe(48);
    // The yard is emptied as it fills (a porter's job), so the lodge's output cap does not stop it.
    for (const w of [one, two])
      for (let i = 0; i < 3 * H + 40; i += 20) {
        ticks(w.f.state, 20);
        w.lodge.rt!.output.fill(0);
      }
    expect(48 - grove(one.f.state)).toBe(3);
    expect(48 - grove(two.f.state)).toBe(4);
  });

  it("the Lodge's felling range grows by level: a tree at 9 tiles is felled only from level 2", () => {
    const lodgeAndTree = (level: number) => {
      const f = hamletFixture();
      f.state.buildings.find((b) => b.id === f.b.stall)!.rt!.store[good('firewood')] = 500;
      const lodge = spot(f.state, 'foresters-lodge', 120, 80, level);
      let n = 0;
      // Saplings along the far side keep the woods rule met, so it fells instead of planting.
      for (const z of [72, 73])
        for (let x = 112; x <= 130 && n < 12; x++) {
          const i = z * S + x;
          if (f.state.map.occupant[i] || f.state.map.road[i] || f.state.map.tree[i]) continue;
          f.state.map.tree[i] = treeValue(TREE_SPECIES.oak, 0);
          n++;
        }
      // The footprint is 2 wide: its far edge is x 121, nine tiles on is x 130.
      const at = 80 * S + 130;
      f.state.map.tree[at] = treeValue(TREE_SPECIES.oak, 3);
      toWork(f.state, hire(f.state, lodge.id, 1));
      return { f, lodge, at };
    };
    const a = lodgeAndTree(1);
    expect(atLevel(a.lodge, 'reach', 8)).toBe(8);
    ticks(a.f.state, 3 * H);
    expect(a.f.state.map.tree[a.at]).not.toBe(0);
    expect(stockOf(a.lodge, 'output', 'timber')).toBe(0);
    const b = lodgeAndTree(2);
    expect(atLevel(b.lodge, 'reach', 8)).toBe(10);
    ticks(b.f.state, 3 * H);
    expect(b.f.state.map.tree[b.at]).toBe(0);
    expect(stockOf(b.lodge, 'output', 'timber')).toBe(4);
  });
});

describe('storage', () => {
  it('storageOf and storageSpace: a Granary keeps 1,200, 1,680, 2,160', () => {
    const { state } = hamletFixture();
    const sizes: number[] = [];
    const room: number[] = [];
    for (const l of [1, 2, 3]) {
      const g = atLevelOf(state, 'granary', l, 120 + l * 8, 100);
      g.rt!.store[good('grain')] = 100;
      sizes.push(storageOf(g));
      room.push(storageSpace(g, g.rt!));
    }
    expect(sizes).toEqual([1200, 1680, 2160]);
    expect(room).toEqual([1100, 1580, 2060]);
  });

  it('a Storehouse and a Trading Post follow their own tables', () => {
    const { state } = hamletFixture();
    expect([1, 2, 3].map((l) => storageOf(atLevelOf(state, 'storehouse', l, 100 + l * 8, 100)))).toEqual([
      800, 1120, 1440,
    ]);
    expect([1, 2, 3].map((l) => storageOf(atLevelOf(state, 'trading-post', l, 100 + l * 8, 112)))).toEqual([
      200, 280, 360,
    ]);
  });

  it('the level above the table never reads past its last entry', () => {
    const { state } = hamletFixture();
    const g = atLevelOf(state, 'granary', 3, 120, 100);
    g.level = 9;
    expect(storageOf(g)).toBe(2160);
  });
});

describe('reach', () => {
  /** A Market Stall at (120, 100) on a straight lane running east from its door. */
  function stallOnLane(level: number) {
    const { state } = hamletFixture();
    const stall = spot(state, 'market-stall', 120, 100, level);
    const door = doorTile(stall);
    const dx = door % S;
    const dz = Math.floor(door / S);
    for (let x = dx; x < dx + 30; x++) state.map.road[dz * S + x] = Road.lane;
    return { state, stall, door, dx, dz };
  }

  it('specializedReach reads the level: a Stall 14, 18, 22', () => {
    const { state } = hamletFixture();
    expect([1, 2, 3].map((l) => specializedReach(atLevelOf(state, 'market-stall', l, 120, 100)))).toEqual([
      14, 18, 22,
    ]);
  });

  it('a level change walks the reach again: a road tile 16 tiles away is in reach from level 2 only', () => {
    const { state, stall, dx, dz } = stallOnLane(1);
    const far = dz * S + dx + 16;
    expect(withinReach(state, stall, far)).toBe(false);
    stall.level = 2;
    expect(withinReach(state, stall, far)).toBe(true);
    // 20 tiles is past level 2 and inside level 3; a slide takes it back.
    const farther = dz * S + dx + 20;
    expect(withinReach(state, stall, farther)).toBe(false);
    stall.level = 3;
    expect(withinReach(state, stall, farther)).toBe(true);
    stall.level = 1;
    expect(withinReach(state, stall, far)).toBe(false);
  });

  it('a home 16 tiles away shops at a level 2 Stall and not at level 1 (the food coverage)', () => {
    const { state, stall, dx, dz } = stallOnLane(1);
    stall.rt!.store[good('bread')] = 20;
    const home = dz * S + dx + 16;
    expect(coverageAt(stall, 'food', 14)).toBe(14);
    expect(nearestOutletWithFood(state, home)).not.toBe(stall.id);
    stall.level = 2;
    expect(coverageAt(stall, 'food', 14)).toBe(18);
    expect(nearestOutletWithFood(state, home)).toBe(stall.id);
    stall.level = 3;
    expect(coverageAt(stall, 'food', 14)).toBe(22);
    stall.level = 1;
    expect(nearestOutletWithFood(state, home)).not.toBe(stall.id);
  });
});

describe('capacity', () => {
  it('a Windmill has room for 2, 3, 4 bakers', () => {
    const { state } = hamletFixture();
    const caps = [1, 2, 3].map((l) => capacityOf(state, atLevelOf(state, 'windmill', l, 150 + l * 8, 130)));
    expect(caps).toEqual([2, 3, 4]);
  });

  it('a raised Windmill has room for 4, 5, 6', () => {
    const { state } = hamletFixture();
    const mills = [1, 2, 3].map((l) => atLevelOf(state, 'windmill', l, 150 + l * 10, 130));
    for (const m of mills) {
      const def = content.buildingById.get('windmill')!;
      for (let dz = 0; dz < def.size[1]; dz++)
        for (let dx = 0; dx < def.size[0]; dx++) state.map.height[(m.z + dz) * S + m.x + dx] = 8;
    }
    expect(mills.map((m) => capacityOf(state, m))).toEqual([4, 5, 6]);
  });

  it('a Sawmill 3, 4, 5, and a frozen river takes one carpenter from each', () => {
    const { state } = hamletFixture();
    const mills = [1, 2, 3].map((l) => atLevelOf(state, 'sawmill', l, 100 + l * 10, 130));
    expect(mills.map((m) => capacityOf(state, m))).toEqual([3, 4, 5]);
    state.weather.river.frozen = true;
    expect(mills.map((m) => capacityOf(state, m))).toEqual([2, 3, 4]);
  });
});
