// V3.0: one shape for the lots the long view draws rows, back gardens, corner buildings and storeys from.
import { Matrix4, Vector3 } from 'three';
import {
  footprintSize,
  MAP_SIZE,
  type BuildingView,
  type EntityId,
  type LotView,
  type Rot4,
} from '@qoti/sim';
import { artKitId, isRowKit, MAX_ROW_STOREYS, rowEaves } from '@qoti/art';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';
import { buildingMatrix, standLevel } from './kitGeometry';

export type LotSource = 'sim' | 'joined';

export interface ScreenLot {
  /** The lot's id. */
  id: EntityId;
  /** Lot rectangle origin and size in tiles, and facing, as in LotView. */
  x: number;
  z: number;
  w: number;
  d: number;
  rot: Rot4;
  /** Zone content id. */
  zone: string;
  /** The building on the lot, 0 while empty. */
  buildingId: EntityId;
  /** Row id: lots cut from one run share it. 0 when the lot is in no row. */
  row: number;
  /** Where `row` came from: the sim's `Lot.row`, or rows joined from the occupant layer (the fallback). */
  rowSource: LotSource;
  /** A plot holds a building; a garden is the open back of a row. */
  kind: 'plot' | 'garden';
  /** True for a corner lot, which fronts two roads. */
  corner: boolean;
  /** The second frontage road tile (tile index z * size + x) of a corner lot, else undefined. */
  frontage2?: number;
  /**
   * Storeys of the building on it (the sim's `params.storeys`), 1 when unknown or empty. V3B: along a
   * row, the one-step rule is applied (see `lotsFor`).
   */
  storeys: number;
  /** V3B: true when the lot or its building carried a storeys value (else `storeys` is the default 1). */
  storeysKnown: boolean;
  /** V3B: the district style id the lot was cut in ('brick', 'plaster', 'stone', 'timber') or ''. */
  style: string;
}

export interface ScreenLots {
  /** Every lot, sorted by id. */
  lots: ScreenLot[];
  /**
   * Each row's lots in order along the frontage, keyed by row id: in kit-local +x order, the way
   * `rowNeighbors` names its sides (`joinL` first, `joinR` last; for rot 0, increasing world x).
   * Rows of one lot are left out.
   */
  rows: Map<number, ScreenLot[]>;
  /**
   * V3B: every garden lot, sorted by id. A garden shares its owner row's id (`row`) but is never in
   * `rows`, which holds plots only.
   */
  gardens: ScreenLot[];
  /** True when the Mirror carries R2's lot fields (some lot has a positive `row`). */
  fromSim: boolean;
}

/**
 * The lot fields R2 adds to `LotView` (R2.0, `cycle/r2-0-evenings-contracts` at 9847e74), read through
 * this optional view until R2X lands them on `main`: `row` (0 for none), `kind` (absent reads 'plot'),
 * `corner?: true`, `frontage2` (road tile index), `storeys` (the grown building's, absent while empty).
 */
type LotFields = LotView & {
  row?: number;
  kind?: 'plot' | 'garden';
  corner?: true;
  frontage2?: number;
  storeys?: number;
};
/** R2.0's `BuildingView.storeys` (the sim's `Building.storeys`); `params.storeys` is V3B's kit param. */
type BuildingFields = BuildingView & { storeys?: number; params?: Record<string, unknown> };

/** World direction of a kit's local +x (`joinR`'s side) for each rotation, as (dx, dz). */
const RIGHT: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const probe = new Vector3();
const toLocal = new Matrix4();
const local = new Matrix4();

/** What one side (kit-local x- or x+) of a built row kit meets, by the V1B probe. */
interface SideProbe {
  /** The building whose front row and facing edge the probe lands on (same facing and stand level). */
  nb: BuildingView | undefined;
  /** A road tile lies at the probe. */
  road: boolean;
}

/**
 * The V1B probe, once: for each side of a built row kit (left, then right) the neighbor it joins
 * (a built row kit with the same facing, the probe on its facing edge in its front row, standing at
 * the same level) and whether a road tile lies there. Null for anything that is not a built row kit.
 */
