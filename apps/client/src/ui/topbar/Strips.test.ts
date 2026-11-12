// @vitest-environment happy-dom
import { signal } from '@preact/signals';
import { h } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BalanceLine, BalancesView, DemandView } from '@qoti/sim';
import type { Session } from '../../app/session';
import { mount, type Mounted } from '../test/dom';
import { LedgerStrip } from './Strips';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const FAMILIES = ['food', 'fuel', 'materials', 'wares', 'treats'] as const;

function line(family: (typeof FAMILIES)[number], over: Partial<BalanceLine> = {}): BalanceLine {
  return {
    family,
    stock: 10,
    use: 5,
    cover: 400,
    flavors: [
      { good: 'bread', onOffer: true, made: true, stock: 1 },
      { good: 'fish', onOffer: false, made: false, stock: 0 },
    ],
    price: 100,
    carriedIn: 0,
    carriedOut: 0,
    carriedInYesterday: 0,
    carriedOutYesterday: 0,
    rule: 'always',
    reserve: 3,
    sell: false,
    mark: null,
    history: [],
    ...over,
  };
}

function fakeSession(marks: boolean) {
  const demand: DemandView = {
    bars: [
      { kind: 'homes', value: 80, lit: true, reasons: [], why: ['Newcomers would come.'] },
      { kind: 'shops', value: 30, lit: false, reasons: [], why: [] },
      { kind: 'workshops', value: 0, lit: false, reasons: [], why: [] },
      { kind: 'farmland', value: 55, lit: true, reasons: [], why: [] },
    ],
  };
  const balances: BalancesView = {
    lines: FAMILIES.map((f) => line(f, marks ? { mark: 8 } : {})),
    budget: 40,
    spentToday: 0,
    tab: 0,
    tabCap: 240,
    passClosed: false,
    plan: { reserve: 8, food: null, fuel: null, deal: null, buildFirst: null },
    offers: [],
  };
  const select = vi.fn();
  const session = {
    mirror: { demand: signal(demand), balances: signal(balances) },
    ui: { panel: signal<string | null>(null), balancesFamily: signal<string | null>(null) },
    tools: { select },
  } as unknown as Session;
  return { session, select };
}

describe('Ledger strip', () => {
  it('lights the bars that want land, one chip and pip set per family', async () => {
    const { session } = fakeSession(false);
    view = await mount(h(LedgerStrip, { session }));
    expect(view.get('demand-homes').className).toContain('lit');
    expect(view.get('demand-shops').className).toContain('quiet');
    expect(view.get('demand-farmland').className).toContain('lit');
    for (const f of FAMILIES) expect(view.get(`balance-${f}`)).toBeTruthy();
    expect(view.get('balance-food').querySelectorAll('.flavor-pips i')).toHaveLength(2);
    expect(view.get('balance-food').querySelectorAll('.flavor-pips i.on')).toHaveLength(1);
  });

  it('shows the winter bar only while a mark is set', async () => {
    const plain = fakeSession(false);
    view = await mount(h(LedgerStrip, { session: plain.session }));
    expect(view.find('winter-reserve')).toBeNull();
    view.unmount();
    const marked = fakeSession(true);
    view = await mount(h(LedgerStrip, { session: marked.session }));
    expect(view.get('winter-reserve').title).toContain('Put by for winter: Food 4 of 8 days');
  });

  it('a bar opens the zone brush; a chip opens that family in the Balances book', async () => {
    const { session, select } = fakeSession(false);
    view = await mount(h(LedgerStrip, { session }));
    await view.click('demand-workshops');
    expect(select).toHaveBeenCalledWith('zone', 'crafts');
    await view.click('balance-fuel');
    expect(session.ui.panel.value).toBe('balances');
    expect(session.ui.balancesFamily.value).toBe('fuel');
  });
});
