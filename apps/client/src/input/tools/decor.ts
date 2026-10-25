import { effect, signal } from '@preact/signals';
import { content } from '@qoti/content';
import { canPlaceDecor, DECOR_CAP, DECOR_ROTATIONS } from '@qoti/sim';
import type { TilePick } from '../../render/api';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

const VARIANTS = [
  { id: 'bench', label: 'Bench' },
  { id: 'lantern', label: 'Lantern' },
  { id: 'flower-bed', label: 'Flower bed' },
];

/** Place decor exactly where the cursor is; R turns it an eighth. */
export function decorTool(ctx: ToolContext): Tool {
  const variant = signal('bench');
  let rot = 0;
  let tile: TilePick | null = null;
  let cx = 0;
  let cy = 0;
  let stop: (() => void) | null = null;

  function preview() {
    const def = content.decorById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const check =
      ctx.mirror.decor.size >= DECOR_CAP
        ? { ok: false, reason: 'TOO_MANY' as const }
        : canPlaceDecor(ctx.mirror, def, tile.fx, tile.fz, rot);
    ctx.render.setGhost({ kind: 'decor', def: def.id, fx: tile.fx, fz: tile.fz, rot, valid: check.ok });
    cursorHint(check.ok ? null : rejectText(check.reason), cx, cy);
    return { def, fx: tile.fx, fz: tile.fz, check };
  }

  return {
    id: 'decor',
    lane: 'hearth',
    icon: '✿',
    label: 'Decor',
    hint: 'R turns, Shift+R nudges',
    order: 40,
    variants: VARIANTS,
    variant,
    enter() {
      stop = effect(() => {
        void variant.value;
        preview();
      });
    },
    pointerMove(p) {
      tile = p.tile;
      cx = p.clientX;
      cy = p.clientY;
      preview();
    },
    pointerDown(p) {
      tile = p.tile;
      const spot = preview();
      if (!spot) return;
      if (spot.check.ok) ctx.submit({ t: 'decor.place', def: spot.def.id, fx: spot.fx, fz: spot.fz, rot });
      else ctx.ui.toast(rejectText(spot.check.reason));
    },
    key(e) {
      if (e.key !== 'r' && e.key !== 'R') return false;
      // R turns an eighth; Shift+R nudges one of the 64 fine steps.
      rot = (rot + (e.shiftKey ? 1 : DECOR_ROTATIONS / 8)) % DECOR_ROTATIONS;
      preview();
      return true;
    },
    exit() {
      stop?.();
      stop = null;
      tile = null;
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}
