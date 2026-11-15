// @vitest-environment happy-dom
import { signal } from '@preact/signals';
import { h } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingStatus, type BalanceLine, type BalancesView, type DemandView } from '@qoti/sim';
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

function fakeSession(marks: boolean, sites = false, rank = 'hamlet', jobs = false) {
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
    mirror: {
      demand: signal(demand),
      balances: signal(balances),
      revision: signal(0),
      stocks: signal({
        lines: [
          { good: 'timber', stock: 6 },
          { good: 'stone', stock: 40 },
        ],
      }),
      town: signal({ population: 15, households: 5, rank }),
      households: new Map(),
      residents: new Map([
        [1, { jobId: 7 }],
        [2, { jobId: 0 }],
      ]),
      buildings: new Map<number, unknown>([
        ...(sites
          ? [
              [
                1,
                {
                  id: 1,
                  stage: 'construction',
                  rt: { status: 0, construction: { needs: new Map([['timber', 42]]) } },
                },
              ] as [number, unknown],
            ]
          : []),
        ...(jobs
          ? [
              [
                2,
                {
                  id: 2,
                  stage: 'built',
                  rt: { status: BuildingStatus.noWorkers, jobs: 3, workers: 0 },
                },
              ] as [number, unknown],
            ]
          : []),
      ]),
    },
    ui: {
      panel: signal<string | null>(null),
      balancesFamily: signal<string | null>(null),
      wishFocus: signal<number | null>(null),
    },
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
    for (const f of FAMILIES.filter((x) => x !== 'materials')) expect(view.get(`balance-${f}`)).toBeTruthy();
    expect(view.get('balance-food').querySelectorAll('.flavor-pips i')).toHaveLength(2);
    expect(view.get('balance-food').querySelectorAll('.flavor-pips i.on')).toHaveLength(1);
  });

  it('leads each chip with its name and the units in store, days of cover second', async () => {
    const { session } = fakeSession(false);
    view = await mount(h(LedgerStrip, { session }));
    const labels = ['food', 'fuel', 'wares', 'treats'].map(
      (f) => view?.get(`balance-${f}`).querySelector('.chip-label')?.textContent,
    );
    expect(labels).toEqual(['Food', 'Fuel', 'Wares', 'Treats']);
    expect(view.get('balance-food').querySelector('.chip-amount')?.textContent).toBe('10');
    expect(view.get('balance-food').querySelector('.cover-days')?.textContent).toBe('4 days');
    expect(view.get('demand-workshops').querySelector('.demand-word')?.textContent).toBe('Workshops');
    expect(view.get('demand-homes').querySelector('.demand-word')?.textContent).toBe('Homes');
  });

  it('draws Timber and Stone as chips of their own, calm while no site waits', async () => {
    const { session } = fakeSession(false);
    view = await mount(h(LedgerStrip, { session }));
    expect(view.find('balance-materials')).toBeNull();
    const timber = view.get('material-timber');
    expect(timber.querySelector('.chip-label')?.textContent).toBe('Timber');
    expect(timber.querySelector('.chip-amount')?.textContent).toBe('6');
    expect(timber.className).not.toContain('low');
    expect(view.get('material-stone').querySelector('.chip-amount')?.textContent).toBe('40');
    expect(view.find('material-brick')).toBeNull();
  });

  it('reads "6 of 42" and warms Timber while an open site needs more than the stores hold', async () => {
    const { session } = fakeSession(false, true);
    view = await mount(h(LedgerStrip, { session }));
    const chip = view.get('material-timber');
    expect(chip.querySelector('.chip-amount')?.textContent).toBe('6 of 42');
    expect(chip.className).toContain('low');
    expect(chip.title).toContain('Timber: 6 in store. Open sites still need 42.');
    expect(view.get('material-stone').className).not.toContain('low');
  });

  it('brings Brick in from Village', async () => {
    const { session } = fakeSession(false, false, 'village');
    view = await mount(h(LedgerStrip, { session }));
    expect(view.get('material-brick')).toBeTruthy();
  });

  it('leads with a Folk chip: residents, open jobs warm while workplaces stand empty, opens Townsfolk', async () => {
    const { session } = fakeSession(false, false, 'hamlet', true);
    view = await mount(h(LedgerStrip, { session }));
    const chip = view.get('folk-chip');
    expect(chip.parentElement?.firstElementChild).toBe(chip);
    expect(view.get('folk-amount').textContent).toBe('15');
    expect(view.get('folk-jobs').textContent).toBe('3 jobs open');
    expect(view.get('folk-jobs').className).toContain('warm');
    expect(chip.title).toContain('15 folk in 5 households, 1 at work. 3 jobs stand open');
    await view.click('folk-chip');
    expect(session.ui.panel.value).toBe('people');
  });

  it('shows no jobs figure when none stands open', async () => {
    const { session } = fakeSession(false);
    view = await mount(h(LedgerStrip, { session }));
    expect(view.find('folk-jobs')).toBeNull();
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
