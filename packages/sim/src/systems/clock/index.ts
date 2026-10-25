import { TICKS_PER_HOUR } from '../../constants';
import type { System } from '../../contracts';
import { clockView } from '../../view';

/**
 * Advances the calendar one tick and emits `clock` at each in-game hour. Speed changes emit
 * `clock` from applyTurn, because a paused valley runs no ticks to notice them.
 */
export const clock: System = {
  id: 'clock',
  order: 10,
  tick(state, ctx) {
    state.tick += 1;
    if (state.tick % TICKS_PER_HOUR === 0) ctx.events.push({ e: 'clock', c: clockView(state) });
  },
};
