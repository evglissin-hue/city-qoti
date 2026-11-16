// The gaps' cross-track API (docs/build/r2-wave-notes.md, Cross-track APIs). Signatures fixed by
// R2.0; R2C owns the bodies and the rules that call them.
import { PLACE_EVENINGS } from '../../constants';
import type { Gap, GapKind, SeatId, TickCtx, WorldState } from '../../contracts';
import { dayIndex } from '../economy/time';

/** The open gap of this kind about this subject, if any. */
export function findGap(state: WorldState, kind: GapKind, subject: string): Gap | undefined {
  return state.gaps.open.find((g) => g.kind === kind && g.subject === subject);
}

/**
 * Opens a gap, or refreshes the number of the one already open about the same subject (gaps are
 * deduped by kind and subject). Returns the open gap.
 *
 * R2 stand-in (R2C): no gaps.updated yet; R2C emits it (and checks rank, the rules and the words).
 */
export function openGap(
  state: WorldState,
  _ctx: TickCtx | null,
  kind: GapKind,
  subject: string,
  tile: number,
  n: number,
): Gap {
  const open = findGap(state, kind, subject);
  if (open) {
    open.n = n;
    return open;
  }
  const gap: Gap = { id: state.nextId++, kind, subject, tile, openedDay: dayIndex(state.tick), n };
  state.gaps.open.push(gap);
  return gap;
}

/**
 * Closes an open gap, crediting `closers` (the seat whose piece closed it; both when both laid it).
 * A subject already credited this season (`gaps.credited`) closes with no credit, so nothing is
 * gained by pulling a stall down and putting it back. Closed gaps stay listed PLACE_EVENINGS days.
 *
 * R2 stand-in (R2C): no gaps.updated yet; R2C decides who the closers are and emits it.
 */
export function closeGap(state: WorldState, _ctx: TickCtx | null, gap: Gap, closers: SeatId[]): void {
  const at = state.gaps.open.indexOf(gap);
  if (at < 0) return;
  state.gaps.open.splice(at, 1);
  const day = dayIndex(state.tick);
  const key = `${gap.kind}:${gap.subject}`;
  const credited = state.gaps.credited.includes(key);
  gap.closedDay = day;
  gap.closers = credited ? [] : [...closers].sort((a, b) => a - b);
  state.gaps.closedCount += 1;
  if (!credited) {
    for (const s of gap.closers) state.gaps.closedBySeat[s] = (state.gaps.closedBySeat[s] ?? 0) + 1;
    if (gap.closers.length > 0) {
      state.gaps.credited.push(key);
      state.gaps.credited.sort();
    }
  }
  state.gaps.closed.push(gap);
  while (state.gaps.closed.length > 0 && state.gaps.closed[0]!.closedDay! < day - PLACE_EVENINGS) {
    state.gaps.closed.shift();
  }
}
