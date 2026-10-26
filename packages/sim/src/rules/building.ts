import type { BuildingDef } from '@qoti/content';
import { DECOR_BUILDING_MARGIN, TILE_FP } from '../constants';
import type { BuildingPlacement, MapReader, RejectReason, Rot4 } from '../contracts';
import { Deposit } from '../map/layers';
import { entranceTiles, footprintSize, footprintTiles } from './footprint';
import { decorRadius, distSqToRect, isInt, MAX_DECOR_RADIUS } from './geometry';

const DEPOSIT_VALUES = {
  stone: Deposit.stone,
  clay: Deposit.clay,
  sand: Deposit.sand,
  coal: Deposit.coal,
} as const;

/**
 * Can `def` stand with its footprint min corner at (x, z) and rotation `rot`?
 * Rules and reason codes: docs/spec/10-world-and-building.md, Buildings.
 */
export function canPlaceBuilding(
  reader: MapReader,
  def: BuildingDef,
  x: number,
  z: number,
  rot: Rot4,
): BuildingPlacement {
  const fail = (reason: RejectReason, tiles: [number, number][] = []): BuildingPlacement => ({
    ok: false,
    reason,
    tiles,
    foundation: false,
    warnings: [],
  });
  if (!isInt(x) || !isInt(z) || !isInt(rot) || rot < 0 || rot > 3) return fail('INVALID');
  const [w, d] = footprintSize(def, rot);
  const tiles = footprintTiles(def, x, z, rot);
  if (x < 0 || z < 0 || x + w > reader.size || z + d > reader.size) return fail('OUT_OF_BOUNDS', tiles);

  const rules = def.placement ?? [];
  const waterEdge = rules.some((r) => r.kind === 'waterEdge');
  let hMin = Infinity;
  let hMax = -Infinity;
  for (const [tx, tz] of tiles) {
    if (!reader.parcelUnlocked(tx, tz)) return fail('LOCKED_PARCEL', tiles);
  }
  for (const [tx, tz] of tiles) {
    if (reader.water(tx, tz) && !waterEdge) return fail('WATER', tiles);
  }
  for (const [tx, tz] of tiles) {
    if (reader.road(tx, tz) || reader.occupant(tx, tz)) return fail('OCCUPIED', tiles);
    const h = reader.height(tx, tz);
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  // Decor may not come within the margin of a footprint, so a footprint may not swallow decor.
  const x0 = x * TILE_FP;
  const z0 = z * TILE_FP;
  const x1 = (x + w) * TILE_FP;
  const z1 = (z + d) * TILE_FP;
  const cx = (x0 + x1) >> 1;
  const cz = (z0 + z1) >> 1;
  const reach =
    Math.ceil(Math.sqrt((x1 - cx) * (x1 - cx) + (z1 - cz) * (z1 - cz))) +
    MAX_DECOR_RADIUS +
    DECOR_BUILDING_MARGIN;
  for (const decor of reader.decorNear(cx, cz, reach)) {
    const r = decorRadius(decor.def) + DECOR_BUILDING_MARGIN;
    if (distSqToRect(decor.fx, decor.fz, x0, z0, x1, z1) < r * r) return fail('OCCUPIED', tiles);
  }
  if (hMax - hMin > 1) return fail('TOO_STEEP', tiles);

  for (const rule of rules) {
    switch (rule.kind) {
      case 'deposit': {
        const want = DEPOSIT_VALUES[rule.deposit];
        if (!tiles.some(([tx, tz]) => reader.deposit(tx, tz) === want)) return fail('NEEDS_DEPOSIT', tiles);
        break;
      }
      case 'fertility': {
        let sum = 0;
        for (const [tx, tz] of tiles) sum += reader.fertility(tx, tz);
        if (sum < rule.min * tiles.length) return fail('NEEDS_FERTILITY', tiles);
        break;
      }
      case 'height': {
        if (hMin < (rule.min ?? 0) || hMax > (rule.max ?? 15)) return fail('TOO_STEEP', tiles);
        break;
      }
      case 'waterEdge': {
        const touches = tiles.some(
          ([tx, tz]) =>
            reader.water(tx, tz) > 0 ||
            reader.water(tx + 1, tz) > 0 ||
            reader.water(tx - 1, tz) > 0 ||
            reader.water(tx, tz + 1) > 0 ||
            reader.water(tx, tz - 1) > 0,
        );
        if (!touches) return fail('NEEDS_WATER_EDGE', tiles);
        break;
      }
    }
  }

  const warnings: string[] = [];
  const { front } = entranceTiles(def, x, z, rot);
  if (!reader.road(front[0], front[1])) warnings.push('NO_ROAD');
  return { ok: true, tiles, foundation: hMax - hMin === 1, warnings };
}
