// R3G: the storybook of the valley, the pure part. When a chapter closes (a sealed Charter; today the
// Village chapter, its First Winter weathered), the Storybook panel lays the chapter out for the
// browser's print dialog. Everything here is read from the Mirror the client already holds (the
// Chronicle, the Pattern Book, the Town Book, the residents and the Charter's history): nothing about
// the storybook is sim state, and nothing here reads the sim.
//
// Pictures come through one seam (`ui/pictures.ts`): `pictureFor` first, so V4B's ink-and-wash
// source drops in with its one `setPictureSource` call, then the valley's own Chronicle snapshot
// where one exists (the panel's fallback, not a registered source), else none.
import { content } from '@qoti/content';
import {
  calendar,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  SEASON_NAMES,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type ChronicleEntryView,
  type EntityId,
  type SeatView,
  type TownBookPageView,
  type TownBookView,
} from '@qoti/sim';
import type { ReadonlySignal } from '@preact/signals';
import type { Mirror } from '../state/mirror';
import { chapterDone, CHAPTER_CHARTER } from './chapter';
import { pictureFor, type PictureRef } from './pictures';

/** A chapter of the valley's story: from one sealed Charter (or the founding) to the next. */
export interface StorybookChapter {
  id: string;
  /** "The Village chapter". */
  name: string;
  /** The Charter whose sealing closed it. */
  charter: string;
  /** First and last tick the chapter covers, both included. */
  from: number;
  to: number;
}

/** One Chronicle entry as the storybook prints it. */
export interface StoryEntry {
  id: EntityId;
  tick: number;
  kind: string;
  text: string;
  /** "Spring, day 3". */
  date: string;
  /** The gazette's small heading for the kind ("Firsts"), or null. */
  mark: string | null;
  /** The sim marked it as notable: a snapshot may have been taken of it. */
  notable: boolean;
}

/** A season's worth of entries under one heading. */
export interface StorySeason {
  /** year * 4 + season, for keys and order. */
  key: number;
  /** "Spring, Year 1". */
  title: string;
  entries: StoryEntry[];
}

/** A Pattern Book or Town Book page found in the chapter. */
export interface StoryPage {
  book: 'patternBook' | 'townBook';
  id: string;
  name: string;
  text: string;
  /** "Found in Summer, Year 1" (or "Noticed..." for patterns). */
  found: string;
  /** "Ada and Bo", or null when nobody is credited. */
  credit: string | null;
  together: boolean;
  /** Where it was found, for a Town Book page ("Orchard Walk"). */
  place?: string;
  /** The Chronicle entry written when it was found, whose snapshot can stand in for its picture. */
  chronicleId?: EntityId;
}

/** A household as the portraits page groups it. */
export interface StoryHousehold {
  id: EntityId;
  family: string;
  folk: { id: EntityId; given: string; species: string; look: number; stage: string; moodBand: number }[];
}

/**
 * The gazette's kind headings (the Chronicle panel's, with the later kinds the sim writes). Kinds
 * without a line print without a heading.
 */
// prettier-ignore
export const STORY_MARK: ReadonlyMap<string, string> = new Map([
  ['achievement', 'Plaques'],
  ['birth', 'Births'],
  ['circus', 'Visitors'],
  ['cold-snap', 'Weather'],
  ['commission-done', 'Commissions'],
  ['first-frost', 'Weather'],
  ['first-of', 'Firsts'],
  ['first-sighting', 'Nature notes'],
  ['first-winter', 'Winter'],
  ['festival', 'Festivities'],
  ['flood', 'High water'],
  ['founding', 'Founded'],
  ['household-arrived', 'Arrivals'],
  ['household-left', 'Farewells'],
  ['pattern-discovered', 'The Pattern Book'],
  ['raid', 'The Watch'],
  ['raid-lost', 'The Watch'],
  ['rank-up', 'Proclaimed'],
  ['renown-level', 'Renown'],
  ['seaside', 'Visitors'],
  ['season-summary', 'The season'],
  ['shop-opened', 'Shops'],
  ['sighting', 'Nature notes'],
  ['species-sighted', 'Nature notes'],
  ['story-arrived', 'Stories'],
  ['story-finale', 'Stories'],
  ['trial', 'The County'],
  ['trial-failed', 'The County'],
  ['trial-passed', 'The County'],
  ['wedding', 'Weddings'],
  ['wishes-digest', 'Wishes'],
  ['wolves', 'The Watch'],
]);

/** The Charters whose sealing closes a chapter, in order, with the chapter's name. */
const CHAPTERS: readonly { charter: string; name: string }[] = [
  { charter: CHAPTER_CHARTER, name: 'The Village chapter' },
];

