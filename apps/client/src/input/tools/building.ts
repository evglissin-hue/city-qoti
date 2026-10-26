import { effect, signal } from '@preact/signals';
import { content } from '@qoti/content';
import { canPlaceBuilding, footprintSize, type Rot4 } from '@qoti/sim';
import type { TilePick } from '../../render/api';
import { rejectText } from '../../ui/messages';
import { buildingChoices, costBlock } from '../catalog';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

/**
 * Place buildings with the cursor at the footprint's center; R rotates. The picker offers what the
 * valley's mode allows (and, in the Hearth lens, the homely ones), with costs; a refusal says why.
 */
export function buildingTool(ctx: ToolContext): Tool {
  const variant = signal('cottage');
  let rot: Rot4 = 0;
  let tile: TilePick | null = null;
  let cx = 0;
  let cy = 0;
  let stop: (() => void) | null = null;

  const choices = () => buildingChoices(ctx.mirror.settings.value.mode, ctx.ui.lens());

  function preview() {
    const def = content.buildingById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const [w, d] = footprintSize(def, rot);
    const x = tile.x - Math.floor((w - 1) / 2);
    const z = tile.z - Math.floor((d - 1) / 2);
    const place = canPlaceBuilding(ctx.mirror, def, x, z, rot);
    const blocked = place.ok ? costBlock(ctx.mirror, def.cost) : null;
    const check = blocked ? { ok: false, reason: blocked } : place;
    ctx.render.setGhost({ kind: 'building', def: def.id, x, z, rot, valid: check.ok });
    cursorHint(check.ok ? null : rejectText(check.reason), cx, cy);
    return { def, x, z, check };
  }

  return {
    id: 'building',
    lane: 'shared',
    icon: '⌂',
    label: 'Build',
    hint: 'R rotates',
    order: 30,
    get variants() {
      return choices().map((d) => ({ id: d.id, label: d.name }));
    },
    variant,
    enter() {
      // A valley mode or lens may not offer the last pick (a house in a standard valley).
      const offered = choices();
      if (offered.length && !offered.some((d) => d.id === variant.value)) variant.value = offered[0]!.id;
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
      if (spot.check.ok) ctx.submit({ t: 'build.place', def: spot.def.id, x: spot.x, z: spot.z, rot });
      else ctx.ui.toast(rejectText(spot.check.reason));
    },
    key(e) {
      if (e.key !== 'r' && e.key !== 'R') return false;
      rot = ((rot + 1) % 4) as Rot4;
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
