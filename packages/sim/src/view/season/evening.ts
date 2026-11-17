// The season report's cross-lane lines (R2C): the gaps mended, the season's busiest place with both
// lanes' credit, and how the evenings went. Pure: reads saved state. Built at 23:02 on the season's
// last day, so tonight's evening is in `evenings.tonight`.
import { PENNIES_PER_COIN } from '../../constants';
import type { EveningTally, SeasonReportLine, SeatId, WorldState } from '../../contracts';
import { shownName } from '../../state/evenings';
import { seasonAt } from '../../state/seasons';
import { listJoin, seatName } from '../../systems/chronicle/text';
import { dayIndex } from '../../systems/economy/time';
import { busiestRow, coinsText, placeAttribution } from '../evening';
import { capitalized, folkText, gapClosedText, outletName, seatNames } from '../gaps';

function sum(a: readonly number[]): number {
  let n = 0;
  for (const x of a) n += x;
  return n;
}

function sameSeats(a: readonly SeatId[], b: readonly SeatId[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export function eveningSeasonLines(state: WorldState): SeasonReportLine[] {
  const lines: SeasonReportLine[] = [];
  const today = dayIndex(state.tick);
  const first = today - (seasonAt(state.tick).day - 1);
  const inRange = (d: number): boolean => d >= first && d <= today;

  // 1. Gaps mended this season.
  const gaps = state.gaps.closed.filter((g) => g.closedDay !== undefined && inRange(g.closedDay));
  const n = gaps.length;
  if (n > 0) {
    const counts = new Map<SeatId, number>();
    for (const g of gaps) for (const s of g.closers ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
    const seats = [...counts.keys()].sort((a, b) => a - b);
    let text: string;
    if (n === 1) {
      text =
        seats.length > 0
          ? `One gap mended this season, by ${seatNames(state, seats)}.`
          : 'One gap mended this season.';
    } else if (seats.length === 0) {
      text = `${n} gaps mended this season.`;
    } else if (seats.length === 1 && gaps.every((g) => (g.closers ?? []).length === 1)) {
      text = `${n} gaps mended this season, every one by ${seatName(state, seats[0]!)}.`;
    } else {
      const parts = seats.map((s, i) => `${seatName(state, s)}${i === 0 ? ' closed ' : ' '}${counts.get(s)}`);
      text = `${n} gaps mended this season: ${listJoin(parts)}.`;
    }
    lines.push({ track: 'evening', text, value: n, seats });
  }

  // 2. Up to two mended gaps, in their own words.
  let shown = 0;
  for (const g of gaps) {
    if (shown >= 2) break;
    if ((g.closers ?? []).length === 0) continue;
    lines.push({ track: 'evening', text: gapClosedText(state, g), seats: [...(g.closers ?? [])] });
    shown++;
  }

  // 3. The season's busiest place.
  const row = busiestRow(state.places, (r) => sum(r.visitors));
  if (row) {
    const v = sum(row.visitors);
    const coins = Math.round(sum(row.takings) / PENNIES_PER_COIN);
    const { hearth, outlet, ledger } = placeAttribution(state, row);
    const place = capitalized(shownName(row));
    const who = hearth.length > 0 ? `${place}, ${seatNames(state, hearth)}'s doing,` : place;
    let text: string;
    let seats = hearth;
    if (outlet && coins > 0) {
      const name = outletName(state, outlet);
      if (hearth.length > 0 && ledger.length > 0 && !sameSeats(hearth, ledger)) {
        text = `${who} drew ${folkText(v)} this season; ${name} took ${coinsText(coins)} from them, to ${seatNames(state, ledger)}'s credit.`;
        seats = [...hearth, ...ledger].sort((a, b) => a - b);
      } else {
        text = `${who} drew ${folkText(v)} this season, and ${name} took ${coinsText(coins)} from them.`;
      }
    } else {
      text = `${who} drew ${folkText(v)} this season.`;
    }
    const line: SeasonReportLine = { track: 'evening', text: capitalized(text), value: v };
    if (seats.length > 0) line.seats = [...seats];
    lines.push(line);
  }

  // 4 and 5. The season's evenings.
  const evenings: EveningTally[] = [...state.evenings.history, state.evenings.tonight].filter(
    (e) => e.day >= 0 && inRange(e.day),
  );
  const withGrownups = evenings.filter((e) => e.grownups > 0);
  const grownups = withGrownups.reduce((a, e) => a + e.grownups, 0);
  if (grownups > 0) {
    const pct = Math.round((100 * withGrownups.reduce((a, e) => a + e.out, 0)) / grownups);
    lines.push({
      track: 'evening',
      text: `On an average evening this season, ${pct}% of the grown-ups went out.`,
      value: pct,
    });
  }
  const friends = evenings.reduce((a, e) => a + e.friendships, 0);
  if (friends > 0) {
    lines.push({
      track: 'evening',
      text:
        friends === 1
          ? 'One friendship was made on the evening round this season.'
          : `${friends} friendships were made on the evening round this season.`,
      value: friends,
    });
  }
  return lines;
}
