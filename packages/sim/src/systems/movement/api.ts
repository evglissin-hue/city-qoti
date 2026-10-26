// Movement API (C3.0 contract; C3A owns the implementation). C3C drives porters and builders
// through it. Tiles are indexes z * MAP_SIZE + x.
//
// C3.0 STUB: requestMove teleports the resident to the target at once and reports 'arrived', so
// tracks can test trips before real pathfinding lands. C3A replaces it with A* and walking.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, MoveReason, WorldState } from '../../contracts';
import { entranceTiles } from '../../rules/footprint';
import { findById } from '../../state/entities';

/** 'walking' (a path was found), 'arrived' (already there), 'unreachable' (no path; resident is stuck). */
export type MoveResult = 'walking' | 'arrived' | 'unreachable';

/** Starts (or retargets) a walk to `targetTile`. The resident leaves any building it is inside. */
export function requestMove(
  state: WorldState,
  residentId: EntityId,
  targetTile: number,
  _reason: MoveReason,
): MoveResult {
  const r = findById(state.residents, residentId);
  if (!r) return 'unreachable';
  r.inside = 0;
  r.move = null;
  r.tile = targetTile;
  return 'arrived';
}

/** True when the resident stands on `tile` and is not walking. */
export function isAt(state: WorldState, residentId: EntityId, tile: number): boolean {
  const r = findById(state.residents, residentId);
  return !!r && r.move === null && r.tile === tile;
}

/** True when the resident is walking. */
export function isWalking(state: WorldState, residentId: EntityId): boolean {
  return !!findById(state.residents, residentId)?.move;
}

/** Stops a walk where the resident stands. */
export function stopMove(state: WorldState, residentId: EntityId): void {
  const r = findById(state.residents, residentId);
  if (r) r.move = null;
}

/** The tile in front of a building's entrance: where walkers arrive and leave. */
export function doorTile(
  b: Building,
  def: BuildingDef | undefined = content.buildingById.get(b.def),
): number {
  if (!def) return b.z * MAP_SIZE + b.x;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return front[1] * MAP_SIZE + front[0];
}

/** doorTile by id, or -1 when the building is gone. */
export function doorTileOf(state: WorldState, buildingId: EntityId): number {
  const b = findById(state.buildings, buildingId);
  return b ? doorTile(b) : -1;
}

/** Puts a resident inside a building (they vanish from agent frames). Call after isAt(door). */
export function enterBuilding(state: WorldState, residentId: EntityId, buildingId: EntityId): void {
  const r = findById(state.residents, residentId);
  if (r) {
    r.move = null;
    r.inside = buildingId;
  }
}
