// @vitest-environment happy-dom
// R3D: the master line in the Businesses book, callings on the Charter board and in the goal pill.
import { content } from '@qoti/content';
import type { BusinessView } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalPill } from '../GoalPill';
import { mockVillageSession } from '../mocks/session';
import { mount, settle, type Mounted } from '../test/dom';
import { masterLine, BusinessesPanel } from './Businesses';
import { CharterPanel } from './Charter';
import { craftLine, craftWord, openJobs } from './masterLines';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

function withBaker(extra: Partial<BusinessView> = {}) {
  const out = mockVillageSession(0, { charter: true });
  const m = out.session.mirror;
  const id = [...m.buildings.keys()][0]!;
  const master = [...m.residents.values()][0]!;
  const baker: BusinessView = {
    id,
    def: 'workshop',
    trade: 'baker',
    level: 3,
    keeperId: master.id,
    pinned: false,
    hands: 1,
    crew: 2,
    status: 'Baking',
    levelDays: 0,
    ...extra,
  };
  m.businesses.set(id, baker);
  m.villageRevision.value++;
  return { ...out, baker, master };
}

describe('the Businesses book, masters (R3D)', () => {
  it('has no master line without a master or a grace', async () => {
    const { session, baker } = withBaker();
    expect(masterLine(session, baker)).toBeNull();
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.find(`business-master-${baker.id}`)).toBeNull();
  });

  it('names the master and what they make, with apprentices when it has any', async () => {
    const { session, baker, master } = withBaker({ masterId: 0, masterGood: 'pies' });
    const b = { ...baker, masterId: master.id };
    session.mirror.businesses.set(b.id, b);
    session.mirror.villageRevision.value++;
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.get(`business-master-${b.id}`).textContent).toBe(`Master ${master.given}; makes pies.`);
    session.mirror.businesses.set(b.id, { ...b, apprentices: [1, 2] });
    session.mirror.villageRevision.value++;
    await settle();
    expect(view.get(`business-master-${b.id}`).textContent).toBe(
      `Master ${master.given}; makes pies. 2 apprentices`,
    );
    expect(masterLine(session, { ...b, apprentices: [1] })).toContain('1 apprentice');
    expect(masterLine(session, { ...b, apprentices: [1] })).not.toContain('apprentices');
  });

  it('counts the days before a business slides', async () => {
    const { session, baker } = withBaker({ graceDays: 4 });
    expect(masterLine(session, baker)).toBe('Its master has gone: 4 days before it slides.');
    expect(masterLine(session, { ...baker, graceDays: 1 })).toBe(
      'Its master has gone: 1 day before it slides.',
    );
    view = await mount(h(BusinessesPanel, { session }));
    expect(view.get(`business-master-${baker.id}`).textContent).toContain('4 days before it slides');
  });
});

describe('callings (R3D)', () => {
  const earned = () => {
    const [a, b] = content.callings;
    return [a!, b!].map((c) => ({ id: c.id, name: c.name }));
  };

  it('shows nothing on the board or the pill when none is earned', async () => {
    const { session } = mockVillageSession(0, { charter: true });
    view = await mount(h('div', null, h(CharterPanel, { session }), h(GoalPill, { session })));
    expect(view.find('charter-callings')).toBeNull();
    expect(view.get('goal-pill').title).not.toContain('Callings');
  });

  it('lists each calling with its blurb on the board, and names them in the pill', async () => {
    const { session } = mockVillageSession(0, { charter: true });
    const c = session.mirror.charter.value!;
    const list = earned();
    session.mirror.charter.value = { ...c, callings: list };
    view = await mount(h('div', null, h(CharterPanel, { session }), h(GoalPill, { session })));
    const box = view.get('charter-callings');
    for (const { id } of list) {
      const def = content.callingById.get(id)!;
      expect(view.get(`calling-${id}`).textContent).toContain(def.name);
      expect(view.get(`calling-${id}`).textContent).toContain(def.blurb);
    }
    expect(box.textContent).toContain('Callings');
    expect(view.get('goal-pill').title).toContain(`Callings: ${list[0]!.name} and ${list[1]!.name}.`);

    session.mirror.charter.value = { ...c, callings: [list[0]!] };
    await settle();
    expect(view.get('goal-pill').title).toContain(`Callings: ${list[0]!.name}.`);
  });
});

describe('craftLine', () => {
  it('is null with no working days', () => {
    expect(craftLine(undefined)).toBeNull();
    expect(craftLine([])).toBeNull();
    expect(craftLine([{ trade: 'baker', days: 0 }])).toBeNull();
  });
  it('says one day in the singular and keeps two trades', () => {
    expect(craftLine([{ trade: 'baker', days: 1 }])).toBe('1 day at baking.');
    expect(
      craftLine([
        { trade: 'weaver', days: 3 },
        { trade: 'baker', days: 9 },
        { trade: 'windmill', days: 1 },
      ]),
    ).toBe('9 days at baking, 3 at weaving.');
  });
  it('has words for every trade and master building, never a raw id', () => {
    for (const m of content.masters) expect(craftWord(m.of)).not.toBe(m.of);
  });
});

describe('openJobs', () => {
  it('says how many lamplighter jobs stand open, in words that read', () => {
    expect(openJobs(1, 1)).toBe("The lamplighter's job is open.");
    expect(openJobs(2, 2)).toBe('Both lamplighter jobs are open.');
    expect(openJobs(3, 3)).toBe('All 3 lamplighter jobs are open.');
    expect(openJobs(2, 1)).toBe('One of 2 lamplighter jobs is open.');
    expect(openJobs(4, 2)).toBe('2 of 4 lamplighter jobs are open.');
  });
});
