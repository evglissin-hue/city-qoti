// Walls and gates (C5.0 baseline; C5D owns defenses). docs/spec/14-challenge.md, Defenses. A wall
// run is painted like a road, one piece a tile (palisade or stone wall); a gate lets residents and
// carts through while open and closes when the bell rings. Until C5D unhides the defense defs
// (`modes`), painting refuses with LOCKED; C5D writes the placement, the costs and WOULD_ENCLOSE.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES } from '../constants';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { buildingView } from '../view';
import { checkTiles, type HandlerFor } from './util';

const S = MAP_SIZE;

export const paint: HandlerFor<'wall.paint'> = {
  type: 'wall.paint',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const def = typeof cmd.def === 'string' ? content.buildingById.get(cmd.def) : undefined;
    if (!def?.defense?.blocks) return 'INVALID';
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    if (def.modes && !def.modes.includes(state.settings.mode)) return 'LOCKED';
    return rankAtLeast(state, def.requires?.rank ?? 'village') ? null : 'LOCKED';
  },
  // C5D: a piece per free tile, as construction sites; nothing reaches here while LOCKED.
  apply() {},
};

export const remove: HandlerFor<'wall.remove'> = {
  type: 'wall.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    for (const [x, z] of cmd.tiles) {
      const b = findById(state.buildings, state.map.occupant[z * S + x]!);
      if (b && content.buildingById.get(b.def)?.tags?.includes('wall')) return null;
    }
    return 'NOT_FOUND';
  },
  // C5D: removes the wall pieces on the tiles (refunds as build.remove does).
  apply() {},
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
