// @vitest-environment happy-dom
// R3G: the printed storybook. The pure model (chapters, seasons, pages, households), the picture seam
// that V4B's source plugs into, and the panel that lays the book out into a print root.
import { content } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type ChronicleEntryView,
  type TownBookPageView,
  type TownBookView,
  type TrialView,
} from '@qoti/sim';
import { h } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../app/session';
import type { Mirror } from '../../state/mirror';
import { mockCharter } from '../mocks/village';
import { mockVillageSession } from '../mocks/session';
import { setPictureSource, type PictureRef } from '../pictures';
import { mount, settle, type Mounted } from '../test/dom';
import {
  chapterPatternPages,
  chapterSeasons,
  chapterSpan,
  chapterTownBookPages,
  PRINT_DIM_BELOW,
  printLift,
  slotPicture,
  type StorybookChapter,
  storybookChapters,
  storyHouseholds,
  townBookOf,
} from '../storybook';
import { defaultPaper, forewordCounts, pageRules, StorybookPanel } from './Storybook';

vi.mock('../../render/endpaper', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  endpaperStill: vi.fn(() => Promise.resolve(null)),
}));

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  setPictureSource(null);
  vi.restoreAllMocks();
});

/** The tick of 06:00 on a day index (the sim clock starts at START_HOUR, so day d begins at d * TICKS_PER_DAY). */
const dayTick = (day: number) => day * TICKS_PER_DAY;
/** The tick of midnight starting a day index (before the clock's first tick for day 0). */
const midnight = (day: number) => day * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR;

const trial = (status: TrialView['status']): TrialView => ({
  kind: 'winter',
  name: 'The First Winter',
  blurb: 'Keep every home warm and fed.',
  charter: 'village',
  season: 3,
  year: 1,
  status,
  measured: [],
});

let nextId = 1000;
const entry = (tick: number, kind: string, text = kind, extra: Partial<ChronicleEntryView> = {}) =>
  ({ id: nextId++, tick, kind, text, refs: [], seats: [], ...extra }) as ChronicleEntryView;

function sessionWith(
  status: TrialView['status'] | null,
  entries: ChronicleEntryView[] = [],
  rankTick = 0,
): { session: Session; m: Mirror } {
  const { session } = mockVillageSession(0);
  const m = session.mirror;
  m.trial.value = status ? trial(status) : null;
  m.charter.value = {
    ...mockCharter,
    rank: 'village',
    next: null,
    ready: false,
    history: [{ rank: 'village', tick: rankTick, seats: [0] }],
  };
  m.chronicle.value = entries;
  m.tick.value = dayTick(20); // the village view's clock stands at 0
  m.patterns.clear();
  return { session, m };
}

const chapter = (from: number, to: number): StorybookChapter => ({
  id: 'village',
  name: 'The Village chapter',
  charter: 'village',
  from,
  to,
});

describe('storybookChapters', () => {
  it('has no chapter until the Village trial has passed', () => {
    for (const status of ['upcoming', 'running', 'failed', null] as const) {
      expect(storybookChapters(sessionWith(status).m), String(status)).toEqual([]);
    }
  });

  it('closes at the first trial-passed entry at or after the Village rank-up', () => {
    const entries = [
      entry(50, 'trial-passed'), // an earlier Charter's trial: before the rank-up
      entry(900, 'trial-passed'),
      entry(700, 'trial-passed'), // the first one at or after the rank-up
      entry(800, 'wedding'),
    ];
    const { m } = sessionWith('passed', entries, 600);
    expect(storybookChapters(m)).toEqual([
      { id: 'village', name: 'The Village chapter', charter: 'village', from: 0, to: 700 },
    ]);
  });

  it('ends at the moment it was seen when the Chronicle has no such line', () => {
    const { m } = sessionWith('passed', [entry(50, 'trial-passed')], 600);
    m.tick.value = 4321;
    expect(storybookChapters(m).map((c) => c.to)).toEqual([4321]);
  });
});

