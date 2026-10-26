// Ledger levers on a building (C3C owns them): construction priority and pausing.
import { findById } from '../state/entities';
import { buildingView } from '../view';
import type { HandlerFor } from './util';

export const setPriority: HandlerFor<'build.setPriority'> = {
  type: 'build.setPriority',
  validate(state, _seat, cmd) {
    if (typeof cmd.priority !== 'boolean') return 'INVALID';
    const b = findById(state.buildings, cmd.id);
    if (!b) return 'NOT_FOUND';
    return b.rt?.construction ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    b.rt!.construction!.priority = cmd.priority;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  },
};

export const setPaused: HandlerFor<'build.setPaused'> = {
  type: 'build.setPaused',
  validate(state, _seat, cmd) {
    if (typeof cmd.paused !== 'boolean') return 'INVALID';
    const b = findById(state.buildings, cmd.id);
    if (!b) return 'NOT_FOUND';
    return b.rt ? null : 'NOT_ALLOWED';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    b.rt!.paused = cmd.paused;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  },
};
