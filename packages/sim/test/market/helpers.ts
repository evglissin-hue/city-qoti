// Helpers for the C4A market and money tests. The Trading Post building is C4C's: with C4C's def in
// content `withTradingPost` builds one on the village fixture's lane A; until then it lends the
// 'trading-post' tag to the storehouse def for the length of the test, so the fixture's first
// storehouse doubles as the post and caravans have somewhere to work.
import { content, type BuildingDef } from '@qoti/content';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, TickCtx, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { dailyOffset } from '../../src/systems/economy/time';
import { tradingPost } from '../../src/systems/trade/post';
import { applyTurn, createTickCtx } from '../../src/turn';

/** Runs `fn` with a Trading Post in the valley; returns what `fn` returns. */
export function withTradingPost<T>(state: WorldState, fn: (post: Building) => T): T {
  const own = content.buildingById.get('trading-post');
  if (own) {
    const post = insertBuilding(state, null, own, 88, 46, 0, 0, { site: false });
    return fn(post);
  }
  const def = content.buildingById.get('storehouse') as BuildingDef & { tags: string[] };
  const tags = def.tags;
  def.tags = [...tags, 'trading-post'];
  try {
    return fn(tradingPost(state)!);
  } finally {
    def.tags = tags;
  }
}

/** Runs the world through the next tick at which the clock shows `hour`:00 plus `extra` ticks. */
export function untilDaily(state: WorldState, hour: number, extra = 0, ctx?: TickCtx): TickCtx {
  const c = ctx ?? createTickCtx(state);
  const at = dailyOffset(hour, extra);
  const n = (at - (state.tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
  const target = state.tick + n;
  while (state.tick <= target) applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, c);
  return c;
}

/** Runs `days` whole days. */
export function runDays(state: WorldState, days: number, ctx?: TickCtx): TickCtx {
  const c = ctx ?? createTickCtx(state);
  const target = state.tick + days * TICKS_PER_DAY;
  while (state.tick < target) applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, c);
  return c;
}

export const good = (id: string): number => content.goodIndex.get(id)!;
