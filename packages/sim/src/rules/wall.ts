// Wall runs and gates (C5D). docs/spec/14-challenge.md, Defenses. Pure over a MapReader and the
// buildings, so wall.paint validates with it and the client's wall ghost says the same before the
// click. A run is one piece a tile; tiles already holding a wall piece are skipped, and where a run
// crosses a road the piece there is a gate (residents and carts keep their way). A run may never
// cut a home, workplace or storehouse off from the valley gate (WOULD_ENCLOSE): gates count as
// open, since a gate shut by the bell opens again at dawn, so nothing can deadlock residents or
// porters.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES } from '../constants';
import type { MapReader, RejectReason, Rot4 } from '../contracts';
import { canPlaceBuilding } from './building';
import { facing } from './footprint';
import { isInt } from './geometry';
import { doorReached, townReach, type ReachBuilding } from './reach';

const S = MAP_SIZE;

/** Most tiles in one painted run (wall.paint checks the zone limit). */
export const MAX_WALL_TILES = MAX_ZONE_TILES;

/** A building as the wall rules see it (BuildingView and Building both fit). */
export interface WallBuilding extends ReachBuilding {
  id: number;
}

export interface WallPlan {
  ok: boolean;
  reason?: RejectReason;
  /** The tile that failed, when one did. */
  firstBadTile?: [number, number];
  /** Pieces to place: [x, z, def id] (gates where the run crosses a road). */
  pieces: [x: number, z: number, def: string][];
  /** R3X: the way each piece faces (parallel to `pieces`), chosen so its door has a way in. */
  rots?: Rot4[];
  /** Buildings the run would cut off, when the reason is WOULD_ENCLOSE. */
  enclosed?: number[];
}

/** True for a building def that is a gate. */
export function isGateDef(def: string): boolean {
  return content.buildingById.get(def)?.defense?.passable === 'gate';
}

/** True for a wall piece def (palisade, stone wall, gate). */
export function isWallDef(def: string): boolean {
  return !!content.buildingById.get(def)?.tags?.includes('wall');
}

/** Tiles of gates (1x1), which walkers and the town's reach pass through. */
export function gateTiles(buildings: Iterable<{ def: string; x: number; z: number }>): Set<number> {
  const out = new Set<number>();
  for (const b of buildings) if (isGateDef(b.def)) out.add(b.z * S + b.x);
  return out;
}

/**
 * R3X: the way a wall piece faces, so its door is a tile a builder can walk to. Pieces face south
 * (rot 0) when that tile is open to the town; else the first quarter turn whose step is: a gate turns
 * to a road neighbor first (it sits on a road; a gate across a lane that runs east to west used to
 * face south, onto the lots beside the lane), and a piece of a ring turns off the next piece of the
 * run. Null when no turn has a way in, which refuses the run (the audit's gate and palisade
 * site-cut-offs). `after` is the town's reach with the run standing.
 */
export function chooseRot(
  reader: MapReader,
  after: Uint8Array,
  x: number,
  z: number,
  def: string,
): Rot4 | null {
  const rots = [0, 1, 2, 3] as Rot4[];
  const front = (rot: Rot4): number => {
    const [fx, fz] = facing(rot);
    const nx = x + fx;
    const nz = z + fz;
    return nx < 0 || nz < 0 || nx >= reader.size || nz >= reader.size ? -1 : nz * S + nx;
  };
  const gate = isGateDef(def);
  if (gate) {
    for (const rot of rots) {
      const f = front(rot);
      if (f >= 0 && reader.road(f % S, Math.floor(f / S)) > 0 && after[f]) return rot;
    }
  }
  for (const rot of rots) {
    const f = front(rot);
    if (f >= 0 && after[f]) return rot;
  }
  for (const rot of rots) if (doorReached(after, reader, { def, x, z, rot })) return rot;
  return null;
}

/** Buildings that must keep their way out: homes, workplaces and storehouses. */
export function mustReach(def: string): boolean {
  const d = content.buildingById.get(def);
  if (!d) return false;
  return d.category === 'home' || d.category === 'storage' || !!d.jobs || d.id === 'town-hall';
}

/**
 * The pieces a wall run would place, or why it cannot: in bounds, unlocked, dry land (or a road,
 * which takes a gate), free of buildings other than wall pieces (skipped) and of decor, and never
 * enclosing (`valleyGate` is the tile where the valley's road comes in).
 */
