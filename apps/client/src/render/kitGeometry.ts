import {
  artKitId,
  constructionGeometry,
  isRowKit,
  kitById,
  mergeFlat,
  fitModules,
  ShapeBuilder,
  upgradeScaffold,
  type KitBuildOptions,
  WALL_KITS,
} from '@qoti/art';
import { content } from '@qoti/content';
import { drawDef } from './defs';
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
import { padLevel } from '../state/pads';
import { groundY, type SurfaceReader } from './surface';

const cache = new Map<string, BufferGeometry>();

function missing(): BufferGeometry {
  return new ShapeBuilder().box(-0.2, 0, -0.2, 0.2, 0.4, 0.2, 0xff00ff).build();
}

/** Geometry for a building def, built from its art kit at the def's footprint. */
export function buildingGeometry(defId: string): BufferGeometry {
  const key = `building:${defId}`;
  let g = cache.get(key);
  if (!g) {
    const def = drawDef(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
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

/**
 * C4E: kits whose look follows the season (fruit trees in orchards and farmsteads). Others never
 * see the season in their params, so a new season rebuilds only these.
 */
const SEASONAL_KITS = new Set(['farmstead', 'orchard']);
let drawSeason = 1;

/** Sets the season seasonal kits are drawn in (0 spring to 3 winter); true when it changed. */
export function setDrawSeason(season: number): boolean {
  if (season === drawSeason) return false;
  drawSeason = season;
  return true;
}

/**
 * Playtest round six: plots show their soil. The buildings layer hands in the map's fertility;
 * a plot's params carry it as 1 (thin) to 4 (rich) over its footprint.
 */
let soilAt: ((x: number, z: number) => number) | null = null;

export function setSoilReader(read: ((x: number, z: number) => number) | null): void {
  soilAt = read;
}

/** Fertility 0 to 100 as the four soil levels the plot kit draws. */
export function soilLevel(fertility: number): number {
  return fertility >= 70 ? 4 : fertility >= 45 ? 3 : fertility >= 25 ? 2 : 1;
}

function plotSoil(b: BuildingView): number {
  const def = drawDef(b.def);
  if (!soilAt || !def) return 3;
  const [w, d] = b.rot % 2 ? [def.size[1], def.size[0]] : def.size;
  let sum = 0;
  for (let z = b.z; z < b.z + d; z++) for (let x = b.x; x < b.x + w; x++) sum += soilAt(x, z);
  return soilLevel(sum / (w * d));
}

/**
 * V1B: joined facades. The buildings layer hands in a reader for a home's place in its row (the
 * neighbor's kit on each joined side, and the sides that face a road), read from the Mirror's
 * occupant layer; the params carry it, so the key changes, and both houses rebuild, when a
 * neighbor comes, goes or changes.
 */
let rowAt: ((b: BuildingView) => Record<string, string | boolean>) | null = null;

export function setRowReader(read: ((b: BuildingView) => Record<string, string | boolean>) | null): void {
  rowAt = read;
}

/**
 * C5E: wall pieces join the wall pieces beside them. The buildings layer hands in a reader for the
 * kit-local sides a piece has a wall neighbor on (`wx-`, `wx+`, `wz-`, `wz+`), so a run of palisade
 * or stone wall reads as one wall and turns its corners.
 */
let wallAt: ((b: BuildingView) => Record<string, boolean>) | null = null;

export function setWallReader(read: ((b: BuildingView) => Record<string, boolean>) | null): void {
  wallAt = read;
}

/**
 * C5E: waterside buildings (the River Dock, the Stone Bridge) reach out over the water behind them;
 * `span` is how many tiles of water lie straight behind the footprint's middle (up to 8), so the
 * bridge lands on the far bank.
 */
let waterAt: ((x: number, z: number) => boolean) | null = null;

export function setWaterReader(read: ((x: number, z: number) => boolean) | null): void {
  waterAt = read;
}

const spanProbe = new Vector3();
const spanMatrix = new Matrix4();

function waterSpan(b: BuildingView): number {
  const def = drawDef(b.def);
  if (!waterAt || !def) return 0;
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, spanMatrix);
  let n = 0;
  for (let k = 0; k < 8; k++) {
    spanProbe.set(def.size[0] / 2, 0, -0.5 - k).applyMatrix4(spanMatrix);
    if (!waterAt(Math.floor(spanProbe.x), Math.floor(spanProbe.z))) break;
    n++;
  }
  return n;
}

/** C5E: wall damage as the kits draw it, from hit points left in percent (0 whole to 3 down). */
export function damageLevel(hp: number | undefined): number {
  if (hp === undefined || hp >= 85) return 0;
  return hp <= 0 ? 3 : hp < 50 ? 2 : 1;
}

export function isSeasonal(defId: string): boolean {
  const def = drawDef(defId);
  const kit = def ? artKitId(def.art) : undefined;
  return !!kit && SEASONAL_KITS.has(kit);
}

/** Kit params for one building: its def's params, the player's customization and runtime levels. */
export function buildingParams(b: BuildingView): Record<string, number | string | boolean> {
  const def = drawDef(b.def);
  const p: Record<string, number | string | boolean> = { ...(def?.art.params ?? {}) };
  for (const [k, v] of Object.entries(b.custom ?? {})) p[k] = v;
  // C4E: grown buildings take their district's look; seasonal kits the season.
  if (b.style) p.style = b.style;
  if (def && SEASONAL_KITS.has(artKitId(def.art))) p.season = drawSeason;
  if (def?.tags?.includes('plot')) p.soil = plotSoil(b);
  if (rowAt && def && isRowKit(artKitId(def.art))) Object.assign(p, rowAt(b));
  if (wallAt && def && WALL_KITS.has(artKitId(def.art))) Object.assign(p, wallAt(b));
  if (def?.placement?.some((r) => r.kind === 'waterEdge')) p.span = waterSpan(b);
  // C5E: modules fitted (`mod:<slot>`), wall damage, a shut gate, a sprung trap.
  for (const [slot, m] of b.modules ?? []) {
    p[`mod:${slot}`] = m;
    // P1: the flower-boxes module brings its own boxes; the kit's would sit on the same sills.
    if (m === 'flower-boxes') p.windowBoxes = false;
  }
  const rt = b.rt;
  if (rt && b.stage === 'built') {
    if (def?.defense?.trap) {
      if (rt.hp === 0) p.sprung = true;
    } else if (rt.hp !== undefined) {
      const dmg = damageLevel(rt.hp);
      if (dmg) p.dmg = dmg;
    }
    if (rt.open === false) p.open = false;
  }
  if (rt?.method) {
    // What a grown craft or farm is making, by its method's first output.
    const out = def?.methods?.find((m) => m.id === rt.method)?.outputs[0]?.[0];
    if (out) p.make = out;
  }
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
    // V1B: sites have two levels too (the far one drops tools, poles and small stock).
    return `site:${b.def}:${stage}:${variantSeed(b)}:${delivered}${lod === 'low' ? ':low' : ''}`;
  }
  const params = buildingParams(b);
  const keys = Object.keys(params).sort();
  const up = b.rt?.upgrading ? ':up' : '';
  return `b:${b.def}:${variantSeed(b)}:${lod}${up}:${keys.map((k) => `${k}=${String(params[k])}`).join(';')}`;
}

/** Kit options for a building view (seed variant, params), as the effects layer and signs need. */
export function buildingKitOptions(b: BuildingView): KitBuildOptions {
  const def = drawDef(b.def);
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
  const def = drawDef(b.def);
  const kit = def ? kitById.get(artKitId(def.art)) : undefined;
  const stage = constructionStage(b);
  if (!def || !kit) return missing();
  if (stage !== null) {
    const delivered: Record<string, number> = {};
    for (const [good, qty] of b.rt?.construction?.delivered ?? []) delivered[good] = pile(qty, 10);
    return constructionGeometry({
      kit: artKitId(def.art),
      size: def.size,
      stage,
      delivered,
      seed: variantSeed(b),
      ...(lod === 'low' ? { lod } : {}),
    });
  }
  const opts = { ...buildingKitOptions(b), lod };
  let g = kit.build(opts);
  // C5E: modules fitted to the kit as built (the wall kits draw their own).
  if (b.modules?.length && !WALL_KITS.has(artKitId(def.art))) {
    const fitted = fitModules(g, opts);
    g.dispose();
    g = fitted;
  }
  if (!b.rt?.upgrading) return g;
  // C4E: a home upgrade under way: scaffolding round the house as it stands.
  const merged = mergeFlat([g, upgradeScaffold(artKitId(def.art), def.size, variantSeed(b), lod)]);
  g.dispose();
  return merged;
}

/** A decor kit's geometry; V1D: `lod` picks the kit's far level (lod.ts chooses which shows). */
export function decorGeometry(defId: string, lod: 'high' | 'low' = 'high'): BufferGeometry {
  const key = lod === 'high' ? `decor:${defId}` : `decor:${defId}:${lod}`;
  let g = cache.get(key);
  if (!g) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    const params = def?.art.params ? { params: def.art.params } : {};
    g = kit ? kit.build(lod === 'high' ? params : { ...params, lod }) : missing();
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
  const def = drawDef(defId);
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

/**
 * The level a building stands at: its flat pad, which the ground is drawn to as well. A placed
 * building asks the reader (the Mirror caches pads); a ghost works it out from its def.
 */
export function standLevel(
  reader: Pick<MapReader, 'height' | 'water' | 'occupant'> & Pick<SurfaceReader, 'padLevel'>,
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
): number {
  if (reader.padLevel && reader.occupant(x, z)) return reader.padLevel(x, z);
  return padLevel(reader, drawDef(defId), x, z, rot);
}

/** Places a building kit: rotate about the footprint center, stand it on its pad's level. */
export function buildingMatrix(
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
  baseLevel: number,
  out = new Matrix4(),
): Matrix4 {
  const def = drawDef(defId);
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
