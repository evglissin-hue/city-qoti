import { artKitId, kitById } from '@qoti/art';
import { content } from '@qoti/content';
import { calendar, type EntityId, type RestKind, type SuppliesView } from '@qoti/sim';
import type { BufferGeometry } from 'three';
import { decorGeometry, decorMatrix, isCherryDecor, isFruitDecor } from '../kitGeometry';
import { InstanceField, SMALL_RADIUS, type FieldKind } from '../lod';
import { cherryLook, StepCache, thinStep, type CherryLook } from '../thin';
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
function decorKind(
  def: string,
  thin = 1,
  cache?: StepCache<BufferGeometry>,
  leaf: CherryLook = 'blossom',
): FieldKind {
  const high = cache ? cache.get(thin) : decorGeometry(def, 'high');
  const low = decorGeometry(def, 'low', undefined, leaf);
  if (!high.boundingSphere) high.computeBoundingSphere();
  if (!high.boundingBox) high.computeBoundingBox();
  const radius = high.boundingSphere?.radius ?? 1;
  const top = high.boundingBox?.max.y ?? 1;
  const small = radius < SMALL_RADIUS && !glows(high) && !hasFarLevel(decorGeometry(def, 'high'), low);
  return { high, low, small, height: Math.max(0.5, top) };
}

// --- R3F: resting pieces and the town's lamps ---------------------------------------------------

/**
 * R3F: how a supplied piece is drawn: as itself (null), resting (`19-evenings.md`, Supplies: a cold
 * fire, a bare table, faded cloth, a dry basin, an unlit lamp), or, for a lamp the town lights and
 * not resting, with its glass unlit (`off`): the lights layer lights it as the lamplighter reaches
 * it, so the lamp's own geometry never changes through the evening.
 */
export type DecorLook = RestKind | 'off' | null;

/** The look a piece takes tonight, from its def and its rest in the supplies view. */
export function decorLook(defId: string, rest: RestKind | undefined): DecorLook {
  const def = content.decorById.get(defId);
  const supply = def?.supply;
  if (!supply) return null;
  // A piece rests only as its own kind does (a lamp is never "faded").
  if (rest && rest === supply.rests) return rest;
  return supply.kind === 'nightly' ? 'off' : null;
}

/** The field key of a def in a look: the def alone when drawn as itself. */
export function decorKey(defId: string, look: DecorLook): string {
  return look ? `${defId}#${look}` : defId;
}

/** Rests by piece id from a supplies view (none without one). */
export function restsOf(view: SuppliesView | null): Map<EntityId, RestKind> {
  return new Map((view?.resting ?? []).map((r) => [r.id, r.kind]));
}

/** A def built in a look (its kit with `rest`, or `flame: 'off'`), at a level, cached. */
const lookCache = new Map<string, BufferGeometry>();
function lookGeometry(defId: string, look: Exclude<DecorLook, null>, lod: 'high' | 'low'): BufferGeometry {
  const key = `${defId}#${look}:${lod}`;
  let g = lookCache.get(key);
  if (!g) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    if (!kit) return decorGeometry(defId, lod);
    const params = { ...(def?.art.params ?? {}), ...(look === 'off' ? { flame: 'off' } : { rest: look }) };
    g = kit.build(lod === 'high' ? { params } : { params, lod });
    lookCache.set(key, g);
  }
  return g;
}

/** A piece in a look: its levels; a town lamp never shrinks away far off (its glass is lit there). */
function lookKind(defId: string, look: Exclude<DecorLook, null>): FieldKind {
  const high = lookGeometry(defId, look, 'high');
  const low = lookGeometry(defId, look, 'low');
  if (!high.boundingSphere) high.computeBoundingSphere();
  if (!high.boundingBox) high.computeBoundingBox();
  const radius = high.boundingSphere?.radius ?? 1;
  const top = high.boundingBox?.max.y ?? 1;
  const lamp = content.decorById.get(defId)?.supply?.kind === 'nightly';
  const small = !lamp && radius < SMALL_RADIUS && !glows(high) && !hasFarLevel(high, low);
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
  /**
   * V2X: each orchard def's near geometry by thinning step, and the step on screen. R3X: and by the
   * cherry's look (each look and step built once and kept), the look on screen.
   */
  const fruit = new Map<string, Map<CherryLook, StepCache<BufferGeometry>>>();
  let onScreen = 1;
  let onLook: CherryLook = 'blossom';
  const looks = (def: string): CherryLook => (isCherryDecor(def) ? onLook : 'blossom');
  const stepsOf = (def: string, leaf: CherryLook): StepCache<BufferGeometry> => {
    let byLook = fruit.get(def);
    if (!byLook) fruit.set(def, (byLook = new Map()));
    let cache = byLook.get(leaf);
    if (!cache) byLook.set(leaf, (cache = new StepCache((t) => decorGeometry(def, 'high', t, leaf))));
    return cache;
  };
  /** R3F: the rests the field was last built with, as a key, to rebuild on a change only. */
  let restKey = '';
  let seenView: SuppliesView | null | undefined;
  const keyOf = (rests: Map<EntityId, RestKind>): string =>
    [...rests].map(([id, k]) => `${id}:${k}`).join(',');

  function kindFor(key: string): FieldKind {
    const hash = key.indexOf('#');
    if (hash >= 0) return lookKind(key.slice(0, hash), key.slice(hash + 1) as Exclude<DecorLook, null>);
    const def = key;
    if (!isFruitDecor(def)) return decorKind(def);
    const leaf = looks(def);
    return decorKind(def, onScreen, stepsOf(def, leaf), leaf);
  }

  function rebuild(): void {
    if (!ctx || !field) return;
    const m = ctx.mirror;
    seenView = m.supplies.value;
    restKey = keyOf(restsOf(seenView));
    const rests = restsOf(seenView);
    field.set(
      [...m.decor.values()].map((d) => ({
        key: decorKey(d.def, decorLook(d.def, rests.get(d.id))),
        matrix: decorMatrix(m, d.fx, d.fz, d.rot),
      })),
    );
    ctx.invalidate();
  }

  return {
    id: 'decor',
    init(c) {
      ctx = c;
      const cal = calendar(c.mirror.tick.value);
      onScreen = fruitStep(cal.season, cal.day, floor);
      onLook = cherryLook(cal.season, cal.day);
      field = new InstanceField(c.scene, c.material, kindFor);
      rebuild();
    },
    update(change) {
      if (change.full || change.decor || change.rects.has('height') || change.rects.has('occupant'))
        rebuild();
    },
    frame() {
      if (!field || !ctx?.env) return false;
      // R3F: a new supplies view (the settling, a priority, a well built) rebuilds the field only
      // when the rests differ, so the lamps' nightly updates cost nothing here.
      if (ctx.mirror.supplies.value !== seenView) {
        seenView = ctx.mirror.supplies.value;
        if (keyOf(restsOf(seenView)) !== restKey) rebuild();
      }
      field.setDetail(ctx.env.detailDistance);
      // V2X: the orchard's thinning, a static-layer event that happens when the step changes.
      const step = fruitStep(ctx.env.shown.season, ctx.env.shown.day, floor);
      let swapped = false;
      // R3X: the ornamental cherry's look (blossom, leaf, turned) swaps both levels, by day.
      const look = cherryLook(ctx.env.shown.season, ctx.env.shown.day);
      if (step !== onScreen || look !== onLook) {
        onScreen = step;
        onLook = look;
        for (const def of fruit.keys()) {
          const leaf = looks(def);
          field.setGeometry(def, stepsOf(def, leaf).get(step), decorGeometry(def, 'low', undefined, leaf));
        }
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
