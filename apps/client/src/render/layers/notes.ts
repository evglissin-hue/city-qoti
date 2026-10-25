import { palette, ShapeBuilder } from '@qoti/art';
import { Matrix4 } from 'three';
import { levelY } from '../coords';
import { InstanceSets } from '../instances';
import type { LayerContext, RenderLayer } from './types';

/** Notes: a little pin with a flag on each noted tile. */
export function notesLayer(): RenderLayer {
  let sets: InstanceSets | null = null;
  let ctx: LayerContext | null = null;
  const pin = new ShapeBuilder()
    .box(-0.02, 0, -0.02, 0.02, 0.7, 0.02, palette.darkWood)
    .box(0.02, 0.48, -0.01, 0.3, 0.68, 0.01, palette.noteRed)
    .build();

  function rebuild(): void {
    if (!ctx || !sets) return;
    const matrices: Matrix4[] = [];
    for (const n of ctx.mirror.notes.values()) {
      matrices.push(new Matrix4().makeTranslation(n.x + 0.5, levelY(ctx.mirror.height(n.x, n.z)), n.z + 0.5));
    }
    sets.set(new Map([['note', matrices]]));
    ctx.invalidate();
  }

  return {
    id: 'notes',
    init(c) {
      ctx = c;
      sets = new InstanceSets(c.scene, c.material, () => pin);
      rebuild();
    },
    update(change) {
      if (change.full || change.notes) rebuild();
    },
    dispose() {
      sets?.dispose();
      pin.dispose();
    },
  };
}
