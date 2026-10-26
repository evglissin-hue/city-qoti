// Movement API (C3.0 contract; C3A owns the implementation). C3C drives porters and builders
// through it. Tiles are indexes z * MAP_SIZE + x.
//
// requestMove plans an A* path (cached by network epoch) and the movement system walks it at the
// spec's per-tile speeds. A walk that hits a newly blocked tile replans; when no path exists the
// walk ends where the resident stands and the result says 'unreachable'.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE, ResidentFlags } from '../../constants';
import type { Building, EntityId, MoveReason, Resident, WorldState } from '../../contracts';
import { entranceTiles } from '../../rules/footprint';
import { findById } from '../../state/entities';
import { pathBetween } from './paths';

/** 'walking' (a path was found), 'arrived' (already there), 'unreachable' (no path; resident is stuck). */
export type MoveResult = 'walking' | 'arrived' | 'unreachable';

/** Starts (or retargets) a walk to `targetTile`. The resident leaves any building it is inside. */
export function requestMove(
  state: WorldState,
  residentId: EntityId,
  targetTile: number,
  reason: MoveReason,
): MoveResult {
  const r = findById(state.residents, residentId);
  if (!r) return 'unreachable';
  return moveResident(state, r, targetTile, reason);
}

/** requestMove for a resident already in hand (the residents system's hot path). */
export function moveResident(state: WorldState, r: Resident, target: number, reason: MoveReason): MoveResult {
  setInside(state, r, 0);
  const m = r.move;
  if (m && m.target === target) {
    m.reason = reason;
    return 'walking';
  }
  // Mid-step: keep going to the next tile and plan onward from there, so nobody snaps back.
  if (m && m.progress > 0 && m.step < m.path.length) {
    const next = m.path[m.step]!;
    const onward = next === target ? [] : pathBetween(state, next, target);
    if (onward) {
      r.move = {
        path: [next, ...onward],
        step: 0,
        progress: m.progress,
        target,
        reason,
        version: state.networkVersion,
      };
      r.flags &= ~ResidentFlags.stuck;
      return 'walking';
    }
  }
  r.move = null;
  if (r.tile === target) return 'arrived';
  const path = pathBetween(state, r.tile, target);
  if (!path) return 'unreachable';
  r.move = { path, step: 0, progress: 0, target, reason, version: state.networkVersion };
  r.flags &= ~ResidentFlags.stuck;
  return 'walking';
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
  if (!r) return;
  r.move = null;
  const b = findById(state.buildings, buildingId);
  if (!b) return;
  r.tile = doorTile(b);
  setInside(state, r, buildingId);
}

/**
 * Moves a resident in or out of a building, keeping the workplace's `present` count equal to the
 * workers inside it. Every change of `inside` goes through here.
 */
export function setInside(state: WorldState, r: Resident, buildingId: EntityId): void {
  const old = r.inside;
  if (old === buildingId) return;
  r.inside = buildingId;
  if (r.jobId && old === r.jobId) {
    const rt = findById(state.buildings, old)?.rt;
    if (rt && rt.present > 0) rt.present -= 1;
  }
  if (r.jobId && buildingId === r.jobId) {
    const rt = findById(state.buildings, buildingId)?.rt;
    if (rt) rt.present += 1;
  }
}
