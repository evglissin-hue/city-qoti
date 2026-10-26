// The Ledger's I2 levers (C4.0 baseline; C4A owns them): wage level, income tax, price caps and
// subsidies. They only set numbers; the market and wage passes read them.
import { content } from '@qoti/content';
import { MAX_SUBSIDY, TAX_RATE_RANGE, WAGE_LEVEL_RANGE } from '../constants';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { leversView, marketView } from '../view/village';
import type { HandlerFor } from './util';

const inRange = (v: unknown, [lo, hi]: readonly [number, number]): boolean =>
  isInt(v) && (v as number) >= lo && (v as number) <= hi;

export const setWageLevel: HandlerFor<'ledger.setWageLevel'> = {
  type: 'ledger.setWageLevel',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return inRange(cmd.percent, WAGE_LEVEL_RANGE) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.levers.wageLevel = cmd.percent;
    ctx.events.push({ e: 'levers.updated', l: leversView(state) });
  },
};

export const setTaxRate: HandlerFor<'ledger.setTaxRate'> = {
  type: 'ledger.setTaxRate',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return inRange(cmd.percent, TAX_RATE_RANGE) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.levers.taxRate = cmd.percent;
    ctx.events.push({ e: 'levers.updated', l: leversView(state) });
  },
};

export const setPriceCap: HandlerFor<'ledger.setPriceCap'> = {
  type: 'ledger.setPriceCap',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    const g = typeof cmd.good === 'string' ? content.goodById.get(cmd.good) : undefined;
    if (!g?.food) return 'INVALID';
    if (!isInt(cmd.cap) || cmd.cap < 0) return 'INVALID';
    return inRange(cmd.subsidy, [0, MAX_SUBSIDY]) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const i = content.goodIndex.get(cmd.good)!;
    state.levers.priceCaps[i] = cmd.cap;
    state.levers.subsidies[i] = cmd.subsidy;
    ctx.events.push({ e: 'levers.updated', l: leversView(state) });
    ctx.events.push({ e: 'market.updated', m: marketView(state) });
  },
};
