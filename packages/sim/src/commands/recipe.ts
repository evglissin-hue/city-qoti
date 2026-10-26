// Pinning a production method (C4.0 baseline; C4C owns production, C4B grown crafts and farms).
// A pinned method is the one the building runs; null lets it choose again (grown buildings follow
// shortages, hand-placed ones fall back to their first method).
import { content } from '@qoti/content';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { emitBuilding } from '../systems/economy/emit';
import type { HandlerFor } from './util';

export const pinRecipe: HandlerFor<'build.pinRecipe'> = {
  type: 'build.pinRecipe',
  validate(state, _seat, cmd) {
    const b = isInt(cmd.id) ? findById(state.buildings, cmd.id) : undefined;
    if (!b) return 'NOT_FOUND';
    const methods = content.buildingById.get(b.def)?.methods ?? [];
    if (!b.rt || methods.length === 0) return 'NOT_ALLOWED';
    if (cmd.method === null) return null;
    return typeof cmd.method === 'string' && methods.some((m) => m.id === cmd.method) ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    const rt = b.rt!;
    const methods = content.buildingById.get(b.def)?.methods ?? [];
    if (cmd.method === null) {
      delete rt.pinned;
      rt.method = 0;
    } else {
      rt.pinned = cmd.method;
      rt.method = Math.max(
        0,
        methods.findIndex((m) => m.id === cmd.method),
      );
    }
    rt.progress = 0;
    emitBuilding(state, ctx, b);
  },
};
