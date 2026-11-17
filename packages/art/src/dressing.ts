// V3.0: the dressing resolver (docs/spec/20-architecture.md, V3 contracts). A pure function from a
// building's shared state, the rules (packages/content/src/dressingRules.ts) and the plot's anchors
// (anchors.ts) to the pieces on its plot, in kit-local space. Deterministic from its inputs alone, so
// both seats draw the same plot and an unchanged building gives the same list.
import {
  DRESSING_MAX_PER_RULE,
  DRESSING_STATS,
  type DressingAnchor,
  type DressingCount,
  type DressingKind,
  type DressingRule,
  type DressingSeason,
  type DressingStat,
  type DressingTier,
} from '@qoti/content';
import type { BufferGeometry } from 'three';
import { ANCHOR_NAMES, type GroundBox } from './anchors';
import type { AnchorPoint, AnchorRect, AnchorRun, KitAnchors } from './kits/types';

/**
 * What the resolver knows about one building, built by the dressing layer from the Mirror (shared
 * state only). `kind` is null for anything the dressing leaves alone (roads, walls, wells).
 */
export interface DressingSubject {
  /** The building's id: placements are keyed by it. */
  id: number;
  /** Its def id. */
  def: string;
  kind: DressingKind | null;
  trade?: string;
  /** 1 to 3 for a business; 1 otherwise. */
  level: number;
  /** R2's place kind; absent on `main` (a gap until R2X). */
  place?: string;
  /** The household's tier, for a home with one. */
  tier?: DressingTier;
  season: DressingSeason;
  /** The stats a rule may scale with (`DRESSING_STATS`); a missing one reads as 0. */
  stats: Readonly<Partial<Record<DressingStat, number>>>;
}

/** One piece on a plot, in kit-local space (the same space as the kit's `build` and anchors). */
export interface Placement {
  /** The rule that placed it. */
  rule: string;
  /** V3A: the anchor it was set at (the layer's fit and ground logic read it); absent on older lists. */
  anchor?: DressingAnchor;
  kit: string;
  params?: Readonly<Record<string, number | string | boolean>>;
  /** On the ground at y = 0 for yard, garden, front, walls, eaves and door; sills sit at their height. */
  at: [number, number, number];
  /** Turn about +y in radians; 0 faces +z (the street), as a kit's entrance does. */
  yaw: number;
  /** About 0.9 to 1.1, so a row of the same piece does not look stamped. */
  scale: number;
  /** A per-piece seed for the kit's own variation. */
  seed: number;
}

