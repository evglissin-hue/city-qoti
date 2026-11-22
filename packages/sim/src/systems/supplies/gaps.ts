// The fourth gap's rule (R3A; docs/spec/19-evenings.md, Gaps: a place short of supplies): opens when one
// of a place's goods-drawing pieces rested two nights running, closes when none did for two nights.
// The gaps pass (systems/gaps/index.ts) calls keepSupplyGaps at 21:10 on a fair evening from Village
// rank, after R2's three rules, with the same pass and achievable check. A place set to let rest is
// not read and its gap is dropped without credit. Credit as the R3 wave notes rule: the seat whose
// priority (keep) or carrier switch (places) was set last since the gap opened, else the Ledger's seats.
// The streak helpers are small copies of gaps/rules.ts's (never edited from here).
import { content, type GapDef, type GapKind } from '@qoti/content';
import { TICKS_PER_DAY } from '../../constants';
import type { Gap, GapStreak, Place, SeatId, WorldState } from '../../contracts';
import { placeState } from '../../state/evenings';
import { familyIndex } from '../../state/zones';
import { GAPS_OFFSET } from '../gaps';
import { closeGap, dropGap, findGap, openGap } from '../gaps/api';
import { ledgerSeats } from '../gaps/credit';
import type { GapPass } from '../gaps/rules';
import { placeById } from '../places/api';
import { placeIndex } from '../places';
import { placeGoods, placeShortage } from './gapChecks';

const KIND: GapKind = 'shortOfSupplies';

// --- streaks (copies of gaps/rules.ts's) ---------------------------------------------------------

function before(a: GapStreak, subject: string): boolean {
  return a.kind < KIND || (a.kind === KIND && a.subject < subject);
}

function streakIndex(state: WorldState, subject: string): number {
  const list = state.gaps.streaks;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(list[mid]!, subject)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hasStreak(state: WorldState, subject: string): boolean {
  const row = state.gaps.streaks[streakIndex(state, subject)];
  return !!row && row.kind === KIND && row.subject === subject;
}

/** Counts one more evening on the streak (making it at 1), marks it held tonight, returns its count. */
function bump(state: WorldState, held: Set<string>, subject: string): number {
  const at = streakIndex(state, subject);
  const row = state.gaps.streaks[at];
  held.add(subject);
  if (row && row.kind === KIND && row.subject === subject) {
    row.n += 1;
    return row.n;
  }
  state.gaps.streaks.splice(at, 0, { kind: KIND, subject, n: 1 });
  return 1;
}

function clearStreak(state: WorldState, subject: string): void {
  if (hasStreak(state, subject)) state.gaps.streaks.splice(streakIndex(state, subject), 1);
}

/** Deletes this kind's streaks that did not hold tonight. */
function sweep(state: WorldState, held: ReadonlySet<string>): void {
  const list = state.gaps.streaks;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    if (s.kind === KIND && !held.has(s.subject)) list.splice(i, 1);
  }
}

// --- credit --------------------------------------------------------------------------------------

/**
 * Who is credited when the gap closes: the latest of the place's `keep` priority and the places
 * switch of a family its goods belong to, each set at or after the pass the gap opened at; with
 * neither, the seats playing the Ledger.
 */
function closers(state: WorldState, gap: Gap, place: Place | undefined): SeatId[] {
  const opened = gap.openedDay * TICKS_PER_DAY + GAPS_OFFSET;
  let best: { seat: SeatId; tick: number } | undefined;
  const row = placeState(state, gap.subject);
  if (row?.priority === 'keep' && row.prioritySet && row.prioritySet.tick >= opened) best = row.prioritySet;
  if (place) {
    for (const g of placeGoods(state, place)) {
      const fam = state.carrier.families[familyIndex(content.goods[g]!.family)];
      const set = fam?.places ? fam.placesSet : undefined;
      if (set && set.tick >= opened && (!best || set.tick > best.tick)) best = set;
    }
  }
  return best ? [best.seat] : ledgerSeats(state);
}

// --- the rule ------------------------------------------------------------------------------------

/** Reads the fourth gap's rule over the evening just closed. */
export function keepSupplyGaps(pass: GapPass, achievable: (kind: GapKind) => boolean): void {
  const { state, ctx } = pass;
  const d: GapDef = content.gapByKind.get(KIND)!;
  const held = new Set<string>();
  const letRest = (id: string): boolean => placeState(state, id)?.priority === 'rest';

  // A gap whose place is gone, or is set to let rest: dropped, no credit, no count.
  for (const gap of [...state.gaps.open]) {
    if (gap.kind !== KIND || (placeById(state, gap.subject) && !letRest(gap.subject))) continue;
    dropGap(state, ctx, gap);
    clearStreak(state, gap.subject);
    pass.changed = true;
  }

  for (const place of placeIndex(state).places) {
    if (letRest(place.id)) continue;
    const gap = findGap(state, KIND, place.id);
    const s = placeShortage(state, place);
    if (!s && !gap) continue;
    const opens = !!s?.resting;
    if (!gap) {
      if (!opens) continue;
      const blocked = !achievable(KIND) || (pass.closable && !pass.closable(KIND, place.id, place.tile));
      if (blocked) {
        // Nothing the town can do would close it yet: keep the streak, open nothing.
        if (hasStreak(state, place.id)) held.add(place.id);
        continue;
      }
      if (bump(state, held, place.id) < d.openAfter) continue;
      clearStreak(state, place.id);
      openGap(state, ctx, KIND, place.id, place.tile, s!.n);
      pass.changed = true;
      continue;
    }
    if (opens && gap.n !== s!.n) {
      gap.n = s!.n;
      pass.changed = true;
    }
    if (opens) continue;
    if (bump(state, held, place.id) < d.closeAfter) continue;
    clearStreak(state, place.id);
    closeGap(state, ctx, gap, closers(state, gap, place));
    pass.changed = true;
  }
  sweep(state, held);
}
