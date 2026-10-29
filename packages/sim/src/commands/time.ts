import { MAX_SPEED } from '../constants';
import { isInt } from '../rules/geometry';
import { seatView } from '../view';
import type { HandlerFor } from './util';

/**
 * Sets the valley's speed for everyone: whoever changes it last decides, so a partner who never
 * touched the clock cannot hold it back (playtest round three). Either seat can still pause, and
 * either can carry on. Kept per seat in state, so the minimum rule still guards older saves.
 */
export const setSpeed: HandlerFor<'time.setSpeed'> = {
  type: 'time.setSpeed',
  validate(_state, _seat, cmd) {
    return isInt(cmd.speed) && cmd.speed >= 0 && cmd.speed <= MAX_SPEED ? null : 'INVALID';
  },
  apply(state, seat, cmd, ctx) {
    for (let s = 0; s < state.time.desired.length; s++) state.time.desired[s] = cmd.speed;
    for (const s of state.time.connected) ctx.events.push({ e: 'seat.updated', s: seatView(state, s) });
    if (!state.time.connected.includes(seat))
      ctx.events.push({ e: 'seat.updated', s: seatView(state, seat) });
  },
};
