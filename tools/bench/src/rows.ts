// R2E: what R2F's street lots look like in a bench town. `rowsOf` reads the lots (pure): row lots,
// the distinct rows, the garden lots behind them, corner lots and the row lots a building stands on.
import type { Lot, WorldState } from '@qoti/sim';

export interface RowsMeasure {
  /** Lots with `row !== 0` (garden lots excluded: they carry no row). */
  rowLots: number;
  /** Distinct row ids. */
  rows: number;
  /** Lots in the longest row. */
  longestRow: number;
  /** Distinct rows of three or more lots. */
  rowsOf3: number;
  gardens: number;
  corners: number;
  /** Row lots with a building on them. */
  grownRowLots: number;
}

export const NO_ROWS: RowsMeasure = {
  rowLots: 0,
  rows: 0,
  longestRow: 0,
  rowsOf3: 0,
  gardens: 0,
  corners: 0,
  grownRowLots: 0,
};

export function rowsOf(w: Pick<WorldState, 'lots'>): RowsMeasure {
  const sizes = new Map<number, number>();
  let rowLots = 0;
  let gardens = 0;
  let corners = 0;
  let grown = 0;
  for (const l of w.lots as readonly Lot[]) {
    if (l.kind === 'garden') {
      gardens++;
      continue;
    }
    if (l.corner) corners++;
    if (!l.row) continue;
    rowLots++;
    sizes.set(l.row, (sizes.get(l.row) ?? 0) + 1);
    if (l.buildingId) grown++;
  }
  let longest = 0;
  let of3 = 0;
  for (const n of sizes.values()) {
    longest = Math.max(longest, n);
    if (n >= 3) of3++;
  }
  return {
    rowLots,
    rows: sizes.size,
    longestRow: longest,
    rowsOf3: of3,
    gardens,
    corners,
    grownRowLots: grown,
  };
}

/**
 * R2E: whether a tile lies in a hollow the lots and buildings wall in (a ray each way meets a lot or a
 * building within 8 tiles before any road). R2F makes gardens of such ground, so nothing of the Hearth's
 * goes there, and no path is laid into it, which would open the hollow again.
 */
export function walledIn(w: Pick<WorldState, 'map'>, x: number, z: number): boolean {
  const S = Math.sqrt(w.map.road.length);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    let hit = false;
    for (let k = 1; k <= 8; k++) {
      const tx = x + dx * k;
      const tz = z + dz * k;
      if (tx < 0 || tz < 0 || tx >= S || tz >= S) return false;
      const i = tz * S + tx;
      if (w.map.road[i]) return false;
      if (w.map.lot[i] || w.map.occupant[i]) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}
