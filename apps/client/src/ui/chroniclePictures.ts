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
