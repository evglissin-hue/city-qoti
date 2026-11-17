// R2 (R2.0): the evening's views (docs/spec/19-evenings.md, the evening's tally; 17-presentation.md,
// the evening edition and the Hearth's strip). R2C owns this file; R2B's score fills the numbers.
// Every line is a pure function of saved state (no RNG, no ctx), so both seats' snapshots read the
// same. Nothing here reads `treatsDoorstep`: the doorstep errand runs at 21:30, after the edition.
import type {
  Building,
  EditionLine,
  EveningView,
  PlaceState,
  Resident,
  ResidentDetail,
  SeatId,
  TownView,
  WorldState,
} from '../contracts';
import { content } from '@qoti/content';
import { PENNIES_PER_COIN, TICKS_PER_HOUR } from '../constants';
import { findById } from '../state/entities';
import { eveningsNeed, shownName } from '../state/evenings';
import { dayIndex, tickOfDay } from '../systems/economy/time';
import { buildingCredit, placeCredit } from '../systems/gaps/credit';
import { sellsTreats } from '../systems/market/round';
import { placeById, placeServes } from '../systems/places/api';
import { capitalized, folkText, gapClosedText, gapView, outletName, seatNames } from './gaps';

/** "1 coin", "14 coins". */
export function coinsText(n: number): string {
  return n === 1 ? '1 coin' : `${n} coins`;
}

/** "a treat", "5 treats". */
function treatsText(n: number): string {
  return n === 1 ? 'a treat' : `${n} treats`;
}

