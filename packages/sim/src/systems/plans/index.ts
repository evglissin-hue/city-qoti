// Plans (docs/spec/16-coop.md, Plans layer). Plans are driven by commands (plan.*); this daily pass
// (03:00, C4D) tidies closed plans: approved and discarded plans stay on the board for
// PLAN_KEEP_DAYS so both seats can see what happened, at most PLAN_KEEP_CLOSED of them, oldest
// going first. Open plans are never tidied away.
import { TICKS_PER_DAY } from '../../constants';
import type { EntityId, System, TickCtx, WorldState } from '../../contracts';
import { removeById } from '../../state/entities';
import { dailyOffset } from '../economy/time';

/** Days a closed plan stays on the board, and the most closed plans kept. */
export const PLAN_KEEP_DAYS = 12;
export const PLAN_KEEP_CLOSED = 10;

export const plans: System = {
  id: 'plans',
  order: 97,
  every: TICKS_PER_DAY,
  offset: dailyOffset(3),
  tick(state, ctx) {
    tidyPlans(state, ctx);
  },
};

/** Removes closed plans past their keep; returns the ids removed. */
export function tidyPlans(state: WorldState, ctx: TickCtx): EntityId[] {
  const closed = state.plans.filter((p) => p.status !== 'open');
  const drop: EntityId[] = [];
  closed.forEach((p, i) => {
    const old = state.tick - p.tick >= PLAN_KEEP_DAYS * TICKS_PER_DAY;
    if (old || i < closed.length - PLAN_KEEP_CLOSED) drop.push(p.id);
  });
  for (const id of drop) {
    removeById(state.plans, id);
    ctx.events.push({ e: 'plan.removed', id });
  }
  return drop;
}
