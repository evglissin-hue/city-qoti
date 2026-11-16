// P2 (the R1 playtest): how many folk the town has and how many jobs stand open, read from the
// Mirror. "Nobody works here yet" was a shortage of residents that the screen never named; the top
// bar's Folk chip and the Ledger's feed both read this one count.
import { BuildingStatus, type EntityId } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

export interface HandsReading {
  /** Residents in town. */
  folk: number;
  /** Residents with a job. */
  working: number;
  /** Jobs nobody holds, over built workplaces that are neither paused nor resting. */
  openJobs: number;
  /** Built workplaces with nobody at work at all (the "nobody works here yet" ones), lowest id first. */
  empty: EntityId[];
}

export function readHands(m: Mirror): HandsReading {
  let working = 0;
  for (const r of m.residents.values()) if (r.jobId) working++;
  let openJobs = 0;
  const empty: EntityId[] = [];
  for (const b of m.buildings.values()) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || rt.jobs <= 0) continue;
    if (rt.status & (BuildingStatus.paused | BuildingStatus.resting)) continue;
    openJobs += Math.max(0, rt.jobs - rt.workers);
    if (rt.status & BuildingStatus.noWorkers) empty.push(b.id);
  }
  empty.sort((a, b) => a - b);
  return { folk: m.town.value?.population ?? m.residents.size, working, openJobs, empty };
}