/** The day index of a tick, as the sim counts days (the clock starts at START_HOUR). */
export function dayOfTick(tick: number): number {
  return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

/** "Spring, Year 1" for a day index. */
export function seasonOfDay(day: number): string {
  const year = 1 + Math.floor(day / DAYS_PER_YEAR);
  const season = Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_SEASON);
  return `${SEASON_NAMES[season]}, Year ${year}`;
}

function seasonKey(tick: number): number {
  const c = calendar(tick);
  return c.year * 4 + c.season;
}

/**
 * The chapters that have closed, oldest first. The Village chapter runs from the founding to the day
 * the County sealed the Village Charter (the Chronicle's "trial-passed" entry after the town became a
 * Village; the moment it was seen, if the Chronicle has no such line).
 */
export function storybookChapters(m: Mirror): StorybookChapter[] {
  const out: StorybookChapter[] = [];
  if (!chapterDone(m)) return out;
  let from = 0;
  for (const c of CHAPTERS) {
    if (c.charter !== CHAPTER_CHARTER) continue; // Later Charters' chapters come with I4.
    const rankAt = m.charter.value?.history.find((h) => h.rank === c.charter)?.tick ?? 0;
    let to = -1;
    for (const e of m.chronicle.value) {
      if (e.kind === 'trial-passed' && e.tick >= rankAt && (to < 0 || e.tick < to)) to = e.tick;
    }
    if (to < 0) to = m.tick.value;
    out.push({ id: c.charter, name: c.name, charter: c.charter, from, to });
    from = to + 1;
  }
  return out;
}

/** The chapter's Chronicle, oldest first, under a heading a season. */
export function chapterSeasons(entries: readonly ChronicleEntryView[], ch: StorybookChapter): StorySeason[] {
  const list = entries
    .filter((e) => e.tick >= ch.from && e.tick <= ch.to)
    .slice()
    .sort((a, b) => a.tick - b.tick || a.id - b.id);
  const seasons: StorySeason[] = [];
  for (const e of list) {
    const key = seasonKey(e.tick);
    let s = seasons[seasons.length - 1];
    if (!s || s.key !== key) {
      const c = calendar(e.tick);
      s = { key, title: `${SEASON_NAMES[c.season]}, Year ${c.year}`, entries: [] };
      seasons.push(s);
    }
    const c = calendar(e.tick);
    s.entries.push({
      id: e.id,
      tick: e.tick,
      kind: e.kind,
      text: e.text,
      date: `${SEASON_NAMES[c.season]}, day ${c.day}`,
      mark: STORY_MARK.get(e.kind) ?? null,
      notable: !!e.snapshot,
    });
  }
  return seasons;
}

/** A seat by name for the printed page: never "you", since the book outlives the session. */
export function seatName(seats: readonly SeatView[], seat: number): string {
  return seats.find((s) => s.seat === seat)?.name || `Player ${seat + 1}`;
}

function credit(seats: readonly SeatView[], list: readonly number[]): string | null {
  const names = [...new Set(list)].map((s) => seatName(seats, s));
  return names.length ? names.join(' and ') : null;
}

/** The Pattern Book's pages noticed in the chapter, in the order they were found. */
export function chapterPatternPages(m: Mirror, ch: StorybookChapter): StoryPage[] {
  const seats = m.seats.value;
  const found = [...m.patterns.values()]
    .filter((p) => p.discovered && p.tick !== undefined && p.tick >= ch.from && p.tick <= ch.to)
    .sort((a, b) => a.tick! - b.tick! || (a.id < b.id ? -1 : 1));
  const entries = m.chronicle.value;
  return found.map((p) => {
    const def = content.patterns.find((d) => d.id === p.id);
    const name = def?.name ?? p.id;
    // The line written when it was noticed: the same tick, and it names the page.
    const entry = entries.find(
      (e) => e.kind === 'pattern-discovered' && e.tick === p.tick && e.text.includes(name),
    );
    const together = !!p.together;
    return {
      book: 'patternBook',
      id: p.id,
      name,
      text: def?.flavor ?? '',
      found: `Noticed in ${seasonOfDay(dayOfTick(p.tick!))}`,
      credit: together ? credit(seats, [0, 1]) : p.seat === undefined ? null : seatName(seats, p.seat),
      together,
      ...(entry ? { chronicleId: entry.id } : {}),
    };
  });
}

