// V1B: joined facades. Where a home's side wall touches a neighbor's on the same frontage, the
// renderer passes the neighbor's kit in `params.joinL` (the kit's x- side) or `params.joinR` (x+),
// and the kit builds to the lot's edge on that side: the party wall is left out below the
// neighbor's eaves (shown above, where a taller house steps up), the plinth runs through, the roof
// stops flush, and the chimney stands on the party wall. Joined homes share one band of the lot
// (the same front and back planes whatever the lot's depth), so party walls meet face to face.
// `params.streetL` and `params.streetR` mark a side that faces a road: a corner house dresses it.
//
// V3B adds, all optional (absent means today's look, so a valley without R2's lot fields draws as
// before):
// - `params.storeys` (1, 1.5, 2, 3 or 4; the sim's `Building.storeys` through `lotsFor`): the kit
//   builds that many floors, its roof riding the top. A half storey is a room in the roof (a low
//   knee wall and dormers). Absent, a kit draws its native storeys (`ROW_NATIVE_STOREYS`).
// - `params.partyL` and `params.partyR`: the joined neighbor's eaves height in tiles (`rowEaves` of
//   its kit and storeys), which wins over `ROW_EAVES[joinL]`, so a party wall shows where a
//   neighbor of another height steps up or down.
// - `params.corner`: 'L' or 'R', the kit-local side (x- or x+) a corner lot's second street runs
//   past (`ScreenLot.frontage2`). That side is a second front (`streetL` or `streetR` is set too):
//   a canted entrance on the front corner, windows and sills on both faces, never a blank wall.
import type { PartySides } from './buildings';
import type { KitBuildOptions } from './types';

/** Wall tops (eaves) of the kits that join into rows, so a neighbor knows where it steps up. */
export const ROW_EAVES: Readonly<Record<string, number>> = {
  cottage: 0.88,
  house: 1.46,
  shop: 1.64,
  townhouse: 1.58,
};

/** V3B: the storeys a row kit draws when `params.storeys` is absent (today's look). */
export const ROW_NATIVE_STOREYS: Readonly<Record<string, number>> = {
  cottage: 1.5,
  house: 2,
  shop: 2,
  townhouse: 2,
};

/** V3B: the cozy ceiling outside landmarks (18-eras.md), as the sim's `MAX_STOREYS`. */
export const MAX_ROW_STOREYS = 4;
/** V3B: one full storey's wall height, in tiles. */
export const STOREY_H = 0.72;
/** V3B: the knee wall a half storey (a room in the roof) adds under the eaves. */
export const HALF_STOREY_H = 0.06;

/** V3B: storeys from a value, clamped to 1 to 4 in half steps; undefined when not a finite number. */
export function clampStoreys(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.round(Math.min(MAX_ROW_STOREYS, Math.max(1, v)) * 2) / 2;
}

/** V3B: a kit's `params.storeys`, clamped; undefined when absent (draw the native storeys). */
export function storeysOf(opts: KitBuildOptions | undefined): number | undefined {
  return clampStoreys(opts?.params?.storeys);
}

/** V3B: the wall height `storeys` floors take (whole floors, plus a knee wall for a half). */
export function storeyWall(storeys: number): number {
  const whole = Math.floor(storeys);
  return whole * STOREY_H + (storeys > whole ? HALF_STOREY_H : 0);
}

/**
 * V3B: how much taller (or lower, when negative) a row kit's walls stand at `storeys` than at its
 * native storeys. A kit adds this to its own wall height, so `rowEaves` and the kit always agree.
 */
export function storeyLift(kit: string, storeys: number | undefined): number {
  const native = ROW_NATIVE_STOREYS[kit];
  if (storeys === undefined || native === undefined) return 0;
  return storeyWall(storeys) - storeyWall(native);
}

/** V3B: a row kit's eaves height at `storeys` (absent: native, `ROW_EAVES`); undefined for other kits. */
export function rowEaves(kit: string, storeys?: number): number | undefined {
  const e = ROW_EAVES[kit];
  return e === undefined ? undefined : e + storeyLift(kit, clampStoreys(storeys));
}

/** True for kits that join their neighbors into rows. */
export function isRowKit(kit: string): boolean {
  return ROW_EAVES[kit] !== undefined;
}

/** How far a joined home stands back from its lot's front, and how deep it is. */
export const ROW_SETBACK = 0.3;
export const ROW_DEPTH = 1.45;

export interface Row {
  /** Party walls for `shell`: the neighbor's eaves on each joined side. */
  party: PartySides;
  /** Joined on the left (x-) and right (x+). */
  l: boolean;
  r: boolean;
  /** Either side joined. */
  joined: boolean;
  /** Sides that face a road (corner houses dress them). */
  streetL: boolean;
  streetR: boolean;
  /** V3B: the side a corner lot's second street runs past, or null. */
  corner: 'L' | 'R' | null;
}

function joinOf(v: unknown, party: unknown): number | undefined {
  if (typeof v !== 'string' || ROW_EAVES[v] === undefined) return undefined;
  return typeof party === 'number' && Number.isFinite(party) ? party : ROW_EAVES[v];
}

/** A home's place in a row, from its params. */
export function rowOf(opts: KitBuildOptions | undefined): Row {
  const p = opts?.params ?? {};
  const l = joinOf(p.joinL, p.partyL);
  const r = joinOf(p.joinR, p.partyR);
  const corner = p.corner === 'L' || p.corner === 'R' ? p.corner : null;
  return {
    party: { ...(l !== undefined ? { l } : {}), ...(r !== undefined ? { r } : {}) },
    l: l !== undefined,
    r: r !== undefined,
    joined: l !== undefined || r !== undefined,
    streetL: p.streetL === true || corner === 'L',
    streetR: p.streetR === true || corner === 'R',
    corner,
  };
}

/**
 * Fits a home's outline to its row: to the lot's edge on joined sides, and into the shared band
 * (front `ROW_SETBACK` from the lot's front, `ROW_DEPTH` deep) when joined at all.
 */
export function fitRow(
  row: Row,
  w: number,
  d: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): [number, number, number, number] {
  if (!row.joined) return [x0, z0, x1, z1];
  const f = d - ROW_SETBACK;
  return [row.l ? 0 : x0, Math.max(0.12, f - ROW_DEPTH), row.r ? w : x1, f];
}
