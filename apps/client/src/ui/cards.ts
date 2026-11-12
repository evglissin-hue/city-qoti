// R1 (R1C): cards wait their turn (docs/spec/17-presentation.md, The redesign's interface). Letters,
// result cards and season pages show one at a time, in the order they arrived, with a small stack at
// the corner saying how many wait. A waiting card stays mounted (hidden), so its own effects still
// run; it just never covers another. Also paper by lamplight: dusk to dawn.
import { signal } from '@preact/signals';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { Session } from '../app/session';

export interface CardKind {
  /** The overlay panel's id in the registry. */
  panel: string;
  /** True while this card wants to be read. */
  pending: (session: Session) => boolean;
  /**
   * The panel draws more than its card (the raid's live bar), so it is never hidden as a whole: it
   * asks `cardQueue` itself and shows its card only on its turn.
   */
  ownsTurn?: true;
}

// One line per card, in alphabetical order by panel id.
// prettier-ignore
export const CARDS: readonly CardKind[] = [
  { panel: 'away', pending: (s) => !!s.ui.letter.value },
  { panel: 'chapter', pending: (s) => !!s.ui.chapter.value },
  { panel: 'festival-result', pending: (s) => !!s.ui.festivalCard.value },
  { panel: 'raid', pending: (s) => !!s.ui.raidCard.value, ownsTurn: true },
  { panel: 'rankup', pending: (s) => !!s.ui.rankUp.value },
  { panel: 'season-card', pending: (s) => !!s.ui.almanac.value },
  { panel: 'story-letter', pending: (s) => !!s.ui.storyLetter.value },
];

export const CARD_PANELS: ReadonlySet<string> = new Set(CARDS.map((c) => c.panel));
const OWN_TURN: ReadonlySet<string> = new Set(CARDS.filter((c) => c.ownsTurn).map((c) => c.panel));

/**
 * Whether GameUI keeps an overlay panel mounted but hidden: a card that is not at the front (unless
 * it handles its own turn), and the guide while any card is up.
 */
export function waitsBehind(id: string, front: string | undefined): boolean {
  if (id === 'guide') return !!front;
  return CARD_PANELS.has(id) && !OWN_TURN.has(id) && id !== front;
}

/**
 * When each pending card first showed up, so the queue keeps arrival order. Kept per session (a
 * WeakMap), and a card that is closed forgets its place.
 */
const arrivals = new WeakMap<object, { next: number; at: Map<string, number> }>();

/** The cards waiting to be read, oldest first; the first one is the one on show. */
export function cardQueue(session: Session): string[] {
  let book = arrivals.get(session);
  if (!book) {
    book = { next: 0, at: new Map() };
    arrivals.set(session, book);
  }
  const pending: string[] = [];
  for (const c of CARDS) {
    if (c.pending(session)) {
      if (!book.at.has(c.panel)) book.at.set(c.panel, book.next++);
      pending.push(c.panel);
    } else book.at.delete(c.panel);
  }
  const at = book.at;
  return pending.sort((a, b) => at.get(a)! - at.get(b)!);
}

/** "1 more waiting", "3 more waiting". */
export function waitingWords(n: number): string {
  return `${n} more waiting`;
}

/** Dusk to dawn, as the valley's light has it: 19:30 until 06:00. */
export function lamplitHour(hour: number): boolean {
  return hour >= 19.5 || hour < 6;
}

/** Debug only: the renderer's debug hour pins the paper's light too (null follows the clock). */
export const lampOverride = signal<boolean | null>(null);

export function lamplit(tick: number): boolean {
  if (lampOverride.value !== null) return lampOverride.value;
  return lamplitHour((((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_HOUR);
}
