import { canPlantTree } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import type { PointerInfo, Tool } from '../tool';

/** Plant oak saplings: click for one, drag for a row. */
export function treeTool(ctx: ToolContext): Tool {
  let planted = new Set<number>();

  function preview(p: PointerInfo) {
    if (!p.tile) {
      ctx.render.setGhost(null);
      return null;
    }
    const check = canPlantTree(ctx.mirror, p.tile.x, p.tile.z);
    ctx.render.setGhost({ kind: 'tree', species: 'oak', x: p.tile.x, z: p.tile.z, valid: check.ok });
    return check;
  }

  function plant(p: PointerInfo, quiet: boolean): void {
    const check = preview(p);
    if (!check || !p.tile) return;
    const key = p.tile.z * ctx.mirror.size + p.tile.x;
    if (planted.has(key)) return;
    planted.add(key);
    if (check.ok) ctx.submit({ t: 'tree.plant', species: 'oak', x: p.tile.x, z: p.tile.z });
    else if (!quiet) ctx.ui.toast(rejectText(check.reason));
  }

  return {
    id: 'tree',
    lane: 'hearth',
    icon: '♣',
    label: 'Tree',
    hint: 'Drag to plant a row',
    order: 60,
    pointerDown(p) {
      planted = new Set();
      plant(p, false);
    },
    pointerMove(p) {
      if (p.buttons & 1) plant(p, true);
      else preview(p);
    },
    pointerUp() {
      planted = new Set();
    },
    exit() {
      ctx.render.setGhost(null);
    },
  };
}
