// V1B: joined facades. Where a home's side wall touches a neighbor's on the same frontage, the
// renderer passes the neighbor's kit in `params.joinL` (the kit's x- side) or `params.joinR` (x+),
// and the kit builds to the lot's edge on that side: the party wall is left out below the
// neighbor's eaves (shown above, where a taller house steps up), the plinth runs through, the roof
// stops flush, and the chimney stands on the party wall. Joined homes share one band of the lot
// (the same front and back planes whatever the lot's depth), so party walls meet face to face.
// `params.streetL` and `params.streetR` mark a side that faces a road: a corner house dresses it.
import type { PartySides } from './buildings';
import type { KitBuildOptions } from './types';

/** Wall tops (eaves) of the kits that join into rows, so a neighbor knows where it steps up. */
export const ROW_EAVES: Readonly<Record<string, number>> = {
  cottage: 0.88,
  house: 1.46,
  shop: 1.64,
  townhouse: 1.58,
};

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
}

function joinOf(v: unknown): number | undefined {
  return typeof v === 'string' ? ROW_EAVES[v] : undefined;
}

/** A home's place in a row, from its params. */
export function rowOf(opts: KitBuildOptions | undefined): Row {
  const p = opts?.params ?? {};
  const l = joinOf(p.joinL);
  const r = joinOf(p.joinR);
  return {
    party: { ...(l !== undefined ? { l } : {}), ...(r !== undefined ? { r } : {}) },
    l: l !== undefined,
    r: r !== undefined,
    joined: l !== undefined || r !== undefined,
    streetL: p.streetL === true,
    streetR: p.streetR === true,
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
