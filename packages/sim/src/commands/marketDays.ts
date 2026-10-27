// Market days and quiet hours (C5.0 baseline; C5B owns what they do). docs/spec/13-ledger.md,
// Levers (I3 rows). They only set the levers; C5B's passes read them.
import { DAYS_PER_SEASON } from '../constants';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { leversView } from '../view/village';
import type { HandlerFor } from './util';

export const setMarketDay: HandlerFor<'ledger.setMarketDay'> = {
  type: 'ledger.setMarketDay',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (cmd.day === null) return null;
    return isInt(cmd.day) && cmd.day >= 1 && cmd.day <= DAYS_PER_SEASON ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.levers.marketDay = cmd.day;
    ctx.events.push({ e: 'levers.updated', l: leversView(state) });
  },
};

export const setQuietHours: HandlerFor<'ledger.setQuietHours'> = {
  type: 'ledger.setQuietHours',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return typeof cmd.on === 'boolean' ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.levers.quietHours = cmd.on;
    ctx.events.push({ e: 'levers.updated', l: leversView(state) });
  },
};
