// @vitest-environment happy-dom
// R1C: the Balances book against the village mocks (the sim's village fixture through the sim's own
// view builders): the five family rows, the open family with the carrier's terms, the purse, the
// deals, and the Neighbors tab that took over from the Trade book.
import { content } from '@qoti/content';
import { type BalancesView, type Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockVillageSession } from '../mocks/session';
import { mount, settle, type Mounted } from '../test/dom';
import { BalancesPanel, daysText, makersText, underReserve } from './Balances';
import { panels } from './index';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const last = <T extends Command['t']>(submitted: Command[], t: T) =>
  submitted.filter((c): c is Extract<Command, { t: T }> => c.t === t).pop();

function withBalances(patch: Partial<BalancesView> = {}) {
  const out = mockVillageSession();
  const b = out.session.mirror.balances.value;
  expect(b, 'the village fixture carries balances').not.toBeNull();
  out.session.mirror.balances.value = { ...b!, ...patch };
  return out;
}

describe('the Balances book', () => {
  it('is registered as the ledger book on key m, and the old Market, Trade and Dock books are gone', () => {
    const def = panels.find((p) => p.id === 'balances')!;
    expect(def).toMatchObject({ lens: 'ledger', key: 'm', label: 'Balances', order: 10 });
    for (const gone of ['market', 'trade', 'dock']) expect(panels.find((p) => p.id === gone)).toBeUndefined();
  });

  it('shows one row per family with the carrier line above', async () => {
    const { session } = withBalances();
    view = await mount(h(BalancesPanel, { session }));
    for (const f of ['food', 'fuel', 'materials', 'wares', 'treats']) {
      expect(view.find(`balance-row-${f}`), f).not.toBeNull();
    }
    expect(view.get('carrier-head').textContent).toMatch(
      /The carrier (comes|came) at ten\. \d+ of \d+ coins/,
    );
  });

  it('says so when snow has closed the pass', async () => {
    const { session } = withBalances({ passClosed: true });
    view = await mount(h(BalancesPanel, { session }));
    expect(view.get('carrier-head').textContent).toContain('Snow has closed the pass: no carrier today.');
  });

  it('opens one family at a time, and sends the rule, the reserve and the selling switch', async () => {
    const { session, submitted } = withBalances();
    view = await mount(h(BalancesPanel, { session }));
    expect(view.find('balance-detail-food')).toBeNull();
    await view.click(view.get('balance-row-food').querySelector('button')!);
    expect(session.ui.balancesFamily.value).toBe('food');
    expect(view.find('balance-detail-food')).not.toBeNull();
    await view.click(view.get('balance-row-fuel').querySelector('button')!);
    expect(view.find('balance-detail-food')).toBeNull();
    expect(view.find('balance-detail-fuel')).not.toBeNull();

    const fuel = session.mirror.balances.value!.lines.find((l) => l.family === 'fuel')!;
    await view.click('rule-fuel-never');
    expect(last(submitted, 'carrier.setRule')).toEqual({
      t: 'carrier.setRule',
      family: 'fuel',
      rule: 'never',
      sell: fuel.sell,
    });
    await view.click('sell-fuel');
    expect(last(submitted, 'carrier.setRule')).toEqual({
      t: 'carrier.setRule',
      family: 'fuel',
      rule: fuel.rule,
      sell: !fuel.sell,
    });
    await view.click('reserve-fuel-more');
    expect(last(submitted, 'carrier.setReserve')).toEqual({
      t: 'carrier.setReserve',
      family: 'fuel',
      reserve: fuel.reserve + 1,
    });
  });

  it('opens the family a chip asked for, and lists its flavors', async () => {
    const { session } = withBalances();
    session.ui.balancesFamily.value = 'treats';
    view = await mount(h(BalancesPanel, { session }));
    expect(view.find('balance-detail-treats')).not.toBeNull();
    const treats = session.mirror.balances.value!.lines.find((l) => l.family === 'treats')!;
    for (const fl of treats.flavors) expect(view.find(`flavor-${fl.good}`), fl.good).not.toBeNull();
  });

  it('sets the carrier purse in coins', async () => {
    const { session, submitted } = withBalances();
    view = await mount(h(BalancesPanel, { session }));
    const coins = Math.round(session.mirror.balances.value!.budget / 100);
    await view.click('budget-more');
    expect(last(submitted, 'carrier.setBudget')).toEqual({ t: 'carrier.setBudget', coins: coins + 5 });
  });

  it('shows the County tab only while something is owed', async () => {
    let out = withBalances({ tab: 0 });
    view = await mount(h(BalancesPanel, { session: out.session }));
    expect(view.find('county-tab')).toBeNull();
    view.unmount();
    out = withBalances({ tab: 1200, tabCap: 24000 });
    view = await mount(h(BalancesPanel, { session: out.session }));
    expect(view.get('county-tab').textContent).toContain('12 coins owed on the County tab, of 240');
  });

  it('turns a deal on through season.setPlan, and off again', async () => {
    const offers = [
      {
        id: 'millhaven:wares:sell',
        neighbor: 'millhaven',
        family: 'wares' as const,
        side: 'sell' as const,
        percent: 95,
      },
      {
        id: 'millhaven:food:buy',
        neighbor: 'millhaven',
        family: 'food' as const,
        side: 'buy' as const,
        percent: 90,
      },
    ];
    const { session, submitted } = withBalances({ offers });
    view = await mount(h(BalancesPanel, { session }));
    expect(view.get('deal-millhaven:wares:sell').textContent).toContain('Millhaven buys our Wares at 95%');
    await view.click('deal-millhaven:wares:sell');
    expect(last(submitted, 'season.setPlan')).toEqual({
      t: 'season.setPlan',
      plan: { deal: 'millhaven:wares:sell' },
    });
    const now = session.mirror.balances.value!;
    session.mirror.balances.value = { ...now, plan: { ...now.plan, deal: 'millhaven:wares:sell' } };
    await settle();
    await view.click('deal-millhaven:wares:sell');
    expect(last(submitted, 'season.setPlan')).toEqual({ t: 'season.setPlan', plan: { deal: null } });
  });

  it('says when there are no offers', async () => {
    const { session } = withBalances({ offers: [] });
    view = await mount(h(BalancesPanel, { session }));
    expect(view.get('deals').textContent).toContain('No offers this season.');
  });

  it('counts who makes a flavor from the built businesses', () => {
    const { session } = withBalances();
    expect(makersText(session, 'bread')).toMatch(/baker/);
    expect(makersText(session, 'candles')).toBe('');
  });

  it('reads cover and the reserve plainly', () => {
    const line = (cover: number, use: number, reserve: number, family: 'food' | 'materials' = 'food') =>
      ({ cover, use, stock: 5, reserve, mark: null, family }) as never;
    expect(daysText(line(412, 10, 3))).toBe('4');
    expect(daysText(line(0, 0, 3))).toBe('99+');
    expect(underReserve(line(200, 10, 3))).toBe(true);
    expect(underReserve(line(400, 10, 3))).toBe(false);
    expect(underReserve(line(0, 10, 20, 'materials'))).toBe(false);
  });

  it('keeps the Neighbors tab: each neighbor, the trade log and the note about the post', async () => {
    const { session } = withBalances();
    session.ui.balancesTab.value = 'neighbors';
    view = await mount(h(BalancesPanel, { session }));
    expect(view.get('no-post').textContent).toContain('No Trading Post yet');
    for (const n of content.neighbors) expect(view.get(`neighbor-${n.id}`).textContent).toContain(n.name);
    expect(view.get('neighbor-millhaven').textContent).toContain('They sell');
    const log = view.get('trade-log-table').textContent ?? '';
    expect(log).toContain('Sold 20 vegetables');
    expect(log).toContain('Bought 8 wool');
    expect(view.find('dock')).not.toBeNull();
  });
});
