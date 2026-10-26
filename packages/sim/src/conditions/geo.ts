// Tile geometry shared by the Condition DSL, the pattern detectors and the Chronicle's place
// names. Everything is measured as the gap between inclusive tile rectangles, so "within 2 tiles of
// home" counts the tiles touching the home and the two rings beyond them.
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../constants';
import type { Building, Decor, Rect, WorldState } from '../contracts';
import { footprintSize } from '../rules/footprint';
import { findById } from '../state/entities';
import { worldIndex } from '../state/worldIndex';

/** Inclusive footprint rect of a building. */
export function buildingRect(b: Building, def = content.buildingById.get(b.def)): Rect {
  const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
  return [b.x, b.z, b.x + w - 1, b.z + d - 1];
}

/** The tile a decor piece stands on. */
export function decorTileX(d: Pick<Decor, 'fx'>): number {
  return Math.floor(d.fx / TILE_FP);
}

export function decorTileZ(d: Pick<Decor, 'fz'>): number {
  return Math.floor(d.fz / TILE_FP);
}

/** Squared gap between two inclusive rects, in tiles (0 when they touch or overlap). */
export function rectGap2(a: Rect, b: Rect): number {
  const gx = Math.max(0, a[0] - b[2] - 1, b[0] - a[2] - 1);
  const gz = Math.max(0, a[1] - b[3] - 1, b[1] - a[3] - 1);
  return gx * gx + gz * gz;
}

/** Squared gap between a tile and an inclusive rect. */
export function tileGap2(x: number, z: number, r: Rect): number {
  const gx = Math.max(0, r[0] - x - 1, x - r[2] - 1);
  const gz = Math.max(0, r[1] - z - 1, z - r[3] - 1);
  return gx * gx + gz * gz;
}

export function expandRect(r: Rect, n: number): Rect {
  return [
    Math.max(0, r[0] - n),
    Math.max(0, r[1] - n),
    Math.min(MAP_SIZE - 1, r[2] + n),
    Math.min(MAP_SIZE - 1, r[3] + n),
  ];
}

/** Homes are buildings that house a household. */
export function isHomeDef(def: BuildingDef | undefined): boolean {
  return !!def && (def.category === 'home' || !!def.housing);
}

/** The household living in a building, if any (households are few; a linear scan is fine). */
export function householdIn(state: WorldState, homeId: number) {
  for (const h of state.households) if (h.homeId === homeId) return h;
  return undefined;
}

/** The building on a tile, or undefined. */
export function buildingAt(state: WorldState, x: number, z: number): Building | undefined {
  if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return undefined;
  const id = state.map.occupant[z * MAP_SIZE + x]!;
  return id ? findById(state.buildings, id) : undefined;
}

/** Decor whose tile lies inside an inclusive rect, in grid order. */
export function decorInRect(state: WorldState, r: Rect): Decor[] {
  const cx = ((r[0] + r[2] + 1) * TILE_FP) / 2;
  const cz = ((r[1] + r[3] + 1) * TILE_FP) / 2;
  const hw = ((r[2] - r[0] + 1) * TILE_FP) / 2;
  const hd = ((r[3] - r[1] + 1) * TILE_FP) / 2;
  const radius = Math.ceil(Math.sqrt(hw * hw + hd * hd)) + 1;
  const out: Decor[] = [];
  for (const d of worldIndex(state).decorGrid.near(Math.round(cx), Math.round(cz), radius)) {
    const x = decorTileX(d);
    const z = decorTileZ(d);
    if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) out.push(d);
  }
  return out;
}

/** Decor ids sorted ascending, for stable site member lists. */
export function byIdAsc<T extends { id: number }>(a: T, b: T): number {
  return a.id - b.id;
}
