// @vitest-environment happy-dom
// R1C: the Businesses book and the inspector's business lines.
import { content } from '@qoti/content';
import type { BusinessView, Command } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockVillageSession } from '../mocks/session';
import { mount, settle, type Mounted } from '../test/dom';
import { BuildingInspector } from './BuildingInspector';
import { BusinessesPanel, pinTitle, profitLine } from './Businesses';
import { panels } from './index';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const last = <T extends Command['t']>(submitted: Command[], t: T) =>
  submitted.filter((c): c is Extract<Command, { t: T }> => c.t === t).pop();

function withBusinesses() {
  const out = mockVillageSession();
  const m = out.session.mirror;
  const ids = [...m.buildings.keys()];
  const keeper = [...m.residents.values()][0]!;
  const baker: BusinessView = {
    id: ids[0]!,
    def: 'workshop',
    trade: 'baker',
    level: 2,
    keeperId: keeper.id,
    pinned: false,
    hands: 1,
    crew: 2,
    status: 'Baking',
    levelDays: 1,
    ...{},
  };
  const farm: BusinessView = { ...baker, id: ids[1]!, def: 'farmstead', trade: 'grain-farm', keeperId: 0 };
  const well: BusinessView = {
    ...baker,
    id: ids[2]!,
    def: 'storehouse',
    trade: null,
    level: 1,
    keeperId: 0,
    hands: 0,
    crew: 0,
    status: 'Standing ready',
    served: { count: 2, capacity: 3 },
  };
  for (const b of [baker, farm, well]) m.businesses.set(b.id, b);
  m.villageRevision.value++;
  return { ...out, baker, farm, well, keeper };
}

describe('the Businesses book', () => {
  it('is the ledger book on key l', () => {
    expect(panels.find((p) => p.id === 'businesses')).toMatchObject({
      lens: 'ledger',
      key: 'l',
      label: 'Businesses',
      order: 30,
    });
  });

  it('says so when nothing has grown yet', async () => {
    const { session } = mockVillageSession();
    session.mirror.businesses.clear();
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.text()).toContain('Nothing has grown yet.');
  });

  it('groups rows, shows the keeper, level pips, hands, status and what a specialized building serves', async () => {
    const { session, baker, farm, well, keeper } = withBusinesses();
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.find('businesses-crafts')).not.toBeNull();
    expect(view.find('businesses-farms')).not.toBeNull();
    expect(view.find('businesses-specialized')).not.toBeNull();
    const row = view.get(`business-${baker.id}`);
    expect(row.textContent).toContain('Baker');
    expect(row.textContent).toContain(`Kept by the ${keeper.family} family`);
    expect(row.textContent).toContain('1 of 2 hands');
    expect(row.textContent).toContain('Baking');
    expect(row.querySelectorAll('.level-pips i.on')).toHaveLength(2);
    expect(view.get(`business-${farm.id}`).textContent).toContain('No keeper yet');
    expect(view.get(`business-${well.id}`).textContent).toContain('Serves 2 of 3');
    expect(view.find(`pin-${well.id}`)).toBeNull();
  });

  it('pins and unpins a trade, with the right words', async () => {
    const { session, submitted, baker } = withBusinesses();
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.get(`pin-${baker.id}`).title).toBe('Keep it a baker');
    await view.click(`pin-${baker.id}`);
    expect(last(submitted, 'build.pinRecipe')).toEqual({
      t: 'build.pinRecipe',
      id: baker.id,
      trade: 'baker',
    });
    session.mirror.businesses.set(baker.id, { ...baker, pinned: true });
    session.mirror.villageRevision.value++;
    await settle();
    await view.click(`pin-${baker.id}`);
    expect(last(submitted, 'build.pinRecipe')).toEqual({ t: 'build.pinRecipe', id: baker.id, trade: null });
    expect(pinTitle({ pinned: true, trade: 'baker' })).toBe('Let it change trade');
  });

  it('a row click selects the building and moves the camera to it', async () => {
    const { session, calls, baker } = withBusinesses();
    view = await mount(h(BusinessesPanel, { session }));
    await view.click(view.get(`business-${baker.id}`).querySelector('.business-main')!);
    expect(session.ui.selection.value).toEqual({ kind: 'building', id: baker.id });
    expect(calls.some((c) => c.method === 'focus')).toBe(true);
  });

  it('every trade resolves to a group and a name', () => {
    for (const t of content.trades) {
      expect(['crafts', 'farms', 'shops']).toContain(t.zone);
      expect(t.name.length).toBeGreaterThan(0);
    }
  });
});

describe('the building inspector, for a business', () => {
  it('shows trade, level, keeper, hands, status and the pin in place of the old trade list', async () => {
    const { session, submitted, baker } = withBusinesses();
    view = await mount(h(BuildingInspector, { session, id: baker.id }));
    const lines = view.get('business-lines');
    expect(lines.textContent).toContain('Baker');
    expect(lines.textContent).toContain('1 of 2 hands');
    expect(view.get('building-status').textContent).toBe('Baking');
    expect(view.find('pin-none')).toBeNull();
    await view.click(`pin-${baker.id}`);
    expect(last(submitted, 'build.pinRecipe')!.trade).toBe('baker');
  });
});

describe('one status for a business (R1X)', () => {
  it('a resting business reads the same words in its inspector and its Businesses row', async () => {
    const { session, baker } = withBusinesses();
    const words = 'Resting: no wool; the carrier brings some at ten';
    session.mirror.businesses.set(baker.id, { ...baker, status: words });
    session.mirror.villageRevision.value++;
    view = await mount(h(BuildingInspector, { session, id: baker.id }));
    expect(view.get('building-status').textContent).toBe(words);
    view.unmount();
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.get(`business-${baker.id}`).querySelector('.business-status')!.textContent).toBe(words);
  });
});

describe('the profit line (R1X)', () => {
  it('says what a business takes and pays a work day, and stays quiet without figures', async () => {
    const { session, baker, farm } = withBusinesses();
    expect(profitLine({ profit: { takes: 1240, pays: 710 } })).toBe('Takes 12.4, pays 7.1 a work day');
    expect(profitLine({})).toBeNull();
    session.mirror.businesses.set(baker.id, { ...baker, profit: { takes: 1240, pays: 710 } });
    session.mirror.villageRevision.value++;
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.get(`business-profit-${baker.id}`).textContent).toBe('Takes 12.4, pays 7.1 a work day');
    expect(view.find(`business-profit-${farm.id}`)).toBeNull();
  });
});
