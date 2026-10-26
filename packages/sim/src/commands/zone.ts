// Zoning (C4.0 baseline; C4B owns it): paint and clear the `zone` layer. Zoning arrives with the
// Village rank. Roads, water and buildings are never zoned; lots follow in the zoning system.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES } from '../constants';
import { Water } from '../map/layers';
import { findById, removeById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { checkTiles, type HandlerFor, tilesChangedFor } from './util';

export const paint: HandlerFor<'zone.paint'> = {
  type: 'zone.paint',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (typeof cmd.zone !== 'string' || !content.zoneById.has(cmd.zone)) return 'INVALID';
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    return rankAtLeast(state, 'village') ? null : 'LOCKED';
  },
  apply(state, _seat, cmd, ctx) {
    const value = content.zoneById.get(cmd.zone)!.layerValue;
    const m = state.map;
    const changed: [number, number][] = [];
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      if (m.road[i] || m.water[i] !== Water.none || m.occupant[i] || m.zone[i] === value) continue;
      m.zone[i] = value;
      changed.push([x, z]);
    }
    tilesChangedFor(ctx, changed, ['zone']);
  },
};

export const clear: HandlerFor<'zone.clear'> = {
  type: 'zone.clear',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return checkTiles(cmd.tiles, MAX_ZONE_TILES);
  },
  apply(state, _seat, cmd, ctx) {
    const m = state.map;
    const changed: [number, number][] = [];
    const lots = new Set<number>();
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      if (m.lot[i]) lots.add(m.lot[i]!);
      if (!m.zone[i]) continue;
      m.zone[i] = 0;
      changed.push([x, z]);
    }
    // Empty lots touching cleared tiles go; lots with a grown building stay until it is removed.
    const gone: [number, number][] = [];
    for (const id of [...lots].sort((a, b) => a - b)) {
      const lot = findById(state.lots, id);
      if (!lot || lot.buildingId) continue;
      for (let z = lot.z; z < lot.z + lot.d; z++) {
        for (let x = lot.x; x < lot.x + lot.w; x++) {
          const i = z * MAP_SIZE + x;
          if (m.lot[i] !== id) continue;
          m.lot[i] = 0;
          gone.push([x, z]);
        }
      }
      removeById(state.lots, id);
      ctx.events.push({ e: 'lot.removed', id });
    }
    tilesChangedFor(ctx, changed, ['zone']);
    tilesChangedFor(ctx, gone, ['lot']);
  },
};
