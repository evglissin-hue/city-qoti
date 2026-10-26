// @vitest-environment happy-dom
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../app/session';
import type { ToolContext } from '../input/context';
import { ToolManager } from '../input/manager';
import type { RenderApi } from '../render/api';
import { mockSession, mockView } from './mocks/session';
import { mount, type Mounted } from './test/dom';
import { Toolbar } from './Toolbar';
import { TopBar } from './TopBar';

let view: Mounted | null = null;
let tools: ToolManager | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  tools?.dispose();
  tools = null;
});

/** A mock session with real tools on a stub renderer. */
function withTools(session: Session, toasts: string[] = []): Session {
  const render = {
    pickTile: () => null,
    pickEntity: () => null,
    setGhost: () => {},
    setOverlay: () => {},
    setPresence: () => {},
    ping: () => {},
    focus: () => {},
    setQuality: () => {},
  } as RenderApi;
  const ctx: ToolContext = {
    mirror: session.mirror,
    render,
    camera: { panByPixels: () => {} } as unknown as ToolContext['camera'],
    seat: 0,
    submit: (cmd) => session.submit(cmd),
    ui: {
      toast: (t) => toasts.push(t),
      confirm: () => Promise.resolve(true),
      prompt: () => Promise.resolve(null),
      select: (s) => (session.ui.selection.value = s),
      lens: () => session.ui.lens.value,
    },
  };
  tools = new ToolManager(ctx, render, document.createElement('canvas'), {
    pointer: () => {},
    globalKey: () => false,
  });
  (session as { tools: ToolManager }).tools = tools;
  (session as { toast: (t: string) => void }).toast = (t) => toasts.push(t);
  return session;
}

const ids = (root: HTMLElement, prefix: string) =>
  [...root.querySelectorAll(`[data-testid^="${prefix}"]`)].map((e) =>
    e.getAttribute('data-testid')!.slice(prefix.length),
  );

describe('top bar', () => {
  it('shows the treasury in coins and the population in a standard valley', async () => {
    const { session } = mockSession();
    view = await mount(h(TopBar, { session, onLeave: () => {} }));
    expect(view.get('treasury').textContent).toContain('412');
    expect(view.get('treasury').className).not.toContain('lean');
    expect(view.get('population').textContent).toContain('9');
    await view.click('treasury');
    expect(session.ui.panel.value).toBe('reports');
    expect(session.ui.reportTab.value).toBe('budget');
  });

  it('shows lean times gently, and nothing of the sort in a creative valley', async () => {
    const lean = mockSession(
      mockView({
        budget: { treasury: -800, leanTimes: true, today: [], yesterday: [], season: [], lastSeason: null },
      }),
    );
    view = await mount(h(TopBar, { session: lean.session, onLeave: () => {} }));
    expect(view.get('treasury').className).toContain('lean');
    expect(view.get('treasury').textContent).toContain('lean times');
    view.unmount();
    const creative = mockSession(mockView({ settings: { ...mockView().settings, mode: 'sandbox' } }));
    view = await mount(h(TopBar, { session: creative.session, onLeave: () => {} }));
    expect(view.find('treasury')).toBeNull();
  });
});

describe('lens toolbars', () => {
  it('Hearth: decor, customize and the books; Ledger: fields, reports and overlays', async () => {
    const session = withTools(mockSession().session);
    view = await mount(h(Toolbar, { session }));
    expect(ids(view.root, 'tool-')).toEqual([
      'inspect',
      'path',
      'building',
      'decor',
      'customize',
      'fence',
      'tree',
      'note',
      'plan',
      'ping',
      'erase',
    ]);
    expect(ids(view.root, 'book-')).toEqual([
      'wishes',
      'patterns',
      'chronicle',
      'letters',
      'achievements',
      'notebook',
    ]);
    expect(ids(view.root, 'overlay-')).toEqual(['charm']);
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBe('patterns');
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBeNull();

    await view.click('lens-ledger');
    expect(ids(view.root, 'tool-')).toEqual([
      'inspect',
      'lane',
      'street',
      'field',
      'building',
      'zone',
      'note',
      'plan',
      'ping',
      'erase',
    ]);
    expect(ids(view.root, 'book-')).toEqual(['market', 'trade', 'policies', 'reports', 'notebook']);
    expect(ids(view.root, 'overlay-')).toEqual(['coverage', 'flows', 'status']);
    await view.click('overlay-flows');
    expect(session.ui.overlay.value).toBe('flows');
    expect((view.get('undo') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a creative valley keeps the I0 toolbar: no books, no fields', async () => {
    const session = withTools(
      mockSession(mockView({ settings: { ...mockView().settings, mode: 'sandbox' } })).session,
    );
    session.ui.lens.value = 'ledger';
    view = await mount(h(Toolbar, { session }));
    expect(ids(view.root, 'book-')).toEqual([]);
    expect(ids(view.root, 'tool-')).not.toContain('field');
  });

  it('the build picker shows costs and hides what the valley mode does not offer', async () => {
    const session = withTools(mockSession().session);
    session.ui.lens.value = 'ledger';
    session.tools!.select('building');
    view = await mount(h(Toolbar, { session }));
    expect(ids(view.root, 'group-')).toEqual(['homes', 'food', 'materials', 'services']);
    const cottage = view.get('variant-cottage');
    expect(cottage.textContent).toContain('20');
    expect(cottage.textContent).toContain('16 planks');
    // Homes have no upkeep (C3X tuning), so the card shows none.
    expect(cottage.textContent).not.toContain('a day to keep');
    await view.click('group-food');
    expect(ids(view.root, 'variant-')).toEqual(
      expect.arrayContaining(['bakery', 'farmhouse', 'fishers-hut', 'market-stall', 'windmill']),
    );
    await view.click('group-services');
    expect(ids(view.root, 'variant-')).not.toContain('town-hall');
    await view.click('variant-storehouse');
    expect(session.tools!.tool('building')!.variant!.value).toBe('storehouse');
  });

  it('in a creative valley the picker says building is free and offers the sandbox pieces', async () => {
    const session = withTools(
      mockSession(mockView({ settings: { ...mockView().settings, mode: 'sandbox' } })).session,
    );
    session.tools!.select('building');
    view = await mount(h(Toolbar, { session }));
    expect(ids(view.root, 'variant-')).toContain('house');
    expect(view.get('variant-cottage').textContent).toContain('Free in a creative valley');
  });

  it('the decor picker shows Pattern Book pieces locked, with their hint', async () => {
    const toasts: string[] = [];
    const session = withTools(mockSession().session, toasts);
    session.tools!.select('decor');
    view = await mount(h(Toolbar, { session }));
    await view.click('decor-group-water');
    const birdbath = view.get('variant-birdbath');
    expect(birdbath.getAttribute('aria-disabled')).toBe('true');
    expect(birdbath.textContent).toContain('In the Pattern Book');
    await view.click(birdbath);
    expect(toasts[0]).toContain('Pattern Book');
    expect(session.tools!.tool('decor')!.variant!.value).not.toBe('birdbath');
    // Unlocked in the mock town: the curved bench.
    await view.click('decor-group-seats');
    expect(view.get('variant-curved-bench').getAttribute('aria-disabled')).toBe('false');
    await view.click('variant-curved-bench');
    expect(session.tools!.tool('decor')!.variant!.value).toBe('curved-bench');
  });
});
