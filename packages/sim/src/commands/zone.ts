// Zoning (C4.0 baseline; C4B owns it): paint and clear the `zone` layer. R1: Homes, Workshops and
// Farmland are open from founding; a zone with `requires.rank` (Shops, Townhouses) waits for it. Roads, water and buildings are never zoned; lots follow in the zoning system's
// next hourly pass (systems/zoning).
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES } from '../constants';
import { Water } from '../map/layers';
import { findById, removeById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { refreshDemand } from '../systems/growth';
import { zonesChanged } from '../systems/zoning';
import { checkTiles, type HandlerFor, tilesChangedFor } from './util';

export const paint: HandlerFor<'zone.paint'> = {
  type: 'zone.paint',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const zone = typeof cmd.zone === 'string' ? content.zoneById.get(cmd.zone) : undefined;
    if (!zone) return 'INVALID';
    const bad = checkTiles(cmd.tiles, MAX_ZONE_TILES);
    if (bad) return bad;
    const rank = zone.requires?.rank;
    return !rank || rankAtLeast(state, rank) ? null : 'LOCKED';
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
    zonesChanged(state);
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
    zonesChanged(state);
    tilesChangedFor(ctx, gone, ['lot']);
    // R1B: free lots went, so a quiet bar may need land again.
    if (gone.length > 0) refreshDemand(state, ctx);
  },
};
