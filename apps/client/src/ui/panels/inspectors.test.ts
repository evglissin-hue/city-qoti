// @vitest-environment happy-dom
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { removalRequest } from '../../input/removal';
import { mockBuildings } from '../mocks/hamlet';
import { mockSession, mockView } from '../mocks/session';
import { button, mount, type Mounted } from '../test/dom';
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
    expect(text).toContain('Bakery');
    expect(view.get('building-status').textContent).toContain('Waiting for inputs');
    expect(text).toContain('Hazel Thistledown');
    expect(text).toContain('1 in, 1 of 2 jobs filled');
    expect(text).toContain('1 job open');
    expect(text).toContain('Bake bread');
    expect(text).toContain('4 flour');
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
    expect(text).toContain('10/16 logs');
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
    expect(view.text()).toContain('142 of 400');
    expect(view.text()).toContain('40 logs');
    view.unmount();
    session.ui.selection.value = { kind: 'building', id: 3 };
    view = await mount(h(InspectorPanel, { session }));
    expect(view.text()).toContain('Home of the Thistledown family');
    expect(view.text()).toContain('Pip Thistledown');
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
    expect(removalRequest.value?.title).toBe('Bo built this bakery and dressed it up by hand.');
    removalRequest.value!.resolve('The mill needs the spot');
    await new Promise((r) => setTimeout(r, 0));
    expect(submitted[0]).toEqual({ t: 'build.remove', ids: [6] });
    expect(submitted[1]).toMatchObject({
      t: 'note.pin',
      x: 65,
      z: 48,
      text: 'Ada removed your bakery: The mill needs the spot',
    });
  });
});
