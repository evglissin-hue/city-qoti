import { planCovers } from '../../ui/plans';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

/**
 * Plans (shared): opens the plans book and draws every open plan's blueprint; clicking a blueprint
 * picks that plan. Sketching itself uses the ordinary tools while a sketch is open.
 */
export function planTool(ctx: ToolContext): Tool {
  function planAt(x: number, z: number): number | null {
    const open = [...ctx.mirror.plans.values()]
      .filter((p) => p.status === 'open')
      .sort((a, b) => b.tick - a.tick || b.id - a.id);
    return open.find((p) => planCovers(p.items, ctx.mirror, x, z))?.id ?? null;
  }

  return {
    id: 'plan',
    lane: 'shared',
    icon: '▱',
    label: 'Plans',
    hint: 'Sketch, talk it over, approve',
    order: 75,
    enter() {
      ctx.ui.openPanel?.('plans');
    },
    pointerMove(p) {
      if (!p.tile) {
        cursorHint(null);
        return;
      }
      const id = planAt(p.tile.x, p.tile.z);
      const plan = id !== null ? ctx.mirror.plans.get(id) : undefined;
      cursorHint(plan ? plan.name : null, p.clientX, p.clientY);
    },
    pointerDown(p) {
      if (!p.tile) return;
      const id = planAt(p.tile.x, p.tile.z);
      ctx.ui.focusPlan?.(id);
      if (id !== null) ctx.ui.openPanel?.('plans');
    },
    exit() {
      cursorHint(null);
    },
  };
}
