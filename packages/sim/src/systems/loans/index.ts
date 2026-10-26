// The County Bank (docs/spec/13-ledger.md, Levers). C4.0 stub: loan.take and loan.repay work;
// this pass will add interest at each season's end (LOAN_RATE, booked as 'interest'). C4A owns it.
import { TICKS_PER_DAY } from '../../constants';
import type { System } from '../../contracts';
import { dailyOffset } from '../economy/time';

export const loans: System = {
  id: 'loans',
  order: 66,
  every: TICKS_PER_DAY,
  offset: dailyOffset(0, 30),
  tick() {},
};
