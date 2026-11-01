import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { tilesRect } from '../map/layers';
import { canPlaceBuilding } from '../rules/building';
import { footprintTiles } from '../rules/footprint';
import { findById, removeById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { insertBuilding } from '../state/place';
import { townReachesDoor } from '../state/reach';
import { worldIndex } from '../state/worldIndex';
import { chargePlacement, matureTreesUnder, placementBlocked, refundRemoval } from '../systems/economy/api';
import { meetsRequires } from '../systems/innovations/api';
import { checkIds, type HandlerFor, tilesChangedFor, worldChanged } from './util';

export const place: HandlerFor<'build.place'> = {
  type: 'build.place',
  validate(state, _seat, cmd) {
    const def = typeof cmd.def === 'string' ? content.buildingById.get(cmd.def) : undefined;
    if (!def) return 'INVALID';
    if (def.modes && !def.modes.includes(state.settings.mode)) return 'NOT_ALLOWED';
    // I2 (C4C): a rank or an innovation first; grown-only defs (shops, workshops) are not placed.
    if (!meetsRequires(state, def.requires, def.id)) return 'LOCKED';
    if (def.grows && !def.grows.handPlaced && isStandard(state)) return 'NOT_ALLOWED';
    const result = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    if (!result.ok) return result.reason ?? 'INVALID';
    // Playtest round three: a site nobody can walk to would wait forever.
    if (isStandard(state) && !townReachesDoor(state, { def: def.id, x: cmd.x, z: cmd.z, rot: cmd.rot }))
      return 'CUT_OFF';
    return placementBlocked(state, def);
  },
  apply(state, seat, cmd, ctx) {
    const def = content.buildingById.get(cmd.def)!;
    const placement = canPlaceBuilding(worldIndex(state).reader, def, cmd.x, cmd.z, cmd.rot);
    // Sandbox: built instantly. Standard: a construction site that builders finish (C3C).
    const trees = matureTreesUnder(state, def, cmd.x, cmd.z, cmd.rot);
    const b = insertBuilding(state, ctx, def, cmd.x, cmd.z, cmd.rot, seat, {
      foundation: placement.foundation,
    });
    chargePlacement(state, ctx, b, def, trees);
  },
};

export const remove: HandlerFor<'build.remove'> = {
  type: 'build.remove',
  validate(state, _seat, cmd) {
    const bad = checkIds(cmd.ids);
    if (bad) return bad;
    return cmd.ids.every((id) => findById(state.buildings, id)) ? null : 'NOT_FOUND';
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
      tilesChangedFor(ctx, tiles, ['occupant']);
      const rect = tilesRect(tiles);
      worldChanged(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
    }
  },
};
