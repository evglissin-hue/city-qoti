// Terraforming (C4.0 baseline; C4B owns it). Raise or lower land one level per command, never
// under buildings, roads or water, within the map's heights; standard valleys pay per tile. C4B
// adds the slope rules, stairs and what it does to fields and trees.
import { MAP_SIZE, MAX_HEIGHT, PENNIES_PER_COIN, TERRAFORM_COST, TERRAFORM_MAX_TILES } from '../constants';
import type { RejectReason, WorldState } from '../contracts';
import { Water } from '../map/layers';
import { isStandard } from '../state/hamlet';
import { book, spendBlocked } from '../systems/economy/api';
import { emitMoney } from '../systems/economy/emit';
import { checkTiles, type HandlerFor, tilesChangedFor, worldChanged } from './util';
import { tilesRect } from '../map/layers';

function terraformBlocked(state: WorldState, tiles: [number, number][], dir: 1 | -1): RejectReason | null {
  const bad = checkTiles(tiles, TERRAFORM_MAX_TILES);
  if (bad) return bad;
  const m = state.map;
  for (const [x, z] of tiles) {
    const i = z * MAP_SIZE + x;
    if (m.water[i] !== Water.none) return 'WATER';
    if (m.occupant[i] || m.road[i]) return 'OCCUPIED';
    const h = m.height[i]! + dir;
    if (h < 1 || h > MAX_HEIGHT - 1) return 'TOO_STEEP';
  }
  return spendBlocked(state, terraformCost(tiles.length));
}

/** Pennies to move `tiles` tiles one level. */
export function terraformCost(tiles: number): number {
  return TERRAFORM_COST * PENNIES_PER_COIN * tiles;
}

function terraform(dir: 1 | -1): HandlerFor<'terrain.raise' | 'terrain.lower'>['apply'] {
  return (state, _seat, cmd, ctx) => {
    const seen = new Set<number>();
    const tiles: [number, number][] = [];
    for (const [x, z] of cmd.tiles) {
      const i = z * MAP_SIZE + x;
      if (seen.has(i)) continue;
      seen.add(i);
      state.map.height[i]! += dir;
      tiles.push([x, z]);
    }
    if (isStandard(state)) {
      book(state, 'terraforming', terraformCost(tiles.length));
      emitMoney(state, ctx);
    }
    tilesChangedFor(ctx, tiles, ['height']);
    const rect = tilesRect(tiles);
    worldChanged(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
  };
}

export const raise: HandlerFor<'terrain.raise'> = {
  type: 'terrain.raise',
  validate: (state, _seat, cmd) => terraformBlocked(state, cmd.tiles, 1),
  apply: terraform(1),
};

export const lower: HandlerFor<'terrain.lower'> = {
  type: 'terrain.lower',
  validate: (state, _seat, cmd) => terraformBlocked(state, cmd.tiles, -1),
  apply: terraform(-1),
};
