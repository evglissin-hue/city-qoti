// Standing orders at the Trading Post (C4.0 baseline; C4A owns trade). docs/spec/13-ledger.md, Trade.
import { content } from '@qoti/content';
import type { StandingOrder } from '../contracts';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { tradeView } from '../view/village';
import type { HandlerFor } from './util';

const nonNegative = (v: unknown): boolean => isInt(v) && v >= 0;

export const setStandingOrder: HandlerFor<'trade.setStandingOrder'> = {
  type: 'trade.setStandingOrder',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (typeof cmd.good !== 'string' || !content.goodIndex.has(cmd.good)) return 'INVALID';
    const o = cmd.order;
    if (o === null) return null;
    if (typeof o !== 'object') return 'INVALID';
    if (![o.min, o.max, o.floor, o.ceiling].every(nonNegative) || o.min > o.max) return 'INVALID';
    if (typeof o.neighbor !== 'string') return 'INVALID';
    return o.neighbor === '' || content.neighborById.has(o.neighbor) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const good = content.goodIndex.get(cmd.good)!;
    const orders = state.trade.orders.filter((o) => o.good !== good);
    if (cmd.order) {
      const { min, max, floor, ceiling, neighbor } = cmd.order;
      const order: StandingOrder = { good, min, max, floor, ceiling, neighbor };
      orders.push(order);
      orders.sort((a, b) => a.good - b.good);
    }
    state.trade.orders = orders;
    ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
  },
};
