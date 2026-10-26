import { wheatTileGeometry } from '@qoti/art';
import { MAP_SIZE } from '@qoti/sim';
import { Matrix4, type BufferGeometry } from 'three';
import { levelY } from '../coords';
import { InstanceSets } from '../instances';
import type { LayerContext, RenderLayer } from './types';

/**
 * Wheat fields (C3D): every tile a farmhouse tends (`fieldOwner`) grows wheat by its `crop` value,
 * from sprouts to golden ears. One instanced mesh per growth stage.
 */
export function fieldsLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let sets: InstanceSets | null = null;
  const geometries = new Map<string, BufferGeometry>();

  function geometry(key: string): BufferGeometry {
    let g = geometries.get(key);
    if (!g) {
      g = wheatTileGeometry(Number(key.slice(6)));
      geometries.set(key, g);
    }
    return g;
  }

  function rebuild(): void {
    if (!ctx || !sets) return;
    const m = ctx.mirror;
    const owner = m.layers.fieldOwner;
    const crop = m.layers.crop;
    const groups = new Map<string, Matrix4[]>();
    if (owner && crop) {
      for (let i = 0; i < owner.length; i++) {
        if (!owner[i]) continue;
        const x = i % MAP_SIZE;
        const z = Math.floor(i / MAP_SIZE);
        const key = `wheat:${Math.min(3, Math.floor((crop[i] ?? 0) / 64))}`;
        const list = groups.get(key) ?? [];
        list.push(new Matrix4().makeTranslation(x, levelY(m.height(x, z)), z));
        groups.set(key, list);
      }
    }
    sets.set(groups);
    ctx.invalidate();
  }

  return {
    id: 'fields',
    init(c) {
      ctx = c;
      sets = new InstanceSets(c.scene, c.material, geometry);
      rebuild();
    },
    update(change) {
      if (
        change.full ||
        change.rects.has('fieldOwner') ||
        change.rects.has('crop') ||
        change.rects.has('height')
      ) {
        rebuild();
      }
    },
    dispose() {
      sets?.dispose();
      for (const g of geometries.values()) g.dispose();
    },
  };
}
