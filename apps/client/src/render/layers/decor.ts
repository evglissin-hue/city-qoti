import type { BufferGeometry } from 'three';
import { decorGeometry, decorMatrix } from '../kitGeometry';
import { InstanceField, SMALL_RADIUS, type FieldKind } from '../lod';
import type { LayerContext, RenderLayer } from './types';

/** Whether a geometry carries lit parts (a lantern's flame): those stay in view at night, far or not. */
function glows(g: BufferGeometry): boolean {
  const a = g.getAttribute('glow');
  if (!a) return false;
  for (let i = 0; i < a.count; i++) if (a.getX(i) > 0) return true;
  return false;
}

/** A decor def's two levels, and whether it is a small prop that may shrink away far off. */
function decorKind(def: string): FieldKind {
  const high = decorGeometry(def, 'high');
  const low = decorGeometry(def, 'low');
  if (!high.boundingSphere) high.computeBoundingSphere();
  if (!high.boundingBox) high.computeBoundingBox();
  const radius = high.boundingSphere?.radius ?? 1;
  const top = high.boundingBox?.max.y ?? 1;
  return { high, low, small: radius < SMALL_RADIUS && !glows(high), height: Math.max(0.5, top) };
}

/**
 * Decor: one instanced mesh per def and level, filled from the chunks in view (V1D, lod.ts). Within
 * the preset's decor distance a piece draws at full detail, beyond it at its far level, and small
 * props (benches, planters, crates) shrink away there; lanterns and other lit pieces stay.
 */
export function decorLayer(): RenderLayer {
  let field: InstanceField | null = null;
  let ctx: LayerContext | null = null;

  function rebuild(): void {
    if (!ctx || !field) return;
    const m = ctx.mirror;
    field.set([...m.decor.values()].map((d) => ({ key: d.def, matrix: decorMatrix(m, d.fx, d.fz, d.rot) })));
    ctx.invalidate();
  }

  return {
    id: 'decor',
    init(c) {
      ctx = c;
      field = new InstanceField(c.scene, c.material, decorKind);
      rebuild();
    },
    update(change) {
      if (change.full || change.decor || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
    },
    frame() {
      if (!field || !ctx?.env) return false;
      field.setDetail(ctx.env.detailDistance);
      return field.update(ctx.env.camera, ctx.env.focus);
    },
    dispose() {
      field?.dispose();
    },
  };
}
