// Standing orders at the Trading Post (C4.0 baseline; C4A owns trade). docs/spec/13-ledger.md, Trade.
import { content } from '@qoti/content';
import type { StandingOrder } from '../contracts';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { DOCK_NEIGHBOR, riverDock } from '../systems/dock';
import { dockView } from '../view/seasons';
import { tradeView } from '../view/village';
import type { HandlerFor } from './util';

const nonNegative = (v: unknown): boolean => isInt(v) && v >= 0;

export const setStandingOrder: HandlerFor<'trade.setStandingOrder'> = {
  type: 'trade.setStandingOrder',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    if (typeof cmd.good !== 'string' || !content.goodIndex.has(cmd.good)) return 'INVALID';
    if (cmd.via !== undefined && cmd.via !== 'post' && cmd.via !== 'dock') return 'INVALID';
    // I3 (C5B): the River Dock's orders, for boats to Millhaven; none while the river is frozen.
    if (cmd.via === 'dock') {
      if (!riverDock(state)) return 'NOT_FOUND';
      if (state.weather.river.frozen) return 'FROZEN';
      if (cmd.order && cmd.order.neighbor !== '' && cmd.order.neighbor !== DOCK_NEIGHBOR) return 'INVALID';
    }
    const o = cmd.order;
    if (o === null) return null;
    if (typeof o !== 'object') return 'INVALID';
    if (![o.min, o.max, o.floor, o.ceiling].every(nonNegative) || o.min > o.max) return 'INVALID';
    if (typeof o.neighbor !== 'string') return 'INVALID';
    return o.neighbor === '' || content.neighborById.has(o.neighbor) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const good = content.goodIndex.get(cmd.good)!;
    const dock = cmd.via === 'dock';
    const orders = (dock ? (state.dock.orders ?? []) : state.trade.orders).filter((o) => o.good !== good);
    if (cmd.order) {
      const { min, max, floor, ceiling, neighbor } = cmd.order;
      const order: StandingOrder = { good, min, max, floor, ceiling, neighbor };
      orders.push(order);
      orders.sort((a, b) => a.good - b.good);
    }
    if (dock) {
      if (orders.length > 0) state.dock.orders = orders;
      else delete state.dock.orders;
      ctx.events.push({ e: 'dock.updated', d: dockView(state) });
      return;
    }
    state.trade.orders = orders;
    ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
  },
};