/** A 32-bit integer hash of two values (the resolver's only source of variety). */
export function mix32(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A small seeded stream, 0 (inclusive) to 1 (exclusive). */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when the rule dresses this building. */
export function matches(rule: DressingRule, s: DressingSubject): boolean {
  const w = rule.who;
  if (s.kind === null) return false;
  if (w.kind && !w.kind.includes(s.kind)) return false;
  if (w.def && !w.def.includes(s.def)) return false;
  if (w.trade && (s.trade === undefined || !w.trade.includes(s.trade))) return false;
  if (w.minLevel !== undefined && s.level < w.minLevel) return false;
  if (w.place && (s.place === undefined || !w.place.includes(s.place))) return false;
  if (w.tier && (s.tier === undefined || !w.tier.includes(s.tier))) return false;
  if (w.season && !w.season.includes(s.season)) return false;
  return true;
}

/** How many pieces a count gives for this building: bounded by `max` and `DRESSING_MAX_PER_RULE`. */
export function dressingCount(c: DressingCount, s: DressingSubject): number {
  const stat = c.stat ? (s.stats[c.stat] ?? 0) : 0;
  const n = Math.floor(c.base + (c.perUnit ?? 0) * stat);
  return Math.max(0, Math.min(n, c.max, DRESSING_MAX_PER_RULE));
}

function yawOf(f: readonly [number, number]): number {
  return Math.atan2(f[0], f[1]);
}

function inRect(r: AnchorRect, u: number, v: number): [number, number, number] {
  // u runs across (at right angles to facing), v along it; both -0.5 to 0.5 of the rect.
  const [fx, fz] = r.facing;
  const ax = fz;
  const az = -fx;
  const x = r.center[0] + ax * u * r.size[0] + fx * v * r.size[1];
  const z = r.center[2] + az * u * r.size[0] + fz * v * r.size[1];
  return [x, r.center[1], z];
}

function onRun(r: AnchorRun, t: number): [number, number, number] {
  return [
    r.start[0] + (r.end[0] - r.start[0]) * t,
    r.start[1] + (r.end[1] - r.start[1]) * t,
    r.start[2] + (r.end[2] - r.start[2]) * t,
  ];
}

/**
 * The pieces on one building's plot: each rule that matches, in table order, puts its count of its
 * piece at its anchor (spread through a rect, spaced along runs, dealt round points), jittered by a
 * stream from `seed`, the building's id and the rule's seed. A rule whose anchor the plot lacks puts
 * nothing. Pure: equal inputs give equal output.
 */
export function resolveDressing(
  subject: DressingSubject,
  rules: readonly DressingRule[],
  anchors: KitAnchors,
  seed: number,
): Placement[] {
  const out: Placement[] = [];
  if (subject.kind === null) return out;
  for (const rule of rules) {
    if (!matches(rule, subject)) continue;
    const base = mix32(mix32(seed, subject.id), rule.seed);
    const rnd = stream(base);
    if (rule.chance !== undefined && rnd() >= rule.chance) continue;
    const n = dressingCount(rule.count, subject);
    if (n === 0) continue;
    const put = (at: [number, number, number], yaw: number, i: number): void => {
      out.push({
        rule: rule.id,
        anchor: rule.anchor,
        kit: rule.piece.kit,
        ...(rule.piece.params ? { params: rule.piece.params } : {}),
        at,
        yaw,
        scale: 0.9 + rnd() * 0.2,
        seed: mix32(base, i),
      });
    };
    placeAt(rule.anchor, anchors, n, rnd, put);
  }
  return out;
}

function placeAt(
  anchor: DressingAnchor,
  a: KitAnchors,
  n: number,
  rnd: () => number,
  put: (at: [number, number, number], yaw: number, i: number) => void,
): void {
  const rect =
    anchor === 'yard' ? a.yard : anchor === 'front' ? a.front : anchor === 'garden' ? a.garden : null;
  if (rect !== null) {
    if (!rect) return;
    for (let i = 0; i < n; i++) {
      // Jittered cells across the rect, so pieces spread rather than heap.
      const u = (i + 0.2 + rnd() * 0.6) / n - 0.5;
      const v = (rnd() - 0.5) * 0.6;
      put(inRect(rect, u, v), yawOf(rect.facing) + (rnd() - 0.5) * 0.5, i);
    }
    return;
  }
  if (anchor === 'walls') {
    const runs = a.walls;
    if (!runs?.length) return;
    for (let i = 0; i < n; i++) {
      const run = runs[i % runs.length]!;
      const k = Math.floor(i / runs.length);
      const per = Math.ceil((n - (i % runs.length)) / runs.length);
      put(onRun(run, (k + 0.5) / per), yawOf(run.facing), i);
    }
    return;
  }
  const points: readonly AnchorPoint[] | undefined =
    anchor === 'door' ? (a.door ? [a.door] : undefined) : anchor === 'sills' ? a.sills : a.eaves;
  if (!points?.length) return;
  for (let i = 0; i < n; i++) {
    const p = points[i % points.length]!;
    // Repeats at one point step sideways along its face, alternating left and right.
    const k = Math.floor(i / points.length);
    const side = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 0.22;
    const [fx, fz] = p.facing;
    put([p.at[0] + fz * side, p.at[1], p.at[2] - fx * side], yawOf(p.facing), i);
  }
}

/**
 * A key that changes exactly when a subject's resolver input changes, for the layer's per-building
 * cache (an unchanged building keeps its placements).
 */
export function subjectKey(s: DressingSubject): string {
  let stats = '';
  for (const d of DRESSING_STATS) stats += `${s.stats[d.id] ?? 0},`;
  return `${s.def}|${s.kind ?? '-'}|${s.trade ?? ''}|${s.level}|${s.place ?? ''}|${s.tier ?? ''}|${s.season}|${stats}`;
}

/** The rules a preset draws: Low ('some') keeps only signs and stock piles (`low`), the rest all. */
export function rulesFor(level: 'some' | 'all', rules: readonly DressingRule[]): readonly DressingRule[] {
  return level === 'all' ? rules : rules.filter((r) => r.low);
}

/**
 * What is wrong with a rules table, one line each (empty when it is sound): unknown kits, anchors or
 * stats, counts out of bounds, duplicate ids, a chance outside 0 to 1. Tests run it on the shipped
 * table and on bad rules, so a bad rule fails CI.
 */
export function validateDressingRules(
  rules: readonly DressingRule[],
  isKit: (id: string) => boolean,
  isTrade: (id: string) => boolean = () => true,
  isDef: (id: string) => boolean = () => true,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const seeds = new Set<number>();
  const stats = new Set<string>(DRESSING_STATS.map((d) => d.id));
  const anchors = new Set<string>(ANCHOR_NAMES);
  for (const r of rules) {
    const at = `rule ${r.id}`;
    if (ids.has(r.id)) errors.push(`${at}: duplicate id`);
    ids.add(r.id);
    if (seeds.has(r.seed)) errors.push(`${at}: seed ${r.seed} is another rule's`);
    seeds.add(r.seed);
    if (!isKit(r.piece.kit)) errors.push(`${at}: no kit ${r.piece.kit}`);
    if (!anchors.has(r.anchor)) errors.push(`${at}: no anchor ${r.anchor}`);
    const c = r.count;
    if (c.stat !== undefined && !stats.has(c.stat)) errors.push(`${at}: no stat ${c.stat}`);
    if (c.stat === undefined && c.perUnit) errors.push(`${at}: perUnit without a stat`);
    if (!(c.base >= 0) || !(c.max >= 1) || c.max > DRESSING_MAX_PER_RULE || c.base > c.max)
      errors.push(`${at}: count out of bounds (base ${c.base}, max ${c.max})`);
    if (r.chance !== undefined && !(r.chance > 0 && r.chance <= 1)) errors.push(`${at}: chance ${r.chance}`);
    for (const t of r.who.trade ?? []) if (!isTrade(t)) errors.push(`${at}: no trade ${t}`);
    for (const d of r.who.def ?? []) if (!isDef(d)) errors.push(`${at}: no building ${d}`);
    if (r.who.minLevel !== undefined && !(r.who.minLevel >= 1 && r.who.minLevel <= 3))
      errors.push(`${at}: minLevel ${r.who.minLevel}`);
  }
  return errors;
}

// --- V3A: clearance. Derived anchors only guess where a house's walls stand, and a building kit
// carries its own props, so a resolved piece can land in a wall or on a porch. The layer measures
// the geometry the buildings layer draws and fits every piece to it. ---------------------------------

/** Cells a tile in a clearance grid. */
export const CLEAR_CELLS = 8;
/** Height of one band, in tiles; 16 bands cover 0 to 1.6. */
export const CLEAR_BAND = 0.1;
const BANDS = 16;
/** Triangles wholly below this are ground patches, doorsteps and flagstones, not obstacles (V3A: a piece may stand on a path). */
const GROUND_PATCH = 0.07;

/** Which 0.1 tile height bands the kit's own triangles occupy, per cell of a plot's ground. */
export interface Clearance {
  /** The grid's origin (in cells) and size in cells; a cell is 1/8 tile. */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  cells: Uint16Array;
}

/** A piece's near geometry's bounds (unscaled, kit-local): its footprint and height. */
export interface PieceBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
}

