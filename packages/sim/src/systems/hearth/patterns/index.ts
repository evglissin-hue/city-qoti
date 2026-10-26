// The patterns system: the Pattern Book pass each in-game hour (offset 100), and each morning at
// 06:30 every Kitchen Garden puts its extra food in the household's pantry, just before breakfast.
import { content } from '@qoti/content';
import { PANTRY_CAPACITY, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../constants';
import type { System, TickCtx, WorldState } from '../../../contracts';
import { householdIn } from '../../../conditions/geo';
import { isStandard } from '../../../state/hamlet';
import { householdView } from '../../../view/hamlet';
import { runPatterns } from './engine';
import { param } from './shared';

export const PATTERNS_OFFSET = 100;

export const patterns: System = {
  id: 'patterns',
  order: 72,
  every: TICKS_PER_HOUR,
  offset: PATTERNS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    runPatterns(state, ctx);
    const t = state.tick - 1;
    if (t % TICKS_PER_DAY === PATTERNS_OFFSET) kitchenGardenHarvest(state, ctx);
  },
};

const GARDEN = content.patternById.get('kitchen-garden');
const VEGETABLES = content.goodIndex.get('vegetables');

/** +1 vegetables per Kitchen Garden site into its home's pantry, while there is room. */
export function kitchenGardenHarvest(state: WorldState, ctx: TickCtx): void {
  if (!GARDEN || VEGETABLES === undefined) return;
  const perDay = param(GARDEN, 'foodPerDay', 1);
  for (const site of state.hearth.sites) {
    if (site.pattern !== GARDEN.id) continue;
    // The site is anchored on its home.
    const home = state.map.occupant[site.anchor]!;
    const h = home ? householdIn(state, home) : undefined;
    if (!h) continue;
    let food = 0;
    for (let i = 0; i < content.goods.length; i++) if (content.goods[i]!.food) food += h.pantry[i] ?? 0;
    const add = Math.min(perDay, PANTRY_CAPACITY - food);
    if (add <= 0) continue;
    h.pantry[VEGETABLES] = (h.pantry[VEGETABLES] ?? 0) + add;
    ctx.events.push({ e: 'household.updated', h: householdView(h) });
  }
}