function probeSides(mirror: Mirror, b: BuildingView): [SideProbe, SideProbe] | null {
  const def = drawDef(b.def);
  if (!def || b.stage !== 'built' || !isRowKit(artKitId(def.art))) return null;
  const [w, d] = def.size;
  const level = standLevel(mirror, b.def, b.x, b.z, b.rot);
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, local);
  const out: SideProbe[] = [];
  for (const [i, u] of [
    [0, -0.5],
    [1, w + 0.5],
  ] as const) {
    probe.set(u, 0, d - 0.5).applyMatrix4(local);
    const tx = Math.floor(probe.x);
    const tz = Math.floor(probe.z);
    const road = mirror.road(tx, tz) > 0;
    const id = mirror.occupant(tx, tz);
    const nb = id && id !== b.id ? mirror.buildings.get(id) : undefined;
    const ndef = nb ? drawDef(nb.def) : undefined;
    let joined: BuildingView | undefined;
    if (nb && ndef && nb.stage === 'built' && nb.rot === b.rot && isRowKit(artKitId(ndef.art))) {
      // The probe must fall in the neighbor's front row, on its facing edge.
      toLocal.copy(buildingMatrix(nb.def, nb.x, nb.z, nb.rot, 0, toLocal)).invert();
      probe.set(tx + 0.5, 0, tz + 0.5).applyMatrix4(toLocal);
      const [nw, nd] = ndef.size;
      const edge = i === 0 ? probe.x > nw - 1 : probe.x < 1;
      if (edge && probe.z > nd - 1 && standLevel(mirror, nb.def, nb.x, nb.z, nb.rot) === level) joined = nb;
    }
    out[i] = { nb: joined, road };
  }
  return out as [SideProbe, SideProbe];
}

/**
 * V1B: a home's place in a row, for joined facades: on each side (the kit's x- and x+, at its
 * front row) the neighbor it joins (a built row kit with the same facing, its front on the same
 * line, standing at the same level) as `joinL` or `joinR` with the neighbor's kit, or `streetL` /
 * `streetR` where a road runs past that side instead (a corner house dresses it). The V3.0
 * fallback: the buildings layer draws from `rowParams`, which gives exactly this on lots without
 * R2's fields.
 */
export function rowNeighbors(mirror: Mirror, b: BuildingView): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const sides = probeSides(mirror, b);
  if (!sides) return out;
  for (const [i, side] of (['L', 'R'] as const).entries()) {
    const s = sides[i]!;
    const ndef = s.nb ? drawDef(s.nb.def) : undefined;
    if (s.nb && ndef) out[`join${side}`] = artKitId(ndef.art);
    else if (s.road) out[`street${side}`] = true;
  }
  return out;
}

/** The building each of a built row kit's sides joins, or 0. */
function joinedIds(mirror: Mirror, b: BuildingView): [left: EntityId, right: EntityId] {
  const sides = probeSides(mirror, b);
  return sides ? [sides[0].nb?.id ?? 0, sides[1].nb?.id ?? 0] : [0, 0];
}

/** The storeys the lot or its building carried (R2.0), clamped to 1 to 4 in halves; undefined when none. */
function rawStoreys(lot: LotFields, b: BuildingView | undefined): number | undefined {
  const v = b as BuildingFields | undefined;
  const raw =
    typeof lot.storeys === 'number'
      ? lot.storeys
      : typeof v?.storeys === 'number'
        ? v.storeys
        : v?.params?.storeys;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.round(Math.min(MAX_ROW_STOREYS, Math.max(1, raw)) * 2) / 2;
}

/**
 * The lots as the long view draws them. Rows, kinds, corners and storeys come from the sim's lot
 * fields when the Mirror carries them (R2). Where a lot has no positive `row` (the fields are
 * missing, or R2.0's stand-in cutter gave 0), rows are joined from the occupant layer instead: homes
 * that `rowNeighbors` would join are chained, each chain gets a negative synthetic id, and a lone
 * home has row 0. That joined fallback stays until R2X lands. Pure: it reads the Mirror only.
 */
