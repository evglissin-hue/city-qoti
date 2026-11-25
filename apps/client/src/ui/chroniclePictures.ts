// V4X: a Chronicle picture belongs to its entry's place and moment, and is never the same picture
// twice in a row. No picture is better than a wrong one, so a repeat is dropped, not swapped.
import { TICKS_PER_DAY, type ChronicleEntryView } from '@qoti/sim';

/** Two aims are the same place when their focus is within this many tiles... */
export const SAME_FOCUS = 1.5;
/** ...and their radius within this many. */
export const SAME_RADIUS = 2;

function sameAim(a: ChronicleEntryView, b: ChronicleEntryView): boolean {
  const s = a.snapshot;
  const t = b.snapshot;
  if (!s || !t) return false;
  if (Math.floor(a.tick / TICKS_PER_DAY) !== Math.floor(b.tick / TICKS_PER_DAY)) return false;
  return (
    Math.abs(s.focus[0] - t.focus[0]) <= SAME_FOCUS &&
    Math.abs(s.focus[1] - t.focus[1]) <= SAME_FOCUS &&
    Math.abs(s.radius - t.radius) <= SAME_RADIUS
  );
}

/**
 * The pictures to show, from the entries in display order (newest day first, as the panel lists them)
 * and every picture this device holds. A picture is dropped when it repeats the one shown under the
 * previous entry that has a picture: the same URL, or the same aim written within the same game day.
 * Entries without a picture in between do not break the comparison.
 */
export function chroniclePictures(
  entries: readonly ChronicleEntryView[],
  pictures: ReadonlyMap<number, string>,
): Map<number, string> {
  const shown = new Map<number, string>();
  let last: { entry: ChronicleEntryView; url: string } | null = null;
  for (const e of entries) {
    const url = pictures.get(e.id);
    if (!url) continue;
    if (last && (last.url === url || sameAim(last.entry, e))) continue;
    shown.set(e.id, url);
    last = { entry: e, url };
  }
  return shown;
}

/** A Town Book page as the picture rule needs it. */
interface PagePlace {
  id: number;
  place: string;
  day: number;
}

/**
 * R3X: the Town Book pages that get a picture. A page's picture is its place, so two pages at one
 * place would show the same view: the first found there (by day, then id) gets it, and a later one
 * shows its framed name instead of a repeat.
 */
export function townBookPictured(pages: readonly PagePlace[]): Set<number> {
  const first = new Map<string, PagePlace>();
  for (const p of pages) {
    const have = first.get(p.place);
    if (!have || p.day < have.day || (p.day === have.day && p.id < have.id)) first.set(p.place, p);
  }
  return new Set([...first.values()].map((p) => p.id));
}

/** A slot in a printed book, in book order. */
export interface BookSlot<P extends { url: string }> {
  key: string;
  picture: P | null;
  /** A Chronicle entry's slot. */
  entry?: ChronicleEntryView;
  /** A Town Book page's slot: whether the page gets a picture (`townBookPictured`). */
  pictured?: boolean;
}

/**
 * R3X: a printed book never shows one picture twice. In book order a slot's picture is left out (the
 * slot prints its framed name) when an earlier slot printed the same URL, when it is a Chronicle
 * picture `chroniclePictures` drops (the same aim within one game day as the one above it), or when
 * it is a Town Book page whose place an earlier page pictures.
 */
export function oncePerBook<P extends { url: string }>(slots: readonly BookSlot<P>[]): Map<string, P | null> {
  const entries = slots.flatMap((s) => (s.entry ? [s.entry] : []));
  const urls = new Map<number, string>();
  for (const s of slots) if (s.entry && s.picture) urls.set(s.entry.id, s.picture.url);
  const shown = chroniclePictures(entries, urls);
  const printed = new Set<string>();
  const out = new Map<string, P | null>();
  for (const s of slots) {
    const p = s.picture;
    const keep = !!p && !printed.has(p.url) && (!s.entry || shown.has(s.entry.id)) && s.pictured !== false;
    out.set(s.key, keep ? p : null);
    if (keep) printed.add(p.url);
  }
  return out;
}
