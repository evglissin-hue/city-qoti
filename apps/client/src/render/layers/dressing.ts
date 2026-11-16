import {
  anchorsFor,
  artKitId,
  boundsOf,
  clearanceOf,
  cloneClearance,
  fitPlacement,
  kitById,
  markPlacement,
  doorCorridor,
  placementFree,
  resolveDressing,
  rulesFor,
  subjectKey,
  type AnchorPoint,
  type AnchorRun,
  type Clearance,
  type DressingSubject,
  type GroundBox,
  type PieceBounds,
  type Placement,
} from '@qoti/art';
import {
  content,
  type DressingRule,
  type DressingSeason,
  type DressingStat,
  type DressingTier,
} from '@qoti/content';
import {
  MAP_SIZE,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type BuildingView,
  type LotView,
} from '@qoti/sim';
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { Mirror } from '../../state/mirror';
import { fpToWorld } from '../coords';
import { drawDef } from '../defs';
import { DressingBatch } from '../dressingBatch';
import { buildingKey, buildingMatrix, buildingVariantGeometry, standLevel } from '../kitGeometry';
import type { LightDisc } from '../lightMap';
import { lampColor } from '../lighting';
import { levelFor, SMALL_RADIUS, type Level } from '../lod';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * V3.0: the dressing layer's stub (docs/spec/17-presentation.md, Visual direction, second pass,
 * item 4). It keeps each building's placements (the pieces on its plot, from the resolver) up to
 * date as the Mirror changes, and draws nothing: V3A adds the instanced draws. With the shipped
 * rules table empty, a frame costs nothing and never drops the still frame.
 */

/**
 * Medium's budget for the layer, within the decor detail distance (docs/spec/17-presentation.md,
 * item 4). V3A's pieces go in one instanced draw per piece family.
 */
export const DRESSING_BUDGET = { triangles: 300_000, draws: 12 } as const;

/** The resolver's seed. Nothing seat-specific goes in it: both seats draw the same plot. */
export const DRESSING_SEED = 0x5eed1e55;

const SEASONS: readonly DressingSeason[] = ['spring', 'summer', 'autumn', 'winter'];
/** Tiers by standing, for the `cloth` stand-in. A change in the sim's `TierId` breaks this build. */
const TIER_ORDER: Readonly<Record<DressingTier, number>> = {
  settler: 0,
  craftsfolk: 1,
  merchant: 2,
  patron: 3,
};
/** How long a baby counts toward `births`, in days. */
const BIRTH_DAYS = 28;

function seasonOf(mirror: Mirror): DressingSeason {
  return SEASONS[mirror.clock.value.season] ?? 'spring';
}

