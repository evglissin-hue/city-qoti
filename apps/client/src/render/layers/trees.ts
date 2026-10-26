import { MAP_SIZE, treeSpecies, treeStage } from '@qoti/sim';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { hash2, levelY } from '../coords';
import { InstanceSets } from '../instances';
import { treeGeometry } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

const STAGE_SCALE = [0.35, 0.55, 0.8, 1];
const up = new Vector3(0, 1, 0);

/** Forest trees v0: instanced cone or blob and trunk per species, scaled by growth stage. */
export function treesLayer(): RenderLayer {
  let sets: InstanceSets | null = null;
  let ctx: LayerContext | null = null;

  function rebuild(): void {
    if (!ctx || !sets) return;
    const groups = new Map<string, Matrix4[]>();
    const tree = ctx.mirror.layers.tree;
    const q = new Quaternion();
    for (let i = 0; i < tree.length; i++) {
      const v = tree[i]!;
      if (!v) continue;
      const x = i % MAP_SIZE;
      const z = Math.floor(i / MAP_SIZE);
      const key = String(treeSpecies(v));
      const jitter = hash2(x, z, 7);
      const scale = (STAGE_SCALE[treeStage(v)] ?? 1) * (0.85 + jitter * 0.3);
      q.setFromAxisAngle(up, jitter * Math.PI * 2);
      const m = new Matrix4().compose(
        new Vector3(
          x + 0.3 + hash2(x, z, 1) * 0.4,
          levelY(ctx.mirror.height(x, z)),
          z + 0.3 + hash2(x, z, 2) * 0.4,
        ),
        q,
        new Vector3(scale, scale, scale),
      );
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    sets.set(groups);
    ctx.invalidate();
  }

  return {
    id: 'trees',
    init(c) {
      ctx = c;
      sets = new InstanceSets(c.scene, c.material, (key) => treeGeometry(Number(key)));
      rebuild();
    },
    update(change) {
      if (change.full || change.rects.has('tree') || change.rects.has('height')) rebuild();
    },
    dispose() {
      sets?.dispose();
    },
  };
}
