import { MAX_SPEED } from '../constants';
import { isInt } from '../rules/geometry';
import { seatView } from '../view';
import type { HandlerFor } from './util';

/** Sets this seat's desired speed. The effective speed is the minimum over connected seats. */
export const setSpeed: HandlerFor<'time.setSpeed'> = {
  type: 'time.setSpeed',
  validate(_state, _seat, cmd) {
    return isInt(cmd.speed) && cmd.speed >= 0 && cmd.speed <= MAX_SPEED ? null : 'INVALID';
  },
  apply(state, seat, cmd, ctx) {
    state.time.desired[seat] = cmd.speed;
    ctx.events.push({ e: 'seat.updated', s: seatView(state, seat) });
  },
};
