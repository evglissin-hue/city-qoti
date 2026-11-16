// V3.0: one shape for the lots the long view draws rows, back gardens, corner buildings and storeys from.
import { Matrix4, Vector3 } from 'three';
import type { BuildingView, EntityId, LotView, Rot4 } from '@qoti/sim';
import { artKitId, isRowKit } from '@qoti/art';
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
  /** Storeys of the building on it (the sim's `params.storeys`), 1 when unknown or empty. */
  storeys: number;
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

/**
 * The building each of a built row kit's sides joins, found with the same probe as
 * `rowNeighbors` in layers/buildings.ts (that function returns kit ids, not neighbors).
 * Returns the joined neighbor's id for the left and right side, or 0.
 */
function joinedIds(mirror: Mirror, b: BuildingView): [left: EntityId, right: EntityId] {
  const out: [EntityId, EntityId] = [0, 0];
  const def = drawDef(b.def);
  if (!def || b.stage !== 'built' || !isRowKit(artKitId(def.art))) return out;
  const [w, d] = def.size;
  const level = standLevel(mirror, b.def, b.x, b.z, b.rot);
  buildingMatrix(b.def, b.x, b.z, b.rot, 0, local);
  for (const [i, u] of [
    [0, -0.5],
    [1, w + 0.5],
  ] as const) {
    probe.set(u, 0, d - 0.5).applyMatrix4(local);
    const tx = Math.floor(probe.x);
    const tz = Math.floor(probe.z);
    const id = mirror.occupant(tx, tz);
    const nb = id && id !== b.id ? mirror.buildings.get(id) : undefined;
    const ndef = nb ? drawDef(nb.def) : undefined;
    if (!nb || !ndef || nb.stage !== 'built' || nb.rot !== b.rot || !isRowKit(artKitId(ndef.art))) continue;
    toLocal.copy(buildingMatrix(nb.def, nb.x, nb.z, nb.rot, 0, toLocal)).invert();
    probe.set(tx + 0.5, 0, tz + 0.5).applyMatrix4(toLocal);
    const [nw, nd] = ndef.size;
    const edge = i === 0 ? probe.x > nw - 1 : probe.x < 1;
    if (edge && probe.z > nd - 1 && standLevel(mirror, nb.def, nb.x, nb.z, nb.rot) === level) out[i] = nb.id;
  }
  return out;
}

/** Storeys from the lot's `storeys` (R2.0), else its building's, else 1; clamped to 1 to 4 in halves. */
function storeysOf(lot: LotFields, b: BuildingView | undefined): number {
  const v = b as BuildingFields | undefined;
  const raw =
    typeof lot.storeys === 'number'
      ? lot.storeys
      : typeof v?.storeys === 'number'
        ? v.storeys
        : v?.params?.storeys;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.round(Math.min(4, Math.max(1, raw)) * 2) / 2;
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
      storeys: storeysOf(l, l.buildingId ? mirror.buildings.get(l.buildingId) : undefined),
    };
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
    if (l.row === 0) continue;
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
  return { lots, rows, fromSim };
}
