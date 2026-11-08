import { seatView } from '../view';
import { ensureSeat } from './seat';
import { type HandlerFor, isSeat } from './util';

// Injected by the room only; the room drops any client-sent sys.* command.

export const seatJoined: HandlerFor<'sys.seatJoined'> = {
  type: 'sys.seatJoined',
  validate(_state, _seat, cmd) {
    return isSeat(cmd.seat) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const s = ensureSeat(state, cmd.seat);
    s.lastSeenTick = state.tick;
    const connected = state.time.connected;
    if (!connected.includes(cmd.seat)) {
      connected.push(cmd.seat);
      connected.sort((a, b) => a - b);
    }
    ctx.events.push({ e: 'seat.updated', s: seatView(state, cmd.seat) });
  },
};

export const seatLeft: HandlerFor<'sys.seatLeft'> = {
  type: 'sys.seatLeft',
  validate(_state, _seat, cmd) {
    return isSeat(cmd.seat) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const s = ensureSeat(state, cmd.seat);
    s.lastSeenTick = state.tick;
    s.seen = {
      tick: state.tick,
      population: state.residents.length,
      treasury: state.economy.treasury,
      patterns: state.hearth.discovered.length,
      wishesGranted: state.stats.wishesGranted,
    };
    const i = state.time.connected.indexOf(cmd.seat);
    if (i >= 0) state.time.connected.splice(i, 1);
    ctx.events.push({ e: 'seat.updated', s: seatView(state, cmd.seat) });
  },
};
