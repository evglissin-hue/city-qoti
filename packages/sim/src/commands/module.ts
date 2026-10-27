// Modules (C5.0 baseline; C5C owns customization phase 2). docs/spec/10-world-and-building.md,
// Customization phase 2: a porch, a dormer, a bay window, an extra floor, a tower, an arcade, ivy or
// flower boxes on walls, each in a slot the def declares. C5C adds costs, materials by porter
// (rt.moduleWork) and charm.
import { content, type ModuleSlot } from '@qoti/content';
import { isInt } from '../rules/geometry';
import { findById } from '../state/entities';
import { buildingView } from '../view';
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
    if (cmd.module === null) return (b.rt.modules ?? []).some(([s]) => s === cmd.slot) ? null : 'NOT_FOUND';
    const m = typeof cmd.module === 'string' ? content.moduleById.get(cmd.module) : undefined;
    if (!m) return 'INVALID';
    return m.slot === cmd.slot ? null : 'INVALID';
  },
  apply(state, _seat, cmd, ctx) {
    const b = findById(state.buildings, cmd.id)!;
    const rt = b.rt!;
    const list = (rt.modules ?? []).filter(([s]) => s !== cmd.slot);
    if (cmd.module !== null) list.push([cmd.slot, cmd.module]);
    list.sort((a, c) => (a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : 0));
    if (list.length) rt.modules = list;
    else delete rt.modules;
    b.handmade = true;
    ctx.events.push({ e: 'building.updated', b: buildingView(b) });
  },
};