export function canPaintWall(
  reader: MapReader,
  def: string,
  tiles: readonly [number, number][],
  buildings: readonly WallBuilding[],
  valleyGate: readonly [number, number],
): WallPlan {
  const d = content.buildingById.get(def);
  const fail = (reason: RejectReason, at?: [number, number]): WallPlan => ({
    ok: false,
    reason,
    ...(at && { firstBadTile: at }),
    pieces: [],
  });
  if (!d?.defense || !(d.defense.blocks || d.defense.passable === 'gate')) return fail('INVALID');
  const gate = content.buildingById.get('gate');
  const pieces: [number, number, string][] = [];
  const seen = new Set<number>();
  for (const t of tiles) {
    const [x, z] = t;
    if (!isInt(x) || !isInt(z)) return fail('INVALID');
    if (x < 0 || z < 0 || x >= reader.size || z >= reader.size) return fail('OUT_OF_BOUNDS', [x, z]);
    const i = z * S + x;
    if (seen.has(i)) continue;
    seen.add(i);
    const occ = reader.occupant(x, z);
    if (occ) {
      const b = buildings.find((v) => v.id === occ);
      if (b && isWallDef(b.def)) continue;
      return fail('OCCUPIED', [x, z]);
    }
    if (reader.road(x, z) > 0) {
      if (!reader.parcelUnlocked(x, z)) return fail('LOCKED_PARCEL', [x, z]);
      if (!gate) return fail('OCCUPIED', [x, z]);
      pieces.push([x, z, gate.id]);
      continue;
    }
    const p = canPlaceBuilding(reader, d, x, z, 0);
    if (!p.ok) return fail(p.reason ?? 'INVALID', [x, z]);
    pieces.push([x, z, d.id]);
  }
  if (pieces.length === 0) return fail('OCCUPIED');
  const after = reachWith(reader, pieces, buildings, valleyGate);
  const enclosed = enclosedBy(reader, after, buildings, valleyGate);
  if (enclosed.length > 0) return { ok: false, reason: 'WOULD_ENCLOSE', pieces: [], enclosed };
  // R3X: a piece the run itself shuts off from the town has a door nobody can walk to, and the
  // builders who would raise it never arrive: each takes a way that has one, or the run is refused.
  const rots: Rot4[] = [];
  for (const [x, z, d] of pieces) {
    const rot = chooseRot(reader, after, x, z, d);
    if (rot === null) return fail('CUT_OFF', [x, z]);
    rots.push(rot);
  }
  return { ok: true, pieces, rots };
}

/** Reach from the valley gate with extra pieces standing (gates among them stay open). */
function reachWith(
  reader: MapReader,
  pieces: readonly [number, number, string][],
  buildings: readonly WallBuilding[],
  valleyGate: readonly [number, number],
): Uint8Array {
  const through = gateTiles(buildings);
  for (const [x, z, def] of pieces) if (isGateDef(def)) through.add(z * S + x);
  const blocked = new Set<number>();
  for (const [x, z, def] of pieces) if (!isGateDef(def)) blocked.add(z * S + x);
  const view: MapReader =
    blocked.size === 0
      ? reader
      : {
          size: reader.size,
          height: (x, z) => reader.height(x, z),
          terrain: (x, z) => reader.terrain(x, z),
          water: (x, z) => reader.water(x, z),
          road: (x, z) => reader.road(x, z),
          tree: (x, z) => reader.tree(x, z),
          occupant: (x, z) => (blocked.has(z * S + x) ? -1 : reader.occupant(x, z)),
          deposit: (x, z) => reader.deposit(x, z),
          fertility: (x, z) => reader.fertility(x, z),
          parcelUnlocked: (x, z) => reader.parcelUnlocked(x, z),
          decorNear: (fx, fz, r) => reader.decorNear(fx, fz, r),
        };
  return townReach(view, [valleyGate[1] * S + valleyGate[0]], through);
}

/**
 * Buildings the pieces would cut off from the valley gate (ids, in the buildings' order): those whose
 * door the valley reaches now and would not with the pieces up. R3X: every building counts, not only
 * homes and workplaces; a fishery's door sealed by the cottage that grew beside it stood cut off for
 * days. `pieces` may be a building's footprint tile by tile (a def that is not a gate blocks).
 */
export function wouldEnclose(
  reader: MapReader,
  pieces: readonly [number, number, string][],
  buildings: readonly WallBuilding[],
  valleyGate: readonly [number, number],
): number[] {
  return enclosedBy(reader, reachWith(reader, pieces, buildings, valleyGate), buildings, valleyGate);
}

function enclosedBy(
  reader: MapReader,
  after: Uint8Array,
  buildings: readonly WallBuilding[],
  valleyGate: readonly [number, number],
): number[] {
  let before: Uint8Array | null = null;
  const out: number[] = [];
  for (const b of buildings) {
    if (!content.buildingById.has(b.def)) continue;
    // A finished wall has no business at its door; one still going up needs its builders to arrive.
    if (isWallDef(b.def) && b.stage === 'built') continue;
    if (doorReached(after, reader, b)) continue;
    before ??= reachWith(reader, [], buildings, valleyGate);
    if (doorReached(before, reader, b)) out.push(b.id);
  }
  return out;
}
