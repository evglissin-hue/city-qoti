// R1 (R1.0): the carrier's levers (docs/spec/13-ledger.md, The carrier and trade). They only set
// numbers; the carrier system (systems/carrier, R1A) reads them at 10:00.
import { CARRIER_BUDGET_MAX, CARRIER_RESERVE_MAX, GOOD_FAMILIES, PENNIES_PER_COIN } from '../constants';
import type { CarrierRule } from '../contracts';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { balancesView } from '../view/balances';
import type { HandlerFor } from './util';

const RULES: readonly CarrierRule[] = ['always', 'essentials', 'never'];

/** The family's index, or -1 when it is not one of the five. */
function family(value: unknown): number {
  return typeof value === 'string' ? (GOOD_FAMILIES as readonly string[]).indexOf(value) : -1;
}

export const setRule: HandlerFor<'carrier.setRule'> = {
  type: 'carrier.setRule',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (family(cmd.family) < 0 || !RULES.includes(cmd.rule) || typeof cmd.sell !== 'boolean')
      return 'INVALID';
    return null;
  },
  apply(state, _seat, cmd, ctx) {
    const f = state.carrier.families[family(cmd.family)]!;
    f.rule = cmd.rule;
    f.sell = cmd.sell;
    f.set = true;
    ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
  },
};

export const setReserve: HandlerFor<'carrier.setReserve'> = {
  type: 'carrier.setReserve',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const f = family(cmd.family);
    if (f < 0 || !isInt(cmd.reserve)) return 'INVALID';
    return cmd.reserve >= 0 && cmd.reserve <= CARRIER_RESERVE_MAX[f]! ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.carrier.families[family(cmd.family)]!.reserve = cmd.reserve;
    ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
  },
};

export const setBudget: HandlerFor<'carrier.setBudget'> = {
  type: 'carrier.setBudget',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return isInt(cmd.coins) && cmd.coins >= 0 && cmd.coins <= CARRIER_BUDGET_MAX ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.carrier.budget = cmd.coins * PENNIES_PER_COIN;
    ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
  },
};
