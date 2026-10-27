// Threats, the Watch and raids API (C5.0 contract; C5D owns them). docs/spec/14-challenge.md.
import { content } from '@qoti/content';
import { MAP_SIZE, PENNIES_PER_COIN, TILE_FP } from '../../constants';
import type { WorldState } from '../../contracts';
import { townStock } from '../../view/hamlet';

/**
 * Wealth W = treasury + stored goods at base price + a tenth of the buildings' value
 * (14-challenge.md, Threat pressure), in pennies. C5D may refine "building value"; the baseline
 * counts each built building's coin cost.
 */
export function wealth(state: WorldState): number {
  let w = Math.max(0, state.economy.treasury);
  const stock = townStock(state);
  content.goods.forEach((g, i) => {
    w += (stock[i] ?? 0) * g.basePrice;
  });
  let value = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    value += (content.buildingById.get(b.def)?.cost?.coins ?? 0) * PENNIES_PER_COIN;
  }
  return w + Math.floor(value / 10);
}

/** C5D: deterrence at a tile, permille (walls, towers, lanterns, the Watch). Baseline: none. */
export function deterrenceAt(_state: WorldState, _tile: number): number {
  return 0;
}

export function isRaidActive(state: WorldState): boolean {
  return state.raid !== null;
}

/** Members x training x morale, as in the Watch panel. */
export function watchStrength(state: WorldState): number {
  const w = state.watch;
  return Math.round((w.members.length * w.training * w.morale) / 10000);
}

/** A lantern stands on or next to the tile (night threats avoid it; raiders lose heart in it). */
export function lanternLit(state: WorldState, tile: number): boolean {
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  for (const d of state.decor) {
    const dx = Math.floor(d.fx / TILE_FP);
    const dz = Math.floor(d.fz / TILE_FP);
    if (Math.abs(dx - x) > 1 || Math.abs(dz - z) > 1) continue;
    if (content.decorById.get(d.def)?.tags.includes('lantern')) return true;
  }
  return false;
}
