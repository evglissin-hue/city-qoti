import type { Matrix4 } from 'three';
import { InstanceSets } from '../instances';
import { decorGeometry, decorMatrix } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

/** Decor v0: one instanced mesh per decor def. */
export function decorLayer(): RenderLayer {
  let sets: InstanceSets | null = null;
  let ctx: LayerContext | null = null;

  function rebuild(): void {
    if (!ctx || !sets) return;
    const groups = new Map<string, Matrix4[]>();
    for (const d of ctx.mirror.decor.values()) {
      const list = groups.get(d.def) ?? [];
      list.push(decorMatrix(ctx.mirror, d.fx, d.fz, d.rot));
      groups.set(d.def, list);
    }
    sets.set(groups);
    ctx.invalidate();
  }

  return {
    id: 'decor',
    init(c) {
      ctx = c;
      sets = new InstanceSets(c.scene, c.material, decorGeometry);
      rebuild();
    },
    update(change) {
      if (change.full || change.decor || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
    },
    dispose() {
      sets?.dispose();
    },
  };
}