describe('chapterSeasons', () => {
  it('keeps only the chapter, both ends included, oldest first, ties by id', () => {
    const from = dayTick(2);
    const to = dayTick(9);
    const a = entry(to, 'wedding', 'last');
    const b = entry(from, 'wedding', 'first');
    const c = entry(from, 'festival', 'first-too');
    const outBefore = entry(from - 1, 'wedding');
    const outAfter = entry(to + 1, 'wedding');
    const seasons = chapterSeasons([a, outAfter, c, outBefore, b], chapter(from, to));
    const texts = seasons.flatMap((s) => s.entries.map((e) => e.text));
    expect(texts).toEqual(['first', 'first-too', 'last']);
  });

  it('puts one heading on each season', () => {
    const seasons = chapterSeasons(
      [
        entry(dayTick(0), 'wedding'),
        entry(dayTick(2), 'festival'),
        entry(dayTick(DAYS_PER_SEASON + 1), 'wedding'),
        entry(dayTick(4 * DAYS_PER_SEASON + 1), 'wedding'),
      ],
      chapter(0, dayTick(5 * DAYS_PER_SEASON)),
    );
    expect(seasons.map((s) => s.title)).toEqual(['Spring, Year 1', 'Summer, Year 1', 'Spring, Year 2']);
    expect(seasons.map((s) => s.entries.length)).toEqual([2, 1, 1]);
    expect(seasons[0]!.entries[0]!.date).toBe('Spring, day 1');
  });

  it('marks each kind, and notable follows the snapshot', () => {
    const [season] = chapterSeasons(
      [
        entry(10, 'household-arrived'),
        entry(11, 'birth'),
        entry(12, 'wishes-digest'),
        entry(13, 'wedding'),
        entry(14, 'first-of', 'x', { snapshot: { focus: [1, 2], radius: 5 } }),
      ],
      chapter(0, 100),
    );
    const e = season!.entries;
    // One body size for every entry: nothing in the model sets routine news apart.
    expect(e.every((x) => !('brief' in x))).toBe(true);
    expect(e.map((x) => x.notable)).toEqual([false, false, false, false, true]);
    expect(e[3]!.mark).toBe('Weddings');
  });
});

describe('chapterSpan', () => {
  it('reads a single season plainly', () => {
    expect(chapterSpan(chapter(0, dayTick(3)))).toBe('Spring, Year 1');
  });

  it('reads a chapter closing on a season first day as ending in the season before', () => {
    // Day 24 is the first day of Spring, Year 2: the chapter belongs to the Winter before it.
    expect(chapterSpan(chapter(0, midnight(24) + TICKS_PER_HOUR))).toBe('Spring to Winter, Year 1');
  });

  it('reads a chapter across years in full', () => {
    // Day 33 is in Summer, Year 2 (days 30 to 35), not on a first day.
    expect(chapterSpan(chapter(0, dayTick(33)))).toBe('Spring of Year 1 to Summer of Year 2');
  });
});

describe('chapterPatternPages', () => {
  it('lists discovered patterns inside the chapter, in found order, credited by name', () => {
    const [p1, p2, p3] = content.patterns;
    const { m } = sessionWith('passed', [], 0);
    const base = { hinted: false, sites: [] };
    m.patterns.set(p1!.id, { ...base, id: p1!.id, discovered: true, tick: 300, seat: 1 });
    m.patterns.set(p2!.id, { ...base, id: p2!.id, discovered: true, tick: 200, together: true });
    m.patterns.set(p3!.id, { ...base, id: p3!.id, discovered: true, tick: 5000, seat: 0 }); // after the chapter
    const rest = content.patterns[3];
    if (rest) m.patterns.set(rest.id, { ...base, id: rest.id, discovered: false });
    m.chronicle.value = [
      entry(300, 'pattern-discovered', `Ada and Bo noticed ${p1!.name}.`),
      entry(300, 'wedding', 'unrelated'),
    ];
    const pages = chapterPatternPages(m, chapter(0, 1000));
    expect(pages.map((p) => p.id)).toEqual([p2!.id, p1!.id]);
    expect(pages[0]).toMatchObject({
      name: p2!.name,
      text: p2!.flavor,
      credit: 'Ada and Bo',
      together: true,
    });
    expect(pages[0]!.chronicleId).toBeUndefined();
    expect(pages[1]).toMatchObject({ name: p1!.name, credit: 'Bo', together: false });
    expect(pages[1]!.chronicleId).toBe(m.chronicle.value[0]!.id);
    expect(pages[1]!.found).toMatch(/^Noticed in Spring, Year 1$/);
    for (const p of pages) expect(p.credit).not.toMatch(/you/i);
  });
});

