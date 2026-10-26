import { signal } from '@preact/signals';
import { content } from '@qoti/content';
import { canPlaceDecorRun, TILE_FP } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import type { Tool } from '../tool';

const VARIANTS = [
  { id: 'fence', label: 'Fence' },
  { id: 'hedge', label: 'Hedge' },
  { id: 'low-wall', label: 'Low wall' },
];

const center = (t: number) => t * TILE_FP + TILE_FP / 2;

/** Linear decor: drag a line and it becomes a run of 1-tile segments. */
export function fenceTool(ctx: ToolContext): Tool {
  const variant = signal('fence');
  let start: [number, number] | null = null;
  let end: [number, number] | null = null;

  function preview() {
    const def = content.decorById.get(variant.value);
    if (!def || !start || !end) return null;
    const check = canPlaceDecorRun(ctx.mirror, def, start, end);
    ctx.render.setGhost({ kind: 'decorRun', def: def.id, segments: check.segments, valid: check.ok });
    return { def, check };
  }

  return {
    id: 'fence',
    lane: 'hearth',
    icon: '╫',
    label: 'Fence',
    hint: 'Drag to draw',
    order: 50,
    variants: VARIANTS,
    variant,
    pointerDown(p) {
      if (!p.tile) return;
      start = [center(p.tile.x), center(p.tile.z)];
      end = start;
      preview();
    },
    pointerMove(p) {
      if (!p.tile) return;
      end = [center(p.tile.x), center(p.tile.z)];
      if (start) preview();
      else ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
    },
    pointerUp() {
      const result = preview();
      const from = start;
      const to = end;
      start = null;
      if (!result || !from || !to) return;
      if (result.check.ok) ctx.submit({ t: 'decor.placeRun', def: result.def.id, from, to });
      else ctx.ui.toast(rejectText(result.check.reason));
    },
    exit() {
      start = null;
      end = null;
      ctx.render.setGhost(null);
    },
  };
}
