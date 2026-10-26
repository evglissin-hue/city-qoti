import { palette, ShapeBuilder } from '@qoti/art';
import { content } from '@qoti/content';
import { footprintSize } from '@qoti/sim';
import { Matrix4, MeshStandardMaterial, Vector3, Quaternion } from 'three';
import { levelY } from '../coords';
import { InstanceSets } from '../instances';
import { buildingGeometry, buildingMatrix, footprintHeights } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

const PLINTH = '__plinth';

/** Buildings v0: one instanced mesh per kit; a stone plinth under footprints on a slope. */
export function buildingsLayer(): RenderLayer {
  let sets: InstanceSets | null = null;
  let ctx: LayerContext | null = null;
  const plinthGeometry = new ShapeBuilder().box(0, 0, 0, 1, 1, 1, palette.plinth).build();
  const plinthMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  let plinths: InstanceSets | null = null;

  function rebuild(): void {
    if (!ctx || !sets || !plinths) return;
    const groups = new Map<string, Matrix4[]>();
    const plinthMatrices: Matrix4[] = [];
    for (const b of ctx.mirror.buildings.values()) {
      const [lo, hi] = footprintHeights(ctx.mirror, b.def, b.x, b.z, b.rot);
      const list = groups.get(b.def) ?? [];
      list.push(buildingMatrix(b.def, b.x, b.z, b.rot, hi));
      groups.set(b.def, list);
      if (hi > lo) {
        const def = content.buildingById.get(b.def);
        const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
        plinthMatrices.push(
          new Matrix4().compose(
            new Vector3(b.x, levelY(lo), b.z),
            new Quaternion(),
            new Vector3(w, levelY(hi) - levelY(lo), d),
          ),
        );
      }
    }
    sets.set(groups);
    plinths.set(new Map([[PLINTH, plinthMatrices]]));
    ctx.invalidate();
  }

  return {
    id: 'buildings',
    init(c) {
      ctx = c;
      sets = new InstanceSets(c.scene, c.material, buildingGeometry);
      plinths = new InstanceSets(c.scene, plinthMaterial, () => plinthGeometry);
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) rebuild();
    },
    dispose() {
      sets?.dispose();
      plinths?.dispose();
      plinthGeometry.dispose();
      plinthMaterial.dispose();
    },
  };
}