export function lotsFor(mirror: Mirror): ScreenLots {
  const src = [...mirror.lots.values()].sort((a, b) => a.id - b.id) as LotFields[];
  const lots: ScreenLot[] = src.map((l) => {
    const row = typeof l.row === 'number' && l.row > 0 ? l.row : 0;
    const lot: ScreenLot = {
      id: l.id,
      x: l.x,
      z: l.z,
      w: l.w,
      d: l.d,
      rot: l.rot,
      zone: l.zone,
      buildingId: l.buildingId,
      row,
      rowSource: row > 0 ? 'sim' : 'joined',
      kind: l.kind === 'garden' ? 'garden' : 'plot',
      corner: l.corner === true,
      storeys: 1,
      storeysKnown: false,
      style: typeof l.style === 'string' ? l.style : '',
    };
    const known = rawStoreys(l, l.buildingId ? mirror.buildings.get(l.buildingId) : undefined);
    if (known !== undefined) {
      lot.storeys = known;
      lot.storeysKnown = true;
    }
    if (typeof l.frontage2 === 'number') lot.frontage2 = l.frontage2;
    return lot;
  });
  const fromSim = src.some((l) => typeof l.row === 'number' && l.row > 0);

  // Fallback: chain the lots without a sim row through the buildings that join each other.
  const pending = lots.filter((l) => l.row === 0);
  if (pending.length) {
    const byBuilding = new Map<EntityId, ScreenLot>();
    for (const l of pending) if (l.buildingId) byBuilding.set(l.buildingId, l);
    const parent = new Map<EntityId, EntityId>();
    const find = (a: EntityId): EntityId => {
      let r = a;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(a, r);
      return r;
    };
    for (const id of byBuilding.keys()) parent.set(id, id);
    for (const id of byBuilding.keys()) {
      const b = mirror.buildings.get(id);
      if (!b) continue;
      for (const n of joinedIds(mirror, b)) {
        if (n && n !== id && byBuilding.has(n)) {
          const ra = find(id);
          const rb = find(n);
          if (ra !== rb) parent.set(ra, rb);
        }
      }
    }
    const chains = new Map<EntityId, ScreenLot[]>();
    for (const l of pending) {
      if (!l.buildingId) continue;
      const root = find(l.buildingId);
      const list = chains.get(root);
      if (list) list.push(l);
      else chains.set(root, [l]);
    }
    // Pending lots are in id order, so each chain's first lot is its smallest id.
    let next = -1;
    for (const chain of [...chains.values()]
      .filter((c) => c.length > 1)
      .sort((a, b) => a[0]!.id - b[0]!.id)) {
      for (const l of chain) l.row = next;
      next--;
    }
  }

  const rows = new Map<number, ScreenLot[]>();
  for (const l of lots) {
    if (l.row === 0 || l.kind !== 'plot') continue;
    const list = rows.get(l.row);
    if (list) list.push(l);
    else rows.set(l.row, [l]);
  }
  for (const [id, list] of rows) {
    if (list.length < 2) {
      rows.delete(id);
      continue;
    }
    const [ax, az] = RIGHT[list[0]!.rot]!;
    list.sort((a, b) => a.x * ax + a.z * az - (b.x * ax + b.z * az) || a.id - b.id);
  }
  for (const list of rows.values()) clampRow(mirror, list);
  return { lots, rows, gardens: lots.filter((l) => l.kind === 'garden'), fromSim };
}

/**
 * V3B: neighbors in a row step by at most one storey (the sim's own rule, applied again here in
 * case a lot's value arrives unchecked). Along a run of consecutive built plots with known storeys
 * whose buildings touch, each is raised to the upper envelope `s_i = max_j(b_j - |i - j|)`, capped
 * at 4. A valid row is unchanged.
 */
function clampRow(mirror: Mirror, list: ScreenLot[]): void {
  let run: ScreenLot[] = [];
  const flush = (): void => {
    const n = run.length;
    for (let i = 1; i < n; i++) run[i]!.storeys = Math.max(run[i]!.storeys, run[i - 1]!.storeys - 1);
    for (let i = n - 2; i >= 0; i--) run[i]!.storeys = Math.max(run[i]!.storeys, run[i + 1]!.storeys - 1);
    for (const l of run) l.storeys = Math.min(MAX_ROW_STOREYS, l.storeys);
    run = [];
  };
  let prev: BuildingView | undefined;
  for (const l of list) {
    const b = l.buildingId ? mirror.buildings.get(l.buildingId) : undefined;
    if (!b || b.stage !== 'built' || !l.storeysKnown) {
      flush();
      prev = undefined;
      continue;
    }
    if (prev && joinedIds(mirror, prev)[1] !== b.id) flush();
    run.push(l);
    prev = b;
  }
  flush();
}

