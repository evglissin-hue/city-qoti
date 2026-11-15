// A Winter Without Imports (docs/spec/15-progression.md, R1 feats): a winter in which the carrier
// brought no Food or Fuel and nobody went short. The carrier keeps only CARRIER_DAYS (4) days of
// purchases, a winter is six, so each morning of winter (and the first of spring, for winter's last
// day) the seasons system reads the carrier's newest day into `seasons.winterImported`; closeWinter
// counts the winter in `seasons.importFreeWinters` when the flag is still clear and nobody was cold.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { FOOD_GOODS } from '../../state/zones';
import { Need } from '../residents/needs';

/** Need value under which a resident is skipping meals ("Skipping the odd meal" starts at 35). */
const HUNGRY_BELOW = 35;

let fuelGoods: number[] | undefined;

/** Good indexes the carrier's imports are judged by: Food and Fuel. */
function staples(): readonly number[] {
  if (!fuelGoods) {
    fuelGoods = [...FOOD_GOODS];
    for (let i = 0; i < content.goods.length; i++) if (content.goods[i]!.family === 'fuel') fuelGoods.push(i);
  }
  return fuelGoods;
}

/** Winter day 1: a clean tally. */
export function openImportTally(state: WorldState): void {
  state.seasons.winterImported = false;
}

/**
 * 00:02 on a winter day after the first, and on Spring day 1: yesterday's boat. Marks the winter
 * imported when the carrier's newest day holds any Food or Fuel, or some resident is going hungry.
 */
export function tallyImports(state: WorldState): void {
  if (state.seasons.winterImported === undefined || state.seasons.winterImported) return;
  const today = state.carrier.bought[state.carrier.bought.length - 1];
  let brought = 0;
  if (today) for (const g of staples()) brought += today[g] ?? 0;
  let hungry = false;
  for (const r of state.residents) if ((r.needs[Need.food] ?? 100) < HUNGRY_BELOW) hungry = true;
  if (brought > 0 || hungry) state.seasons.winterImported = true;
}

/** Spring day 1, after the last tally: counts the winter that just ended, then clears the tally. */
export function closeImportTally(state: WorldState, nobodyCold: boolean): void {
  if (state.seasons.winterImported === false && nobodyCold && state.households.length > 0) {
    state.seasons.importFreeWinters = (state.seasons.importFreeWinters ?? 0) + 1;
  }
  delete state.seasons.winterImported;
}