describe('town book pages', () => {
  const page = (id: number, day: number, seats: number[], extra: Partial<TownBookPageView> = {}) =>
    ({
      id,
      kind: 'specialty',
      def: 'x',
      place: 'seats:1',
      name: `Page ${id}`,
      day,
      seats,
      leaning: 'hearth',
      placeName: 'Orchard Walk',
      text: 'Words.',
      together: seats.length > 1,
      ...extra,
    }) as unknown as TownBookPageView;
  const book = (pages: TownBookPageView[]): TownBookView => ({
    pages,
    hints: [],
    callings: [],
    leanings: [],
  });

  it('keeps pages by day inside the chapter, and none for a null view', () => {
    const { m } = sessionWith('passed');
    const ch = chapter(dayTick(2), dayTick(8));
    const pages = chapterTownBookPages(
      book([page(5, 1, [0]), page(4, 8, [0, 1]), page(3, 2, [1]), page(2, 9, [0])]),
      m.seats.value,
      ch,
    );
    expect(pages.map((p) => p.id)).toEqual(['3', '4']);
    expect(pages[0]).toMatchObject({ book: 'townBook', credit: 'Bo', place: 'Orchard Walk' });
    expect(pages[1]!.credit).toBe('Ada and Bo');
    expect(chapterTownBookPages(null, m.seats.value, ch)).toEqual([]);
  });

  it("reads R3D's Town Book off the mirror", () => {
    const { m } = sessionWith('passed');
    m.townBook.value = null;
    expect(townBookOf(m)).toBeNull();
    const b = book([]);
    m.townBook.value = b;
    expect(townBookOf(m)).toBe(b);
  });
});

describe('storyHouseholds', () => {
  it('orders households by id, elders first, skipping missing residents and empty households', () => {
    const { m } = sessionWith('passed');
    const proto = [...m.residents.values()][0]!;
    m.residents.clear();
    m.households.clear();
    const res = (id: number, given: string, stage: 'elder' | 'adult' | 'young' | 'child') =>
      m.residents.set(id, { ...proto, id, given, stage });
    res(31, 'Kid', 'child');
    res(32, 'Gran', 'elder');
    res(33, 'Mum', 'adult');
    res(41, 'Solo', 'adult');
    const hh = (id: number, family: string, members: number[]) =>
      m.households.set(id, { id, family, members, homeId: 1, tier: 'settler', pantryFood: 0 });
    hh(50, 'Later', [41]);
    hh(40, 'Ghosts', [999]); // nobody in the mirror
    hh(30, 'First', [31, 33, 32, 998]);
    const out = storyHouseholds(m);
    expect(out.map((x) => x.family)).toEqual(['First', 'Later']);
    expect(out[0]!.folk.map((f) => f.given)).toEqual(['Gran', 'Mum', 'Kid']);
  });
});

describe('the picture seam', () => {
  const chronicleRef: PictureRef = { book: 'chronicle', id: '7' };
  const fake = (ref: PictureRef) =>
    Promise.resolve(ref.book === 'chronicle' ? `data:image/png;base64,FAKE${ref.id}` : null);

  it('falls back to the snapshot with no source, and prefers the source once one is set', async () => {
    const snapshot = () => Promise.resolve('blob:snap');
    expect(await slotPicture(chronicleRef, snapshot)).toEqual({ url: 'blob:snap', from: 'snapshot' });
    expect(await slotPicture(chronicleRef, null)).toBeNull();

    setPictureSource(fake);
    expect(await slotPicture(chronicleRef, snapshot)).toEqual({
      url: 'data:image/png;base64,FAKE7',
      from: 'source',
    });
    expect(await slotPicture({ book: 'townBook', id: '1' }, snapshot)).toEqual({
      url: 'blob:snap',
      from: 'snapshot',
    });
  });

  it('asks the source at the slot size, and at print size for print (R3X)', async () => {
    const asked: unknown[] = [];
    setPictureSource((ref, opts) => {
      asked.push(opts);
      return fake(ref);
    });
    await slotPicture(chronicleRef, null);
    await slotPicture(chronicleRef, null, { print: true });
    // On screen the slot's size; print size only when printing.
    expect(asked).toEqual([undefined, { print: true }]);
  });

  it('sets a slot without its picture when the capture does not come (never a hang)', async () => {
    setPictureSource(() => new Promise(() => {}));
    expect(await slotPicture(chronicleRef, () => Promise.resolve('blob:snap'), { waitMs: 20 })).toEqual({
      url: 'blob:snap',
      from: 'snapshot',
    });
    expect(await slotPicture(chronicleRef, null, { waitMs: 20 })).toBeNull();
  });

  it('falls back when the source throws or the snapshot does', async () => {
    setPictureSource(() => Promise.reject(new Error('no ink today')));
    expect(await slotPicture(chronicleRef, () => Promise.resolve('blob:snap'))).toEqual({
      url: 'blob:snap',
      from: 'snapshot',
    });
    expect(await slotPicture(chronicleRef, () => Promise.reject(new Error('x')))).toBeNull();
  });

  it('prints a source picture in the book with one setPictureSource call', async () => {
    setPictureSource(fake);
    const entries = [entry(100, 'wedding', 'A wedding.'), entry(200, 'festival', 'A festival.')];
    const { session } = sessionWith('passed', entries, 0);
    // The game mounts the book because the open panel names it.
    session.ui.panel.value = 'storybook';
    view = await mount(h(StorybookPanel, { session }));
    expect(document.body.classList.contains('qoti-storybook')).toBe(true);
    for (let i = 0; i < 5; i++) {
      await settle();
      await new Promise((r) => setTimeout(r, 0));
    }
    // The print root, on <body> beside the app.
    const root = document.querySelector('div[data-testid="storybook-print"]');
    expect(root).not.toBeNull();
    const imgs = [...root!.querySelectorAll('[data-testid="storybook-entry-picture"] img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([
      `data:image/png;base64,FAKE${entries[0]!.id}`,
      `data:image/png;base64,FAKE${entries[1]!.id}`,
    ]);
    view.unmount();
    view = null;
    await settle(); // effect cleanups run after the render
    expect(document.body.classList.contains('qoti-storybook')).toBe(false);
    expect(document.querySelector('div[data-testid="storybook-print"]')).toBeNull();
  });
});

