// The trade score's cross-track API (docs/spec/13-ledger.md, Choosing a trade; docs/build/
// r1-wave-notes.md, Cross-track APIs). Signature fixed by R1.0; R1B owns the insides. R1F's advisors
// may ask why a lot grew what it did.
import type { TradeDef } from '@qoti/content';
import type { Lot, WorldState } from '../../contracts';
import { townStock } from '../../view/hamlet';
import { lotFertility } from './desirability';
import { siteFits } from './index';
import { methodScore, shortages } from './recipes';

/**
 * A trade's score for a lot about to grow: need x supply x site x keeper. R1 stand-in (R1B): the
 * shortage of what it makes (methodScore) when the lot meets the trade's site wants, else 0; shops
 * score 1 where their site fits.
 */
export function tradeScore(state: WorldState, lot: Lot, trade: TradeDef): number {
  if (!siteFits(state, lot, trade)) return 0;
  if (!trade.method) return 1;
  const stock = townStock(state);
  return methodScore(state, trade.method, shortages(state, stock), stock, lotFertility(state, lot));
}
