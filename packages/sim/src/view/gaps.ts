// R2 (R2.0): the gaps' views (docs/spec/19-evenings.md, Gaps): what each reads like and what would
// close it, for the left feed and the paper tags. R2C owns this file.
import { content } from '@qoti/content';
import type { Gap, GapsView, GapView, WorldState } from '../contracts';
import { findById } from '../state/entities';
import { placeState, shownName } from '../state/evenings';
import { fillText } from './hamlet';

/** What a gap's subject is called in its words: the place's name, the shop's, the street's. */
function subjectName(state: WorldState, subject: string): string {
  if (subject.startsWith('building:')) {
    const b = findById(state.buildings, Number(subject.slice(9)));
    return b ? (content.buildingById.get(b.def)?.name ?? b.def) : 'A shop';
  }
  if (subject.startsWith('street:')) {
    const s = findById(state.streets, Number(subject.slice(7)));
    return s ? shownName(s) : 'A street';
  }
  const row = placeState(state, subject);
  return row ? shownName(row) : 'A place';
}

/** A gap in words (content.gaps), its placeholders filled. */
export function gapView(state: WorldState, gap: Gap): GapView {
  const def = content.gapByKind.get(gap.kind);
  const name = subjectName(state, gap.subject);
  const raw = def?.text[gap.id % Math.max(1, def.text.length)] ?? gap.kind;
  const view: GapView = {
    id: gap.id,
    kind: gap.kind,
    subject: gap.subject,
    tile: gap.tile,
    lane: def?.lane ?? 'hearth',
    text: fillText(raw, [
      ['place', name],
      ['shop', name],
      ['street', name],
      ['n', String(gap.n)],
    ]),
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