function bandMask(lo: number, hi: number): number {
  const l = Math.max(0, lo);
  const h = Math.min(BANDS - 1, hi);
  if (h < l) return 0;
  return ((1 << (h + 1)) - 1) & ~((1 << l) - 1) & 0xffff;
}

/**
 * The clearance grid of a kit's geometry over its plot `size` (or `extent`, a ground box that may
 * be wider when the lot is): each cell a 16-bit mask of the height bands the triangles occupy.
 * Pure; the caller caches it.
 */
export function clearanceOf(
  geometry: BufferGeometry,
  size: readonly [number, number],
  extent?: GroundBox,
): Clearance {
  const [ex0, ez0, ex1, ez1] = extent ?? [0, 0, size[0], size[1]];
  const x0 = Math.floor(Math.min(ex0, 0) * CLEAR_CELLS);
  const z0 = Math.floor(Math.min(ez0, 0) * CLEAR_CELLS);
  const nx = Math.max(1, Math.ceil(Math.max(ex1, size[0]) * CLEAR_CELLS) - x0);
  const nz = Math.max(1, Math.ceil(Math.max(ez1, size[1]) * CLEAR_CELLS) - z0);
  const cells = new Uint16Array(nx * nz);
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number): number => (index ? index.getX(i) : i);
  for (let t = 0; t + 2 < count; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    const ymin = Math.min(pos.getY(a), pos.getY(b), pos.getY(c));
    const ymax = Math.max(pos.getY(a), pos.getY(b), pos.getY(c));
    if (ymax < GROUND_PATCH || ymin >= BANDS * CLEAR_BAND) continue;
    // A flat face (a top) belongs to the band just under it; a tall one to every band it spans.
    const flat = ymax - ymin < 1e-5;
    const lo = flat ? Math.floor(ymin / CLEAR_BAND - 1e-5) : Math.floor(ymin / CLEAR_BAND + 1e-5);
    const mask = bandMask(lo, flat ? lo : Math.max(lo, Math.floor(ymax / CLEAR_BAND - 1e-5)));
    const xmin = Math.min(pos.getX(a), pos.getX(b), pos.getX(c));
    const xmax = Math.max(pos.getX(a), pos.getX(b), pos.getX(c));
    const zmin = Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    const zmax = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    const ix0 = Math.floor(xmin * CLEAR_CELLS + 1e-5);
    const iz0 = Math.floor(zmin * CLEAR_CELLS + 1e-5);
    const ix1 = Math.max(ix0, Math.ceil(xmax * CLEAR_CELLS - 1e-5) - 1);
    const iz1 = Math.max(iz0, Math.ceil(zmax * CLEAR_CELLS - 1e-5) - 1);
    for (let iz = Math.max(0, iz0 - z0); iz <= Math.min(nz - 1, iz1 - z0); iz++)
      for (let ix = Math.max(0, ix0 - x0); ix <= Math.min(nx - 1, ix1 - x0); ix++)
        cells[iz * nx + ix]! |= mask;
  }
  return { x0, z0, nx, nz, cells };
}

