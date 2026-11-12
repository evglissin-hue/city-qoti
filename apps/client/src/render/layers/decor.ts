import { calendar } from '@qoti/sim';
import type { BufferGeometry } from 'three';
import { decorGeometry, decorMatrix, isFruitDecor } from '../kitGeometry';
import { InstanceField, SMALL_RADIUS, type FieldKind } from '../lod';
import { StepCache, thinStep } from '../thin';
import type { LayerContext, RenderLayer } from './types';

/** Whether a geometry carries lit parts (a lantern's flame): those stay in view at night, far or not. */
function glows(g: BufferGeometry): boolean {
  const a = g.getAttribute('glow');
  if (!a) return false;
  for (let i = 0; i < a.count; i++) if (a.getX(i) > 0) return true;
  return false;
}

/** V2X: orchard trees keep a quarter of their dabs through winter (the kit has no bare twigs). */
export const FRUIT_MIN_THIN = 0.25;

/** The thinning step the orchard trees show on a season and day. */
export function fruitStep(season: number, day: number): number {
  return Math.max(FRUIT_MIN_THIN, thinStep(season, day));
}

/** A decor def's two levels, and whether it is a small prop that may shrink away far off. */
function decorKind(def: string, thin = 1, cache?: StepCache<BufferGeometry>): FieldKind {
  const high = cache ? cache.get(thin) : decorGeometry(def, 'high');
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
  /** V2X: each orchard def's near geometry by thinning step, and the step on screen. */
  const fruit = new Map<string, StepCache<BufferGeometry>>();
  let onScreen = 1;

  function kindFor(def: string): FieldKind {
    if (!isFruitDecor(def)) return decorKind(def);
    let cache = fruit.get(def);
    if (!cache) fruit.set(def, (cache = new StepCache((t) => decorGeometry(def, 'high', t))));
    return decorKind(def, onScreen, cache);
  }

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
      const cal = calendar(c.mirror.tick.value);
      onScreen = fruitStep(cal.season, cal.day);
      field = new InstanceField(c.scene, c.material, kindFor);
      rebuild();
    },
    update(change) {
      if (change.full || change.decor || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
    },
    frame() {
      if (!field || !ctx?.env) return false;
      field.setDetail(ctx.env.detailDistance);
      // V2X: the orchard's thinning, a static-layer event that happens when the step changes.
      const step = fruitStep(ctx.env.shown.season, ctx.env.shown.day);
      let swapped = false;
      if (step !== onScreen) {
        onScreen = step;
        for (const [def, cache] of fruit) field.setGeometry(def, cache.get(step));
        swapped = true;
      }
      const redrew = field.update(ctx.env.camera, ctx.env.focus);
      return swapped || redrew;
    },
    dispose() {
      field?.dispose();
      // The geometries live in kitGeometry's cache, which owns them.
      fruit.clear();
    },
  };
}