describe('the panel', () => {
  it('lets go of the print at once on every way out, before any unmount', async () => {
    const entries = [entry(100, 'wedding', 'A wedding.')];
    for (const next of [null, 'chronicle']) {
      const { session } = sessionWith('passed', entries, 0);
      session.ui.panel.value = 'storybook';
      view = await mount(h(StorybookPanel, { session }));
      expect(document.body.classList.contains('qoti-storybook')).toBe(true);
      // The close button and Escape set the panel to null; another book names itself.
      session.ui.panel.value = next;
      expect(document.body.classList.contains('qoti-storybook'), String(next)).toBe(false);
      expect(document.querySelector('div[data-testid="storybook-print"]'), String(next)).toBeNull();
      view.unmount();
      view = null;
      await settle();
    }
  });

  it('waits for a closed chapter, with no print root', async () => {
    const { session } = sessionWith('running');
    view = await mount(h(StorybookPanel, { session }));
    expect(view.text()).toContain('The storybook binds itself when a chapter closes');
    expect(document.querySelector('div[data-testid="storybook-print"]')).toBeNull();
    expect(document.body.classList.contains('qoti-storybook')).toBe(false);
  });

  it('counts what the chapter holds for the foreword', () => {
    const seasons = chapterSeasons(
      [entry(1, 'household-arrived'), entry(2, 'household-arrived'), entry(3, 'birth')],
      chapter(0, 10),
    );
    expect(forewordCounts(seasons, 1, 0)).toEqual([
      'two households move in',
      'one child is born',
      'one page of the Pattern Book is written',
    ]);
    expect(forewordCounts([], 0, 0)).toEqual([]);
  });

  it('guesses the paper from the language', () => {
    expect(defaultPaper('en-US')).toBe('letter');
    expect(defaultPaper('en-GB')).toBe('a4');
    expect(defaultPaper('de-DE')).toBe('a4');
    expect(defaultPaper(undefined)).toBe('a4');
  });

  it('writes page rules for the paper and strips quotes from the running head', () => {
    expect(pageRules('a4', 'Town')).toContain('size: A4');
    expect(pageRules('letter', 'Town')).toContain('size: letter');
    const rules = pageRules('a4', 'The "Quoted" \\ Town');
    expect(rules).toContain('content: "The Quoted  Town"');
  });
});

describe('the print lift for dark pictures', () => {
  it('leaves day and dusk alone and lifts a night gently, within bounds', () => {
    expect(printLift(null)).toBeNull();
    // The valley's own pictures: daylight 0.22 to 0.33, dusk 0.20 to 0.29.
    for (const mean of [0.33, 0.26, 0.22, 0.2, PRINT_DIM_BELOW])
      expect(printLift(mean), String(mean)).toBeNull();
    // A lamplit night, 0.11 to 0.13: lifted, the darker the more, never past 1.6.
    const light = printLift(0.13)!;
    const dark = printLift(0.11)!;
    expect(light).toBeGreaterThan(1.3);
    expect(dark).toBeGreaterThan(light);
    expect(dark).toBeLessThanOrEqual(1.6);
    expect(printLift(0)).toBe(1.6);
    // Just under the threshold the lift starts at about 1: no jump.
    expect(printLift(PRINT_DIM_BELOW - 0.001)!).toBeLessThan(1.02);
  });
});
