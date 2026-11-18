// @vitest-environment happy-dom
import { content } from '@qoti/content';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { removalRequest } from '../../input/removal';
import { mockBuildings } from '../mocks/hamlet';
import { mockInspect, mockSession, mockView } from '../mocks/session';
import { button, mount, settle, type Mounted } from '../test/dom';
import { InspectorPanel } from './Inspector';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('resident inspector', () => {
  it('shows who they are, how they feel and what they wish for', async () => {
    const { session, calls } = mockSession();
    session.ui.selection.value = { kind: 'resident', id: 12 };
    view = await mount(h(InspectorPanel, { session }));
    const text = view.text();
    expect(text).toContain('Clover Thistledown');
    expect(text).toContain('Rabbit, adult, 9 years');
    expect(text).toContain('Cheerful');
    expect(text).toContain('Green-Fingered');
    expect(text).toContain('At work at the town hall');
    expect(view.get('mood-word').textContent).toContain('Content');
    expect(text).toContain('The Thistledown family');
    expect(text).toContain('Town hall');
    expect(text).toContain('Fed well, with some variety');
    expect(text).toContain('Belonging');
    expect(view.get('resident-wish').textContent).toContain('bench by the river');
    expect(view.root.querySelector('svg.portrait')).not.toBeNull();

    await view.click(button(view.root, 'Show me where'));
    expect(calls.find((c) => c.method === 'highlight')?.args[0]).toMatchObject({ x: 54, z: 49, radius: 4 });

    await view.click('follow');
    expect(session.ui.following.value).toBe(12);
    expect(calls.find((c) => c.method === 'follow')?.args[0]).toBe(12);
  });

  it('tells their story: friends, household and history', async () => {
    const { session } = mockSession();
    session.ui.selection.value = { kind: 'resident', id: 12 };
    view = await mount(h(InspectorPanel, { session }));
    await view.click('resident-story-tab');
    const text = view.text();
    expect(text).toContain('came for the meadows');
    expect(text).toContain('Marina Underbank');
    expect(text).toContain('Hazel Thistledown');
    expect(text).toContain('Became friends with Marina Underbank');
    await view.click(button(view.root, 'Marina Underbank'));
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: 17 });
  });

  it('opens the home from the facts', async () => {
    const { session } = mockSession();
    session.ui.selection.value = { kind: 'resident', id: 12 };
    view = await mount(h(InspectorPanel, { session }));
    await view.click(button(view.root, 'Cottage'));
    expect(session.ui.selection.value).toEqual({ kind: 'building', id: 3 });
  });
});

