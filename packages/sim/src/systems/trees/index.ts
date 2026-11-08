import { MAP_SIZE, TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { TREE_MATURE, treeStage } from '../../map/layers';
import { isStandard } from '../../state/hamlet';
import { seasonAt } from '../../state/seasons';
import { markCharmDirty } from '../hearth/charm/dirty';

/** Ticks between growth steps: two in-game days per stage, sapling (0) to mature (3). */
export const TREE_STAGE_TICKS = 2 * TICKS_PER_DAY;

/**
 * Grows every young tree one stage each TREE_STAGE_TICKS. The stage lives in the low three bits
 * of the tree layer (species * 8 + stage), so growth reaches clients through the usual layer
 * patches. The offset keeps it off the hour boundaries other systems favor.
 */
export const trees: System = {
  id: 'trees',
  order: 30,
  every: TREE_STAGE_TICKS,
  offset: 151,
  tick(state, ctx) {
    const S = MAP_SIZE;
    const tree = state.map.tree;
    let x0 = S;
    let z0 = S;
    let x1 = -1;
    let z1 = -1;
    const standard = isStandard(state);
    // I3 (C5A): trees rest in winter (standard valleys; sandbox trees keep growing).
    if (standard && seasonAt(state.tick).season === 3) return;
    for (let i = 0; i < tree.length; i++) {
      const v = tree[i]!;
      if (!v || treeStage(v) >= TREE_MATURE) continue;
      tree[i] = v + 1;
      const x = i % S;
      const z = (i - x) / S;
      ctx.dirty.mark('tree', [x, z, x, z]);
      // Growing trees change charm (I1); sandbox valleys keep no charm.
      if (standard) markCharmDirty(state, [x, z, x, z]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    if (x1 >= 0) ctx.events.push({ e: 'tiles.changed', rect: [x0, z0, x1, z1], layers: ['tree'] });
  },
};
