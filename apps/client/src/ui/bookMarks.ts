// P3B: the Books shelf marks a book with something new or waiting in it. One line per book that
// has a mark, alphabetical; a book without a line here simply shows no mark.
import type { Session } from '../app/session';
import { letterKey } from './letters';

export interface BookMark {
  /** How many, for the dot on the Books button. */
  count: number;
  /** The words beside the book's name on the shelf ("2 new"). */
  words: string;
}

type MarkReader = (session: Session) => BookMark | null;

const counted = (count: number, words: string): BookMark | null => (count > 0 ? { count, words } : null);

// prettier-ignore
export const bookMarks: ReadonlyMap<string, MarkReader> = new Map<string, MarkReader>([
  ['letters', (s) => counted(s.mirror.letters.value.filter((l) => l.tick >= 0 && !s.ui.lettersRead.value.has(letterKey(l))).length, 'new')],
  ['patterns', (s) => counted([...s.mirror.patterns.values()].filter((p) => p.hinted && !p.discovered).length, 'hinted')],
  ['wishes', (s) => counted(s.mirror.wishes.size, 'waiting')],
]);

/** The mark for one book, or null. */
export function bookMark(session: Session, id: string): BookMark | null {
  const m = bookMarks.get(id)?.(session) ?? null;
  return m ? { count: m.count, words: `${m.count} ${m.words}` } : null;
}
