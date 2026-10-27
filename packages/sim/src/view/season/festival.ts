// The season report's festival, renown and commission lines (C5B fills them).
import type { SeasonReportLine, WorldState } from '../../contracts';

export function festivalLines(_state: WorldState): {
  hearth: SeasonReportLine[];
  ledger: SeasonReportLine[];
} {
  return { hearth: [], ledger: [] };
}