/** The plot lot of each building on one, by building id. */
function plotLotOf(screen: ScreenLots): Map<EntityId, ScreenLot> {
  const out = new Map<EntityId, ScreenLot>();
  for (const l of screen.lots) if (l.kind === 'plot' && l.buildingId) out.set(l.buildingId, l);
  return out;
}

/** One side of a built row kit after the row rule: the joined neighbor (and its lot), or a road. */
interface RowSide {
  nb: BuildingView | undefined;
  nbLot: ScreenLot | undefined;
  street: boolean;
}

/**
 * The V1B probe's joins, kept only for neighbors in the same row: a neighbor whose lot is in
 * another row (or in none while this one is in a row) is not joined, whatever touches. A building
 * with no lot (hand-placed homes), or a neighbor with none, joins as `rowNeighbors` always did.
 */
function rowSides(
  mirror: Mirror,
  b: BuildingView,
  lot: ScreenLot | undefined,
  lotOf: Map<EntityId, ScreenLot>,
): [RowSide, RowSide] | null {
  const sides = probeSides(mirror, b);
  if (!sides) return null;
  const out = sides.map((s): RowSide => {
    const nbLot = s.nb ? lotOf.get(s.nb.id) : undefined;
    const nb = s.nb && (!lot || !nbLot || nbLot.row === lot.row) ? s.nb : undefined;
    return { nb, nbLot, street: !nb && s.road };
  });
  return out as [RowSide, RowSide];
}

/**
 * V3B: the row params of every built row-kit building, from the lots: `joinL`/`joinR` (the
 * neighbor's kit) and `partyL`/`partyR` (its eaves, `rowEaves` of its kit and storeys, when its
 * storeys are known) for neighbors that really touch in the same row, `streetL`/`streetR` from the
 * road probe on an unjoined side, `storeys` when known (after the one-step clamp), and `corner`
 * ('L' or 'R', the kit-local side a corner lot's second street runs past, from `frontage2`). On
 * lots without R2's fields (and for buildings with no lot at all) this is exactly `rowNeighbors`.
 */
export function rowParams(
  mirror: Mirror,
  screen: ScreenLots,
): Map<EntityId, Record<string, string | number | boolean>> {
  const out = new Map<EntityId, Record<string, string | number | boolean>>();
  const lotOf = plotLotOf(screen);
  for (const b of mirror.buildings.values()) {
    const lot = lotOf.get(b.id);
    const sides = rowSides(mirror, b, lot, lotOf);
    if (!sides) continue;
    const p: Record<string, string | number | boolean> = {};
    for (const [i, side] of (['L', 'R'] as const).entries()) {
      const s = sides[i]!;
      const ndef = s.nb ? drawDef(s.nb.def) : undefined;
      if (s.nb && ndef) {
        const kit = artKitId(ndef.art);
        p[`join${side}`] = kit;
        if (s.nbLot?.storeysKnown) {
          const eaves = rowEaves(kit, s.nbLot.storeys);
          if (eaves !== undefined) p[`party${side}`] = eaves;
        }
      } else if (s.street) p[`street${side}`] = true;
    }
    if (lot?.storeysKnown) p.storeys = lot.storeys;
    if (lot?.corner && lot.frontage2 !== undefined) {
      const def = drawDef(b.def);
      const side = def ? cornerSide(b, def.size[0], lot.frontage2) : undefined;
      if (side && !p[`join${side}`]) p.corner = side;
    }
    out.set(b.id, p);
  }
  return out;
}

/** Which kit-local side (x- or x+) of a building the road tile `tile` (z * MAP_SIZE + x) lies on. */
function cornerSide(b: BuildingView, width: number, tile: number): 'L' | 'R' | undefined {
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, local);
  toLocal.copy(local).invert();
  probe.set((tile % MAP_SIZE) + 0.5, 0, Math.floor(tile / MAP_SIZE) + 0.5).applyMatrix4(toLocal);
  return probe.x < 0 ? 'L' : probe.x > width ? 'R' : undefined;
}

