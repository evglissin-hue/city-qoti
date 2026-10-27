// The season report's weather and warmth lines (C5A fills them). Returns lines for both pages.
import type { SeasonReportLine, WorldState } from '../../contracts';

export function weatherLines(_state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  return { hearth: [], ledger: [] };
}
