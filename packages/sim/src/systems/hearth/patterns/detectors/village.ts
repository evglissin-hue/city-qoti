// Shared bits for the Village pattern detectors (C4C): road shapes, open ground and the strip
// test for "buildings on a side". Scratch-free; the detectors are hourly and small.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../../constants';
import type { Building, EntityId, Rect, WorldState } from '../../../../contracts';
import { Road } from '../../../../map/layers';

const S = MAP_SIZE;

export function inMap(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < S && z < S;
}

/** Paved for a square: a path or a street (a lane is a cart track, not a square). */
export function paved(state: WorldState, x: number, z: number): boolean {
  if (!inMap(x, z)) return false;
  const i = z * S + x;
  const r = state.map.road[i]!;
  return (r === Road.path || r === Road.street) && !state.map.occupant[i] && !state.map.water[i];
}

/** Open ground for a green: no building, road, water or field. */
export function openGround(state: WorldState, x: number, z: number): boolean {
  if (!inMap(x, z)) return false;
  const i = z * S + x;
  const m = state.map;
  return !m.occupant[i] && !m.road[i] && !m.water[i] && !m.fieldOwner[i];
}

export function roadAt(state: WorldState, x: number, z: number): boolean {
  return inMap(x, z) && state.map.road[z * S + x]! > 0;
}

/** Road neighbors of a road tile: [north, east, south, west]. */
export function roadArms(state: WorldState, x: number, z: number): [boolean, boolean, boolean, boolean] {
  return [roadAt(state, x, z - 1), roadAt(state, x + 1, z), roadAt(state, x, z + 1), roadAt(state, x - 1, z)];
}

/** The building ids standing in an inclusive rect (clipped to the map), sorted. */
export function buildingsIn(state: WorldState, r: Rect): EntityId[] {
  const ids = new Set<EntityId>();
  for (let z = Math.max(0, r[1]); z <= Math.min(S - 1, r[3]); z++) {
    for (let x = Math.max(0, r[0]); x <= Math.min(S - 1, r[2]); x++) {
      const id = state.map.occupant[z * S + x]!;
      if (id) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Buildings beside a rect on each side, `reach` tiles deep: [north, east, south, west], each the
 * sorted ids found in that strip.
 */
export function sideBuildings(state: WorldState, r: Rect, reach: number): EntityId[][] {
  const [x0, z0, x1, z1] = r;
  return [
    buildingsIn(state, [x0, z0 - reach, x1, z0 - 1]),
    buildingsIn(state, [x1 + 1, z0, x1 + reach, z1]),
    buildingsIn(state, [x0, z1 + 1, x1, z1 + reach]),
    buildingsIn(state, [x0 - reach, z0, x0 - 1, z1]),
  ];
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function hasBuildingTag(b: Building, tag: string): boolean {
  return content.buildingById.get(b.def)?.tags?.includes(tag) ?? false;
}

export function rectTiles(r: Rect): number[] {
  const out: number[] = [];
  for (let z = r[1]; z <= r[3]; z++) for (let x = r[0]; x <= r[2]; x++) out.push(z * S + x);
  return out;
}
