// @vitest-environment happy-dom
import type { ThreadSubject, ThreadView } from '@qoti/sim';
import { h } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mockSession } from '../mocks/session';
import { mount, settle, type Mounted } from '../test/dom';
import { Thread } from './Thread';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const subject: ThreadSubject = { kind: 'good', good: 'cider' };

function withThread(answer: Partial<ThreadView>) {
  const m = mockSession();
  (m.session as unknown as { thread: unknown }).thread = (s: ThreadSubject) =>
    Promise.resolve({ subject: s, text: '', refs: [], route: [], ...answer });
  return m;
}
const highlights = (calls: { method: string; args: unknown[] }[]) =>
  calls.filter((c) => c.method === 'highlight').map((c) => c.args[0]);

const TEXT =
  'This cider: fruit from the Mill orchard, pressed on Mill Lane, sold at Mill Lane, drunk at the Promenade.';
const REFS = [
  { name: 'Mill', ref: 'building:3' },
  { name: 'Mill Lane', ref: 'building:4' },
  { name: 'Mill Lane', ref: 'building:5' },
  { name: 'Promenade', ref: 'seats:9' },
];

describe('Thread', () => {
  it('renders the sentence with its names as links, in order', async () => {
    const { session } = withThread({ text: TEXT, refs: REFS, route: [] });
    view = await mount(h(Thread, { session, subject, routeWhen: 'open' }));
    const p = view.get('thread');
    expect(p.textContent).toBe(TEXT);
    expect([...p.querySelectorAll('button.link')].map((b) => b.textContent)).toEqual([
      'Mill',
      'Mill Lane',
      'Mill Lane',
      'Promenade',
    ]);
    expect(p.getAttribute('title')).toContain('Where it came from');
  });

  it('prefers a whole word over a name inside another word', async () => {
    const { session } = withThread({
      text: 'Millie sells to Mill folk.',
      refs: [{ name: 'Mill', ref: 'building:1' }],
    });
    view = await mount(h(Thread, { session, subject, routeWhen: 'open' }));
    const links = view.get('thread').querySelectorAll('button.link');
    expect(links).toHaveLength(1);
    expect(links[0]!.previousSibling?.textContent).toBe('Millie sells to ');
  });

  it('opens what a name points at', async () => {
    const { session } = withThread({ text: TEXT, refs: REFS });
    view = await mount(h(Thread, { session, subject, routeWhen: 'open' }));
    const links = [...view.get('thread').querySelectorAll('button.link')];
    await view.click(links[2]!);
    expect(session.ui.selection.value).toEqual({ kind: 'building', id: 5 });
    await view.click(links[3]!);
    expect(session.ui.selection.value).toEqual({ kind: 'place', id: 'seats:9' });
    const r = withThread({ text: 'Bo works at Mill.', refs: [{ name: 'Bo', ref: 'resident:7' }] });
    view.unmount();
    view = await mount(h(Thread, { session: r.session, subject, routeWhen: 'open' }));
    await view.click(view.get('thread').querySelector('button')!);
    expect(r.session.ui.selection.value).toEqual({ kind: 'resident', id: 7 });
  });

  it('renders nothing for an empty sentence or no answer', async () => {
    const { session } = withThread({ text: '' });
    view = await mount(h(Thread, { session, subject, routeWhen: 'open' }));
    expect(view.find('thread')).toBeNull();
    expect(view.root.textContent).toBe('');
  });

  it('draws its route while open and clears it on unmount', async () => {
    const { session, calls } = withThread({ text: TEXT, refs: REFS, route: [0, 1, 2] });
    view = await mount(h(Thread, { session, subject, routeWhen: 'open' }));
    expect(highlights(calls).at(-1)).toEqual({
      tiles: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      tone: 'ledger',
    });
    await act(() => {
      view!.unmount();
    });
    await settle();
    expect(highlights(calls).at(-1)).toBeNull();
    view = null;
  });

  it('on hover draws its route only while the pointer is over it', async () => {
    const { session, calls } = withThread({ text: TEXT, refs: REFS, route: [0, 1] });
    view = await mount(h(Thread, { session, subject, routeWhen: 'hover' }));
    expect(highlights(calls)).toEqual([]);
    const p = view.get('thread');
    await act(() => {
      p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      p.dispatchEvent(new MouseEvent('mouseenter'));
    });
    await settle();
    expect(highlights(calls).at(-1)).toMatchObject({ tone: 'ledger' });
    await act(() => {
      p.dispatchEvent(new MouseEvent('mouseleave'));
    });
    await settle();
    expect(highlights(calls).at(-1)).toBeNull();
  });
});