/** Today's absolute day, as the agents layer counts it for `bornDay`. */
function absoluteDay(mirror: Mirror): number {
  return Math.floor((mirror.tick.value + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

function sum(pairs: readonly (readonly [string, number])[] | undefined): number {
  let n = 0;
  for (const p of pairs ?? []) n += p[1];
  return n;
}

/** The household whose home this building is (the lowest id when several), or undefined. */
function householdOf(mirror: Mirror, buildingId: number) {
  let best;
  for (const h of mirror.households.values())
    if (h.homeId === buildingId && (!best || h.id < best.id)) best = h;
  return best;
}

/**
 * What the resolver knows about one building. Shared state only: everything here is the same in
 * both seats' Mirrors. Never a seat's own state, never `custom` or anything one seat set alone.
 * `place` is left out (R2's places are not on `main`: a gap until R2X).
 */
export function dressingSubject(mirror: Mirror, b: BuildingView): DressingSubject {
  const def = drawDef(b.def);
  const season = seasonOf(mirror);
  let kind: DressingSubject['kind'] = null;
  if (b.stage === 'built' && def) {
    if (b.trade) kind = 'business';
    else if (def.category === 'home') kind = 'home';
    else if (def.specialized) kind = 'specialized';
  }
  const level = b.level ?? 1;
  const h = householdOf(mirror, b.id);
  const tier: DressingTier | undefined = h?.tier;
  const members = h?.members.length ?? 0;
  let births = 0;
  if (h) {
    const today = absoluteDay(mirror);
    for (const id of h.members) {
      const r = mirror.residents.get(id);
      if (r && r.stage === 'child' && r.bornDay !== undefined && today - r.bornDay < BIRTH_DAYS) births++;
    }
  }
  const capacity = def?.storage ?? 0;
  const fill = capacity > 0 ? Math.min(100, Math.max(0, Math.round((sum(b.rt?.store) / capacity) * 100))) : 0;
  const stats: Partial<Record<DressingStat, number>> = {
    births,
    cloth: tier ? TIER_ORDER[tier] : 0,
    fill,
    firewood: season === 'autumn' || season === 'winter' ? members * 2 : members,
    level,
    members,
    stock: sum(b.rt?.output),
    workers: b.rt?.workers ?? 0,
  };
  return {
    id: b.id,
    def: b.def,
    kind,
    ...(b.trade ? { trade: b.trade } : {}),
    level,
    ...(tier ? { tier } : {}),
    season,
    stats,
  };
}

/** The lot as a box in the building's kit-local space (the inverse of `buildingMatrix`). */
const toLocal = new Matrix4();
const corner = new Vector3();

/**
 * The building's lot as a box in its kit-local space (the space `anchorsFor` takes `lot` in): the
 * lot's world corners through the inverse of the building's own matrix, so side and back gardens
 * land where the kit sees them. Exported for its test.
 */
export function lotBox(b: BuildingView, lot: LotView): GroundBox {
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, toLocal).invert();
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of [
    [lot.x, lot.z],
    [lot.x + lot.w, lot.z + lot.d],
  ] as const) {
    corner.set(x, 0, z).applyMatrix4(toLocal);
    // Snap away float noise from the quarter turn, so equal lots give equal cache keys.
    const lx = Math.round(corner.x * 1e4) / 1e4 + 0;
    const lz = Math.round(corner.z * 1e4) / 1e4 + 0;
    x0 = Math.min(x0, lx);
    z0 = Math.min(z0, lz);
    x1 = Math.max(x1, lx);
    z1 = Math.max(z1, lz);
  }
  return [x0, z0, x1, z1];
}

/**
 * V3A: how far a yard may reach past its lot onto free ground beside it (tiles). Half a tile, so two
 * neighbours across a one-tile gap share it. A stand-in until V3B's `yardOf` (wave notes, Stand-ins):
 * grown kits fill their plots almost to the edge, so on a lot the size of its house the dressing would
 * otherwise have nowhere to stand.
 */
export const YARD_REACH = 0.5;

/** Tiles the dressing may spill onto: no building, road, water, tree, lot, field or decor. */
export function freeTile(mirror: Mirror, decorTiles: ReadonlySet<number>, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return false;
  const i = z * MAP_SIZE + x;
  if (decorTiles.has(i)) return false;
  if (mirror.occupant(x, z) || mirror.road(x, z) || mirror.water(x, z) || mirror.tree(x, z)) return false;
  const layers = (mirror as { layers?: Partial<Record<string, ArrayLike<number>>> }).layers;
  return !layers?.lot?.[i] && !layers?.fieldOwner?.[i];
}

/** The tiles decor stands on (world tile index), for `freeTile`. */
export function decorTilesOf(mirror: Mirror): Set<number> {
  const out = new Set<number>();
  for (const d of mirror.decor?.values() ?? [])
    out.add(Math.floor(fpToWorld(d.fz)) * MAP_SIZE + Math.floor(fpToWorld(d.fx)));
  return out;
}

/**
 * The lot grown by `YARD_REACH` on each side whose whole strip of neighbouring tiles is free (world
 * space, as `LotView`): the yard a building's dressing may use. The road side is never free.
 */
export function roomyLot(mirror: Mirror, decorTiles: ReadonlySet<number>, lot: LotView): LotView {
  const { x, z, w, d } = lot;
  const strip = (tiles: [number, number][]): boolean =>
    tiles.every(([tx, tz]) => freeTile(mirror, decorTiles, tx, tz));
  const run = (n: number, f: (i: number) => [number, number]): [number, number][] =>
    Array.from({ length: n }, (_, i) => f(i));
  const west = strip(run(d, (i) => [x - 1, z + i]));
  const east = strip(run(d, (i) => [x + w, z + i]));
  const north = strip(run(w, (i) => [x + i, z - 1]));
  const south = strip(run(w, (i) => [x + i, z + d]));
  const r = YARD_REACH;
  const x0 = x - (west ? r : 0);
  const z0 = z - (north ? r : 0);
  return { ...lot, x: x0, z: z0, w: x + w + (east ? r : 0) - x0, d: z + d + (south ? r : 0) - z0 };
}

export interface DressingLayer extends RenderLayer {
  /** The placements on one building's plot (kit-local, after fitting), empty when none. */
  placementsOf(id: number): readonly Placement[];
  /** All placements over all buildings, for the debug overlay. */
  placementCount(): number;
  /** V3A: instances visible after the last camera update (for tests and the perf overlay). */
  drawnCount(): number;
  /** V3A: instances in the batch, visible or not. */
  instanceCount(): number;
}

/** One drawn piece: its batch instance and what the camera pass needs. */
interface Inst {
  instance: number;
  /** The world matrix, unshrunk. */
  m: Matrix4;
  x: number;
  y: number;
  z: number;
  near: number;
  far: number;
  small: boolean;
  level: Level | undefined;
  shown: boolean;
  /** The shrink currently written into the instance matrix. */
  shrink: number;
}

interface Cached {
  key: string;
  /** Where the building stands (position, turn, pad level): the pieces' matrices follow it. */
  mkey: string;
  placements: Placement[];
  insts: Inst[];
  lamps: LightDisc[];
}

interface PieceInfo {
  bounds: PieceBounds;
  /** Bounding radius (tiles) of the piece, for the small-prop test. */
  radius: number;
  lights: readonly [number, number, number][];
}

function signature(p: readonly Placement[]): string {
  let s = '';
  for (const q of p)
    s += `${q.rule}|${q.anchor ?? ''}|${q.kit}|${q.at.join(',')}|${q.yaw}|${q.scale}|${q.seed}|${JSON.stringify(q.params ?? null)};`;
  return s;
}

/** The lamplighter's hours for the yards: 17:00 to 23:00. */
export function yardsLit(hour: number): boolean {
  return hour >= 17 && hour < 23;
}

/** How far a yard lamp throws, by kit (a sill lamp less far). */
function lampRadius(kit: string): number {
  return kit === 'yard-lamp' ? 1.3 : kit === 'yard-sill-lamp' ? 0.8 : 1.2;
}

const LAMP_INTENSITY = 0.85;
const GOODS_DISC: readonly [radius: number, intensity: number] = [1.1, 0.5];
/** The share of the detail distance within which pieces draw near. */
const NEAR_SHARE = 0.45;
/** Small pieces shrink over the last share of the distance. */
const FADE_SHARE = 0.85;

const UP = new Vector3(0, 1, 0);
const baseM = new Matrix4();
const localM = new Matrix4();
const shrunkM = new Matrix4();
const posV = new Vector3();
const quatQ = new Quaternion();
const sclV = new Vector3();
const lampV = new Vector3();

function variantOf(p: Placement): number {
  return p.seed % 4;
}

function geoKey(p: Placement): string {
  return `${p.kit}|${JSON.stringify(p.params ?? null)}|${variantOf(p)}`;
}

/** How far out past the plot's front edge a doorstep sign stands (within `FRONT_OVERHANG`). */
const SIGN_OUT = 0.08;
/** How far from its anchor a piece may move to find room (tiles). */
const NEAREST_REACH = 1.1;

/**
 * The nearest spot within `NEAREST_REACH` of where the anchor put a piece (1/8 tile steps, keeping
 * its turn) that is clear, inside the lot and off the door's path, or null. Deterministic.
 */
export function nearestFree(
  p: Placement,
  bounds: PieceBounds,
  clear: Clearance,
  lot: GroundBox,
  door: AnchorPoint | undefined,
): Placement | null {
  const lane = door ? doorCorridor(door, lot) : null;
  const steps = Math.round(NEAREST_REACH * 8);
  const spots: [number, number, number][] = [];
  for (let i = -steps; i <= steps; i++)
    for (let k = -steps; k <= steps; k++) {
      const d2 = i * i + k * k;
      if (d2 > 0 && d2 <= steps * steps) spots.push([d2, i, k]);
    }
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, i, k] of spots) {
    const q: Placement = { ...p, at: [p.at[0] + i / 8, p.at[1], p.at[2] + k / 8] };
    if (placementFree(q, bounds, clear, lot, lane)) return q;
  }
  return null;
}