/** The Town Book's pages found in the chapter, in the order they were found. */
export function chapterTownBookPages(
  book: TownBookView | null,
  seats: readonly SeatView[],
  ch: StorybookChapter,
): StoryPage[] {
  if (!book) return [];
  const last = dayOfTick(ch.to);
  const first = dayOfTick(ch.from);
  return book.pages
    .filter((p) => p.day >= first && p.day <= last)
    .slice()
    .sort((a, b) => a.day - b.day || a.id - b.id)
    .map((p: TownBookPageView) => ({
      book: 'townBook',
      id: String(p.id),
      name: p.name,
      text: p.text,
      found: `Found in ${seasonOfDay(p.day)}`,
      credit: credit(seats, p.seats),
      together: p.together,
      place: p.placeName,
    }));
}

/**
 * The Town Book as the Mirror holds it. R3D adds `mirror.townBook` (a signal of `TownBookView`); until
 * it lands, and in a valley that has found nothing, there is none.
 */
export function townBookOf(m: Mirror): TownBookView | null {
  const sig = (m as unknown as { townBook?: ReadonlySignal<TownBookView | null> }).townBook;
  return sig?.value ?? null;
}

/** Everyone in town by household, households in the order they arrived, elders first within one. */
export function storyHouseholds(m: Mirror): StoryHousehold[] {
  const order: Record<string, number> = { elder: 0, adult: 1, young: 2, child: 3 };
  const out: StoryHousehold[] = [];
  const households = [...m.households.values()].sort((a, b) => a.id - b.id);
  for (const h of households) {
    const folk = h.members
      .map((id) => m.residents.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => (order[a.stage] ?? 1) - (order[b.stage] ?? 1) || a.id - b.id)
      .map((r) => ({
        id: r.id,
        given: r.given,
        species: r.species,
        look: r.look,
        stage: r.stage,
        moodBand: r.moodBand,
      }));
    if (folk.length) out.push({ id: h.id, family: h.family, folk });
  }
  return out;
}

/** What a picture slot shows: a URL and where it came from, or nothing (an empty frame). */
export interface SlotPicture {
  url: string;
  from: 'source' | 'snapshot';
  /** A brightness factor for print, when the picture is too dark for white paper (`printLift`). */
  lift?: number;
}

/**
 * Mean light (0 to 1) at or above which a picture prints as it is. Measured on the valley's own
 * pictures: daylight 0.22 to 0.33, dusk 0.20 to 0.29, a lamplit night 0.11 to 0.13, so only nights
 * are lifted.
 */
export const PRINT_DIM_BELOW = 0.18;
/** A dark picture is lifted toward the threshold's light (so the lift starts at 1, with no jump). */
const PRINT_LIFT_TO = PRINT_DIM_BELOW;
const PRINT_LIFT_MAX = 1.6;

/**
 * How much to brighten a picture for print, from its mean light (0 to 1): null when it is light
 * enough, else a gentle lift toward an evening that still reads on white paper, never more than
 * PRINT_LIFT_MAX, so a night stays a night.
 */
export function printLift(mean: number | null): number | null {
  if (mean === null || !Number.isFinite(mean) || mean >= PRINT_DIM_BELOW) return null;
  const want = PRINT_LIFT_TO / Math.max(mean, 0.01);
  return Math.round(Math.min(PRINT_LIFT_MAX, Math.max(1, want)) * 100) / 100;
}

/**
 * The picture for a slot: the registered source's first (V4B's ink and wash), then the valley's own
 * Chronicle snapshot through `snapshot` (the panel's fallback), else null. Never throws.
 */
export async function slotPicture(
  ref: PictureRef,
  snapshot: (() => Promise<string | null>) | null,
): Promise<SlotPicture | null> {
  const url = await pictureFor(ref);
  if (url) return { url, from: 'source' };
  if (!snapshot) return null;
  try {
    const shot = await snapshot();
    return shot ? { url: shot, from: 'snapshot' } : null;
  } catch {
    return null;
  }
}

/** "Year 1, Spring to Year 1, Winter": the span of a chapter in words. */
export function chapterSpan(ch: StorybookChapter): string {
  const a = calendar(ch.from);
  // A Charter is sealed as its trial's season ends: a chapter closing on a season's first day belongs
  // to the season before it ("Spring to Winter, Year 1", not "to Spring of Year 2").
  const last = dayOfTick(ch.to) - (calendar(ch.to).day === 1 && ch.to > ch.from ? 1 : 0);
  const b = {
    year: 1 + Math.floor(last / DAYS_PER_YEAR),
    season: Math.floor((last % DAYS_PER_YEAR) / DAYS_PER_SEASON),
  };
  if (a.year === b.year) {
    return a.season === b.season
      ? `${SEASON_NAMES[a.season]}, Year ${a.year}`
      : `${SEASON_NAMES[a.season]} to ${SEASON_NAMES[b.season]}, Year ${a.year}`;
  }
  return `${SEASON_NAMES[a.season]} of Year ${a.year} to ${SEASON_NAMES[b.season]} of Year ${b.year}`;
}
