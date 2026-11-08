// Modules (C5.0 baseline; C5C owns customization phase 2). docs/spec/10-world-and-building.md,
// Customization phase 2: a porch, a dormer, a bay window, an extra floor, a balcony, a tower, an
// arcade, ivy or flower boxes, each in a slot the def declares (`moduleSlots`). From Village rank;
// coins now, goods by porter (systems/modules), one module under way at a time, never while a home
// upgrade waits for its own materials.
import { content, type ModuleSlot } from '@qoti/content';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { isStandard } from '../state/hamlet';
import { rankAtLeast } from '../state/village';
import { spendBlocked } from '../systems/economy/api';
import { moduleCoins, orderModule, removeModule } from '../systems/modules';
import type { HandlerFor } from './util';

export const setModule: HandlerFor<'build.setModule'> = {
  type: 'build.setModule',
  validate(state, _seat, cmd) {
    if (!isInt(cmd.id) || typeof cmd.slot !== 'string') return 'INVALID';
    const b = findById(state.buildings, cmd.id);
    if (!b) return 'NOT_FOUND';
    if (!b.rt || b.stage !== 'built') return 'NOT_ALLOWED';
    const slots = content.buildingById.get(b.def)?.moduleSlots ?? [];
    if (!slots.some(([s]) => s === (cmd.slot as ModuleSlot))) return 'NOT_ALLOWED';
    const rt = b.rt;
    if (cmd.module === null) {
      const fitted = (rt.modules ?? []).some(([s]) => s === cmd.slot);
      return fitted || rt.moduleNext?.[0] === cmd.slot ? null : 'NOT_FOUND';
    }
    const m = typeof cmd.module === 'string' ? content.moduleById.get(cmd.module) : undefined;
    if (!m || m.slot !== cmd.slot) return 'INVALID';
    if (isStandard(state) && !rankAtLeast(state, 'village')) return 'LOCKED';
    if (rt.moduleNext || rt.upgrade) return 'NOT_READY';
    if ((rt.modules ?? []).some(([s, id]) => s === cmd.slot && id === m.id)) return 'INVALID';
    return spendBlocked(state, moduleCoins(m));
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    if (cmd.module === null) removeModule(state, ctx, b, cmd.slot);
    else orderModule(state, ctx, b, cmd.slot, content.moduleById.get(cmd.module)!);
  },
};
