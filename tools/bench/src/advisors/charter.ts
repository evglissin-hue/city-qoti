// The charter advisor (C4A, ported in C5.0): the Ledger claims the Charter the moment it is ready.
import type { Planner } from '../planner';
import type { Advisor, AdvisorDef } from './types';

class Charter implements Advisor {
  constructor(readonly p: Planner) {}

  visit(): void {
    if (this.p.w.charter.ready) this.p.do('claim the Charter', [{ t: 'charter.claim' }]);
  }
}

export const charter: AdvisorDef = {
  id: 'charter',
  slot: 30,
  plays: () => true,
  create: (p) => new Charter(p),
};