function sameSeats(a: readonly SeatId[], b: readonly SeatId[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/** Who a place's visitors are owed to: the seats that laid it, the outlet that served them and its seats. */
export interface PlaceCredit {
  hearth: SeatId[];
  outlet?: Building;
  ledger: SeatId[];
}

/** The place's credit as the edition and the season report tell it. */
export function placeAttribution(state: WorldState, row: PlaceState): PlaceCredit {
  const place = placeById(state, row.id);
  const hearth = placeCredit(state, place);
  let outlet: Building | undefined;
  if (place) {
    const served = placeServes(state, place);
    let id = served.length > 0 ? Math.min(...served) : undefined;
    if (id === undefined) {
      for (const o of place.outlets) {
        const b = findById(state.buildings, o);
        if (b && sellsTreats(state, b) && (id === undefined || o < id)) id = o;
      }
    }
    if (id !== undefined) outlet = findById(state.buildings, id);
  }
  const ledger = outlet ? buildingCredit(state, [outlet.id]) : [];
  return outlet ? { hearth, outlet, ledger } : { hearth, ledger };
}

/** The row with the most `count(row)` (above zero), ties to the lowest id; rows are sorted by id. */
export function busiestRow(
  rows: readonly PlaceState[],
  count: (row: PlaceState) => number,
): PlaceState | undefined {
  let best: PlaceState | undefined;
  let most = 0;
  for (const row of rows) {
    const n = count(row);
    if (n > most) {
      best = row;
      most = n;
    }
  }
  return best;
}

function last(a: readonly number[]): number {
  return a.length > 0 ? a[a.length - 1]! : 0;
}

function busiestLine(state: WorldState, row: PlaceState): EditionLine {
  const v = last(row.visitors);
  const coins = Math.round(last(row.takings) / PENNIES_PER_COIN);
  const sold = last(row.sold);
  const { hearth, outlet, ledger } = placeAttribution(state, row);
  const place = capitalized(shownName(row));
  const folk = folkText(v);
  const who = hearth.length > 0 ? `${place}, ${seatNames(state, hearth)}'s doing,` : place;
  const refs = [row.id];
  let text: string;
  let seats = hearth;
  if (outlet && coins > 0) {
    const name = outletName(state, outlet);
    refs.push(`building:${outlet.id}`);
    if (hearth.length > 0 && ledger.length > 0 && !sameSeats(hearth, ledger)) {
      text = `${who} brought ${folk} past ${name}: ${coinsText(coins)} in ${seatNames(state, ledger)}'s till.`;
      seats = [...hearth, ...ledger].sort((a, b) => a - b);
    } else {
      text = `${who} brought ${folk} past ${name}: ${coinsText(coins)}.`;
    }
  } else if (outlet && sold > 0) {
    refs.push(`building:${outlet.id}`);
    text = `${who} drew ${folk}, and ${outletName(state, outlet)} handed out ${treatsText(sold)}.`;
  } else {
    text = `${who} drew ${folk} tonight.`;
  }
  return { text: capitalized(text), seats: [...seats], refs };
}

function nextLine(state: WorldState, row: PlaceState): EditionLine {
  const hearth = placeCredit(state, placeById(state, row.id));
  const place = capitalized(shownName(row));
  const who = hearth.length > 0 ? `${place}, ${seatNames(state, hearth)}'s doing,` : place;
  return {
    text: `${who} was next busiest, with ${folkText(last(row.visitors))}.`,
    seats: hearth,
    refs: [row.id],
  };
}

function honestLine(state: WorldState): string {
  const t = state.evenings.tonight;
  if (t.weather === 'storm') return 'A storm kept the whole town in. The kettles did well out of it.';
  if (t.grownups === 0) return 'A quiet evening: nobody had anywhere to be, and nobody minded.';
  if (t.nowhere > 0) {
    return t.grownups === 1
      ? "The town's one grown-up stayed in: nowhere was worth the walk."
      : `Not one of ${t.grownups} grown-ups went out: nowhere was worth the walk.`;
  }
  return 'Everyone stayed in tonight. Some evenings are like that.';
}

/**
 * The last evening's tally and edition, or null before the first evening. Three to five lines on a
 * day with news (a gap closed leads; the busiest place carries both lanes' credit), one honest line
 * on a day without.
 */
export function eveningView(state: WorldState): EveningView | null {
  const t = state.evenings.tonight;
  if (t.day < 0) return null;
  const ranked = state.places
    .filter((r) => last(r.visitors) > 0)
    .sort((a, b) => last(b.visitors) - last(a.visitors) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const places = ranked.map((r) => ({
    id: r.id,
    name: shownName(r),
    visitors: last(r.visitors),
    seats: placeById(state, r.id)?.seats ?? 0,
    takings: last(r.takings),
  }));
  const closedToday = state.gaps.closed.filter((g) => g.closedDay === t.day);
  const openedToday = state.gaps.open.filter((g) => g.openedDay === t.day);
  const news = t.out > 0 || closedToday.length > 0 || openedToday.length > 0;
  const tally = { ...t };
  if (!news) return { tally, lines: [{ text: honestLine(state), seats: [], refs: [] }], places };

  const lines: EditionLine[] = [];
  for (const g of closedToday) {
    lines.push({
      text: gapClosedText(state, g),
      seats: [...(g.closers ?? [])],
      refs: [`gap:${g.id}`, g.subject],
    });
  }
  const top = ranked[0];
  if (top) lines.push(busiestLine(state, top));
  if (t.grownups > 0 && t.out > 0) {
    const avg = Math.round(t.scoreSum / t.grownups);
    const text =
      t.out === t.grownups
        ? t.grownups === 1
          ? `The town's one grown-up went out, and the evening scored ${avg} out of 100.`
          : `Every grown-up in town went out, all ${t.grownups} of them, and the evening averaged ${avg} out of 100.`
        : `${t.out} of ${t.grownups} grown-ups went out, and the evening averaged ${avg} out of 100.`;
    lines.push({ text, seats: [], refs: [] });
  }
  if (t.out > 0) {
    const sold = t.treatsAtStops + t.treatsPassing;
    let text: string;
    if (sold > 0 && t.treatsPassing > 0) {
      text =
        sold === 1
          ? 'One treat went on the round, bought in passing.'
          : `${sold} treats went on the round, ${t.treatsPassing} of them bought in passing.`;
    } else if (sold > 0) {
      text =
        sold === 1
          ? 'One treat went on the round.'
          : `${sold} treats went on the round, every one of them at a stop.`;
    } else {
      text = 'Not one treat was sold on the round. The shelves and the walkers kept to different streets.';
    }
    lines.push({ text, seats: [], refs: [] });
  }
  for (const g of openedToday) {
    lines.push({ text: gapView(state, g).text, seats: [], refs: [`gap:${g.id}`, g.subject] });
  }
  if (t.friendships > 0) {
    lines.push({
      text:
        t.friendships === 1
          ? 'Two folk became friends tonight, which is how it starts.'
          : `${t.friendships} new friendships were struck up tonight.`,
      seats: [],
      refs: [],
    });
  }
  if (t.stood > 0) {
    lines.push({
      text: `${capitalized(folkText(t.stood))} stood for want of a seat. A bench or two would not go amiss.`,
      seats: [],
      refs: [],
    });
  }
  const next = ranked[1];
  if (next) lines.push(nextLine(state, next));
  if (t.weather === 'rain' && t.out > 0) {
    lines.push({
      text: 'Rain kept the open-air places quiet. The sheltered ones did not mind.',
      seats: [],
      refs: [],
    });
  }
  const out = lines.slice(0, 5);
  if (out.length < 3 && t.out === 0 && t.grownups > 0) {
    out.push({
      text:
        t.nowhere > 0
          ? `Nobody went out tonight: ${t.nowhere} of ${t.grownups} grown-ups had nowhere worth the walk.`
          : 'Nobody went out tonight.',
      seats: [],
      refs: [],
    });
  }
  if (out.length < 3) {
    out.push({ text: 'The rest of the evening passed without remark.', seats: [], refs: [] });
  }
  return { tally, lines: out, places };
}

/**
 * The Hearth's strip: the last evening's share out and average score, absent before the first. R2X:
 * while tonight is under way (scored only at 21:00) it counts tonight so far and keeps the last scored
 * evening's average (`live`), since tonight's sum is empty until folk head home.
 */
export function townEvenings(state: WorldState): TownView['evenings'] {
  const ev = state.evenings;
  const t = ev.tonight;
  if (t.day < 0 || t.grownups === 0) return undefined;
  const P = content.places;
  const tod = tickOfDay(state.tick);
  const live =
    t.day === dayIndex(state.tick) &&
    tod >= P.eveningHour * TICKS_PER_HOUR &&
    tod < P.homeHour * TICKS_PER_HOUR;
  if (!live) return { out: t.out, grownups: t.grownups, average: Math.round(t.scoreSum / t.grownups) };
  let average = 0;
  for (let i = ev.history.length - 1; i >= 0; i--) {
    const h = ev.history[i]!;
    if (h.day < 0 || h.grownups <= 0 || h.weather === 'storm') continue;
    average = Math.round(h.scoreSum / h.grownups);
    break;
  }
  return { out: t.out, grownups: t.grownups, average, live: true };
}

/** The inspector's evening: the need and the last score, once they have had an evening. */
export function residentEvening(r: Resident): ResidentDetail['evening'] {
  if (!r.evening) return undefined;
  return { need: Math.round(eveningsNeed(r)), score: r.evening.score };
}