export function dressingLayer(rules: readonly DressingRule[] = content.dressingRules): DressingLayer {
  let ctx: LayerContext | null = null;
  let dirty = true;
  let reground = false;
  let lastSeason = '';
  let lastLevel = '';
  const cache = new Map<number, Cached>();
  let batch: DressingBatch | null = null;
  const geoms = new Map<string, BufferGeometry>();
  const infos = new Map<string, PieceInfo | null>();
  const clearances = new Map<string, Clearance>();
  // The camera pass.
  const lastPos = new Vector3(Infinity, 0, 0);
  const lastDir = new Vector3();
  const dir = new Vector3();
  let lastDetail = -1;
  let viewDirty = true;
  let drawn = 0;
  // The yard lamps.
  let lampsDirty = true;
  let lastLit: boolean | null = null;
  let fed = false;

  /** A piece's geometry at a level, built once. */
  function pieceGeometry(p: Placement, lod: 'high' | 'low'): BufferGeometry | null {
    const key = `${geoKey(p)}|${lod}`;
    let g = geoms.get(key);
    if (!g) {
      const kit = kitById.get(p.kit);
      if (!kit) return null;
      g = kit.build({ seed: variantOf(p), lod, ...(p.params ? { params: { ...p.params } } : {}) });
      geoms.set(key, g);
    }
    return g;
  }

  function pieceInfo(p: Placement): PieceInfo | null {
    const key = geoKey(p);
    if (infos.has(key)) return infos.get(key) ?? null;
    const g = pieceGeometry(p, 'high');
    let info: PieceInfo | null = null;
    if (g) {
      const bounds = boundsOf(g);
      const kit = kitById.get(p.kit);
      const lights = kit?.anchors?.({
        seed: variantOf(p),
        ...(p.params ? { params: { ...p.params } } : {}),
      }).lights;
      info = {
        bounds,
        radius: Math.sqrt((bounds.x1 - bounds.x0) ** 2 + (bounds.z1 - bounds.z0) ** 2) / 2,
        lights: lights ?? [],
      };
    }
    infos.set(key, info);
    return info;
  }

  /** The clearance of the geometry the buildings layer draws for this building, over plot and lot. */
  function clearanceFor(b: BuildingView, size: readonly [number, number], extent: GroundBox): Clearance {
    const key = `${buildingKey(b, 'high')}|${extent.join(',')}`;
    let c = clearances.get(key);
    if (!c) {
      if (clearances.size > 512) clearances.clear();
      const g = buildingVariantGeometry(b, 'high');
      c = clearanceOf(g, size, extent);
      g.dispose();
      clearances.set(key, c);
    }
    return c;
  }

  /** Fits resolved pieces to the walls, the door corridor, the lot and each other, in order. */
  function fitAll(
    b: BuildingView,
    size: readonly [number, number],
    raw: readonly Placement[],
    lot: GroundBox,
    door: AnchorPoint | undefined,
    back?: AnchorRun,
  ): Placement[] {
    if (raw.length === 0) return [];
    const extent: GroundBox = [
      Math.min(0, lot[0]),
      Math.min(0, lot[1]),
      Math.max(size[0], lot[2]),
      Math.max(size[1], lot[3]),
    ];
    const mask = cloneClearance(clearanceFor(b, size, extent));
    const out: Placement[] = [];
    for (const r of raw) {
      // A sign stands out on the verge by the path, where it is read from the street.
      const p: Placement =
        r.kit === 'yard-sign' && r.anchor === 'door'
          ? { ...r, at: [r.at[0], r.at[1], r.at[2] + SIGN_OUT] }
          : r;
      const info = pieceInfo(p);
      if (!info) continue;
      let q = fitPlacement(p, info.bounds, mask, lot, door);
      // V3A: no room under the side eaves (a cottage in a row): against the back wall instead.
      if (!q && p.anchor === 'eaves' && back) {
        const depth = (info.bounds.z1 - info.bounds.z0) * p.scale;
        const [sx, , sz] = back.start;
        const [ex, , ez] = back.end;
        const [fx, fz] = back.facing;
        const t = 0.3 + 0.4 * ((p.seed % 1000) / 1000);
        const at: [number, number, number] = [
          sx + (ex - sx) * t - fx * (depth / 2 + 0.02),
          0,
          sz + (ez - sz) * t - fz * (depth / 2 + 0.02),
        ];
        q = fitPlacement({ ...p, at, yaw: Math.atan2(fx, fz) }, info.bounds, mask, lot, door);
      }
      // V3A: still no room where the anchor put it: the nearest free spot within a tile of it.
      // Wall pieces (sills, eaves) never wander into the open: a lone water butt in a field looks lost.
      if (!q && p.anchor !== 'sills' && p.anchor !== 'eaves')
        q = nearestFree(p, info.bounds, mask, lot, door);
      if (!q) continue;
      markPlacement(mask, q, info.bounds);
      out.push(q);
    }
    return out;
  }

  /** A piece's world matrix: the building's, then the piece's, then onto the ground (sills keep height). */
  function worldOf(b: BuildingView, level: number, p: Placement, out: Matrix4): Matrix4 {
    buildingMatrix(b.def, b.x, b.z, b.rot, level, baseM);
    posV.set(p.at[0], p.at[1], p.at[2]);
    quatQ.setFromAxisAngle(UP, p.yaw);
    sclV.setScalar(p.scale);
    localM.compose(posV, quatQ, sclV);
    out.multiplyMatrices(baseM, localM);
    if (p.anchor !== 'sills' && ctx) {
      const e = out.elements;
      e[13] = groundY(ctx.mirror, e[12]!, e[14]!) + p.at[1];
    }
    return out;
  }

  function sameMatrices(insts: readonly Inst[], ms: readonly Matrix4[]): boolean {
    if (insts.length !== ms.length) return false;
    for (let i = 0; i < ms.length; i++) if (!insts[i]!.m.equals(ms[i]!)) return false;
    return true;
  }

  function dropInsts(c: Cached): void {
    for (const i of c.insts) batch?.remove(i.instance);
    c.insts = [];
  }

  function lampsOf(b: BuildingView, placements: readonly Placement[], insts: readonly Inst[]): LightDisc[] {
    const out: LightDisc[] = [];
    const color = lampColor(drawDef(b.def)?.eras);
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      const inst = insts[i];
      if (!inst) continue;
      for (const l of pieceInfo(p)?.lights ?? []) {
        lampV.set(l[0], l[1], l[2]).applyMatrix4(inst.m);
        out.push({
          x: lampV.x,
          z: lampV.z,
          radius: lampRadius(p.kit),
          color,
          intensity: LAMP_INTENSITY,
        });
      }
      if (p.kit === 'goods-display') {
        lampV.set(0, 0, 0.35).applyMatrix4(inst.m);
        out.push({ x: lampV.x, z: lampV.z, radius: GOODS_DISC[0], color, intensity: GOODS_DISC[1] });
      }
    }
    return out;
  }

  /** Writes one building's instances into the batch (after dropping its old ones). */
  function writeInsts(c: Cached, b: BuildingView, ms: Matrix4[]): void {
    dropInsts(c);
    const mesh = (batch ??= new DressingBatch(ctx!.scene, ctx!.material));
    const insts: Inst[] = [];
    const kept: Placement[] = [];
    c.placements.forEach((p, i) => {
      const info = pieceInfo(p);
      const near = pieceGeometry(p, 'high');
      const far = pieceGeometry(p, 'low');
      if (!info || !near || !far) return;
      const m = ms[i]!;
      const nearId = mesh.geometry(`${geoKey(p)}|high`, () => near);
      const farId = mesh.geometry(`${geoKey(p)}|low`, () => far);
      const e = m.elements;
      insts.push({
        instance: mesh.add(nearId, m),
        m,
        x: e[12]!,
        y: e[13]!,
        z: e[14]!,
        near: nearId,
        far: farId,
        small: info.radius * p.scale < SMALL_RADIUS,
        level: undefined,
        shown: true,
        shrink: 1,
      });
      kept.push(p);
    });
    c.insts = insts;
    c.lamps = lampsOf(b, kept, insts);
    lampsDirty = true;
    viewDirty = true;
  }

  function rebuild(active: readonly DressingRule[]): boolean {
    if (!ctx) return false;
    const mirror = ctx.mirror;
    let changed = false;
    const seen = new Set<number>();
    const decorTiles = decorTilesOf(mirror);
    for (const b of mirror.buildings.values()) {
      seen.add(b.id);
      const subject = dressingSubject(mirror, b);
      const def = drawDef(b.def);
      const lot = b.lot !== undefined ? mirror.lots.get(b.lot) : undefined;
      const box = def && lot ? lotBox(b, roomyLot(mirror, decorTiles, lot)) : undefined;
      const dressed = subject.kind !== null && !!def;
      const level = dressed ? standLevel(mirror, b.def, b.x, b.z, b.rot) : 0;
      const key = `${subjectKey(subject)}|${box ? box.join(',') : ''}|${dressed ? buildingKey(b, 'high') : ''}`;
      const mkey = `${b.x},${b.z},${b.rot},${level}`;
      const hit = cache.get(b.id);
      if (hit && hit.key === key && hit.mkey === mkey && !reground) continue;
      let placements: Placement[] = hit && hit.key === key ? hit.placements : [];
      if (!hit || hit.key !== key) {
        placements = [];
        if (dressed && def) {
          const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
          const art = trade ? trade.look : def.art;
          const kit = kitById.get(artKitId(art));
          if (kit) {
            const anchors = anchorsFor(kit, {
              size: def.size,
              entrance: def.entrance,
              ...(art.params ? { params: art.params } : {}),
              ...(box ? { lot: box } : {}),
            });
            const raw = resolveDressing(subject, active, anchors, DRESSING_SEED);
            placements = fitAll(
              b,
              def.size,
              raw,
              box ?? [0, 0, def.size[0], def.size[1]],
              anchors.door,
              anchors.walls?.[1],
            );
          }
        }
      }
      const before = hit?.placements ?? [];
      const samePlacements = signature(before) === signature(placements);
      const entry: Cached = hit ?? { key, mkey, placements, insts: [], lamps: [] };
      entry.key = key;
      entry.mkey = mkey;
      if (samePlacements && hit) {
        // Same pieces: keep the old array. Only a moved building or ground rewrites the matrices.
        const ms = entry.placements.map((p) => worldOf(b, level, p, new Matrix4()));
        if (!sameMatrices(entry.insts, ms)) {
          writeInsts(entry, b, ms);
          changed = true;
        }
      } else {
        entry.placements = placements;
        const ms = placements.map((p) => worldOf(b, level, p, new Matrix4()));
        if (placements.length > 0 || entry.insts.length > 0) writeInsts(entry, b, ms);
        if (before.length > 0 || placements.length > 0) changed = true;
      }
      cache.set(b.id, entry);
    }
    for (const [id, c] of cache) {
      if (seen.has(id)) continue;
      cache.delete(id);
      dropInsts(c);
      if (c.placements.length > 0) {
        changed = true;
        lampsDirty = true;
      }
    }
    reground = false;
    return changed;
  }

  /** Distance and level: only when the camera moved enough or the instances changed. */
  function updateView(): void {
    if (!ctx || !batch) return;
    const env = ctx.env;
    const detail = env?.detailDistance ?? 80;
    const cam = ctx.camera;
    cam.getWorldDirection(dir);
    const focusDist = env ? cam.position.distanceTo(env.focus) : 0;
    const moved = cam.position.distanceTo(lastPos);
    const turned = dir.angleTo(lastDir);
    if (!viewDirty && detail === lastDetail && moved < 0.4 + focusDist * 0.02 && turned < 0.02) return;
    viewDirty = false;
    lastDetail = detail;
    lastPos.copy(cam.position);
    lastDir.copy(dir);
    const mesh = batch.mesh;
    const fadeFrom = detail * FADE_SHARE;
    drawn = 0;
    for (const c of cache.values()) {
      for (const i of c.insts) {
        const dx = i.x - cam.position.x;
        const dy = i.y - cam.position.y;
        const dz = i.z - cam.position.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const show = d < detail;
        if (show !== i.shown) {
          mesh.setVisibleAt(i.instance, show);
          i.shown = show;
        }
        if (!show) continue;
        drawn++;
        const lv = levelFor(i.level, d, detail * NEAR_SHARE);
        if (lv !== i.level) {
          mesh.setGeometryIdAt(i.instance, lv === 'high' ? i.near : i.far);
          i.level = lv;
        }
        const s = i.small && d > fadeFrom ? Math.max(0, 1 - (d - fadeFrom) / (detail - fadeFrom)) : 1;
        if (Math.abs(s - i.shrink) > 1e-3) {
          shrunkM.copy(i.m);
          const e = shrunkM.elements;
          for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[k]! *= s;
          mesh.setMatrixAt(i.instance, shrunkM);
          i.shrink = s;
        }
      }
    }
  }

  /** Feeds the yard lamps to the light map on the lamplighter's hours. */
  function syncLamps(): void {
    const env = ctx?.env;
    if (!env) return;
    const lit = yardsLit(env.shown.hour);
    if (!lampsDirty && lit === lastLit) return;
    lampsDirty = false;
    lastLit = lit;
    const discs: LightDisc[] = [];
    if (lit) for (const c of cache.values()) discs.push(...c.lamps);
    if (env.lightWriter.set('yards', discs)) fed = true;
  }

  return {
    id: 'dressing',
    motion: 'static',
    shadowless: true,
    init(c) {
      ctx = c;
      dirty = true;
    },
    update(change) {
      // V3A: decor, roads and the occupant layer move the free ground a yard may spill onto.
      if (
        change.full ||
        change.buildings ||
        change.households ||
        change.residents ||
        change.village ||
        change.decor ||
        change.rects.has('occupant') ||
        change.rects.has('road')
      )
        dirty = true;
      if (change.full || change.rects.has('height')) {
        dirty = true;
        reground = true;
      }
    },
    frame() {
      // The shipped table may be empty: nothing to resolve, nothing to draw, no cost.
      if (!ctx || rules.length === 0) return false;
      const level = ctx.env?.dressing ?? 'all';
      const season = seasonOf(ctx.mirror);
      if (season !== lastSeason || level !== lastLevel) {
        lastSeason = season;
        lastLevel = level;
        dirty = true;
      }
      let changed = false;
      if (dirty) {
        dirty = false;
        changed = rebuild(rulesFor(level, rules));
      }
      updateView();
      syncLamps();
      if (fed) {
        fed = false;
        changed = true;
      }
      return changed;
    },
    placementsOf(id) {
      return cache.get(id)?.placements ?? [];
    },
    placementCount() {
      let n = 0;
      for (const c of cache.values()) n += c.placements.length;
      return n;
    },
    drawnCount() {
      return drawn;
    },
    instanceCount() {
      return batch?.size ?? 0;
    },
    dispose() {
      ctx?.env?.lightWriter.clear('yards');
      batch?.dispose();
      batch = null;
      for (const g of geoms.values()) g.dispose();
      geoms.clear();
      infos.clear();
      clearances.clear();
      cache.clear();
      ctx = null;
    },
  };
}
