// R2D: the evening edition's words, and its one line in the feed for players who would rather not
// have a card at 21:00 (UiSettings.editionInFeed). The card and the feed line read the same view.
import { MAP_SIZE, TICKS_PER_DAY, type EveningTally, type EveningView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import type { Alert } from './alerts';

/** The evening's weather in a few words, for the masthead. */
export function eveningWeatherWords(w: EveningTally['weather']): string {
  if (w === 'rain') return 'Rain on the roofs';
  if (w === 'storm') return 'A storm, and everyone indoors';
  return 'A fair evening';
}

/**
 * The tally in one short line, or null when the lines already say how many went out. Numbers, not a
 * book: who went out, the average, the friendships made.
 */
export function tallyLine(v: EveningView): string | null {
  const t = v.tally;
  if (t.grownups <= 0) return null;
  if (v.lines.some((l) => l.text.includes(`${t.out} of ${t.grownups}`))) return null;
  const avg = Math.round(t.scoreSum / t.grownups);
  const parts = [`${t.out} of ${t.grownups} went out`, `the average evening scored ${avg}`];
  if (t.friendships > 0) {
    parts.push(t.friendships === 1 ? 'one new friendship' : `${t.friendships} new friendships`);
  }
  const s = parts.join('; ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/**
 * One feed line for the last edition, in both lenses: its first line, the rest in the hover. It lives
 * for the rest of the sim day the evening closed on, and only when the player chose the feed over the
 * card.
 */
export function editionFeedAlerts(m: Mirror, inFeed: boolean): Alert[] {
  const v = m.evening.value;
  if (!inFeed || !v || v.lines.length === 0) return [];
  if (Math.floor(m.tick.value / TICKS_PER_DAY) !== v.tally.day) return [];
  const title = v.lines.map((l) => l.text).join('\n');
  const a = {
    key: `edition:${v.tally.day}`,
    tone: 'news' as const,
    icon: 'chronicle',
    text: v.lines[0]!.text,
    title,
  };
  return [
    { ...a, lens: 'hearth' },
    { ...a, lens: 'ledger' },
  ];
}

/** Where a click on an edition line goes: a tile to look at, and the place to select, if it is one. */
export interface EditionTarget {
  x: number;
  z: number;
  place?: string;
}

function at(tile: number, place?: string): EditionTarget {
  const t: EditionTarget = { x: (tile % MAP_SIZE) + 0.5, z: Math.floor(tile / MAP_SIZE) + 0.5 };
  if (place) t.place = place;
  return t;
}

/** Resolves one ref of an edition line ("<place id>", "building:<id>", "gap:<id>", "street:<id>"). */
export function editionTarget(m: Mirror, ref: string): EditionTarget | null {
  const colon = ref.indexOf(':');
  const kind = colon < 0 ? '' : ref.slice(0, colon);
  const id = Number(ref.slice(colon + 1));
  if (kind === 'building') {
    const b = m.buildings.get(id);
    return b ? { x: b.x + 0.5, z: b.z + 0.5 } : null;
  }
  if (kind === 'gap') {
    const g = m.gaps.value;
    const gap = g && [...g.open, ...g.closed].find((x) => x.id === id);
    return gap ? at(gap.tile) : null;
  }
  if (kind === 'street') {
    const st = m.streets.get(id);
    return st ? at(st.anchor) : null;
  }
  const p = m.places.get(ref);
  return p ? at(p.tile, p.id) : null;
}
