import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { tilesRect } from '../map/layers';
import { canPlaceBuilding } from '../rules/building';
import { footprintTiles } from '../rules/footprint';
import { wouldEnclose } from '../rules/wall';
import { findById, removeById } from '../state/entities';
import { isStandard, mayRaiseTownHall, TOWN_HALL } from '../state/hamlet';
import { insertBuilding } from '../state/place';
import { townReachesDoor } from '../state/reach';
import type { WorldState } from '../contracts';
import { worldIndex } from '../state/worldIndex';
import { chargePlacement, matureTreesUnder, placementBlocked, refundRemoval } from '../systems/economy/api';
import { meetsRequires } from '../systems/innovations/api';
import { announceServers } from '../systems/specialized/announce';
import { checkIds, type HandlerFor, tilesChangedFor, worldChanged } from './util';

export const place: HandlerFor<'build.place'> = {
  type: 'build.place',
  validate(state, _seat, cmd) {
    const def = typeof cmd.def === 'string' ? content.buildingById.get(cmd.def) : undefined;
    if (!def) return 'INVALID';
    // P1: a valley that lost its town hall (before P1 kept it) may raise one again.
    const raise = mayRaiseTownHall(state, def.id);
    if (def.modes && !def.modes.includes(state.settings.mode) && !raise) return 'NOT_ALLOWED';
    // I2 (C4C): a rank or an innovation first; grown-only defs (shops, workshops) are not placed.
    if (!meetsRequires(state, def.requires, def.id)) return 'LOCKED';
    if (def.grows && !def.grows.handPlaced && isStandard(state)) return 'NOT_ALLOWED';
    const result = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    if (!result.ok) return result.reason ?? 'INVALID';
    // Playtest round three: a site nobody can walk to would wait forever.
    if (isStandard(state) && !townReachesDoor(state, { def: def.id, x: cmd.x, z: cmd.z, rot: cmd.rot }))
      return 'CUT_OFF';
    // I3 (C5D): a wall piece placed by hand may not enclose anything either.
    if (
      def.defense?.blocks &&
      wouldEnclose(worldIndex(state).reader, [[cmd.x, cmd.z, def.id]], state.buildings, state.meta.valleyGate)
        .length > 0
    )
      return 'WOULD_ENCLOSE';
    // The replacement town hall is free, so lean times do not stand in its way.
    return raise ? null : placementBlocked(state, def);
  },
  apply(state, seat, cmd, ctx) {
    const def = content.buildingById.get(cmd.def)!;
    const placement = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    // P1: the town hall's own builders are the ones who would build it, so the townsfolk raise a
    // replacement at once, as the starting town's was.
    const raise = mayRaiseTownHall(state, def.id);
    // Sandbox: built instantly. Standard: a construction site that builders finish (C3C).
    const trees = matureTreesUnder(state, def, cmd.x, cmd.z, cmd.rot);
    const b = insertBuilding(state, ctx, def, cmd.x, cmd.z, cmd.rot, seat, {
      foundation: placement.foundation,
      ...(raise ? { site: false } : {}),
    });
    chargePlacement(state, ctx, b, def, trees);
    if (raise)
      ctx.events.push({
        e: 'notify',
        kind: 'built',
        text: 'The townsfolk raised a new town hall themselves. Nobody agrees on who did the most.',
        at: [cmd.x, cmd.z],
      });
  },
};

/**
 * P1 (playtest): a standard valley's town hall stays. Its builders raise everything else, so a
 * valley without it could never build again.
 */
function keepsTownHall(state: WorldState, ids: readonly number[]): boolean {
  if (!isStandard(state)) return false;
  return ids.some((id) => findById(state.buildings, id)?.def === TOWN_HALL);
}

export const remove: HandlerFor<'build.remove'> = {
  type: 'build.remove',
  validate(state, _seat, cmd) {
    const bad = checkIds(cmd.ids);
    if (bad) return bad;
    if (!cmd.ids.every((id) => findById(state.buildings, id))) return 'NOT_FOUND';
    return keepsTownHall(state, cmd.ids) ? 'HALL_STAYS' : null;
  },
  apply(state, _seat, cmd, ctx) {
    for (const id of cmd.ids) {
      const existing = findById(state.buildings, id);
      if (!existing) continue;
      const def = content.buildingById.get(existing.def);
      if (def) refundRemoval(state, ctx, existing, def);
      // Residents and households notice the missing building on their next tick (C3A).
      const b = removeById(state.buildings, id)!;
      // I2 (C4.0): a grown building's lot is free again.
      if (b.lot) {
        const lot = findById(state.lots, b.lot);
        if (lot && lot.buildingId === id) lot.buildingId = 0;
      }
      const tiles = def ? footprintTiles(def, b.x, b.z, b.rot) : [];
      for (const [x, z] of tiles) {
        if (state.map.occupant[z * MAP_SIZE + x] === id) state.map.occupant[z * MAP_SIZE + x] = 0;
      }
      ctx.events.push({ e: 'building.removed', id });
      // The windmills and the like that served it now serve one fewer.
      announceServers(state, ctx, b, [b.trade]);
      tilesChangedFor(ctx, tiles, ['occupant']);
      const rect = tilesRect(tiles);
      worldChanged(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
    }
  },
};
