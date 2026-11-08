// @vitest-environment happy-dom
// P1 (playtest item 13): the Village chapter card: when it shows (only after the Village trial has
// passed, once per seat and valley), what it says, and how to read it again.
import { content } from '@qoti/content';
import type { TrialView } from '@qoti/sim';
import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../app/session';
import { chapterDone, chapterKey, chapterOpen, chapterSeen, chapterStory, markChapterSeen } from '../chapter';
import { GoalPill } from '../GoalPill';
import { mockCharter } from '../mocks/village';
import { mockVillageSession } from '../mocks/session';
import { mount, type Mounted } from '../test/dom';
import { ChapterPanel } from './Chapter';
import { CharterPanel } from './Charter';

let view: Mounted | null = null;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Not available: the tests that need it will say so.
  }
});
afterEach(() => {
  view?.unmount();
  view = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const trial = (status: TrialView['status'], charter = 'village'): TrialView => ({
  kind: 'winter',
  name: 'The First Winter',
  blurb: 'Keep every home warm and fed.',
  charter,
  season: 3,
  year: 1,
  status,
  measured: [],
});

function sessionWith(status: TrialView['status'] | null, seat: 0 | 1 = 0): Session {
  const { session } = mockVillageSession(seat);
  const m = session.mirror;
  m.trial.value = status ? trial(status) : null;
  m.charter.value = { ...mockCharter, rank: 'village', next: null, ready: false };
  return session;
}

describe('the Village chapter trigger', () => {
  it('stays closed until the Village trial has passed', async () => {
    for (const status of ['upcoming', 'running', 'failed', null] as const) {
      const session = sessionWith(status);
      view = await mount(h(ChapterPanel, { session }));
      expect(view.find('chapter'), String(status)).toBeNull();
      expect(session.ui.chapter.value).toBe(false);
      view.unmount();
    }
    // Another Charter's trial does not close this chapter.
    const other = sessionWith('passed');
    other.mirror.trial.value = trial('passed', 'town');
    expect(chapterDone(other.mirror)).toBe(false);
  });

  it('opens by itself once the trial has passed, and is remembered for the seat', async () => {
    const session = sessionWith('passed');
    expect(chapterSeen('mock', 0)).toBe(false);
    view = await mount(h(ChapterPanel, { session }));
    expect(view.find('chapter')).not.toBeNull();
    expect(chapterSeen('mock', 0)).toBe(true);
    expect(localStorage.getItem(chapterKey('mock', 0))).toBe('1');
    await view.click('chapter-close');
    expect(session.ui.chapter.value).toBe(false);
    expect(view.find('chapter')).toBeNull();
  });

  it('shows once per seat: a return visit stays quiet, the other seat still sees it', async () => {
    markChapterSeen('mock', 0);
    const again = sessionWith('passed', 0);
    view = await mount(h(ChapterPanel, { session: again }));
    expect(view.find('chapter')).toBeNull();
    view.unmount();
    const partner = sessionWith('passed', 1);
    view = await mount(h(ChapterPanel, { session: partner }));
    expect(view.find('chapter')).not.toBeNull();
  });

  it('still works when storage is blocked', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(chapterSeen('mock', 0)).toBe(false);
    expect(() => markChapterSeen('mock', 0)).not.toThrow();
    view = await mount(h(ChapterPanel, { session: sessionWith('passed') }));
    expect(view.find('chapter')).not.toBeNull();
  });

  it('can be read again from the Charter board and from the goal pill', async () => {
    markChapterSeen('mock', 0);
    const session = sessionWith('passed');
    view = await mount(h('div', null, h(CharterPanel, { session }), h(ChapterPanel, { session })));
    expect(view.find('chapter')).toBeNull();
    await view.click('open-chapter');
    expect(session.ui.chapter.value).toBe(true);
    expect(view.find('chapter')).not.toBeNull();
    await view.click('chapter-close');
    view.unmount();

    view = await mount(h('div', null, h(GoalPill, { session }), h(ChapterPanel, { session })));
    expect(view.get('goal-pill').textContent).toContain('Village chapter complete');
    await view.click('goal-pill');
    expect(session.ui.chapter.value).toBe(true);
    await view.click('goal-pill');
    expect(session.ui.chapter.value).toBe(false);
  });

  it('offers the title screen flow from the card', async () => {
    const session = sessionWith('passed');
    const calls: string[] = [];
    session.onNewValley = () => calls.push('new');
    view = await mount(h(ChapterPanel, { session }));
    await view.click('chapter-new-valley');
    expect(calls).toEqual(['new']);
    expect(session.ui.chapter.value).toBe(false);
  });
});

describe('the chapter numbers', () => {
  it('counts what the mirror holds', () => {
    const session = sessionWith('passed');
    const m = session.mirror;
    const town = { ...m.town.value!, population: 41, households: 12, wishesGranted: 9 };
    m.town.value = { ...town, festivals: { held: 3, bestStars: 4 } };
    const story = chapterStory(m);
    expect(story).toMatchObject({
      residents: 41,
      households: 12,
      wishes: 9,
      festivalsHeld: 3,
      bestStars: 4,
      founded: 'Year 1, Spring',
    });
    let plaques = 0;
    for (const a of m.achievements.values()) if (a.unlocked) plaques++;
    expect(story.plaques).toBe(plaques);
    let patterns = 0;
    for (const p of m.patterns.values()) if (p.discovered) patterns++;
    expect(story.patterns).toBe(patterns);
    expect(story.species).toBe(m.fieldGuide.size);
    const latest = [...m.chronicle.value].sort((a, b) => b.tick - a.tick)[0];
    expect(story.headline).toBe(latest ? latest.text : null);
    expect(story.homes).toBeGreaterThan(0);
  });

  it('counts what is still open against the content totals', () => {
    const session = sessionWith('passed');
    const m = session.mirror;
    m.renown.value = { points: 12, level: 1, name: 'Spoken Of', next: 30, log: [] };
    const open = chapterOpen(m);
    expect(open.renownToNext).toBe(18);
    expect(open.plaques.of).toBe(content.achievements.length);
    expect(open.species.of).toBe(content.wildlife.length);
    expect(open.patterns.of).toBe(content.patterns.length);
    m.renown.value = { points: 150, level: 5, name: 'Storied', next: null, log: [] };
    expect(chapterOpen(m).renownToNext).toBeNull();
  });

  it('says the honest things, and no em dashes', async () => {
    const session = sessionWith('passed');
    view = await mount(h(ChapterPanel, { session }));
    const text = view.get('chapter').textContent ?? '';
    expect(text).toContain('The Village chapter');
    expect(text).toContain('Town Charter comes in a later update');
    expect(text).toContain('Found a new valley');
    expect(text).toContain('Every valley');
    expect(text).not.toMatch(/—/);
  });
});
