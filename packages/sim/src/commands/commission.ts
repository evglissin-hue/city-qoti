// Commissions (C5.0 baseline; C5B owns them). docs/spec/13-ledger.md, Commissions. Offers come from
// neighbors and notable visitors as renown grows; accepting starts the deadline, declining closes it.
import { content } from '@qoti/content';
import { TICKS_PER_DAY } from '../constants';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { commissionView } from '../view/seasons';
import type { HandlerFor } from './util';

export const accept: HandlerFor<'commission.accept'> = {
  type: 'commission.accept',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id)) return 'INVALID';
    const c = findById(state.commissions.list, cmd.id);
    if (!c) return 'NOT_FOUND';
    return c.status === 'offered' ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const c = findById(state.commissions.list, cmd.id)!;
    const days = content.commissionById.get(c.def)?.deadlineDays ?? 6;
    c.status = 'accepted';
    c.deadlineTick = state.tick + days * TICKS_PER_DAY;
    ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
  },
};

export const decline: HandlerFor<'commission.decline'> = {
  type: 'commission.decline',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id)) return 'INVALID';
    const c = findById(state.commissions.list, cmd.id);
    if (!c) return 'NOT_FOUND';
    return c.status === 'offered' ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const c = findById(state.commissions.list, cmd.id)!;
    c.status = 'declined';
    ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
  },
};
