import { MAP_SIZE } from '@qoti/sim';
import type { ToolContext } from '../context';
import type { PointerInfo, Tool } from '../tool';

/** Click to look at something; left-drag on the ground pans the camera. */
export function inspectTool(ctx: ToolContext): Tool {
  let down: { x: number; y: number } | null = null;
  let dragging = false;

  function select(p: PointerInfo): void {
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    if (hit?.kind === 'tree')
      ctx.ui.select({ kind: 'tree', x: hit.id % MAP_SIZE, z: Math.floor(hit.id / MAP_SIZE) });
    else if (hit) ctx.ui.select({ kind: hit.kind, id: hit.id });
    else if (p.tile) ctx.ui.select({ kind: 'tile', x: p.tile.x, z: p.tile.z });
    else ctx.ui.select(null);
  }

  return {
    id: 'inspect',
    lane: 'shared',
    icon: '◎',
    label: 'Inspect',
    hint: 'Click to look, drag to pan',
    order: 0,
    pointerDown(p) {
      down = { x: p.clientX, y: p.clientY };
      dragging = false;
    },
    pointerMove(p) {
      if (!down || !(p.buttons & 1)) return;
      const dx = p.clientX - down.x;
      const dy = p.clientY - down.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 5) return;
      dragging = true;
      ctx.camera.panByPixels(dx, dy);
      down = { x: p.clientX, y: p.clientY };
    },
    pointerUp(p) {
      if (down && !dragging) select(p);
      down = null;
      dragging = false;
    },
    exit() {
      down = null;
      dragging = false;
    },
  };
}
