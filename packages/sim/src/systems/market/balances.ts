// The balances' cross-track API (docs/build/r1-wave-notes.md, Cross-track APIs). Signatures fixed by
// R1.0; R1A owns the insides. R1B's need term, R1D's counts (Porridge No More, the Village's food
// goal) and R1F's audit read these.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { GOODS_BY_FAMILY } from '../../state/zones';
import { townStock } from '../../view/hamlet';

/**
 * Units a day the town uses of a family (GOOD_FAMILIES index). R1 stand-in (R1A): Food a resident,
 * Fuel a household, Materials what open sites need, Wares and Treats the Settler basket's amounts.
 */
export function familyUse(state: WorldState, family: number): number {
  if (family === 0) return state.residents.length;
  if (family === 1) return state.households.length;
  if (family === 2) {
    let n = 0;
    for (const b of state.buildings) for (const x of b.rt?.construction?.needs ?? []) n += x;
    return n;
  }
  const want = content.basketByTier
    .get('settler')
    ?.wants.find((w) => w.family === (family === 3 ? 'wares' : 'treats'));
  if (!want) return 0;
  return want.amount * (want.perHousehold ? state.households.length : state.residents.length);
}

/** Days of cover of a family, in hundredths (0 when the town uses none). */
export function familyCover(state: WorldState, family: number): number {
  const use = familyUse(state, family);
  if (use <= 0) return 0;
  const stock = townStock(state);
  let have = 0;
  for (const g of GOODS_BY_FAMILY[family]!) have += stock[g] ?? 0;
  return Math.floor((have * 100) / use);
}

/**
 * Flavors of a family on offer: goods on a shelf in reach of some home over the last three days.
 * R1 stand-in (R1A): goods of the family in stock anywhere in town today (wool, only an input, never counts).
 */
export function flavorsOnOffer(state: WorldState, family: number): number {
  const stock = townStock(state);
  let n = 0;
  for (const g of GOODS_BY_FAMILY[family]!) if ((stock[g] ?? 0) > 0 && content.goods[g]!.id !== 'wool') n++;
  return n;
}
