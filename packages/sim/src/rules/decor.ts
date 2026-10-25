import type { DecorDef } from '@qoti/content';
import { DECOR_BUILDING_MARGIN, DECOR_ROTATIONS, MAX_RUN_SEGMENTS, TILE_FP } from '../constants';
import type { MapReader, Placement, RejectReason } from '../contracts';
import { rotationForDirection } from '../map/directions';
import { inBounds, Road, Terrain } from '../map/layers';
import { circleHitsTile, decorRadius, decorTooClose, isInt, MAX_DECOR_RADIUS } from './geometry';

const OPEN_GROUND: ReadonlySet<number> = new Set<number>([Terrain.grass, Terrain.meadow, Terrain.sand]);

function fail(reason: RejectReason): Placement {
  return { ok: false, reason };
}

/**
 * Can a decor piece stand at (fx, fz) (fixed point) with rotation 0 to 63?
 * Rules: docs/spec/10-world-and-building.md, Decor.
 */
export function canPlaceDecor(
  reader: MapReader,
  def: DecorDef,
  fx: number,
  fz: number,
  rot: number,
): Placement {
  if (!isInt(fx) || !isInt(fz) || !isInt(rot) || rot < 0 || rot >= DECOR_ROTATIONS) return fail('INVALID');
  const max = reader.size * TILE_FP;
  if (fx < 0 || fz < 0 || fx >= max || fz >= max) return fail('OUT_OF_BOUNDS');
  const tx = Math.floor(fx / TILE_FP);
  const tz = Math.floor(fz / TILE_FP);
  if (!reader.parcelUnlocked(tx, tz)) return fail('LOCKED_PARCEL');

  const r = def.radius;
  const reach = r + DECOR_BUILDING_MARGIN;
  const tx0 = Math.floor((fx - reach) / TILE_FP);
  const tx1 = Math.floor((fx + reach) / TILE_FP);
  const tz0 = Math.floor((fz - reach) / TILE_FP);
  const tz1 = Math.floor((fz + reach) / TILE_FP);
  for (let z = tz0; z <= tz1; z++) {
    for (let x = tx0; x <= tx1; x++) {
      if (!inBounds(x, z, reader.size)) continue;
      if (!def.onWater && reader.water(x, z) && circleHitsTile(fx, fz, r, x, z)) return fail('WATER');
      if (reader.occupant(x, z) && circleHitsTile(fx, fz, reach, x, z)) return fail('OCCUPIED');
    }
  }

  const road = reader.road(tx, tz);
  if (road) {
    if (!def.onRoad || road > Road.lane) return fail('NOT_ALLOWED');
  } else if (!(def.onWater && reader.water(tx, tz)) && !OPEN_GROUND.has(reader.terrain(tx, tz))) {
    return fail('NOT_ALLOWED');
  }
  if (reader.tree(tx, tz)) return fail('OCCUPIED');

  for (const other of reader.decorNear(fx, fz, r + MAX_DECOR_RADIUS)) {
    if (decorTooClose(other.fx - fx, other.fz - fz, r, decorRadius(other.def))) return fail('OCCUPIED');
  }
  return { ok: true };
}

export interface DecorSegment {
  fx: number;
  fz: number;
  rot: number;
}

/** Splits a dragged line into 1-tile segments aligned to it (linear decor). */
export function decorRunSegments(from: [number, number], to: [number, number]): DecorSegment[] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const n = Math.max(1, Math.round(len / TILE_FP));
  const rot = len === 0 ? 0 : rotationForDirection(dx, dz);
  const segments: DecorSegment[] = [];
  for (let i = 0; i < n; i++) {
    segments.push({
      fx: from[0] + Math.floor(((2 * i + 1) * dx) / (2 * n)),
      fz: from[1] + Math.floor(((2 * i + 1) * dz) / (2 * n)),
      rot,
    });
  }
  return segments;
}

/** Validates a whole run of linear decor; any bad segment rejects the run. */
export function canPlaceDecorRun(
  reader: MapReader,
  def: DecorDef,
  from: [number, number],
  to: [number, number],
): Placement & { segments: DecorSegment[] } {
  const bad = (reason: RejectReason) => ({ ok: false, reason, segments: [] });
  if (!def.linear) return bad('NOT_ALLOWED');
  if (!isInt(from[0]) || !isInt(from[1]) || !isInt(to[0]) || !isInt(to[1])) return bad('INVALID');
  const segments = decorRunSegments(from, to);
  if (segments.length > MAX_RUN_SEGMENTS) return bad('TOO_MANY');
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const placement = canPlaceDecor(reader, def, s.fx, s.fz, s.rot);
    if (!placement.ok) return { ...placement, segments };
    for (let j = 0; j < i; j++) {
      const p = segments[j]!;
      if (decorTooClose(p.fx - s.fx, p.fz - s.fz, def.radius, def.radius))
        return { ok: false, reason: 'OCCUPIED', segments };
    }
  }
  return { ok: true, segments };
}
