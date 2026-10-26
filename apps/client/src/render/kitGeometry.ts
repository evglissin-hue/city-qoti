import { constructionGeometry, kitById, ShapeBuilder, type KitBuildOptions } from '@qoti/art';
import { content } from '@qoti/content';
import {
  DECOR_ROTATIONS,
  footprintSize,
  MAP_SIZE,
  type BuildingView,
  type MapReader,
  type Rot4,
} from '@qoti/sim';
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { fpToWorld, levelY } from './coords';
import { groundY } from './surface';

const cache = new Map<string, BufferGeometry>();

function missing(): BufferGeometry {
  return new ShapeBuilder().box(-0.2, 0, -0.2, 0.2, 0.4, 0.2, 0xff00ff).build();
}

/** Geometry for a building def, built from its art kit at the def's footprint. */
export function buildingGeometry(defId: string): BufferGeometry {
  const key = `building:${defId}`;
  let g = cache.get(key);
  if (!g) {
    const def = content.buildingById.get(defId);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    g =
      def && kit
        ? kit.build({
            size: def.size,
            entrance: def.entrance,
            ...(def.art.params ? { params: def.art.params } : {}),
          })
        : missing();
    cache.set(key, g);
  }
  return g;
}

// --- C3D: per-building variants (seed, customization, runtime piles, construction stages). -------

/** Seed buckets per def: enough variety that neighbors differ, few enough that geometry is shared. */
const VARIANTS = 12;
/** Units that make a full pile, per kind of buffer. */
const FULL_STORE = 60;
const FULL_STALL = 24;
const FULL_INPUT = 8;

function pile(qty: number, full: number): number {
  return qty <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((qty / full) * 4)));
}

/** Kit params for one building: its def's params, the player's customization and runtime levels. */
export function buildingParams(b: BuildingView): Record<string, number | string | boolean> {
  const def = content.buildingById.get(b.def);
  const p: Record<string, number | string | boolean> = { ...(def?.art.params ?? {}) };
  for (const [k, v] of Object.entries(b.custom ?? {})) p[k] = v;
  const rt = b.rt;
  if (rt && b.stage === 'built') {
    const storeFull =
      def?.tags?.includes('outlet') && !def.tags.includes('storehouse') ? FULL_STALL : FULL_STORE;
    for (const [good, qty] of rt.store) p[`stock:${good}`] = pile(qty, storeFull);
    for (const [good, qty] of rt.output) p[`out:${good}`] = pile(qty, def?.outputBuffer ?? 10);
    for (const [good, qty] of rt.input) p[`in:${good}`] = pile(qty, FULL_INPUT);
    if (def?.tags?.includes('plot')) p.growth = Math.min(3, Math.floor(rt.progress * 4));
  }
  return p;
}

function variantSeed(b: BuildingView): number {
  return (b.id % VARIANTS) + 1;
}

/** Construction stage of a building view, or null when it is built. */
export function constructionStage(b: BuildingView): number | null {
  if (b.stage !== 'construction') return null;
  return b.rt?.construction?.stage ?? 0;
}

/** A stable key for everything that shapes a building's geometry. */
export function buildingKey(b: BuildingView, lod: 'high' | 'low' = 'high'): string {
  const stage = constructionStage(b);
  if (stage !== null) {
    const delivered = (b.rt?.construction?.delivered ?? [])
      .map(([g, q]) => `${g}${pile(q, 10)}`)
      .sort()
      .join(',');
    return `site:${b.def}:${stage}:${variantSeed(b)}:${delivered}`;
  }
  const params = buildingParams(b);
  const keys = Object.keys(params).sort();
  return `b:${b.def}:${variantSeed(b)}:${lod}:${keys.map((k) => `${k}=${String(params[k])}`).join(';')}`;
}

/** Kit options for a building view (seed variant, params), as the effects layer and signs need. */
export function buildingKitOptions(b: BuildingView): KitBuildOptions {
  const def = content.buildingById.get(b.def);
  return {
    ...(def ? { size: def.size, entrance: def.entrance } : {}),
    params: buildingParams(b),
    seed: variantSeed(b),
  };
}

/**
 * Geometry for one building as it stands: a construction site or the finished, customized kit.
 * Not cached: the buildings batch copies it once per key and the caller disposes it.
 */
export function buildingVariantGeometry(b: BuildingView, lod: 'high' | 'low' = 'high'): BufferGeometry {
  const def = content.buildingById.get(b.def);
  const kit = def ? kitById.get(def.art.kit) : undefined;
  const stage = constructionStage(b);
  if (!def || !kit) return missing();
  if (stage !== null) {
    const delivered: Record<string, number> = {};
    for (const [good, qty] of b.rt?.construction?.delivered ?? []) delivered[good] = pile(qty, 10);
    return constructionGeometry({ kit: def.art.kit, size: def.size, stage, delivered, seed: variantSeed(b) });
  }
  return kit.build({ ...buildingKitOptions(b), lod });
}

export function decorGeometry(defId: string): BufferGeometry {
  const key = `decor:${defId}`;
  let g = cache.get(key);
  if (!g) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    g = kit ? kit.build(def?.art.params ? { params: def.art.params } : {}) : missing();
    cache.set(key, g);
  }
  return g;
}

const SPECIES_KIT = ['', 'oak', 'birch', 'pine'];

/**
 * Forest tree geometry by tree-layer species index (1 oak, 2 birch, 3 pine) and growth stage
 * (0 to 3; the kit scales and shapes each stage).
 */
export function treeGeometry(species: number, stage = 3): BufferGeometry {
  const key = `tree:${species}:${stage}`;
  let g = cache.get(key);
  if (!g) {
    const kit = kitById.get(SPECIES_KIT[species] ?? '');
    g = kit ? kit.build({ stage }) : missing();
    cache.set(key, g);
  }
  return g;
}

const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const pos = new Vector3();
const scl = new Vector3(1, 1, 1);
const toOrigin = new Matrix4();

/** Highest and lowest height level under a footprint. */
export function footprintHeights(
  reader: MapReader,
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
): [number, number] {
  const def = content.buildingById.get(defId);
  if (!def) return [0, 0];
  const [w, d] = footprintSize(def, rot);
  let lo = 15;
  let hi = 0;
  for (let tz = z; tz < z + d; tz++) {
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) continue;
      const h = reader.height(tx, tz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return [lo, hi];
}

/** Places a building kit: rotate about the footprint center, stand it on the highest tile. */
export function buildingMatrix(
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
  baseLevel: number,
  out = new Matrix4(),
): Matrix4 {
  const def = content.buildingById.get(defId);
  const [w, d] = def?.size ?? [1, 1];
  const [rw, rd] = def ? footprintSize(def, rot) : [1, 1];
  toOrigin.makeTranslation(-w / 2, 0, -d / 2);
  q.setFromAxisAngle(up, (-rot * Math.PI) / 2);
  pos.set(x + rw / 2, levelY(baseLevel), z + rd / 2);
  out.compose(pos, q, scl).multiply(toOrigin);
  return out;
}

/** Places a decor kit at a fixed point position with a 0 to 63 rotation. */
export function decorMatrix(
  reader: MapReader,
  fx: number,
  fz: number,
  rot: number,
  out = new Matrix4(),
): Matrix4 {
  const x = fpToWorld(fx);
  const z = fpToWorld(fz);
  q.setFromAxisAngle(up, (-rot * 2 * Math.PI) / DECOR_ROTATIONS);
  // C3D-1: stand on the drawn ground, which slopes between tile centers.
  pos.set(x, groundY(reader, x, z), z);
  return out.compose(pos, q, scl);
}
