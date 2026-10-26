// The County Bank's credit line (docs/spec/13-ledger.md, Budget: "the treasury may go to -200
// coins x rank before construction stops"). A Hamlet has none, so the I1 rules hold to the penny:
// below zero is lean times. From Village rank the treasury may dip into the red by CREDIT_MIN coins
// per rank step before lean times begin; what it owes there pays interest at each season's end.
import { CREDIT_MIN, PENNIES_PER_COIN, RANKS } from '../../constants';
import type { WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';

/** How far below zero the treasury may go before lean times, pennies (0 at Hamlet rank). */
export function overdraftLimit(state: WorldState): number {
  if (!isStandard(state)) return 0;
  const rank = Math.max(0, RANKS.indexOf(state.charter.rank));
  return rank * CREDIT_MIN * PENNIES_PER_COIN;
}

/** Lean times: the treasury below the credit line. */
export function isLean(state: WorldState): boolean {
  return state.economy.treasury < -overdraftLimit(state);
}
