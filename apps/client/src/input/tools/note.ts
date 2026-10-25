import { MAX_NOTE_CHARS } from '@qoti/sim';
import type { ToolContext } from '../context';
import type { Tool } from '../tool';

/** Pin a note to a tile for your partner (or future you). */
export function noteTool(ctx: ToolContext): Tool {
  let busy = false;
  return {
    id: 'note',
    lane: 'shared',
    icon: '✎',
    label: 'Note',
    hint: 'Click to pin',
    order: 70,
    pointerMove(p) {
      if (p.tile) ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
      else ctx.render.setGhost(null);
    },
    pointerDown(p) {
      if (!p.tile || busy) return;
      const { x, z } = p.tile;
      busy = true;
      void ctx.ui.prompt('Pin a note', 'Bakery here? Keep the meadow?', MAX_NOTE_CHARS).then((text) => {
        busy = false;
        if (text && text.trim()) ctx.submit({ t: 'note.pin', x, z, text: text.trim() });
      });
    },
    exit() {
      ctx.render.setGhost(null);
    },
  };
}
