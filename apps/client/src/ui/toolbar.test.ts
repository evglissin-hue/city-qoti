// @vitest-environment happy-dom
import { content } from '@qoti/content';
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from '../app/session';
import type { ToolContext } from '../input/context';
import { ToolManager } from '../input/manager';
import type { RenderApi } from '../render/api';
import { mockTown } from './mocks/hamlet';
import { mockSession, mockView } from './mocks/session';
import { mount, settle, type Mounted } from './test/dom';
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
    // Inspecting is the default click, so it has no button; pings are off for now. P3B: tools that
    // are one idea share a button (tool-group-*), whose kinds open on a shelf over the bar.
    expect(ids(view.root, 'tool-')).toEqual([
      'path',
      'building',
      'group-decor',
      'group-nature',
      'move',
      'group-plans',
      'erase',
    ]);
    await view.click('tool-group-decor');
    expect(session.tools!.active.value).toBe('decor');
    expect(ids(view.get('kinds-decor'), 'tool-')).toEqual(['decor', 'fence', 'customize']);
    await view.click('tool-fence');
    expect(session.tools!.active.value).toBe('fence');
    await view.click('tool-group-decor');
    expect(session.tools!.active.value).toBe('inspect');
    expect(view.find('kinds-decor')).toBeNull();
    // The group takes out the kind last used.
    await view.click('tool-group-decor');
    expect(session.tools!.active.value).toBe('fence');
    await view.click('tool-group-decor');
    await view.click('tool-group-nature');
    expect(ids(view.get('kinds-nature'), 'tool-')).toEqual(['flowers', 'tree', 'pond']);
    await view.click('tool-group-nature');
    await view.click('tool-group-plans');
    expect(ids(view.get('kinds-plans'), 'tool-')).toEqual(['plan', 'note']);
    await view.click('tool-group-plans');
    // P3B: the books open from one named Books button, each named on its shelf.
    expect(view.get('books').textContent).toContain('Books');
    expect(ids(view.root, 'book-')).toEqual([]);
    await view.click('books');
    expect(ids(view.root, 'book-')).toEqual([
      'wishes',
      'festival',
      'patterns',
      'field-guide',
      'chronicle',
      'letters',
      'achievements',
    ]);
    for (const b of view.root.querySelectorAll('[data-testid^="book-"]'))
      expect(b.textContent!.trim()).not.toBe('');
    await view.click('books');
    // Overlays wait behind one View button.
    expect(ids(view.root, 'overlay-')).toEqual([]);
    await view.click('overlays');
    expect(ids(view.root, 'overlay-').filter((id) => id !== 'list')).toEqual([
      'bubbles',
      'charm',
      'habitats',
      'town',
      'warmth',
    ]);
    await view.click('overlays');
    await view.click('books');
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBe('patterns');
    // The shelf closes behind the book, and the button names the book open.
    expect(view.find('books-list')).toBeNull();
    expect(view.get('books').textContent).toContain('Patterns');
    await view.click('books');
    await view.click('book-patterns');
    expect(session.ui.panel.value).toBeNull();

    await view.click('lens-ledger');
    // Playtest round six: Fields waits for a grain farm (the mock valley has none). C5X: walls show
    // now that C5D opened the defense pieces (the mock valley is a Village).
    expect(ids(view.root, 'tool-')).toEqual([
      'group-roads',
      'building',
      'group-land',
      'move',
      'group-plans',
      'erase',
    ]);
    await view.click('tool-group-roads');
    expect(ids(view.get('kinds-roads'), 'tool-')).toEqual(['lane', 'street', 'evening']);
    await view.click('tool-group-roads');
    await view.click('tool-group-land');
    expect(ids(view.get('kinds-land'), 'tool-')).toEqual(['terrain', 'wall']);
    await view.click('tool-group-land');
    // Playtest round five: the Pattern Book is on both lenses' shelves.
    await view.click('books');
    expect(ids(view.root, 'book-')).toEqual([
      'balances',
      'patterns',
      'purse',
      'businesses',
      'watch',
      'notebook',
    ]);
    await view.click('books');
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
      'town',
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
    // P3A: read from content (the basic buildings got cheaper; the card must show what they cost).
    const cost = content.buildingById.get('cottage')!.cost!;
    expect(cottage.textContent).toContain(String(cost.coins));
    expect(cottage.textContent).toContain(`${cost.goods!.find(([g]) => g === 'timber')![1]} timber`);
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

