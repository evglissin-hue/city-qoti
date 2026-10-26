import { effect, signal } from '@preact/signals';
import { content } from '@qoti/content';
import { canPlaceBuilding, footprintSize, type Rot4 } from '@qoti/sim';
import type { TilePick } from '../../render/api';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import type { Tool } from '../tool';

const VARIANTS = [
  { id: 'cottage', label: 'Cottage' },
  { id: 'house', label: 'House' },
  { id: 'well', label: 'Well' },
];

/** Place buildings with the cursor at the footprint's center; R rotates. */
export function buildingTool(ctx: ToolContext): Tool {
  const variant = signal('cottage');
  let rot: Rot4 = 0;
  let tile: TilePick | null = null;
  let stop: (() => void) | null = null;

  function preview() {
    const def = content.buildingById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      return null;
    }
    const [w, d] = footprintSize(def, rot);
    const x = tile.x - Math.floor((w - 1) / 2);
    const z = tile.z - Math.floor((d - 1) / 2);
    const check = canPlaceBuilding(ctx.mirror, def, x, z, rot);
    ctx.render.setGhost({ kind: 'building', def: def.id, x, z, rot, valid: check.ok });
    return { def, x, z, check };
  }

  return {
    id: 'building',
    lane: 'shared',
    icon: '⌂',
    label: 'Build',
    hint: 'R rotates',
    order: 30,
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
    },
  };
}
