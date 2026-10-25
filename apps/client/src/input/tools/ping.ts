import { pingMenu, sendPing } from '../../ui/pingBus';
import type { ToolContext } from '../context';
import type { Tool } from '../tool';

/** Ping a spot for your partner: click for "Look here", Alt+click for the full menu. */
export function pingTool(ctx: ToolContext): Tool {
  return {
    id: 'ping',
    lane: 'shared',
    icon: '◉',
    label: 'Ping',
    hint: 'Click to say look here; Alt+click for more',
    order: 80,
    pointerMove(p) {
      if (p.tile) ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
      else ctx.render.setGhost(null);
    },
    pointerDown(p) {
      if (!p.tile) return;
      if (p.altKey) {
        pingMenu.value = { x: p.tile.x, z: p.tile.z, sx: p.clientX, sy: p.clientY };
        return;
      }
      sendPing(p.tile.x, p.tile.z, 'look');
    },
    exit() {
      ctx.render.setGhost(null);
    },
  };
}
