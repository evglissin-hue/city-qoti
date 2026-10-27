// The season report's nature lines: new Field Guide species, habitats (C5C fills them).
import type { SeasonReportLine, WorldState } from '../../contracts';

export function natureLines(_state: WorldState): { hearth: SeasonReportLine[]; ledger: SeasonReportLine[] } {
  return { hearth: [], ledger: [] };
}
