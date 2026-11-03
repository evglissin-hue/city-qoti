// The season report's threat lines (C5D): raids and what they cost, wolves' nights, and for the
// Ledger the pressure band, deterrence and the Watch. The Hearth's page never shows raw pressure
// (P36). Pure: reads state. Built at 23:02 on the season's last day.
import { DAYS_PER_SEASON, TICKS_PER_DAY } from '../../constants';
import type { SeasonReportLine, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { dayIndex } from '../../systems/economy/time';
import { raidsPossible, thresholdFor } from '../../systems/threats/pressure';

/** Pressure band for the Ledger: calm, rising (half way) or high (a raid is due next season). */
export function pressureBand(state: WorldState): 'calm' | 'rising' | 'high' {
  const p = state.threats.pressure;
  const t = thresholdFor(state);
  return p >= t ? 'high' : p * 2 >= t ? 'rising' : 'calm';
}

function seasonStartTick(state: WorldState): number {
  const today = dayIndex(state.tick);
  const first = today - (seasonAt(state.tick).day - 1);
  return first * TICKS_PER_DAY - 6 * (TICKS_PER_DAY / 24);
}

export function threatLines(state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  const hearth: SeasonReportLine[] = [];
  const ledger: SeasonReportLine[] = [];
  const t = state.threats;
  const from = seasonStartTick(state);
  const raids = t.history.filter((r) => r.tick >= from);
  for (const r of raids) {
    if (r.stolen === 0) {
      hearth.push({
        track: 'threat',
        text: 'Raiders came at dusk and left with nothing. The Watch has not stopped telling the story.',
      });
    } else {
      hearth.push({
        track: 'threat',
        text: r.repelled
          ? 'Raiders were turned back in the night, a few sacks lighter for us. Nobody was hurt.'
          : 'Raiders got away with some of the stores. Nobody was hurt, and the shelves will fill again.',
        value: r.stolen,
      });
    }
    ledger.push({
      track: 'threat',
      text: `Raid (${r.band}): ${r.stolen} units lost, ${r.captured} captured, ${r.repelled ? 'repelled' : 'not repelled'}.`,
      value: r.stolen,
    });
  }
  const first = dayIndex(from + 1);
  const nights = t.wolves.filter(
    (d) => d >= first && d < first + DAYS_PER_SEASON && d < dayIndex(state.tick) + 1,
  );
  if (nights.length > 0) {
    hearth.push({
      track: 'threat',
      text:
        nights.length === 1
          ? 'Wolves came down from the forest one night. Lanterns and fences kept them honest.'
          : `Wolves came down from the forest on ${nights.length} nights. Lanterns and fences kept them honest.`,
      value: nights.length,
    });
  }
  const band = pressureBand(state);
  if (raidsPossible(state))
    ledger.push({
      track: 'threat',
      text:
        band === 'high'
          ? 'Threat pressure is high: a raid is likely next season. Walls round the stores and a bigger Watch help.'
          : band === 'rising'
            ? "Threat pressure is rising with the town's wealth."
            : 'Threat pressure is calm.',
      value: state.threats.pressure,
    });
  const d = t.deterrence;
  const total = d.walls + d.towers + d.lanterns + d.watch;
  if (total > 0)
    ledger.push({
      track: 'threat',
      text: 'Deterrence (walls, towers, lanterns and the Watch).',
      value: total,
    });
  if (state.watch.members.length > 0)
    ledger.push({
      track: 'threat',
      text: `The Watch: ${state.watch.members.length} members.`,
      value: state.watch.members.length,
    });
  return { hearth, ledger };
}
