import { content } from '@qoti/content';
// @vitest-environment happy-dom
import { h } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { mockAwayLetter } from '../mocks/hamlet';
import { mockSession, mockView } from '../mocks/session';
import { button, mount, settle, type Mounted } from '../test/dom';
import { AchievementsPanel } from './Achievements';
import { AlertsPanel } from './Alerts';
import { AwayLetterPanel } from './AwayLetter';
import { ChroniclePanel, chronicleDays } from './Chronicle';
import { CustomizePanel } from './Customize';
import { PatternBookPanel } from './PatternBook';
import { ReportsPanel } from './Reports';
import { WishesPanel } from './Wishes';

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('wishes', () => {
  it('lists every wish with who, lane and time left, and highlights the target area', async () => {
    const { session, calls } = mockSession();
    view = await mount(h(WishesPanel, { session }));
    const text = view.text();
    expect(text).toContain('3 wishes open, 2 granted so far');
    expect(text).toContain('bench by the river');
    expect(text).toContain('fresh fish');
    expect(view.root.querySelectorAll('li.wish')).toHaveLength(3);
    expect(view.root.querySelectorAll('.lane-tag.ledger')).toHaveLength(1);
    await view.click('wish-40');
    expect(session.ui.wishFocus.value).toBe(40);
    expect(calls.find((c) => c.method === 'highlight')?.args[0]).toEqual({
      x: 54,
      z: 49,
      radius: 4,
      tone: 'hearth',
    });
    await view.click('wish-40');
    expect(session.ui.wishFocus.value).toBeNull();
    expect(calls.filter((c) => c.method === 'highlight').pop()?.args[0]).toBeNull();
    await view.click(view.root.querySelector('li.wish button.who')!);
    expect(session.ui.selection.value).toEqual({ kind: 'resident', id: 12 });
  });

  it('says so gently when nobody wishes for anything', async () => {
    const { session } = mockSession(mockView({ wishes: [] }));
    view = await mount(h(WishesPanel, { session }));
    expect(view.text()).toContain('Nobody is wishing for anything right now');
  });
});

describe('the Pattern Book', () => {
  it('opens on the contents: found pages, hints, and blank pages still to come', async () => {
    const { session } = mockSession();
    view = await mount(h(PatternBookPanel, { session }));
    const text = view.text();
    expect(text).toContain(`2 of ${content.patterns.length} pages written`);
    expect(view.get('page-well-gathering-place').textContent).toContain('Well Gathering Place');
    expect(view.get('page-sitting-wall').textContent).toContain('A page not yet found');
    expect((view.get('page-pocket-park') as HTMLButtonElement).disabled).toBe(true);
    expect(text).toContain('Hints in the margin');
    expect(text).toContain(content.patternById.get('sitting-wall')!.hint);
  });

  it('shows a found page with flavor, date, credit and unlocks, and a hinted one with its hint', async () => {
    const { session, calls } = mockSession();
    view = await mount(h(PatternBookPanel, { session }));
    await view.click('page-well-gathering-place');
    let page = view.get('book-page').textContent ?? '';
    expect(page).toContain('Everyone needs water');
    expect(page).toContain('Spring 3');
    expect(page).toContain('you and Bo');
    expect(page).toContain('together');
    expect(page).toContain('Curved bench');
    await view.click(button(view.root, 'Show me the first one'));
    expect(calls.find((c) => c.method === 'highlight')?.args[0]).toMatchObject({ x: 57, z: 52 });
    await view.click('book-next');
    page = view.get('book-page').textContent ?? '';
    expect(page).toContain('Tree Place');
    expect(page).toContain('by Bo');
    await view.click('page-lantern-walk');
    page = view.get('book-page').textContent ?? '';
    expect(page).toContain('Not yet found');
    expect(page).toContain(content.patternById.get('lantern-walk')!.hint);
  });
});

describe('the Chronicle', () => {
  it('groups entries by day, newest first, as a gazette', async () => {
    const { session } = mockSession();
    view = await mount(h(ChroniclePanel, { session }));
    const text = view.text();
    expect(text).toContain('The Qoti Chronicle');
    expect(text).toContain('6 entries');
    const heads = [...view.root.querySelectorAll('.gazette-day-head')].map((e) => e.textContent);
    expect(heads).toEqual(['Spring, day 3, Year 1', 'Spring, day 2, Year 1', 'Spring, day 1, Year 1']);
    expect(text.indexOf('Well Gathering Place')).toBeLessThan(text.indexOf('founded'));
    expect(chronicleDays([])).toEqual([]);
  });
});

