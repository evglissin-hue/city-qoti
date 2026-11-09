// @vitest-environment happy-dom
// Playtest item 9: the Deals tab and the River Dock's deals.
import { content } from '@qoti/content';
import type { Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockVillageSession } from '../mocks/session';
import { mount, settle, type Mounted } from '../test/dom';
import { TradePanel } from './Trade';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

type Set = Extract<Command, { t: 'trade.setStandingOrder' }>;
const sets = (c: Command[]) => c.filter((x): x is Set => x.t === 'trade.setStandingOrder');

describe('the Deals tab', () => {
  it('opens first and says who is good for what, with the post doing the haggling', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(TradePanel, { session }));
    expect(session.ui.tradeTab.value).toBe('deals');
    const text = view.get('deals').textContent ?? '';
    expect(text).toContain('the post does the haggling');
    expect(text.replace(/\s+/g, ' ')).toContain(
      'Until there is a Trading Post, the peddler fills a little of this at a worse price; build the post for caravans.',
    );
    for (const n of content.neighbors) {
      const card = view.get(`deals-${n.id}`).textContent ?? '';
      expect(card).toContain(`${n.days} days away`);
      expect(card).toContain(n.character!);
      expect(card).toContain('They want');
      expect(card).toContain('They sell');
    }
  });

  it('lists the goods best premium first, one toggle each', async () => {
    const { session } = mockVillageSession();
    view = await mount(h(TradePanel, { session }));
    const card = view.get('deals-millhaven');
    const rows = [...card.querySelectorAll('li.deal-row')].map((r) => r.getAttribute('data-testid'));
    const m = content.neighborById.get('millhaven')!;
    const wants = [...m.buys].sort((a, b) => b[1] - a[1]).map(([g]) => `deal-millhaven-${g}`);
    expect(rows[0]).toBe(wants[0]);
    expect(rows).toHaveLength(m.buys.length + m.sells.length);
    expect(card.querySelector('li.deal-row button')!.textContent).toBe('Sell our spare');
    expect(view.get('deal-toggle-millhaven-wheat').textContent).toBe('Keep us stocked');
  });

  it('switches a deal on and off with one click, with no prices asked for', async () => {
    const { session, submitted } = mockVillageSession();
    session.mirror.trade.value = { ...session.mirror.trade.value!, orders: [] };
    view = await mount(h(TradePanel, { session }));
    await view.click('deal-toggle-millhaven-wheat');
    const on = sets(submitted).pop()!;
    expect(on).toMatchObject({ good: 'wheat', order: { neighbor: 'millhaven' } });
    expect(on.order!.min).toBeGreaterThan(0);
    expect(on.order!.ceiling).toBeGreaterThan(0);
    session.mirror.trade.value = {
      ...session.mirror.trade.value!,
      orders: [{ good: 'wheat', ...on.order! }],
    };
    await settle();
    expect(view.get('deal-toggle-millhaven-wheat').getAttribute('aria-pressed')).toBe('true');
    expect(view.get('deal-toggle-millhaven-wheat').textContent).toContain('On: ');
    await view.click('deal-toggle-millhaven-wheat');
    expect(sets(submitted).pop()).toMatchObject({ good: 'wheat', order: null });
  });

  it('offers the same deals on the River Dock tab, waiting for a dock to stand', async () => {
    const { session, submitted } = mockVillageSession();
    session.ui.tradeTab.value = 'dock';
    view = await mount(h(TradePanel, { session }));
    const toggle = view.get('deal-toggle-millhaven-planks');
    // The village mocks have no River Dock: the toggle waits, with a reason.
    expect(toggle.hasAttribute('disabled')).toBe(true);
    expect(sets(submitted).filter((s) => s.via === 'dock')).toHaveLength(0);
  });
});