describe('building inspector', () => {
  it('shows a workshop at work: workers, buffers, cycle, condition and status', async () => {
    const { session, submitted } = mockSession();
    session.ui.selection.value = { kind: 'building', id: 6 };
    view = await mount(h(InspectorPanel, { session }));
    const text = view.text();
    expect(text).toContain('The Warm Loaf');
    expect(text).toContain('Baker');
    expect(view.get('building-status').textContent).toContain('Waiting for inputs');
    expect(text).toContain('Hazel Thistledown');
    expect(text).toContain('1 in, 1 of 2 jobs filled');
    expect(text).toContain('1 job open');
    expect(text).toContain('Bake bread');
    expect(text).toContain('4 grain');
    expect(text).toContain('3 bread');
    expect(text).toContain('Condition');
    expect(text).toContain('Built by you with a personal touch');

    await view.click('pause');
    expect(submitted).toEqual([{ t: 'build.setPaused', id: 6, paused: true }]);
    await view.click('customize-open');
    expect(session.ui.customize.value).toBe(6);
  });

  it('shows a construction site: stage, progress, materials and priority', async () => {
    const { session, submitted } = mockSession();
    session.ui.selection.value = { kind: 'building', id: 8 };
    view = await mount(h(InspectorPanel, { session }));
    const text = view.text();
    expect(text).toContain('Construction site');
    expect(text).toContain('Foundation');
    expect(view.get('construction-progress').textContent).toContain('35%');
    expect(text).toContain('10/16 timber');
    expect(text).toContain('6/6 stone');
    expect(text).toContain('Built by Bo');
    expect(view.root.querySelector('[data-testid="priority"]')?.getAttribute('aria-checked')).toBe('true');
    await view.click('priority');
    expect(submitted).toEqual([{ t: 'build.setPriority', id: 8, priority: false }]);
  });

  it('shows the storehouse shelves and a home with its household', async () => {
    const { session } = mockSession();
    session.ui.selection.value = { kind: 'building', id: 2 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.text()).toContain(`142 of ${content.buildingById.get('storehouse')!.storage}`);
    expect(view.text()).toContain('40 timber');
    view.unmount();
    session.ui.selection.value = { kind: 'building', id: 3 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.text()).toContain('Home of the Thistledown family');
    expect(view.text()).toContain('Pip Thistledown');
  });

  it("a business: goes by its trade's name, and its trade dial sends build.pinRecipe", async () => {
    const { session, submitted } = mockSession();
    session.ui.lens.value = 'ledger';
    session.ui.selection.value = { kind: 'building', id: 6 };
    view = await mount(h(InspectorPanel, { session }));
    // The sign is the title; the trade, not "Workshop", is the line under it.
    expect(view.text()).toContain('Baker');
    expect(view.text()).toContain('Business');
    expect(view.text()).not.toContain('Workshop');
    // R1C: no trade list any more; the business lines carry the pin.
    expect(view.find('pin-trade')).toBeNull();
    session.mirror.businesses.set(6, {
      id: 6,
      def: 'workshop',
      trade: 'baker',
      level: 2,
      keeperId: 0,
      pinned: false,
      hands: 1,
      crew: 2,
      status: 'Baking',
      levelDays: 0,
    });
    session.mirror.villageRevision.value++;
    await settle();
    expect(view.get('business-lines').textContent).toContain('Baker');
    expect(view.get('building-status').textContent).toBe('Baking');
    await view.click('pin-6');
    expect(submitted).toEqual([{ t: 'build.pinRecipe', id: 6, trade: 'baker' }]);
  });

  it('removes through a command', async () => {
    const { session, submitted } = mockSession();
    session.ui.selection.value = { kind: 'building', id: 6 };
    view = await mount(h(InspectorPanel, { session }));
    await view.click('remove');
    expect(submitted).toEqual([{ t: 'build.remove', ids: [6] }]);
  });

  it("asks before removing the partner's handmade building, and leaves them a note", async () => {
    const theirs = mockBuildings.map((b) => (b.id === 6 ? { ...b, builtBy: 1 as const } : b));
    const { session, submitted } = mockSession(mockView({ buildings: theirs }));
    session.ui.selection.value = { kind: 'building', id: 6 };
    view = await mount(h(InspectorPanel, { session }));
    await view.click('remove');
    expect(submitted).toEqual([]);
    expect(removalRequest.value?.title).toBe('Bo built this workshop and dressed it up by hand.');
    removalRequest.value!.resolve('The mill needs the spot');
    await new Promise((r) => setTimeout(r, 0));
    expect(submitted[0]).toEqual({ t: 'build.remove', ids: [6] });
    expect(submitted[1]).toMatchObject({
      t: 'note.pin',
      x: 65,
      z: 47,
      text: 'Ada removed your workshop: The mill needs the spot',
    });
  });
});

/** A session whose inspect reply for one entity carries extra R3 fields. */
function withDetail(kind: 'resident' | 'building', id: number, extra: Record<string, unknown>) {
  const out = mockSession();
  (out.session as { inspect: unknown }).inspect = (k: 'resident' | 'building', i: number) => {
    const base = mockInspect(k, i);
    return Promise.resolve(k === kind && i === id && base ? { ...base, ...extra } : base);
  };
  out.session.ui.selection.value = { kind, id };
  return out;
}

describe('resident inspector, masters and craft (R3D)', () => {
  it('shows nothing extra without the fields', async () => {
    const { session } = mockSession();
    session.ui.selection.value = { kind: 'resident', id: 12 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('resident-master-lines')).toBeNull();
  });

  it('says a master is a master, and leaves their craft out', async () => {
    const { session } = withDetail('resident', 12, {
      master: { trade: 'baker', title: 'master baker' },
      craft: [{ trade: 'baker', days: 40 }],
    });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('resident-master').textContent).toBe('Master baker.');
    expect(view.find('resident-craft')).toBeNull();
  });

  it('names an apprentice master as a link, with the title from the master business', async () => {
    const { session } = withDetail('resident', 12, { apprenticeOf: { id: 17, name: 'Hazel' } });
    session.mirror.businesses.set(6, {
      id: 6,
      def: 'workshop',
      trade: 'baker',
      level: 3,
      keeperId: 0,
      pinned: false,
      hands: 1,
      crew: 2,
      status: 'Baking',
      levelDays: 0,
      masterId: 17,
    });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('resident-apprentice').textContent).toBe('Apprenticed to Hazel, master baker.');
    await view.click(button(view.get('resident-apprentice'), 'Hazel'));
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: 17 });
  });

  it('shows the craft, most days first, at most two trades', async () => {
    const { session } = withDetail('resident', 12, {
      craft: [
        { trade: 'windmill', days: 6 },
        { trade: 'baker', days: 34 },
        { trade: 'weaver', days: 2 },
      ],
    });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('resident-craft').textContent).toBe('34 days at baking, 6 at milling.');
  });

  it('shows no craft for someone with no working days', async () => {
    const { session } = withDetail('resident', 12, { craft: [{ trade: 'baker', days: 0 }] });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('resident-craft')).toBeNull();
  });
});