export interface YardRect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * V3B: the free yard of a building: its lot in world tiles, less what joined neighbors and a garden
 * lot take. On a joined side the yard stops at the building's footprint edge (a party wall reaches
 * the lot line, so there is no side yard there), and any overlap with a garden lot is cut off (the
 * cut that keeps the most ground). Null when the building has no lot. `screen` is `lotsFor(mirror)`
 * when the caller has it already.
 */
export function yardOf(
  mirror: Mirror,
  buildingId: EntityId,
  screen: ScreenLots = lotsFor(mirror),
): YardRect | null {
  const b = mirror.buildings.get(buildingId);
  const lot = screen.lots.find((l) => l.kind === 'plot' && l.buildingId === buildingId);
  if (!b || !lot) return null;
  let x0 = lot.x;
  let z0 = lot.z;
  let x1 = lot.x + lot.w;
  let z1 = lot.z + lot.d;
  const def = drawDef(b.def);
  const sides = def ? rowSides(mirror, b, lot, plotLotOf(screen)) : null;
  if (def && sides) {
    const [fw, fd] = footprintSize(def, b.rot);
    for (const [i, sign] of [-1, 1].entries()) {
      if (!sides[i]!.nb) continue;
      const dx = RIGHT[b.rot]![0] * sign;
      const dz = RIGHT[b.rot]![1] * sign;
      if (dx > 0) x1 = Math.min(x1, b.x + fw);
      else if (dx < 0) x0 = Math.max(x0, b.x);
      else if (dz > 0) z1 = Math.min(z1, b.z + fd);
      else z0 = Math.max(z0, b.z);
    }
  }
  for (const g of screen.gardens) {
    const gx1 = g.x + g.w;
    const gz1 = g.z + g.d;
    if (g.x >= x1 || gx1 <= x0 || g.z >= z1 || gz1 <= z0) continue;
    const cuts: [number, number, number, number][] = [
      [x0, z0, Math.min(x1, g.x), z1],
      [Math.max(x0, gx1), z0, x1, z1],
      [x0, z0, x1, Math.min(z1, g.z)],
      [x0, Math.max(z0, gz1), x1, z1],
    ];
    let best = cuts[0]!;
    let bestArea = -1;
    for (const c of cuts) {
      const area = Math.max(0, c[2] - c[0]) * Math.max(0, c[3] - c[1]);
      if (area > bestArea) {
        best = c;
        bestArea = area;
      }
    }
    [x0, z0, x1, z1] = best;
  }
  return { x: x0, z: z0, w: Math.max(0, x1 - x0), d: Math.max(0, z1 - z0) };
}

/** One roofline in a row, for the endpaper (V3D): the building's footprint, facing and storeys. */
export interface EndpaperRoofline {
  /** The lot's row id (0 for a lone lot). */
  row: number;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  storeys: number;
}

/**
 * V3B: what the endpaper draws of the streets, as plain arrays: a roofline for each built plot (rows
 * in id order and each row's lots in order along the frontage, then lone lots by id with row 0) and
 * each garden lot's rectangle.
 */
export function endpaperStreets(mirror: Mirror): {
  rooflines: EndpaperRoofline[];
  gardens: YardRect[];
} {
  const screen = lotsFor(mirror);
  const rooflines: EndpaperRoofline[] = [];
  const add = (l: ScreenLot, row: number): void => {
    const b = l.buildingId ? mirror.buildings.get(l.buildingId) : undefined;
    const def = b ? drawDef(b.def) : undefined;
    if (!b || !def || b.stage !== 'built') return;
    const [w, d] = footprintSize(def, b.rot);
    rooflines.push({ row, x: b.x, z: b.z, w, d, rot: b.rot, storeys: l.storeys });
  };
  const inRow = new Set<EntityId>();
  for (const id of [...screen.rows.keys()].sort((a, b) => a - b)) {
    for (const l of screen.rows.get(id)!) {
      inRow.add(l.id);
      add(l, id);
    }
  }
  for (const l of screen.lots) if (l.kind === 'plot' && !inRow.has(l.id)) add(l, 0);
  return { rooflines, gardens: screen.gardens.map((g) => ({ x: g.x, z: g.z, w: g.w, d: g.d })) };
}

