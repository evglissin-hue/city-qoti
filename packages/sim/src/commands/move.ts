// R1 (R1.0): moving decor and hand-placed buildings (docs/spec/12-hearth.md, Decorating that
// composes itself; 10-world-and-building.md, Moving). The shapes are final; R1D builds the moves.
// R1 stand-in (R1D): both are refused (NOT_ALLOWED) until R1D runs the placing validators at the new
// spot with the piece itself left out, and the builders take a building down and raise it again.
import { isInt } from '../rules/geometry';
import type { HandlerFor } from './util';

export const moveDecor: HandlerFor<'decor.move'> = {
  type: 'decor.move',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || !isInt(cmd.fx) || !isInt(cmd.fz) || !isInt(cmd.rot)) return 'INVALID';
    if (!state.decor.some((d) => d.id === cmd.id)) return 'NOT_FOUND';
    return 'NOT_ALLOWED';
  },
  apply() {},
};

export const moveBuilding: HandlerFor<'build.move'> = {
  type: 'build.move',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || !isInt(cmd.x) || !isInt(cmd.z) || !isInt(cmd.rot)) return 'INVALID';
    if (cmd.rot < 0 || cmd.rot > 3) return 'INVALID';
    const b = state.buildings.find((x) => x.id === cmd.id);
    if (!b) return 'NOT_FOUND';
    return 'NOT_ALLOWED';
  },
  apply() {},
};
