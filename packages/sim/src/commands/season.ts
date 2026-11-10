// R1 (R1.0): the season plan (docs/spec/13-ledger.md, The season plan). Answers are optional and keep
// until changed; R1B's systems read the winter reserve and where to build first, R1A the deal.
import { content } from '@qoti/content';
import { WINTER_RESERVE_MAX } from '../constants';
import type { SeasonPlanInput, WorldState } from '../contracts';
import { isInt } from '../rules/geometry';
import { isStandard } from '../state/hamlet';
import { balancesView } from '../view/zones';
import type { HandlerFor } from './util';

const days = (v: unknown): boolean => isInt(v) && (v as number) >= 0 && (v as number) <= WINTER_RESERVE_MAX;

/** True when every answer given is one the plan can take. */
function validPlan(state: WorldState, plan: SeasonPlanInput): boolean {
  if (typeof plan !== 'object' || plan === null) return false;
  if (plan.reserve !== undefined && !days(plan.reserve)) return false;
  if (plan.food !== undefined && plan.food !== null && !days(plan.food)) return false;
  if (plan.fuel !== undefined && plan.fuel !== null && !days(plan.fuel)) return false;
  if (plan.deal !== undefined && plan.deal !== null) {
    if (typeof plan.deal !== 'string' || !state.carrier.offers.some((o) => o.id === plan.deal)) return false;
  }
  if (plan.buildFirst !== undefined && plan.buildFirst !== null) {
    if (typeof plan.buildFirst !== 'string' || !content.zoneById.has(plan.buildFirst)) return false;
  }
  return true;
}

export const setPlan: HandlerFor<'season.setPlan'> = {
  type: 'season.setPlan',
  validate(state, _seat, cmd) {
    if (!isStandard(state)) return 'NOT_ALLOWED';
    return validPlan(state, cmd.plan) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const plan = state.seasonPlan;
    const p = cmd.plan;
    if (p.reserve !== undefined) plan.reserve = p.reserve;
    if (p.food !== undefined) plan.food = p.food;
    if (p.fuel !== undefined) plan.fuel = p.fuel;
    if (p.deal !== undefined) plan.deal = p.deal;
    if (p.buildFirst !== undefined) plan.buildFirst = p.buildFirst;
    ctx.events.push({ e: 'balances.updated', b: balancesView(state) });
  },
};