/** What a garden's four edges meet: north (z-), east (x+), south (z+), west (x-). */
export interface GardenSides {
  /** 4 chars for north, east, south, west: 'p' plots (house backs), 'g' garden, 'r' road, 'o' open. */
  sides: string;
  /** The subset of 'nesw' the garden draws a boundary on. */
  walls: string;
  /** The district style of its owner row's lots, or ''. */
  style: string;
}

const DISTRICT_STYLES: ReadonlySet<string> = new Set(['brick', 'plaster', 'stone', 'timber']);

/**
 * V3B: the `sides`, `walls` and `style` params of every garden lot. A side is what most of the
 * tiles just outside it are (ties go plots, garden, road, open). Road and open sides always get a
 * wall, a garden-to-garden edge only on the lower id, a plot side never.
 */
export function gardenParams(mirror: Mirror, screen: ScreenLots): Map<EntityId, GardenSides> {
  const out = new Map<EntityId, GardenSides>();
  if (!screen.gardens.length) return out;
  const tiles = new Map<number, ScreenLot>();
  for (const l of screen.lots)
    for (let z = l.z; z < l.z + l.d; z++)
      for (let x = l.x; x < l.x + l.w; x++) if (!tiles.has(z * MAP_SIZE + x)) tiles.set(z * MAP_SIZE + x, l);
  const tallies = new Map<number, Map<string, number>>();
  for (const l of screen.lots) {
    if (l.kind !== 'plot' || !DISTRICT_STYLES.has(l.style)) continue;
    const t = tallies.get(l.row) ?? new Map<string, number>();
    t.set(l.style, (t.get(l.style) ?? 0) + 1);
    tallies.set(l.row, t);
  }
  const styleOfRow = (row: number): string => {
    let best = '';
    let n = 0;
    for (const [k, c] of tallies.get(row) ?? []) if (c > n) [best, n] = [k, c];
    return best;
  };
  for (const g of screen.gardens) {
    let sides = '';
    let walls = '';
    const edges: [string, number, number, number, number][] = [
      ['n', g.x, g.z - 1, 1, 0],
      ['e', g.x + g.w, g.z, 0, 1],
      ['s', g.x, g.z + g.d, 1, 0],
      ['w', g.x - 1, g.z, 0, 1],
    ];
    for (const [name, sx, sz, dx, dz] of edges) {
      const n = dx ? g.w : g.d;
      let plots = 0;
      let gardens = 0;
      let roads = 0;
      let open = 0;
      const gardenIds = new Map<number, number>();
      for (let k = 0; k < n; k++) {
        const x = sx + dx * k;
        const z = sz + dz * k;
        const lot = tiles.get(z * MAP_SIZE + x);
        if (lot && lot.id !== g.id && lot.kind === 'garden') {
          gardens++;
          gardenIds.set(lot.id, (gardenIds.get(lot.id) ?? 0) + 1);
        } else if (lot && lot.kind === 'plot') plots++;
        else if (mirror.road(x, z) > 0) roads++;
        else open++;
      }
      const top = Math.max(plots, gardens, roads, open);
      const c = plots === top ? 'p' : gardens === top ? 'g' : roads === top ? 'r' : 'o';
      sides += c;
      if (c === 'r' || c === 'o') walls += name;
      else if (c === 'g') {
        let other = 0;
        let most = 0;
        for (const [id, count] of gardenIds) if (count > most) [other, most] = [id, count];
        if (g.id < other) walls += name;
      }
    }
    out.set(g.id, { sides, walls, style: styleOfRow(g.row) });
  }
  return out;
}

/**
 * V3B: a cheap signature of every lot field the long view draws from, so a village change that
 * leaves the lots as they were (a plan, a request, a story) costs the buildings layer nothing.
 */
export function lotSignature(mirror: Mirror): string {
  let sig = '';
  for (const l of mirror.lots.values() as Iterable<LotFields>) {
    sig += `${l.id},${l.x},${l.z},${l.w},${l.d},${l.rot},${l.buildingId},${l.row ?? 0},${l.kind ?? ''},${l.corner ? 1 : 0},${l.frontage2 ?? ''},${l.storeys ?? ''},${l.style};`;
  }
  return sig;
}
