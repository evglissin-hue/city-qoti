import type { BuildingDef } from '@qoti/content';
import { DECOR_BUILDING_MARGIN, TILE_FP } from '../constants';
import type { BuildingPlacement, MapReader, RejectReason, Rot4 } from '../contracts';
import { Deposit, Road, treeStage, Water } from '../map/layers';
import { entranceTiles, footprintSize, footprintTiles } from './footprint';
import { valleyRoadTiles } from './valleyRoad';
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
  const waterEdge = rules.some((r) => r.kind === 'waterEdge' || r.kind === 'river');
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

  const { front } = entranceTiles(def, x, z, rot);
  for (const rule of rules) {
    switch (rule.kind) {
      case 'deposit': {
        const want = DEPOSIT_VALUES[rule.deposit];
        let count = 0;
        for (const [tx, tz] of tiles) if (reader.deposit(tx, tz) === want) count++;
        if (count < (rule.minTiles ?? 1)) return fail('NEEDS_DEPOSIT', tiles);
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
      case 'river': {
        const isRiver = (tx: number, tz: number) => {
          const w = reader.water(tx, tz);
          return w === Water.river || w === Water.riverDeep;
        };
        const touches = tiles.some(
          ([tx, tz]) =>
            isRiver(tx, tz) ||
            isRiver(tx + 1, tz) ||
            isRiver(tx - 1, tz) ||
            isRiver(tx, tz + 1) ||
            isRiver(tx, tz - 1),
        );
        if (!touches) return fail('NEEDS_RIVER', tiles);
        break;
      }
      case 'woods': {
        const within = rule.within;
        let count = 0;
        for (let tz = z - within; tz < z + d + within && count < rule.trees; tz++) {
          for (let tx = x - within; tx < x + w + within; tx++) {
            if (tx < 0 || tz < 0 || tx >= reader.size || tz >= reader.size) continue;
            if (treeStage(reader.tree(tx, tz)) !== 3) continue;
            const dx = tx < x ? x - tx : tx >= x + w ? tx - (x + w - 1) : 0;
            const dz = tz < z ? z - tz : tz >= z + d ? tz - (z + d - 1) : 0;
            if (dx * dx + dz * dz <= within * within) count++;
          }
        }
        if (count < rule.trees) return fail('NEEDS_WOODS', tiles);
        break;
      }
      case 'openGround': {
        for (let tz = z - rule.clear; tz < z + d + rule.clear; tz++) {
          for (let tx = x - rule.clear; tx < x + w + rule.clear; tx++) {
            if (tx < 0 || tz < 0 || tx >= reader.size || tz >= reader.size) continue;
            if (reader.occupant(tx, tz) !== 0) return fail('NEEDS_OPEN_GROUND', tiles);
          }
        }
        break;
      }
      case 'road': {
        const have = reader.road(front[0], front[1]);
        const ok =
          have > 0 &&
          (!rule.roads ||
            rule.roads.some((k) =>
              k === 'path' ? have === Road.path : k === 'lane' ? have === Road.lane : have >= Road.street,
            ));
        if (!ok) return fail('NEEDS_ROAD', tiles);
        break;
      }
      case 'valleyRoad': {
        const valley = valleyRoadTiles(reader);
        const S = reader.size;
        let near = false;
        for (
          let tz = Math.max(0, z - rule.within);
          tz <= Math.min(S - 1, z + d - 1 + rule.within) && !near;
          tz++
        ) {
          for (let tx = Math.max(0, x - rule.within); tx <= Math.min(S - 1, x + w - 1 + rule.within); tx++) {
            if (valley[tz * S + tx]) {
              near = true;
              break;
            }
          }
        }
        if (!near) return fail('NEEDS_VALLEY_ROAD', tiles);
        break;
      }
    }
  }

  const warnings: string[] = [];
  if (!reader.road(front[0], front[1]) && !rules.some((r) => r.kind === 'road')) warnings.push('NO_ROAD');
  return { ok: true, tiles, foundation: hMax - hMin === 1, warnings };
}
