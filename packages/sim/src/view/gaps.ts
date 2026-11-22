// R2 (R2.0): the gaps' views (docs/spec/19-evenings.md, Gaps): what each reads like and what would
// close it, for the left feed and the paper tags. R2C owns this file.
import { content } from '@qoti/content';
import type { Building, Gap, GapsView, GapView, SeatId, WorldState } from '../contracts';
import { findById } from '../state/entities';
import { placeState, shownName } from '../state/evenings';
import { listJoin, seatName } from '../systems/chronicle/text';
import { shortGapWords } from '../systems/supplies/gapChecks';
import { fillText } from './hamlet';

/**
 * An outlet as the edition and the gaps call it: "the Underbank shop" for a business with a keeper
 * (the family on the sign), else "the market stall", "the tavern".
 */
export function outletName(state: WorldState, b: Building): string {
  const def = content.buildingById.get(b.def);
  const what = (
    (b.trade ? content.tradeById.get(b.trade)?.name : undefined) ??
    def?.name ??
    b.def
  ).toLowerCase();
  const keeper = b.keeperId ? findById(state.residents, b.keeperId) : undefined;
  return keeper ? `the ${keeper.family} ${what}` : `the ${what}`;
}

/** What a gap's subject is called in its words: the place's name, the shop's, the street's. */
function subjectName(state: WorldState, subject: string): string {
  if (subject.startsWith('building:')) {
    const b = findById(state.buildings, Number(subject.slice(9)));
    return b ? outletName(state, b) : 'a shop';
  }
  if (subject.startsWith('street:')) {
    const s = findById(state.streets, Number(subject.slice(7)));
    return s ? shownName(s) : 'a street';
  }
  const row = placeState(state, subject);
  return row ? shownName(row) : 'a place';
}

/** "nobody", "one soul", "3 folk": a count of people that reads well at zero. */
export function folkText(n: number): string {
  return n <= 0 ? 'nobody' : n === 1 ? 'one soul' : `${n} folk`;
}

/** Seats by name: "Kat", "Kat and Sam" (a seat that has left keeps its name in state.seats). */
export function seatNames(state: WorldState, seats: readonly SeatId[]): string {
  return listJoin(seats.map((s) => seatName(state, s)));
}

/** A capital first letter, for a name that opens a sentence ("the bench by..." becomes "The bench by..."). */
export function capitalized(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text;
}

function fillGap(state: WorldState, raw: string, gap: Gap): string {
  const name = subjectName(state, gap.subject);
  // The fourth gap's own words (R3A): the good, how often, and what the town makes of it.
  const words = gap.kind === 'shortOfSupplies' ? shortGapWords(state, gap) : { good: '', when: '', makes: 0 };
  const text = fillText(raw, [
    ['good', words.good],
    ['when', words.when],
    ['makes', String(words.makes)],
    ['place', name],
    ['shop', name],
    ['street', name],
    ['n', String(gap.n)],
    ['folk', folkText(gap.n)],
    ['closers', seatNames(state, gap.closers ?? [])],
  ]);
  return capitalized(text);
}

/**
 * The evening edition's line for a gap closed (content.gaps' `closed`, crediting the closers by name;
 * `closedQuiet` when nobody was credited, the place having been credited this season).
 */
export function gapClosedText(state: WorldState, gap: Gap): string {
  const def = content.gapByKind.get(gap.kind);
  const credited = (gap.closers ?? []).length > 0;
  const raw = credited ? def?.closed : def?.closedQuiet;
  return fillGap(state, raw ?? `${subjectName(state, gap.subject)}: a gap closed.`, gap);
}

/** A gap in words (content.gaps), its placeholders filled. */
export function gapView(state: WorldState, gap: Gap): GapView {
  const def = content.gapByKind.get(gap.kind);
  const raw = def?.text[gap.id % Math.max(1, def.text.length)] ?? gap.kind;
  const view: GapView = {
    id: gap.id,
    kind: gap.kind,
    subject: gap.subject,
    tile: gap.tile,
    lane: def?.lane ?? 'hearth',
    text: fillGap(state, raw, gap),
    closes: def?.closes ?? '',
    openedDay: gap.openedDay,
    n: gap.n,
  };
  if (gap.closedDay !== undefined) view.closedDay = gap.closedDay;
  if (gap.closers) view.closers = [...gap.closers];
  return view;
}

/** `gaps.updated` and the snapshot. */
export function gapsView(state: WorldState): GapsView {
  return {
    open: state.gaps.open.map((g) => gapView(state, g)),
    closed: state.gaps.closed.map((g) => gapView(state, g)),
    closedCount: state.gaps.closedCount,
    closedBySeat: [...state.gaps.closedBySeat],
  };
}
