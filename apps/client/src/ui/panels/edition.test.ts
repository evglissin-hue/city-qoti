// @vitest-environment happy-dom
// R2D: the evening edition card, its place in the queue, its feed line, its settings and the season
// spread's order.
import { TICKS_PER_DAY, type EveningView, type SeatId } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seasonsAfterUpdate, seasonsEscape } from '../../app/seasonsHook';
import type { MirrorChange } from '../../state/mirror';
import { cardQueue, CARDS } from '../cards';
import { editionFeedAlerts, editionTarget, tallyLine } from '../eveningFeed';
import { mockPlace, mockTally } from '../mocks/evening';
import { mockSeasonReport, mockSeasonReportCross } from '../mocks/seasons';
import { mockSession } from '../mocks/session';
import { loadSettings } from '../settings';
import { SettingsPanel } from '../SettingsPanel';
import { mount, type Mounted } from '../test/dom';
import { EditionPanel } from './Edition';
import { SeasonCardPanel, togetherLines } from './SeasonCard';

let view: Mounted | null = null;
beforeEach(() => localStorage.clear());
afterEach(() => {
  view?.unmount();
  view = null;
});

const A = 0 as SeatId;
const B = 1 as SeatId;

function edition(over: Partial<EveningView> = {}): EveningView {
  return {
    tally: mockTally({ day: 6 }),
    lines: [
      { text: "Bo's stall by the well sold to the 12 who came.", seats: [B], refs: ['host:9'] },
      { text: "Ada's benches brought 9 folk to the green.", seats: [A], refs: ['host:404'] },
      { text: 'Three folk stood for want of a seat.', seats: [], refs: [] },
    ],
    places: [],
    ...over,
  };
}

function withPlace(session: ReturnType<typeof mockSession>['session']) {
  const p = mockPlace({ id: 'host:9', tile: 50 * 192 + 52 });
  session.mirror.places.set(p.id, p);
}

describe('the evening edition card', () => {
  it("credits each seat by name in that seat's color and says the day and the weather", async () => {
    const { session } = mockSession();
    session.ui.edition.value = edition();
    view = await mount(h(EditionPanel, { session }));
    const card = view.get('edition');
    expect(card.textContent).toContain('The Evening Edition');
    expect(card.textContent).toContain('A fair evening');
    const names = [...card.querySelectorAll<HTMLElement>('.edition-name')];
    expect(names.map((n) => n.textContent)).toEqual(['Bo', 'Ada']);
    expect(names[0]!.style.getPropertyValue('--seat')).toBe('#3f7f7a');
    expect(names[1]!.style.getPropertyValue('--seat')).toBe('#d9a441');
    expect(card.textContent).not.toMatch(/\u2014/);
  });

  it('says the tally when the lines do not, and keeps quiet when they do', () => {
    const v = edition();
    expect(tallyLine(v)).toContain('27 of 40 went out');
    // R2X: a score always carries its scale, so a newcomer can read "61" (the class: a bare number).
    expect(tallyLine(v)).toMatch(/scored \d+ out of 100/);
    const said = edition({
      lines: [{ text: '27 of 40 grown-ups went out.', seats: [], refs: [] }],
    });
    expect(tallyLine(said)).toBeNull();
  });

  it('a click on a line focuses the first ref that resolves and selects the place', async () => {
    const { session, calls } = mockSession();
    withPlace(session);
    session.ui.edition.value = edition();
    view = await mount(h(EditionPanel, { session }));
    const lines = view.root.querySelectorAll<HTMLElement>('[data-testid="edition-line"]');
    // The line whose ref names no place is a plain line, not a button.
    expect(lines.length).toBe(1);
    await view.click(lines[0]!);
    expect(calls.some((c) => c.method === 'focus')).toBe(true);
    expect(session.ui.selection.value).toEqual({ kind: 'place', id: 'host:9' });
  });

  it('resolves buildings, gaps and streets without selecting anything', () => {
    const { session } = mockSession();
    const m = session.mirror;
    const b = [...m.buildings.values()][0]!;
    expect(editionTarget(m, `building:${b.id}`)).toEqual({ x: b.x + 0.5, z: b.z + 0.5 });
    expect(editionTarget(m, 'building:99999')).toBeNull();
    expect(editionTarget(m, 'gap:1')).toBeNull();
    expect(editionTarget(m, 'street:1')).toBeNull();
    m.setStreets([{ id: 31, name: 'Mill Lane', generated: 'Mill Lane', anchor: 192 + 2, tiles: [194] }]);
    m.gaps.value = {
      open: [
        {
          id: 41,
          kind: 'nothingToSell',
          subject: 'host:9',
          tile: 2 * 192 + 4,
          lane: 'ledger',
          text: 'x',
          closes: 'y',
          openedDay: 1,
          n: 3,
        },
      ],
      closed: [],
      closedCount: 0,
      closedBySeat: [0, 0],
    };
    expect(editionTarget(m, 'street:31')).toEqual({ x: 2.5, z: 1.5 });
    expect(editionTarget(m, 'gap:41')).toEqual({ x: 4.5, z: 2.5 });
    expect(editionTarget(m, 'gap:41')?.place).toBeUndefined();
  });

  it('closes itself and clears the signal', async () => {
    const { session } = mockSession();
    session.ui.edition.value = edition();
    view = await mount(h(EditionPanel, { session }));
    await view.click('edition-close');
    expect(session.ui.edition.value).toBeNull();
  });
});

