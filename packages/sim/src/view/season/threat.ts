// The season report's threat lines: raids, the Watch, wolves (C5D fills them).
import type { SeasonReportLine, WorldState } from '../../contracts';

export function threatLines(_state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  return { hearth: [], ledger: [] };
}
