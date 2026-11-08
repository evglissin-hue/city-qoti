// Playtest item 9: the Trade book's honest numbers. Displayed prices carry renown, postId means a
// built post, and the prices stay live below Village rank.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { TradeView } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { postBuyPrice, postSellPrice } from '../../src/systems/trade/caravans';
import { tradeView } from '../../src/view/village';
import { villageFixture } from '../fixtures/village';
import { runDays } from '../market/helpers';

const good = (id: string) => content.goodIndex.get(id)!;
const price = (t: TradeView, n: string, g: string) =>
  t.neighbors.find((x) => x.id === n)!.prices.find((p) => p.good === g)!;

describe('the Trade book tells the truth', () => {
  it('shows the prices the post will actually pay, renown included', () => {
    const { state } = villageFixture();
    const top = content.renown.length - 1;
    state.renown.level = top;
    expect(content.renown[top]!.effects.some(([n, v]) => n === 'trade' && v > 0)).toBe(true);
    const t = tradeView(state);
    expect(price(t, 'millhaven', 'wheat').buy).toBe(postBuyPrice(state, 'millhaven', good('wheat')));
    expect(price(t, 'millhaven', 'planks').sell).toBe(postSellPrice(state, 'millhaven', good('planks')));
    state.renown.level = 0;
    expect(price(tradeView(state), 'millhaven', 'planks').sell).toBeLessThan(
      price(t, 'millhaven', 'planks').sell!,
    );
  });

  it('does not count a construction site as a Trading Post', () => {
    const { state } = villageFixture();
    const def = content.buildingById.get('trading-post');
    if (!def) return;
    expect(tradeView(state).postId).toBe(0);
    const site = insertBuilding(state, null, def, 88, 46, 0, 0, { site: true });
    expect(site.stage).toBe('construction');
    expect(tradeView(state).postId).toBe(0);
    insertBuilding(state, null, def, 88, 60, 0, 0, { site: false });
    expect(tradeView(state).postId).not.toBe(0);
  });

  it('sends trade.updated every day below Village rank, so prices are live', () => {
    const { state } = villageFixture();
    state.charter.rank = 'hamlet';
    const ctx = runDays(state, 2);
    expect(ctx.events.filter((e) => e.e === 'trade.updated').length).toBeGreaterThanOrEqual(2);
  });
});