describe('the edition waits its turn', () => {
  it('is a card kind, sorted, and queues with the season card: one shows, the other waits', () => {
    const ids = CARDS.map((c) => c.panel);
    expect(ids).toContain('edition');
    expect(ids).toEqual([...ids].sort());
    const { session } = mockSession();
    expect(cardQueue(session)).toEqual([]);
    session.ui.almanac.value = { kind: 'report', view: mockSeasonReport, page: 0 };
    expect(cardQueue(session)).toEqual(['season-card']);
    session.ui.edition.value = edition();
    expect(cardQueue(session)).toEqual(['season-card', 'edition']);
    session.ui.almanac.value = null;
    expect(cardQueue(session)).toEqual(['edition']);
  });

  it('arrives from evening.closed unless the player chose the feed, and Esc puts it down', () => {
    const { session } = mockSession();
    const change = { evening: edition(), sightings: [], together: [] } as unknown as MirrorChange;
    seasonsAfterUpdate(session as never, change);
    expect(session.ui.edition.value).toBe(change.evening);
    expect(seasonsEscape(session.ui)).toBe(true);
    expect(session.ui.edition.value).toBeNull();
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ editionInFeed: true }));
    seasonsAfterUpdate(session as never, change);
    expect(session.ui.edition.value).toBeNull();
  });
});

describe('the edition as a feed line', () => {
  it('gives one line per lens, its first line with the rest in the hover, keyed by the day', () => {
    const { session } = mockSession();
    const m = session.mirror;
    m.evening.value = edition();
    m.tick.value = 6 * TICKS_PER_DAY + 100;
    const alerts = editionFeedAlerts(m, true);
    expect(alerts.map((a) => a.lens).sort()).toEqual(['hearth', 'ledger']);
    expect(alerts[0]!.key).toBe('edition:6');
    expect(alerts[0]!.text).toBe(m.evening.value.lines[0]!.text);
    expect(alerts[0]!.title).toContain('Three folk stood');
  });

  it('is empty when off, with no edition, or on another day', () => {
    const { session } = mockSession();
    const m = session.mirror;
    m.tick.value = 6 * TICKS_PER_DAY + 100;
    expect(editionFeedAlerts(m, true)).toEqual([]);
    m.evening.value = edition();
    expect(editionFeedAlerts(m, false)).toEqual([]);
    m.tick.value = 7 * TICKS_PER_DAY + 100;
    expect(editionFeedAlerts(m, true)).toEqual([]);
  });
});

describe('settings', () => {
  it('loads old stored values without the edition setting', () => {
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ uiScale: 1.2, reducedMotion: true }));
    expect(loadSettings()).toEqual({
      uiScale: 1.2,
      reducedMotion: true,
      editionInFeed: false,
      teaBreak: true,
    });
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ editionInFeed: 'yes' }));
    expect(loadSettings().editionInFeed).toBe(false);
    localStorage.setItem('qoti.settings.v1', JSON.stringify({ editionInFeed: true }));
    expect(loadSettings().editionInFeed).toBe(true);
    localStorage.setItem('qoti.settings.v1', 'not json');
    expect(loadSettings().editionInFeed).toBe(false);
  });

  it('toggles the edition in the feed and the lingering evening', async () => {
    const { session, submitted } = mockSession();
    session.ui.settingsOpen.value = true;
    view = await mount(h(SettingsPanel, { session }));
    const box = view.get('edition-in-feed') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(loadSettings().editionInFeed).toBe(true);
    // Absent means on; turning it off is sent as a valley setting.
    const lingers = view.get('evening-lingers') as HTMLInputElement;
    expect(lingers.checked).toBe(true);
    lingers.checked = false;
    lingers.dispatchEvent(new Event('change', { bubbles: true }));
    expect(submitted).toContainEqual({ t: 'valley.setSettings', settings: { eveningLingers: false } });
    expect(view.get('evening-lingers-row').textContent).toContain('half speed');
  });
});

describe('the season spread', () => {
  it('puts the cross-lane lines first, then the Hearth page, then the Ledger page', async () => {
    const { session } = mockSession();
    session.ui.almanac.value = { kind: 'report', view: mockSeasonReportCross, page: 0 };
    view = await mount(h(SeasonCardPanel, { session }));
    const html = view.get('season-report').innerHTML;
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at('report-cross')).toBeGreaterThan(-1);
    expect(at('report-cross')).toBeLessThan(at('report-hearth'));
    expect(at('report-hearth')).toBeLessThan(at('report-ledger'));
    expect(view.get('report-cross').textContent).toContain('lantern walk');
    expect(view.root.querySelectorAll('.report-cross .edition-name').length).toBeGreaterThan(0);
  });

  it('shows no empty heading when there are no cross-lane lines', async () => {
    const { session } = mockSession();
    expect(togetherLines(mockSeasonReport)).toEqual([]);
    session.ui.almanac.value = { kind: 'report', view: mockSeasonReport, page: 0 };
    view = await mount(h(SeasonCardPanel, { session }));
    expect(view.find('report-cross')).toBeNull();
    expect(view.text()).not.toContain('Between the two of you');
  });
});
