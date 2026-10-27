// The money invariant for economy tests (C4.0; docs/spec/13-ledger.md, Market and prices):
// treasury + sum(household savings) changes only by flows across the valley's edge, which book()
// and pay() count in economy.external. Take a snapshot, run anything, then check it:
//
//   const before = moneySnapshot(state);
//   ...ticks, commands, purchases...
//   expectMoneyInvariant(before, state);
//
// A failure names how much money appeared or vanished inside the valley.
import { expect } from 'vitest';
import type { WorldState } from '../src/contracts';
import { moneyBalance, moneyInside } from '../src/systems/economy/money';

export interface MoneySnapshot {
  /** treasury + sum(savings). */
  inside: number;
  /** economy.external at the time. */
  external: number;
  /** inside - external: the invariant's constant. */
  balance: number;
}

export function moneySnapshot(state: WorldState): MoneySnapshot {
  return { inside: moneyInside(state), external: state.economy.external, balance: moneyBalance(state) };
}

/** Fails when money was made or lost inside the valley since `before`. */
export function expectMoneyInvariant(before: MoneySnapshot, state: WorldState): void {
  const after = moneySnapshot(state);
  const leak = after.balance - before.balance;
  expect(
    leak,
    `money ${leak > 0 ? 'appeared' : 'vanished'} inside the valley: ${Math.abs(leak)} pennies ` +
      `(inside ${before.inside} -> ${after.inside}, external ${before.external} -> ${after.external})`,
  ).toBe(0);
}