describe('building inspector, masters, lamplighter and candle (R3D)', () => {
  it('shows nothing extra without the fields', async () => {
    const { session } = mockSession();
    session.ui.selection.value = { kind: 'building', id: 6 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('building-master-lines')).toBeNull();
  });

  it('shows the master and the apprentices as links', async () => {
    const master = {
      id: 12,
      name: 'Hazel',
      trade: 'baker',
      title: 'master baker',
      apprentices: [
        { id: 17, name: 'Fig' },
        { id: 18, name: 'Tansy' },
      ],
    };
    const { session } = withDetail('building', 6, { master });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('building-master').textContent).toBe('Master: Hazel, master baker.');
    expect(view.get('building-apprentices').textContent).toBe('Apprentices: Fig and Tansy.');
    await view.click(button(view.get('building-apprentices'), 'Tansy'));
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: 18 });
    view.unmount();
    const three = withDetail('building', 6, {
      master: { ...master, apprentices: [...master.apprentices, { id: 19, name: 'Wren' }] },
    });
    view = await mount(h(InspectorPanel, { session: three.session }));
    expect(view.get('building-apprentices').textContent).toBe('Apprentices: Fig, Tansy and Wren.');
  });

  it('leaves the apprentices line out when there are none', async () => {
    const { session } = withDetail('building', 6, {
      master: { id: 12, name: 'Hazel', trade: 'baker', title: 'master baker', apprentices: [] },
    });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.find('building-master')).not.toBeNull();
    expect(view.find('building-apprentices')).toBeNull();
  });

  it('says who holds the lamplighter jobs and what tonight needs', async () => {
    const { session } = withDetail('building', 6, {
      lamplighter: { jobs: 1, held: [{ id: 12, name: 'Rowan' }], lanterns: 24, candles: 6 },
    });
    view = await mount(h(InspectorPanel, { session }));
    expect(view.get('building-lamplighter').textContent).toBe('Lamplighter: Rowan.');
    expect(view.get('building-lanterns').textContent).toBe('Tonight: 24 lanterns, 6 candles.');
    await view.click(button(view.get('building-lamplighter'), 'Rowan'));
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: 12 });
  });

  it('says a lamplighter job is open, and two hold the jobs', async () => {
    let out = withDetail('building', 6, { lamplighter: { jobs: 1, held: [], lanterns: 0, candles: 0 } });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.get('building-lamplighter').textContent).toBe("The lamplighter's job is open.");
    expect(view.find('building-lanterns')).toBeNull();
    view.unmount();
    out = withDetail('building', 6, {
      lamplighter: { jobs: 2, held: [{ id: 12, name: 'Rowan' }], lanterns: 3, candles: 0 },
    });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.get('building-lamplighter').textContent).toBe(
      'Lamplighter: Rowan. One of 2 lamplighter jobs is open.',
    );
    expect(view.get('building-lanterns').textContent).toBe('Tonight: 3 lanterns.');
    view.unmount();
    out = withDetail('building', 6, {
      lamplighter: {
        jobs: 2,
        held: [
          { id: 12, name: 'Rowan' },
          { id: 17, name: 'Moss' },
        ],
        lanterns: 1,
        candles: 1,
      },
    });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.get('building-lamplighter').textContent).toBe('Lamplighters: Rowan and Moss.');
    expect(view.get('building-lanterns').textContent).toBe('Tonight: 1 lantern, 1 candle.');
  });

  it("counts a home's candlelight", async () => {
    let out = withDetail('building', 6, { candle: 3 });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.get('building-candle').textContent).toBe('Candlelight for 3 more nights.');
    view.unmount();
    out = withDetail('building', 6, { candle: 1 });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.get('building-candle').textContent).toBe('Candlelight for one more night.');
    view.unmount();
    out = withDetail('building', 6, { candle: 0 });
    view = await mount(h(InspectorPanel, { session: out.session }));
    expect(view.find('building-candle')).toBeNull();
  });
});
