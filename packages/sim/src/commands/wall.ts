// Walls and gates (C5.0 baseline; C5D). docs/spec/14-challenge.md, Defenses. A wall run is painted
// like a road, one piece a tile (palisade or stone wall), each a construction site the builders
// finish; where the run crosses a road the piece is a gate. A gate lets residents and carts through
// while open and closes when the bell rings. A run may never cut a home, workplace or storehouse off
// from the valley gate (WOULD_ENCLOSE; rules/wall.ts). Stone walls come at Town rank, or earlier
// once Barnaby Ashcombe's arc unlocks them.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES, PENNIES_PER_COIN } from '../constants';
import type { WorldState } from '../contracts';
import { isInt } from '../rules/geometry';
import { canPaintWall, isWallDef } from '../rules/wall';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { insertBuilding } from '../state/place';
import { rankAtLeast } from '../state/village';
import { worldIndex } from '../state/worldIndex';
import { chargePlacement, spendBlocked } from '../systems/economy/api';
import { buildingView } from '../view';
import { remove as removeBuildings } from './build';
import { checkTiles, type HandlerFor } from './util';

const S = MAP_SIZE;

/** True when a defense piece may be painted here: its rank, or a story's unlock (stone walls). */
export function wallUnlocked(state: WorldState, def: string): boolean {
  const d = content.buildingById.get(def);
  if (!d) return false;
  if (!isStandard(state)) return true;
  if (state.hearth.unlocked.includes(def) && rankAtLeast(state, 'village')) return true;
  return rankAtLeast(state, d.requires?.rank ?? 'village');
}

function planFor(state: WorldState, def: string, tiles: [number, number][]) {
  return canPaintWall(worldIndex(state).reader, def, tiles, state.buildings, state.meta.valleyGate);
}

export const paint: HandlerFor<'wall.paint'> = {
  type: 'wall.paint',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const def = typeof cmd.def === 'string' ? content.buildingById.get(cmd.def) : undefined;
    if (!def?.defense || !(def.defense.blocks || def.defense.passable === 'gate')) return 'INVALID';
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    if (def.modes && !def.modes.includes(state.settings.mode)) return 'LOCKED';
    if (!wallUnlocked(state, def.id)) return 'LOCKED';
    const plan = planFor(state, def.id, cmd.tiles);
    if (!plan.ok) return plan.reason ?? 'INVALID';
    let coins = 0;
    for (const [, , d] of plan.pieces) coins += content.buildingById.get(d)?.cost?.coins ?? 0;
    return spendBlocked(state, coins * PENNIES_PER_COIN);
  },
  apply(state, seat, cmd, ctx) {
    const plan = planFor(state, cmd.def, cmd.tiles);
    for (const [x, z, d] of plan.pieces) {
      const def = content.buildingById.get(d)!;
      const b = insertBuilding(state, ctx, def, x, z, 0, seat);
      if (b.rt && def.defense?.hp) b.rt.hp = def.defense.hp;
      if (b.rt && def.defense?.passable === 'gate') b.rt.open = true;
      chargePlacement(state, ctx, b, def);
    }
  },
};

export const remove: HandlerFor<'wall.remove'> = {
  type: 'wall.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    for (const [x, z] of cmd.tiles) {
      const b = findById(state.buildings, state.map.occupant[z * S + x]!);
      if (b && isWallDef(b.def)) return null;
    }
    return 'NOT_FOUND';
  },
  apply(state, seat, cmd, ctx) {
    const ids: number[] = [];
    for (const [x, z] of cmd.tiles) {
      const b = findById(state.buildings, state.map.occupant[z * S + x]!);
      if (b && isWallDef(b.def) && !ids.includes(b.id)) ids.push(b.id);
    }
    if (ids.length > 0) removeBuildings.apply(state, seat, { t: 'build.remove', ids }, ctx);
  },
};

export const setGate: HandlerFor<'gate.set'> = {
  type: 'gate.set',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || typeof cmd.open !== 'boolean') return 'INVALID';
    const b = findById(state.buildings, cmd.id);
    if (!b) return 'NOT_FOUND';
    if (content.buildingById.get(b.def)?.defense?.passable !== 'gate' || !b.rt) return 'NOT_ALLOWED';
    return b.stage === 'built' ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    b.rt!.open = cmd.open;
    state.networkVersion += 1;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  },
};