describe('plaques', () => {
  it('shows earned plaques first, with dates and who, and the rest as outlines', async () => {
    const { session } = mockSession();
    view = await mount(h(AchievementsPanel, { session }));
    expect(view.text()).toContain('5 of 15 earned');
    expect(view.get('plaque-well-met').className).toContain('earned');
    expect(view.get('plaque-well-met').textContent).toContain('you and Bo');
    expect(view.get('plaque-balanced-books').className).toContain('waiting');
    expect(view.get('plaque-balanced-books').textContent).toContain(
      content.achievementById.get('balanced-books')!.description,
    );
  });
});

describe('reports', () => {
  it('stocks: stock, today, a sparkline and sale toggles that send ledger.setForSale', async () => {
    const { session, submitted } = mockSession();
    view = await mount(h(ReportsPanel, { session }));
    const rows = view.root.querySelectorAll('table.stocks tbody tr');
    expect(rows).toHaveLength(8);
    expect(rows[0]!.textContent).toContain('Logs');
    expect(rows[0]!.textContent).toContain('40');
    expect(rows[0]!.textContent).toContain('+8');
    expect(rows[0]!.querySelector('svg.sparkline.down')).not.toBeNull();
    expect(view.get('sell-planks').getAttribute('aria-checked')).toBe('true');
    await view.click('sell-bread');
    expect(submitted).toEqual([{ t: 'ledger.setForSale', good: 'bread', forSale: true }]);
  });

  it('workforce: jobs filled and open per workplace', async () => {
    const { session } = mockSession();
    view = await mount(h(ReportsPanel, { session }));
    await view.click('report-workforce');
    expect(view.get('workforce-summary').textContent).toContain('5 of 8 jobs filled, 3 open');
    expect(view.text()).toContain('Storehouse');
  });

  it('budget: treasury, income and expenses, today and the season', async () => {
    const { session } = mockSession();
    view = await mount(h(ReportsPanel, { session }));
    await view.click('report-budget');
    const text = view.text();
    expect(text).toContain('412 coins');
    expect(text).toContain('Peddler sales');
    expect(view.get('budget-net').textContent).toBe('16 coins');
    expect(text).toContain('Behind by');
    await view.click('budget-season');
    expect(view.get('budget-net').textContent).toBe('64 coins');
    expect((view.get('budget-lastSeason') as HTMLButtonElement).disabled).toBe(true);
  });

  it('budget: lean times read as a gentle note', async () => {
    const { session } = mockSession(
      mockView({
        budget: {
          treasury: -1200,
          leanTimes: true,
          today: [],
          yesterday: [],
          season: [],
          lastSeason: null,
        },
      }),
    );
    session.ui.reportTab.value = 'budget';
    view = await mount(h(ReportsPanel, { session }));
    expect(view.text()).toContain('-12 coins');
    expect(view.text()).toContain('Lean times');
  });

  it('buildings: what wants attention, and a click selects it', async () => {
    const { session } = mockSession();
    session.ui.reportTab.value = 'buildings';
    view = await mount(h(ReportsPanel, { session }));
    const list = view.get('building-statuses');
    expect(list.textContent).toContain('Bakery');
    expect(list.textContent).toContain('Waiting for inputs');
    expect(list.textContent).toContain('Sawpit');
    await view.click(button(list, 'Bakery'));
    expect(session.ui.selection.value).toEqual({ kind: 'building', id: 6 });
  });
});

