import { content } from '@qoti/content';
import { MAP_SIZE, MAX_ROAD_TILES } from '../constants';
import { canPaintRoad } from '../rules/road';
import { worldIndex } from '../state/worldIndex';
import { Flags, tilesRect } from '../map/layers';
import { cleanName } from '../state/evenings';
import { streetViews } from '../view/evenings';
import { chargeRoad, roadBlocked } from '../systems/economy/api';
import { afterRoadChange, chargeRoadGoods, roadPaintBlocked } from '../systems/traffic/streets';
import { markCharmDirty } from '../systems/hearth/charm/dirty';
import { noteEveningChange } from '../systems/traffic/evening';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';

export const paint: HandlerFor<'road.paint'> = {
  type: 'road.paint',
  validate(state, _seat, cmd) {
    const result = canPaintRoad(worldIndex(state).reader, cmd.kind, cmd.tiles);
    if (!result.ok) return result.reason ?? 'INVALID';
    return (
      roadBlocked(state, cmd.kind, newRoadTiles(state, cmd.tiles)) ??
      roadPaintBlocked(state, cmd.kind, cmd.tiles)
    );
  },
  apply(state, _seat, cmd, ctx) {
    chargeRoad(state, ctx, cmd.kind, newRoadTiles(state, cmd.tiles));
    chargeRoadGoods(state, ctx, cmd.kind, cmd.tiles);
    const value = content.roadById.get(cmd.kind)!.layerValue;
    const { road, tree } = state.map;
    for (const [x, z] of cmd.tiles) {
      road[z * MAP_SIZE + x] = value;
      // Sandbox clears trees under new roads.
      tree[z * MAP_SIZE + x] = 0;
    }
    tilesChangedFor(ctx, cmd.tiles, ['road', 'tree']);
    worldChanged(state, tilesRect(cmd.tiles));
    afterRoadChange(state, ctx, cmd.tiles);
  },
};

export const remove: HandlerFor<'road.remove'> = {
  type: 'road.remove',
  validate(state, _seat, cmd) {
    const bad = checkTiles(cmd.tiles);
    if (bad) return bad;
    return cmd.tiles.some(([x, z]) => state.map.road[z * MAP_SIZE + x]) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    const { road, flags } = state.map;
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      road[i] = 0;
      // A road painted here later starts plain.
      flags[i] = flags[i]! & ~Flags.evening;
    }
    tilesChangedFor(ctx, cmd.tiles, ['road', 'flags']);
    worldChanged(state, tilesRect(cmd.tiles));
    afterRoadChange(state, ctx, cmd.tiles);
  },
};

export const setEvening: HandlerFor<'road.setEvening'> = {
  type: 'road.setEvening',
  validate(state, _seat, cmd) {
    if (typeof cmd.on !== 'boolean') return 'INVALID';
    const bad = checkTiles(cmd.tiles, MAX_ROAD_TILES);
    if (bad) return bad;
    return cmd.tiles.some(([x, z]) => state.map.road[z * MAP_SIZE + x]) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const { road, flags } = state.map;
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      if (!road[i]) continue;
      flags[i] = cmd.on ? flags[i]! | Flags.evening : flags[i]! & ~Flags.evening;
    }
    // Evening streets change no walkability: no networkVersion bump. The cart routes' cache keys on
    // its own change count, and charm follows the calm (no cart noise falls on an evening street).
    noteEveningChange(state);
    markCharmDirty(state, tilesRect(cmd.tiles));
    tilesChangedFor(ctx, cmd.tiles, ['flags']);
  },
};

export const rename: HandlerFor<'road.rename'> = {
  type: 'road.rename',
  validate(state, _seat, cmd) {
    if (typeof cmd.name !== 'string') return 'INVALID';
    if (!state.streets.some((s) => s.id === cmd.id)) return 'NOT_FOUND';
    return cleanName(cmd.name) === null ? 'INVALID' : null;
  },
  apply(state, seat, cmd, ctx) {
    const street = state.streets.find((s) => s.id === cmd.id)!;
    const name = cleanName(cmd.name)!;
    if (name === '' || name === street.name) {
      delete street.custom;
      delete street.renamedBy;
    } else {
      street.custom = name;
      street.renamedBy = seat;
    }
    ctx.events.push({ e: 'streets.updated', s: streetViews(state) });
  },
};

/** Distinct tiles in the run that are not road yet (repainting an existing road is free). */
function newRoadTiles(state: { map: { road: Uint8Array } }, tiles: [number, number][]): number {
  const seen = new Set<number>();
  for (const [x, z] of tiles) {
    const i = z * MAP_SIZE + x;
    if (!state.map.road[i]) seen.add(i);
  }
  return seen.size;
}
