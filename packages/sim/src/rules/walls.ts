// Wall runs (C5F, for C5D's wall.paint; docs/spec/14-challenge.md, Defenses). A pure function of a
// MapReader and the buildings, so the sim refuses a run and the client's wall ghost says so before
// the click. A run is a piece per tile on open land: not water, not a road (put a gate there), not
// under a building or decor, on an unlocked parcel. Walls must never cut a home, workplace or
// storehouse off from the valley gate (WOULD_ENCLOSE), so nothing can deadlock residents or porters;
// open or shut, gates count as a way through (residents pass them, and they open again at dawn).
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../constants';
import type { EntityId, MapReader, RejectReason, RoadPlacement } from '../contracts';
import { inBounds } from '../map/layers';
import { isTile, MAX_DECOR_RADIUS } from './geometry';
import { doorFront, reachesTile, type ReachBuilding } from './reach';

/** What a wall run needs to know besides the map. BuildingView and Building both fit. */
export interface WallWorld {
  /** The valley gate tile (WorldMeta.valleyGate). */
  gate: [number, number];
  buildings: Iterable<ReachBuilding & { id: EntityId }>;
}

/** Most tiles in one painted run. */
export const MAX_WALL_TILES = 256;

/** Buildings a wall may never shut in: everything but defenses (homes, work, storage, services). */
function guarded(def: string): boolean {
  const d = content.buildingById.get(def);
  return !!d && d.category !== 'defense';
}

/** Tiles walkers reach from the gate, with `blocked` added as wall and gates passable. */
function reachFromGate(
  reader: MapReader,
  gate: [number, number],
  gates: ReadonlySet<number>,
  blocked: ReadonlySet<number>,
): Uint8Array {
  const S = MAP_SIZE;
  const out = new Uint8Array(S * S);
  const open = (x: number, z: number) => {
    const i = z * S + x;
    if (blocked.has(i)) return false;
    const occ = reader.occupant(x, z);
    if (occ && !gates.has(occ)) return false;
    return reader.road(x, z) > 0 || reader.water(x, z) === 0;
  };
  const [gx, gz] = gate;
  if (!inBounds(gx, gz, S) || !open(gx, gz)) return out;
  const queue = [gz * S + gx];
  out[queue[0]!] = 1;
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    const x = t % S;
    const z = (t - x) / S;
    const h = reader.height(x, z);
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
      const nz = k === 2 ? z + 1 : k === 3 ? z - 1 : z;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      if (out[n] || !open(nx, nz)) continue;
      const dh = reader.height(nx, nz) - h;
      if (dh >= 2 || dh <= -2) continue;
      out[n] = 1;
      queue.push(n);
    }
  }
  return out;
}

/**
 * Can `def` (a blocking defense: palisade, stone wall) be painted on these tiles? Any bad tile
 * rejects the run (firstBadTile); a run that would shut a building in names that building's door.
 */
export function canPaintWall(
  reader: MapReader,
  def: string,
  tiles: [number, number][],
  world: WallWorld,
): RoadPlacement {
  if (!content.buildingById.get(def)?.defense?.blocks) return { ok: false, reason: 'INVALID' };
  if (!Array.isArray(tiles) || tiles.length === 0) return { ok: false, reason: 'INVALID' };
  if (tiles.length > MAX_WALL_TILES) return { ok: false, reason: 'TOO_MANY' };
  const S = MAP_SIZE;
  const set = new Set<number>();
  for (const tile of tiles) {
    if (!isTile(tile)) return { ok: false, reason: 'INVALID' };
    const [x, z] = tile;
    const bad = (reason: RejectReason): RoadPlacement => ({ ok: false, reason, firstBadTile: [x, z] });
    if (!inBounds(x, z, S)) return bad('OUT_OF_BOUNDS');
    if (!reader.parcelUnlocked(x, z)) return bad('LOCKED_PARCEL');
    if (reader.water(x, z)) return bad('WATER');
    if (reader.occupant(x, z) || reader.road(x, z)) return bad('OCCUPIED');
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of reader.decorNear(cx, cz, TILE_FP + MAX_DECOR_RADIUS)) {
      if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return bad('OCCUPIED');
    }
    set.add(z * S + x);
  }
  const buildings = [...world.buildings];
  const gates = new Set<number>();
  for (const b of buildings)
    if (content.buildingById.get(b.def)?.defense?.passable === 'gate') gates.add(b.id);
  const before = reachFromGate(reader, world.gate, gates, new Set());
  const after = reachFromGate(reader, world.gate, gates, set);
  for (const b of buildings) {
    if (!guarded(b.def)) continue;
    const door = doorFront(b);
    if (reachesTile(before, reader, door) && (set.has(door) || !reachesTile(after, reader, door))) {
      return { ok: false, reason: 'WOULD_ENCLOSE', firstBadTile: [door % S, Math.floor(door / S)] };
    }
  }
  return { ok: true };
}
