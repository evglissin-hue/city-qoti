import { content } from '@qoti/content';
import { footprintTiles } from '@qoti/sim';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

/** Hearth: click any building to paint it and dress it up (walls, roof, trim, details, a sign). */
export function customizeTool(ctx: ToolContext): Tool {
  return {
    id: 'customize',
    lane: 'hearth',
    icon: '✎',
    label: 'Customize',
    hint: 'Click a building to dress it up',
    order: 45,
    pointerMove(p) {
      const hit = ctx.render.pickEntity(p.clientX, p.clientY);
      const b = hit?.kind === 'building' ? ctx.mirror.buildings.get(hit.id) : undefined;
      const def = b ? content.buildingById.get(b.def) : undefined;
      if (b && def) {
        ctx.render.setGhost({ kind: 'tiles', tiles: footprintTiles(def, b.x, b.z, b.rot), valid: true });
        cursorHint(def.name, p.clientX, p.clientY);
      } else {
        ctx.render.setGhost(null);
        cursorHint(null);
      }
    },
    pointerDown(p) {
      const hit = ctx.render.pickEntity(p.clientX, p.clientY);
      if (hit?.kind === 'building' && ctx.mirror.buildings.has(hit.id)) ctx.ui.customize?.(hit.id);
      else ctx.ui.toast('Pick a building to dress up.');
    },
    exit() {
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}
