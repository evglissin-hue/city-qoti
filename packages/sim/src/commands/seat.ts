import { MAX_NAME_CHARS } from '../constants';
import type { Lens, SeatId, SeatState, WorldState } from '../contracts';
import { isInt } from '../rules/geometry';
import { seatView } from '../view';
import { type HandlerFor, trimmed } from './util';

const DEFAULT_COLORS = [0xd9822b, 0x2b8fd9, 0x9b59b6, 0x5a9e4b] as const;

/** The seat's state, created with defaults the first time the seat shows up. */
export function ensureSeat(state: WorldState, seat: SeatId): SeatState {
  let s = state.seats.find((x) => x.seat === seat);
  if (!s) {
    s = {
      seat,
      name: `Player ${seat + 1}`,
      color: DEFAULT_COLORS[seat],
      lens: seat % 2 === 0 ? 'hearth' : 'ledger',
      lastSeenTick: state.tick,
    };
    state.seats.push(s);
    state.seats.sort((a, b) => a.seat - b.seat);
  }
  return s;
}

function isLens(v: unknown): v is Lens {
  return v === 'hearth' || v === 'ledger';
}

export const setProfile: HandlerFor<'seat.setProfile'> = {
  type: 'seat.setProfile',
  validate(_state, _seat, cmd) {
    if (trimmed(cmd.name, MAX_NAME_CHARS) === null) return 'INVALID';
    if (!isInt(cmd.color) || cmd.color < 0 || cmd.color > 0xffffff) return 'INVALID';
    return isLens(cmd.lens) ? null : 'INVALID';
  },
  apply(state, seat, cmd, ctx) {
    const s = ensureSeat(state, seat);
    s.name = trimmed(cmd.name, MAX_NAME_CHARS)!;
    s.color = cmd.color;
    s.lens = cmd.lens;
    ctx.events.push({ e: 'seat.updated', s: seatView(state, seat) });
  },
};
