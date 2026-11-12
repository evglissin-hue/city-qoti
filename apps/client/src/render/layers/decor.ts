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

/**
 * V2X: the least dab share orchard trees thin to with the season. 1 keeps them full all year: the
 * kit has no bare boughs, so a thinned crown uncovers its faceted core, a different pink, and read
 * patchy at 0.75 and as a solid faceted crown at 0.25 (and a snowy lump in winter). Lower it to
 * thin them once fruit trees have a bare look (`v2x-fruit-*` shots in docs/build/screenshots).
 */
export const FRUIT_MIN_THIN = 1;

/** The thinning step the orchard trees show on a season and day, never below `floor`. */
export function fruitStep(season: number, day: number, floor = FRUIT_MIN_THIN): number {
  return Math.max(floor, thinStep(season, day));
}

/** Options for the decor layer (the registry makes it with none). */
export interface DecorLayerOptions {
  /** The orchard's least dab share (`FRUIT_MIN_THIN` unless given; tests thin with 0.25). */
  fruitFloor?: number;
}

/** Triangles in a geometry (indexed or not). */
function triangles(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/**
 * V2X: whether a def has a far level of its own (V1B's fruit trees, V2C's dozen commonest pieces):
 * a far build lighter than the near one. Those stay in view at their far level beyond the decor
 * distance, so a town seen from afar keeps its orchards, planters and benches (a few dozen
 * triangles each); small props without one still shrink away there.
 */
export function hasFarLevel(high: BufferGeometry, low: BufferGeometry): boolean {
  return low !== high && triangles(low) < triangles(high);
}

/** A decor def's two levels, and whether it is a small prop that may shrink away far off. */
function decorKind(def: string, thin = 1, cache?: StepCache<BufferGeometry>): FieldKind {
  const high = cache ? cache.get(thin) : decorGeometry(def, 'high');
  const low = decorGeometry(def, 'low');
  if (!high.boundingSphere) high.computeBoundingSphere();
  if (!high.boundingBox) high.computeBoundingBox();
  const radius = high.boundingSphere?.radius ?? 1;
  const top = high.boundingBox?.max.y ?? 1;
  const small = radius < SMALL_RADIUS && !glows(high) && !hasFarLevel(decorGeometry(def, 'high'), low);
  return { high, low, small, height: Math.max(0.5, top) };
}

/**
 * Decor: one instanced mesh per def and level, filled from the chunks in view (V1D, lod.ts). Within
 * the preset's decor distance a piece draws at full detail, beyond it at its far level. Small props
 * shrink away there unless they have a far level of their own (V2X: orchards, planters, benches and
 * the rest of V2C's dozen) or glow (lanterns).
 */
export function decorLayer(opts: DecorLayerOptions = {}): RenderLayer {
  const floor = opts.fruitFloor ?? FRUIT_MIN_THIN;
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
      onScreen = fruitStep(cal.season, cal.day, floor);
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
      const step = fruitStep(ctx.env.shown.season, ctx.env.shown.day, floor);
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
