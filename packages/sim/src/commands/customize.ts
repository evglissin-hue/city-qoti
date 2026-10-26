// build.customize (C3.0 stub; C3B owns it): paint and details, marks the building handmade.
// docs/spec/10-world-and-building.md, Customization phase 1.
import { findById } from '../state/entities';
import type { HandlerFor } from './util';

export const customize: HandlerFor<'build.customize'> = {
  type: 'build.customize',
  validate(state, _seat, cmd) {
    if (typeof cmd.custom !== 'object' || cmd.custom === null || Array.isArray(cmd.custom)) return 'INVALID';
    return findById(state.buildings, cmd.id) ? null : 'NOT_FOUND';
  },
  apply() {
    // C3B
  },
};
