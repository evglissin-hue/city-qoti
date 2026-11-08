// P1 (playtest item 13): the Village chapter. When the First Winter trial of the Village Charter has
// passed, each seat sees a card once with the story so far, what is still open and the way to a new
// valley. This file is the pure part: when the chapter is done, whether a seat has seen it, and the
// numbers on the card, all from what the mirror already has.
import { content } from '@qoti/content';
import { calendar, SEASON_NAMES, type RankId } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { RANK_WORD } from './village';

/** The Charter whose first winter closes the chapter. */
export const CHAPTER_CHARTER = 'village';

/** The Village chapter is complete: standard valley, and its First Winter has been weathered. */
export function chapterDone(m: Mirror): boolean {
  const t = m.trial.value;
  return (
    m.settings.value.mode === 'standard' && !!t && t.status === 'passed' && t.charter === CHAPTER_CHARTER
  );
}

/** Where a seat's "I have seen the chapter" lives, per valley and seat. */
export function chapterKey(valleyId: string, seat: number): string {
  return `qoti.chapter.v1.${valleyId}.${seat}`;
}

export function chapterSeen(valleyId: string, seat: number): boolean {
  try {
    return localStorage.getItem(chapterKey(valleyId, seat)) === '1';
  } catch {
    return false;
  }
}

export function markChapterSeen(valleyId: string, seat: number): void {
  try {
    localStorage.setItem(chapterKey(valleyId, seat), '1');
  } catch {
    // Storage blocked: the card may come back next visit, which is harmless.
  }
}

export interface ChapterStory {
  town: string;
  valley: string;
  rank: RankId;
  /** "Year 1, Spring". */
  founded: string;
  now: string;
  residents: number;
  households: number;
  homes: number;
  festivalsHeld: number;
  bestStars: number;
  species: number;
  patterns: number;
  plaques: number;
  wishes: number;
  renownName: string;
  renownPoints: number;
  /** One recent Chronicle line, or null in an empty Chronicle. */
  headline: string | null;
}

export interface ChapterOpen {
  /** Renown points to the next level, or null at the top. */
  renownToNext: number | null;
  renownNext: string | null;
  plaques: { have: number; of: number };
  species: { have: number; of: number };
  patterns: { have: number; of: number };
  commissionsOpen: number;
  commissionsDone: number;
}

function dateWords(tick: number): string {
  const c = calendar(tick);
  return `Year ${c.year}, ${SEASON_NAMES[c.season]}`;
}

/** Homes standing: built buildings that house households. */
export function homesStanding(m: Mirror): number {
  let n = 0;
  for (const b of m.buildings.values()) {
    if (b.stage === 'built' && content.buildingById.get(b.def)?.housing) n++;
  }
  return n;
}

/** The number on the card for each thing the town has done. */
export function chapterStory(m: Mirror): ChapterStory {
  const town = m.town.value;
  const settings = m.settings.value;
  const chronicle = m.chronicle.value;
  let latest = null as (typeof chronicle)[number] | null;
  for (const e of chronicle) if (!latest || e.tick >= latest.tick) latest = e;
  const renown = m.renown.value;
  let plaques = 0;
  for (const a of m.achievements.values()) if (a.unlocked) plaques++;
  let patterns = 0;
  for (const p of m.patterns.values()) if (p.discovered) patterns++;
  return {
    town: settings.townName,
    valley: settings.valleyName,
    rank: town?.rank ?? 'hamlet',
    founded: dateWords(0),
    now: dateWords(m.tick.value),
    residents: town?.population ?? m.residents.size,
    households: town?.households ?? m.households.size,
    homes: homesStanding(m),
    festivalsHeld: town?.festivals?.held ?? 0,
    bestStars: town?.festivals?.bestStars ?? 0,
    species: m.fieldGuide.size,
    patterns,
    plaques,
    wishes: town?.wishesGranted ?? 0,
    renownName: renown?.name ?? 'Unknown',
    renownPoints: renown?.points ?? 0,
    headline: latest ? latest.text : null,
  };
}

/** What is still open after the chapter, with counts. */
export function chapterOpen(m: Mirror): ChapterOpen {
  const story = chapterStory(m);
  const renown = m.renown.value;
  const next = renown?.next ?? null;
  const nextName = renown ? (content.renown.find((r) => r.level === renown.level + 1)?.name ?? null) : null;
  let open = 0;
  let done = 0;
  for (const c of m.commissions.values()) {
    if (c.status === 'offered' || c.status === 'accepted') open++;
    else if (c.status === 'done') done++;
  }
  return {
    renownToNext: next === null ? null : Math.max(0, next - story.renownPoints),
    renownNext: next === null ? null : nextName,
    plaques: { have: story.plaques, of: content.achievements.length },
    species: { have: story.species, of: content.wildlife.length },
    patterns: { have: story.patterns, of: content.patterns.length },
    commissionsOpen: open,
    commissionsDone: done,
  };
}

export function rankWord(rank: RankId): string {
  return RANK_WORD[rank];
}
