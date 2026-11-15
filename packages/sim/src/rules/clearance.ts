// A windmill keeps its open ground (docs/spec/13-ledger.md, Land and specialized buildings; the
// master's decision on R1F's openGround health check, 2026-11-12): nothing stands within the `clear`
// tiles of an `openGround` building's footprint. Its own site rule refuses a windmill placed among
// buildings; this refuses anything else placed by hand, grown, or cut as a lot inside a standing
// windmill's clearance, with the same reason (NEEDS_OPEN_GROUND), so the ghost, the growth pass and
// the lot cutter agree.
import { content } from '@qoti/content';
import type { MapReader } from '../contracts';

/** Clearance by def id, for defs with an openGround rule. */
const CLEAR: ReadonlyMap<string, number> = new Map(
  content.buildings.flatMap((d) => {
    const r = d.placement?.find((p) => p.kind === 'openGround');
    return r && r.kind === 'openGround' ? [[d.id, r.clear] as const] : [];
  }),
);

/** The widest clearance any def keeps (the ring a check must look in). */
export const MAX_CLEAR = Math.max(0, ...CLEAR.values());

/**
 * True when the rect (min corner, size) lies within the clearance of a building with an
 * openGround rule: some tile of that building within its `clear` tiles (Chebyshev) of the rect.
 * Needs `reader.occupantDef`; a reader without it sees no clearance.
 */
export function inClearance(reader: MapReader, x: number, z: number, w: number, d: number): boolean {
  if (MAX_CLEAR <= 0 || !reader.occupantDef) return false;
  for (let tz = z - MAX_CLEAR; tz < z + d + MAX_CLEAR; tz++) {
    for (let tx = x - MAX_CLEAR; tx < x + w + MAX_CLEAR; tx++) {
      if (tx >= x && tx < x + w && tz >= z && tz < z + d) continue;
      if (tx < 0 || tz < 0 || tx >= reader.size || tz >= reader.size || !reader.occupant(tx, tz)) continue;
      const clear = CLEAR.get(reader.occupantDef(tx, tz) ?? '');
      if (clear === undefined) continue;
      const gap = Math.max(x - tx, tx - (x + w - 1), z - tz, tz - (z + d - 1));
      if (gap <= clear) return true;
    }
  }
  return false;
}
