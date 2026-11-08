// The charter advisor (C4A, ported in C5.0): the Ledger claims the Charter the moment it is ready.
// C5A: and once the town is big enough for it, the last days of each season keep the books in
// surplus while the Charter still wants a season that ended so (the planner holds whatever can
// wait and would tip the season into deficit). Seasons of winter building and wheat put by spent
// every coin, and a valley ready in all else waited a year for its rank.
import { calendar, DAYS_PER_SEASON } from '@qoti/sim';
import type { Planner } from '../planner';
import { charterOpen } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** From this day of a season the Ledger keeps the books in surplus for the Charter. */
const SURPLUS_FROM_DAY = DAYS_PER_SEASON - 2;

class Charter implements Advisor {
  constructor(readonly p: Planner) {}

  visit(): void {
    const w = this.p.w;
    if (w.charter.ready) this.p.do('claim the Charter', [{ t: 'charter.claim' }]);
    const open = charterOpen(w);
    this.p.keepSurplus =
      open.includes('surplus') && !open.includes('residents') && calendar(w.tick).day >= SURPLUS_FROM_DAY;
  }
}

export const charter: AdvisorDef = {
  id: 'charter',
  slot: 30,
  plays: () => true,
  create: (p) => new Charter(p),
};
