// @vitest-environment happy-dom
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../app/session';
import type { ToolContext } from '../input/context';
import { ToolManager } from '../input/manager';
import type { RenderApi } from '../render/api';
import { mockTown } from './mocks/hamlet';
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
    // The townsfolk count lives behind the menu button.
    expect(view.find('population')).toBeNull();
    await view.click('menu-open');
    expect(view.get('population').textContent).toContain('9');
    await view.click('menu-open');
    await view.click('treasury');
    expect(session.ui.panel.value).toBe('purse');
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
    // Inspecting is the default click, so it has no button; pings are off for now.
    expect(ids(view.root, 'tool-')).toEqual([
      'path',
      'building',
      'decor',
      'flowers',
      'move',
      'customize',
      'fence',
      'tree',
      'pond',
      'note',
      'plan',
      'erase',
    ]);
    expect(ids(view.root, 'book-')).toEqual([
      'wishes',
      'festival',
      'patterns',
      'field-guide',
      'chronicle',
      'letters',
      'achievements',
    ]);
    // Overlays wait behind one View button.
    expect(ids(view.root, 'overlay-')).toEqual([]);
    await view.click('overlays');
    expect(ids(view.root, 'overlay-').filter((id) => id !== 'list')).toEqual(['charm', 'habitats', 'warmth']);
    await view.click('overlays');
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBe('patterns');
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBeNull();

    await view.click('lens-ledger');
    // Playtest round six: Fields waits for a grain farm (the mock valley has none). C5X: walls show
    // now that C5D opened the defense pieces (the mock valley is a Village).
    expect(ids(view.root, 'tool-')).toEqual([
      'lane',
      'street',
      'building',
      'wall',
      'terrain',
      'move',
      'note',
      'plan',
      'erase',
    ]);
    // Playtest round five: the Pattern Book is on both lenses' shelves.
    expect(ids(view.root, 'book-')).toEqual([
      'balances',
      'patterns',
      'purse',
      'businesses',
      'watch',
      'notebook',
    ]);
    await view.click('overlays');
    // Playtest round six: the Ledger shows the soil and stone until another view is picked.
    expect(view.get('overlays').textContent).toContain('Soil and stone');
    expect(ids(view.root, 'overlay-').filter((id) => id !== 'list')).toEqual([
      'coverage',
      'floodplain',
      'flows',
      'resources',
      'status',
      'threat',
      'clear',
    ]);
    await view.click('overlay-flows');
    expect(session.ui.overlay.value).toBe('flows');
    // The button now names the overlay, and the list has closed.
    expect(view.get('overlays').textContent).toContain('Flows');
    expect(ids(view.root, 'overlay-')).toEqual(['clear']);
    await view.click('overlay-clear');
    // Cleared on purpose: 'off', so the Ledger's own view does not come straight back.
    expect(session.ui.overlay.value).toBe('off');
    // R1C: in a standard Ledger the Build button opens the picker with the Homes brush ready.
    await view.click('tool-building');
    expect(session.tools!.active.value).toBe('zone');
    await view.click('tool-building');
    expect(session.tools!.active.value).toBe('inspect');
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
    session.tools!.select('building', 'cottage');
    view = await mount(h(Toolbar, { session }));
    // R1C: three shelves. A hand-placed cottage is on Services, under "Homes by hand".
    expect(ids(view.root, 'group-')).toEqual(['zones', 'specialized', 'services']);
    const cottage = view.get('variant-cottage');
    expect(cottage.textContent).toContain('20');
    expect(cottage.textContent).toContain('16 timber');
    // Homes have no upkeep (C3X tuning), so the card shows none.
    expect(cottage.textContent).not.toContain('a day to keep');
    expect(view.get('homes-by-hand').textContent).toContain('Homes by hand');
    await view.click('group-specialized');
    expect(ids(view.root, 'variant-')).toEqual(
      expect.arrayContaining(['foresters-lodge', 'quarry', 'fishery', 'windmill', 'granary', 'storehouse']),
    );
    expect(view.find('building-chains')).toBeNull();
    expect(ids(view.root, 'variant-')).not.toContain('workshop');
    expect(ids(view.root, 'variant-')).not.toContain('well');
    await view.click('variant-storehouse');
    expect(session.tools!.tool('building')!.variant!.value).toBe('storehouse');
    await view.click('group-services');
    expect(ids(view.root, 'variant-')).toContain('well');
    expect(ids(view.root, 'variant-')).not.toContain('town-hall');
    expect(ids(view.root, 'variant-')).not.toContain('windmill');
  });

  it('each specialized card says its site rule and what it is for', async () => {
    const session = withTools(mockSession().session);
    session.ui.lens.value = 'ledger';
    session.tools!.select('building', 'windmill');
    view = await mount(h(Toolbar, { session }));
    await view.click('group-specialized');
    expect(view.get('site-windmill').textContent).toBe('On open ground');
    expect(view.get('site-foresters-lodge').textContent).toBe('Beside woods (12 grown trees)');
    expect(view.get('site-quarry').textContent).toBe('On a stone deposit');
    expect(view.get('variant-windmill').textContent).toContain('baker');
    // A building with a reach says so under the shelf while it is chosen.
    expect(view.get('reach-note').textContent).toContain('24 tiles');
  });

  it('the Zones shelf: four brushes in demand order, each beside its demand bar', async () => {
    const mock = mockSession(mockView({ town: { ...mockTown, rank: 'village' } })).session;
    mock.mirror.demand.value = {
      bars: [
        {
          kind: 'homes',
          value: 62,
          lit: true,
          reasons: [],
          why: ['Households would come, and jobs are open.'],
        },
        { kind: 'shops', value: 10, lit: false, reasons: [], why: [] },
        { kind: 'workshops', value: 0, lit: false, reasons: [], why: [] },
        { kind: 'farmland', value: 0, lit: false, reasons: [], why: [] },
      ],
    };
    const session = withTools(mock);
    session.ui.lens.value = 'ledger';
    view = await mount(h(Toolbar, { session }));
    // The Build button opens the picker on the Zones shelf, with Homes ready; Zone has no button.
    expect(view.find('tool-zone')).toBeNull();
    await view.click('tool-building');
    expect(session.tools!.active.value).toBe('zone');
    expect(ids(view.root, 'brush-').filter((id) => !id.startsWith('why-') && id !== 'demand')).toEqual([
      'homes-low',
      'shops',
      'crafts',
      'farms',
      'clear',
    ]);
    expect(view.get('brush-why-homes').textContent).toBe('Households would come, and jobs are open.');
    expect(view.get('brush-why-shops').textContent).toBe('Quiet for now.');
    expect(view.get('brush-homes-low').getAttribute('title')).toContain('The town needs more Homes zoned.');
    // R1B: a grain farm wants room behind its lot, so the Farmland brush says to zone it deep.
    expect(view.get('brush-farms').getAttribute('title')).toContain('Zone it deep');
    // From Village rank the Homes card has its second density.
    expect(view.get('variant-homes-medium').textContent).toBe('Townhouses');
    await view.click('variant-homes-medium');
    expect(session.tools!.tool('zone')!.variant!.value).toBe('homes-medium');
    await view.click('brush-crafts');
    expect(session.tools!.tool('zone')!.variant!.value).toBe('crafts');
    await view.click('brush-clear');
    expect(session.tools!.tool('zone')!.variant!.value).toBe('clear');
    // Clicking Build again puts the brush away.
    await view.click('tool-building');
    expect(session.tools!.active.value).toBe('inspect');
  });

  it('before Village the Shops card is the Market Stall and Townhouses are not offered', async () => {
    const session = withTools(mockSession(mockView({ town: { ...mockTown, rank: 'hamlet' } })).session);
    session.ui.lens.value = 'ledger';
    view = await mount(h(Toolbar, { session }));
    await view.click('tool-building');
    expect(view.find('variant-homes-medium')).toBeNull();
    expect(view.get('shops-closed').textContent).toContain('Market Stall by hand until Village rank');
    expect(view.get('brush-shops').textContent).toContain('Market Stall');
    await view.click('brush-shops');
    expect(session.tools!.active.value).toBe('building');
    expect(session.tools!.tool('building')!.variant!.value).toBe('market-stall');
    // Still on the Zones shelf, with the Shops card chosen.
    expect(view.get('brush-shops').closest('.card')!.className).toContain('active');
  });

  it('a creative valley has no Zones shelf', async () => {
    const session = withTools(
      mockSession(mockView({ settings: { ...mockView().settings, mode: 'sandbox' } })).session,
    );
    session.ui.lens.value = 'ledger';
    session.tools!.select('building', 'house');
    view = await mount(h(Toolbar, { session }));
    expect(ids(view.root, 'group-')).toEqual(['specialized', 'services']);
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