describe('customization', () => {
  it('sends one build.customize per choice and shows it on the sketch', async () => {
    const { session, submitted } = mockSession();
    session.ui.customize.value = 6;
    view = await mount(h(CustomizePanel, { session }));
    expect(view.get('swatch-wall-butter').getAttribute('aria-checked')).toBe('true');
    await view.click('swatch-wall-rose');
    await view.click('swatch-roof-slate');
    await view.click('material-thatch');
    await view.click('detail-shutters');
    await view.click('swatch-wall-rose');
    expect(submitted).toEqual([
      { t: 'build.customize', id: 6, custom: { wall: 'rose' } },
      { t: 'build.customize', id: 6, custom: { roof: 'slate' } },
      { t: 'build.customize', id: 6, custom: { roofMaterial: 'thatch' } },
      { t: 'build.customize', id: 6, custom: { shutters: true } },
      { t: 'build.customize', id: 6, custom: { wall: null } },
    ]);
    expect(
      view.root.querySelector('svg.house-sketch rect[fill="#5e6b7a"], svg.house-sketch path[fill="#5e6b7a"]'),
    ).not.toBeNull();
  });

  it('writes the sign on Enter, trimmed to 24 characters', async () => {
    const { session, submitted } = mockSession();
    session.ui.customize.value = 6;
    view = await mount(h(CustomizePanel, { session }));
    const input = view.get('sign-input') as HTMLInputElement;
    expect(input.value).toBe('The Warm Loaf');
    input.value = '  Crumb and Daughters, Bakers to the Valley  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    await view.click(button(view.root, 'Lovely'));
    expect(submitted).toEqual([
      { t: 'build.customize', id: 6, custom: { sign: 'Crumb and Daughters, Bak' } },
    ]);
    expect(session.ui.customize.value).toBeNull();
  });

  it('homes have no sign', async () => {
    const { session } = mockSession();
    session.ui.customize.value = 3;
    view = await mount(h(CustomizePanel, { session }));
    expect(view.find('sign-input')).toBeNull();
  });
});

describe('while you were away', () => {
  it('writes a letter: days away, what changed, the news and notes left', async () => {
    const { session } = mockSession();
    session.ui.letter.value = { ...mockAwayLetter, seat: 0 };
    view = await mount(h(AwayLetterPanel, { session }));
    const text = view.text();
    expect(text).toContain('Dear Ada,');
    expect(text).toContain('You were away for 2 days');
    expect(text).toContain('Residents');
    expect(text).toContain('380');
    expect(text).toContain('412');
    expect(text).toContain('The first bread in Qoti');
    expect(text).toContain('Smells better than the sawpit');
    expect(text).toContain('Bo and the valley');
    await view.click('letter-close');
    expect(session.ui.letter.value).toBeNull();
  });
});

describe('alerts', () => {
  it('Hearth hears about new wishes and pattern hints; Ledger about idle buildings', async () => {
    const { session } = mockSession();
    session.mirror.tick.value = 2 * 4800 + 100;
    view = await mount(h(AlertsPanel, { session }));
    let text = view.text();
    expect(text).toContain('News from the lanes');
    expect(text).toContain('fresh fish');
    expect(text).toContain('3 hints in the margins of the Pattern Book');
    expect(text).not.toContain('Bakery');
    view.unmount();

    session.ui.lens.value = 'ledger';
    view = await mount(h(AlertsPanel, { session }));
    text = view.text();
    expect(text).toContain('For the books');
    expect(text).toContain('Bakery: waiting for inputs.');
    expect(text).not.toContain('fresh fish');
    await view.click(button(view.root, 'Bakery'));
    expect(session.ui.selection.value).toEqual({ kind: 'building', id: 6 });
  });

  it('warns about lean times and empty larders, and a dismissal sticks', async () => {
    const { session } = mockSession(
      mockView({
        budget: { treasury: -500, leanTimes: true, today: [], yesterday: [], season: [], lastSeason: null },
        stocks: { lines: [] },
      }),
    );
    session.ui.lens.value = 'ledger';
    view = await mount(h(AlertsPanel, { session }));
    expect(view.get('alert-lean').textContent).toContain('Lean times');
    await view.click(view.get('alert-lean').querySelector('.dismiss')!);
    expect(view.find('alert-lean')).toBeNull();
    expect(session.ui.dismissed.value.has('lean')).toBe(true);
  });

  it('stays quiet in a creative valley', async () => {
    const { session } = mockSession(mockView({ settings: { ...mockView().settings, mode: 'sandbox' } }));
    view = await mount(h(AlertsPanel, { session }));
    expect(view.find('alerts')).toBeNull();
  });
});
