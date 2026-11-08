import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../src/constants';
import { TREE_SPECIES, treeSpecies, treeStage, treeValue } from '../src/map/layers';
import { createWorld, defaultSettings } from '../src/state/create';
import { TREE_STAGE_TICKS, trees } from '../src/systems/trees';
import { pipeline } from '../src/systems';
import { createTickCtx } from '../src/turn';

describe('trees system', () => {
  it('runs on its every and offset schedule', () => {
    expect(trees.every).toBe(TREE_STAGE_TICKS);
    expect(trees.offset).toBeLessThan(TREE_STAGE_TICKS);
  });

  it('grows a sapling one stage per two days, keeps the species, and stops at mature', () => {
    const world = createWorld('grow', defaultSettings());
    const [x0, z0] = world.meta.startArea;
    const i = (z0 + 12) * MAP_SIZE + x0 + 12;
    world.map.tree[i] = treeValue(TREE_SPECIES.birch, 0);
    const ctx = createTickCtx(world);
    const before = world.map.tree.slice();
    for (let stage = 1; stage <= 3; stage++) {
      trees.tick(world, ctx);
      expect(treeStage(world.map.tree[i]!)).toBe(stage);
      expect(treeSpecies(world.map.tree[i]!)).toBe(TREE_SPECIES.birch);
    }
    trees.tick(world, ctx);
    expect(treeStage(world.map.tree[i]!)).toBe(3);
    // Mature worldgen trees never change.
    for (let k = 0; k < before.length; k++) {
      if (k !== i && before[k] && treeStage(before[k]!) === 3) expect(world.map.tree[k]).toBe(before[k]);
    }
  });

  it('is in the tick pipeline, and worldgen trees start mature', () => {
    expect(pipeline.some((s) => s.id === 'trees')).toBe(true);
    const world = createWorld('woods', defaultSettings());
    for (const v of world.map.tree) if (v) expect(treeStage(v)).toBe(3);
  });
});
