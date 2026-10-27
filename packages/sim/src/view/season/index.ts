// The two-page season report (C5.0): one builder per track, composed here in a fixed order, so
// four tracks fill their own lines without touching each other's files.
import type { SeasonIndex, SeasonReportView, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { festivalLines } from './festival';
import { natureLines } from './nature';
import { threatLines } from './threat';
import { weatherLines } from './weather';

// prettier-ignore
const BUILDERS = [
  weatherLines,
  festivalLines,
  natureLines,
  threatLines,
];

export function seasonReportView(state: WorldState): SeasonReportView {
  const { season, year } = seasonAt(state.tick);
  const out: SeasonReportView = { season: season as SeasonIndex, year, hearth: [], ledger: [] };
  for (const build of BUILDERS) {
    const lines = build(state);
    out.hearth.push(...lines.hearth);
    out.ledger.push(...lines.ledger);
  }
  return out;
}