describe('everything stays in reach (P3B)', () => {
  // Tools that wait for something in the world (a grain farm, a chosen layout) are shown here as
  // if it were there; the ones that never have a button open from somewhere else, named below.
  const OPENED_ELSEWHERE: Record<string, [file: string, needle: string]> = {
    'festival-site': ['panels/Festival.tsx', "'festival-site'"],
    guard: ['panels/Watch.tsx', "'guard'"],
    inspect: ['../input/manager.ts', "'inspect'"],
    zone: ['Toolbar.tsx', "manager.select('zone')"],
  };
  const source = async (file: string) =>
    (await import('node:fs')).readFileSync(new URL(file, import.meta.url), 'utf8');

  it('every tool is a button or one click away on its group shelf, in its lens', async () => {
    const session = withTools(mockSession().session);
    const all = session.tools!.tools;
    for (const t of all) if (t.id === 'field' || t.id === 'layout') t.hidden = () => false;
    view = await mount(h(Toolbar, { session }));
    const reached = new Set<string>();
    for (const lens of ['hearth', 'ledger'] as const) {
      await view.click(`lens-${lens}`);
      const bar = [...view.root.querySelectorAll('.tools > [data-testid^="tool-"]')];
      // About seven or fewer named tools a lens, every one with a label.
      expect(bar.length).toBeLessThanOrEqual(7);
      for (const b of bar) expect(b.querySelector('.label')!.textContent!.trim()).not.toBe('');
      for (const b of bar) {
        const id = b.getAttribute('data-testid')!.slice('tool-'.length);
        if (!id.startsWith('group-')) {
          reached.add(id);
          continue;
        }
        await view.click(b);
        const shelf = view.get(`kinds-${id.slice('group-'.length)}`);
        for (const k of ids(shelf, 'tool-')) reached.add(k);
        await view.click(b);
      }
    }
    for (const t of all) {
      if (reached.has(t.id)) continue;
      const elsewhere = OPENED_ELSEWHERE[t.id];
      expect(elsewhere, `tool ${t.id} has no way in`).toBeDefined();
      expect(await source(elsewhere![0])).toContain(elsewhere![1]);
    }
    // Every group names real tools.
    const { toolGroups } = await import('./toolGroups');
    const known = new Set(all.map((t) => t.id));
    for (const g of toolGroups) for (const [id] of g.members) expect(known.has(id), id).toBe(true);
  });

  it('every overlay is on its lens View list, and every book on its shelf or a key away', async () => {
    const { session } = mockSession();
    withTools(session);
    session.mirror.town.value = { ...session.mirror.town.value!, rank: 'village' };
    view = await mount(h(Toolbar, { session }));
    const { overlays } = await import('./lenses');
    const { panels, booksFor } = await import('./panels');
    for (const lens of ['hearth', 'ledger'] as const) {
      await view.click(`lens-${lens}`);
      await view.click('overlays');
      const listed = ids(view.get('overlay-list'), 'overlay-');
      for (const o of overlays.filter((x) => x.lens === lens))
        expect(listed, `${lens} ${o.id}`).toContain(o.id);
      await view.click('overlays');
      await view.click('books');
      const shelf = ids(view.get('books-list'), 'book-');
      expect(shelf).toEqual(booksFor(lens, 'standard').map((b) => b.id));
      await view.click('books');
    }
    // Books with no shelf place open from a key, the top bar or a tool.
    const OPENERS: Record<string, [file: string, needle: string]> = {
      plans: ['../input/tools/plan.ts', "openPanel?.('plans')"],
      trial: ['panels/Charter.tsx', "'trial'"],
    };
    for (const p of panels.filter((x) => x.side === 'book' && x.hidden)) {
      if (p.key) continue;
      const opener = OPENERS[p.id];
      expect(opener, `book ${p.id} has no way in`).toBeDefined();
      expect(await source(opener![0])).toContain(opener![1]);
    }
  });
});

describe('Escape closes what was opened last (P3B, CI)', () => {
  /** Whether an Escape pressed now reaches the game's own keys (a listener on the window). */
  const escapeReachesGame = () => {
    let reached = false;
    const hear = (e: KeyboardEvent) => (reached ||= e.key === 'Escape');
    addEventListener('keydown', hear);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    removeEventListener('keydown', hear);
    return reached;
  };

  it('every book picked from the shelf, at once and in both lenses, leaves Escape to the book', async () => {
    const session = withTools(mockSession().session);
    view = await mount(h(Toolbar, { session }));
    for (const lens of ['hearth', 'ledger'] as const) {
      await view.click(`lens-${lens}`);
      await view.click('books');
      const books = ids(view.get('books-list'), 'book-');
      await view.click('books');
      for (const id of books) {
        await view.click('books');
        // With the shelf open, Escape shuts the shelf and goes no further.
        expect(escapeReachesGame()).toBe(false);
        await settle();
        expect(view.find('books-list')).toBeNull();
        await view.click('books');
        // Picked and pressed at once, before Preact has painted or dropped the shelf's listener.
        (view.get(`book-${id}`) as HTMLElement).click();
        expect(escapeReachesGame(), `${lens} ${id}`).toBe(true);
        await settle();
        session.ui.panel.value = null;
      }
    }
  });

  it('a View entry picked from the list leaves Escape to the game too', async () => {
    const session = withTools(mockSession().session);
    view = await mount(h(Toolbar, { session }));
    await view.click('lens-ledger');
    await view.click('overlays');
    (view.get('overlay-flows') as HTMLElement).click();
    expect(escapeReachesGame()).toBe(true);
    await settle();
    // Opened and shut again by its own button, at once.
    await view.click('overlays');
    (view.get('overlays') as HTMLElement).click();
    expect(escapeReachesGame()).toBe(true);
  });
});
