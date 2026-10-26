// Ledger levers (C3C owns them): goods for the peddler.
import { content } from '@qoti/content';
import { budgetView, stocksView } from '../view';
import type { HandlerFor } from './util';

export const setForSale: HandlerFor<'ledger.setForSale'> = {
  type: 'ledger.setForSale',
  validate(_state, _seat, cmd) {
    if (typeof cmd.forSale !== 'boolean') return 'INVALID';
    return typeof cmd.good === 'string' && content.goodIndex.has(cmd.good) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    state.economy.forSale[content.goodIndex.get(cmd.good)!] = cmd.forSale;
    ctx.events.push({ e: 'stocks.updated', s: stocksView(state) });
    ctx.events.push({ e: 'budget.updated', b: budgetView(state) });
  },
};