/** A copy of a clearance grid, for the per-plot mask the placed pieces mark into. */
export function cloneClearance(c: Clearance): Clearance {
  return { ...c, cells: new Uint16Array(c.cells) };
}

/** A piece's near geometry's xz bounds and height. */
export function boundsOf(geometry: BufferGeometry): PieceBounds {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  if (!b) return { x0: -0.1, z0: -0.1, x1: 0.1, z1: 0.1, height: 0.2 };
  return { x0: b.min.x, z0: b.min.z, x1: b.max.x, z1: b.max.z, height: Math.max(0, b.max.y) };
}

/** A piece's footprint on the plot (the box round its turned, scaled bounds), kit-local. */
export function footprintOf(p: Placement, b: PieceBounds): GroundBox {
  const cos = Math.cos(p.yaw);
  const sin = Math.sin(p.yaw);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [cx, cz] of [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x0, b.z1],
    [b.x1, b.z1],
  ] as const) {
    const sx = cx * p.scale;
    const sz = cz * p.scale;
    const x = p.at[0] + sx * cos + sz * sin;
    const z = p.at[2] - sx * sin + sz * cos;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

/** The bands a piece itself occupies: from 0.02 above where it stands to its top. */
function spanMask(p: Placement, b: PieceBounds): number {
  const lo = Math.floor((p.at[1] + 0.02) / CLEAR_BAND + 1e-6);
  const hi = Math.floor((p.at[1] + b.height * p.scale) / CLEAR_BAND - 1e-6);
  return bandMask(lo, Math.max(lo, hi));
}

function cellRange(c: Clearance, box: GroundBox): [number, number, number, number] {
  const ix0 = Math.floor(box[0] * CLEAR_CELLS + 1e-5);
  const iz0 = Math.floor(box[1] * CLEAR_CELLS + 1e-5);
  return [
    ix0 - c.x0,
    iz0 - c.z0,
    Math.max(ix0, Math.ceil(box[2] * CLEAR_CELLS - 1e-5) - 1) - c.x0,
    Math.max(iz0, Math.ceil(box[3] * CLEAR_CELLS - 1e-5) - 1) - c.z0,
  ];
}

/** True when a cell under `box` has a band of `mask` set. Cells off the grid are clear. */
function hits(c: Clearance, box: GroundBox, mask: number): boolean {
  if (mask === 0) return false;
  const [ix0, iz0, ix1, iz1] = cellRange(c, box);
  for (let iz = Math.max(0, iz0); iz <= Math.min(c.nz - 1, iz1); iz++)
    for (let ix = Math.max(0, ix0); ix <= Math.min(c.nx - 1, ix1); ix++)
      if ((c.cells[iz * c.nx + ix]! & mask) !== 0) return true;
  return false;
}

/** Marks a placed piece's footprint into a (per-plot) clearance grid, so later pieces keep off it. */
export function markPlacement(c: Clearance, p: Placement, b: PieceBounds): void {
  const mask = spanMask(p, b);
  if (mask === 0) return;
  const [ix0, iz0, ix1, iz1] = cellRange(c, footprintOf(p, b));
  for (let iz = Math.max(0, iz0); iz <= Math.min(c.nz - 1, iz1); iz++)
    for (let ix = Math.max(0, ix0); ix <= Math.min(c.nx - 1, ix1); ix++) c.cells[iz * c.nx + ix]! |= mask;
}

/** Half the door corridor's width, tiles. */
export const DOOR_HALF = 0.25;
/** How far a front or doorstep piece may overhang the lot's front edge (onto the verge). */
export const FRONT_OVERHANG = 0.15;
/** How far an awning may reach out past the lot's front edge (V3X). */
export const AWNING_OVERHANG = 0.45;
const SNAP_STEP = 1 / 16;
const SNAP_REACH = 1;
const SHIFTS = [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.4] as const;

/** The door corridor: from just behind the door anchor straight out to the lot's edge. */
export function doorCorridor(door: AnchorPoint, lot: GroundBox): GroundBox {
  const [fx, fz] = door.facing;
  const [dx, , dz] = door.at;
  if (Math.abs(fz) >= Math.abs(fx)) {
    const out = fz >= 0 ? Math.max(lot[3], dz) + 0.5 : Math.min(lot[1], dz) - 0.5;
    const back = dz - (fz >= 0 ? 0.6 : -0.6);
    return [dx - DOOR_HALF, Math.min(out, back), dx + DOOR_HALF, Math.max(out, back)];
  }
  const out = fx >= 0 ? Math.max(lot[2], dx) + 0.5 : Math.min(lot[0], dx) - 0.5;
  const back = dx - (fx >= 0 ? 0.6 : -0.6);
  return [Math.min(out, back), dz - DOOR_HALF, Math.max(out, back), dz + DOOR_HALF];
}

function overlaps(a: GroundBox, b: GroundBox): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/** True for a piece that stands against a wall, and so snaps to it. */
function snaps(p: Placement): boolean {
  // V3A: doorstep pieces (boots, churns) stand against the front wall beside the door; a sign stays
  // out by the path, where it can be read.
  if (p.anchor === 'door') return p.kit !== 'yard-sign';
  return p.anchor === 'eaves' || p.anchor === 'sills' || p.anchor === 'front' || p.kit === 'yard-awning';
}

/**
 * True when a piece stands clear: inside the lot (a front piece may overhang its front edge by
 * `FRONT_OVERHANG`), off the door corridor and over no band of its own height that `clear` has set.
 */
export function placementFree(
  q: Placement,
  bounds: PieceBounds,
  clear: Clearance,
  lot: GroundBox,
  lane: GroundBox | null,
  mask: number = spanMask(q, bounds),
): boolean {
  const over = q.anchor === 'front' || q.anchor === 'door';
  // V3X: an awning is meant to reach out over the verge, so a shop on a plot that is only its footprint
  // may still hang one.
  const reach = q.kit === 'yard-awning' ? AWNING_OVERHANG : FRONT_OVERHANG;
  const room: GroundBox = [lot[0], lot[1], lot[2], over ? lot[3] + reach : lot[3]];
  const b = footprintOf(q, bounds);
  const inside =
    b[0] >= room[0] - 1e-6 && b[1] >= room[1] - 1e-6 && b[2] <= room[2] + 1e-6 && b[3] <= room[3] + 1e-6;
  return inside && !(lane && overlaps(b, lane)) && !hits(clear, b, mask);
}

/**
 * Moves a piece to the nearest clear spot, or returns null to drop it. `bounds` is the piece's near
 * geometry's (`boundsOf`), `clear` the plot's clearance with the pieces placed so far marked in
 * (`markPlacement`), `lot` the box the piece must stay in (a front piece may overhang its front edge
 * by `FRONT_OVERHANG`) and `door` the door anchor, whose corridor stays free. Candidates in order:
 * as placed, then sideways along the anchor by 0.12, -0.12, 0.25, -0.25, 0.4, -0.4, then beside the
 * door; wall pieces (eaves, sills, front, awnings) first snap to the wall. Deterministic.
 */
export function fitPlacement(
  p: Placement,
  bounds: PieceBounds,
  clear: Clearance,
  lot: GroundBox,
  door?: AnchorPoint,
): Placement | null {
  const fitted = fitTurned(p, bounds, clear, lot, door);
  if (fitted || !(p.anchor === 'front' || p.anchor === 'door')) return fitted;
  // V3X: a table set a little askew has a deeper footprint than the strip of verge in front of a
  // shop's wall (a quarter turn of jitter on half a tile of table adds a tenth of a tile of depth):
  // when it finds no spot as turned, stand it square to the facade.
  const sx = Math.sin(p.yaw);
  const sz = Math.cos(p.yaw);
  const square =
    Math.abs(sx) > Math.abs(sz) ? Math.atan2(Math.sign(sx), 0) : Math.atan2(0, Math.sign(sz) || 1);
  return Math.abs(square - p.yaw) < 1e-9 ? null : fitTurned({ ...p, yaw: square }, bounds, clear, lot, door);
}

function fitTurned(
  p: Placement,
  bounds: PieceBounds,
  clear: Clearance,
  lot: GroundBox,
  door?: AnchorPoint,
): Placement | null {
  // The piece's facing, turned to the nearest axis: marches and sideways moves run along it.
  const sx = Math.sin(p.yaw);
  const sz = Math.cos(p.yaw);
  const [fx, fz]: [number, number] =
    Math.abs(sx) > Math.abs(sz) ? [Math.sign(sx), 0] : [0, Math.sign(sz) || 1];
  const ax = fz;
  const az = -fx;
  const mask = spanMask(p, bounds);
  const lane = door ? doorCorridor(door, lot) : null;
  const moved = (x: number, z: number): Placement => ({ ...p, at: [x, p.at[1], z] });
  const free = (q: Placement): boolean => placementFree(q, bounds, clear, lot, lane, mask);

  /** March to the wall behind the piece (-facing), or out of what it stands in (+facing). */
  function snap(x: number, z: number): [number, number] | null {
    if (!free(moved(x, z))) {
      for (let i = 1; i <= 8; i++) {
        const nx = x + fx * i * SNAP_STEP;
        const nz = z + fz * i * SNAP_STEP;
        if (free(moved(nx, nz))) return [nx, nz];
      }
      // V3X: the steps may jump a strip as narrow as the piece; stand it flush with the front edge.
      if (fz > 0 && (p.anchor === 'front' || p.anchor === 'door')) {
        const out =
          lot[3] +
          (p.kit === 'yard-awning' ? AWNING_OVERHANG : FRONT_OVERHANG) -
          footprintOf(moved(x, z), bounds)[3];
        if (out > 0 && out <= SNAP_REACH && free(moved(x, z + out))) return [x, z + out];
      }
      return null;
    }
    const max = SNAP_REACH / SNAP_STEP;
    let n = 0;
    while (n < max && free(moved(x - fx * (n + 1) * SNAP_STEP, z - fz * (n + 1) * SNAP_STEP))) n++;
    // No wall within reach: stay where the anchor put it.
    return n >= max ? [x, z] : [x - fx * n * SNAP_STEP, z - fz * n * SNAP_STEP];
  }

  const tries: [number, number][] = SHIFTS.map((s) => [p.at[0] + ax * s, p.at[2] + az * s]);
  if (door) {
    // Beside the door: just clear of its corridor on either side.
    const half =
      Math.max(
        Math.abs(bounds.x0) * p.scale,
        Math.abs(bounds.x1) * p.scale,
        Math.abs(bounds.z0) * p.scale,
        Math.abs(bounds.z1) * p.scale,
      ) +
      DOOR_HALF +
      0.04;
    const shift = door.at[0] * ax + door.at[2] * az - (p.at[0] * ax + p.at[2] * az);
    for (const s of [1, -1])
      tries.push([p.at[0] + ax * (shift + s * half), p.at[2] + az * (shift + s * half)]);
  }
  for (const [x, z] of tries) {
    if (snaps(p)) {
      const at = snap(x, z);
      if (at && free(moved(at[0], at[1]))) return moved(at[0], at[1]);
    } else if (free(moved(x, z))) return moved(x, z);
  }
  return null;
}
