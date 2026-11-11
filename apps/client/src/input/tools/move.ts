import { content } from '@qoti/content';
import {
  canPlaceBuilding,
  canPlaceDecor,
  DECOR_ROTATIONS,
  footprintSize,
  footprintTiles,
  movedReaches,
  readerWithout,
  staysPut,
  TILE_FP,
  type RejectReason,
  type Rot4,
} from '@qoti/sim';
import type { TilePick } from '../../render/api';
import type { Mirror } from '../../state/mirror';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import { moveWithCare } from '../removal';
import type { Tool } from '../tool';

/** A piece picked up to be set down somewhere else. */
export type Picked =
  | { kind: 'decor'; id: number; def: string; fx: number; fz: number; rot: number; builtBy: 0 | 1 | 2 | 3 }
  | {
      kind: 'building';
      id: number;
      def: string;
      x: number;
      z: number;
      rot: Rot4;
      builtBy: 0 | 1 | 2 | 3;
      handmade: boolean;
    };

/**
 * What a click on this entity picks up: the piece, or the reason it stays (a grown building, the
 * town hall of a standard valley, walls, gates and landmarks), or null when it is not movable.
 */
export function pickUp(m: Mirror, hit: { kind: string; id: number }): Picked | RejectReason | null {
  if (hit.kind === 'decor') {
    const d = m.decor.get(hit.id);
    return d ? { kind: 'decor', ...d } : null;
  }
  if (hit.kind !== 'building') return null;
  const b = m.buildings.get(hit.id);
  const def = b && content.buildingById.get(b.def);
  if (!b || !def) return null;
  if (b.lot) return 'NOT_ALLOWED';
  if (m.settings.value.mode === 'standard' && b.def === 'town-hall') return 'HALL_STAYS';
  if (staysPut(def)) return 'NOT_ALLOWED';
  return {
    kind: 'building',
    id: b.id,
    def: b.def,
    x: b.x,
    z: b.z,
    rot: b.rot,
    builtBy: b.builtBy,
    handmade: b.handmade,
  };
}

/** Where the picked piece would stand with the cursor on `tile`, and whether the sim would allow it. */
export function checkSpot(
  m: Mirror,
  picked: Picked,
  tile: Pick<TilePick, 'x' | 'z' | 'fx' | 'fz'>,
  rot: number,
): { ok: boolean; reason?: RejectReason; at: { x: number; z: number; fx: number; fz: number } } {
  if (picked.kind === 'decor') {
    const def = content.decorById.get(picked.def);
    const at = { x: tile.x, z: tile.z, fx: tile.fx, fz: tile.fz };
    if (!def) return { ok: false, reason: 'INVALID', at };
    const r = canPlaceDecor(readerWithout(m, { decor: picked.id }), def, tile.fx, tile.fz, rot);
    return { ok: r.ok, ...(r.reason && { reason: r.reason }), at };
  }
  const def = content.buildingById.get(picked.def);
  const rot4 = (rot & 3) as Rot4;
  if (!def) return { ok: false, reason: 'INVALID', at: { x: tile.x, z: tile.z, fx: 0, fz: 0 } };
  const [w, d] = footprintSize(def, rot4);
  const x = tile.x - Math.floor((w - 1) / 2);
  const z = tile.z - Math.floor((d - 1) / 2);
  const at = { x, z, fx: 0, fz: 0 };
  const r = canPlaceBuilding(readerWithout(m, { building: picked.id }), def, x, z, rot4);
  if (!r.ok) return { ok: false, ...(r.reason && { reason: r.reason }), at };
  if (
    m.settings.value.mode === 'standard' &&
    !movedReaches(m, [...m.buildings.values()], { id: picked.id, def: picked.def }, x, z, rot4)
  )
    return { ok: false, reason: 'CUT_OFF', at };
  return { ok: true, at };
}

/** Click a piece, then where it goes. R turns, Esc puts it back. Costs nothing. */
export function moveTool(ctx: ToolContext): Tool {
  let picked: Picked | null = null;
  let rot = 0;
  let tile: TilePick | null = null;
  let cx = 0;
  let cy = 0;
  let busy = false;

  function show(): {
    ok: boolean;
    reason?: RejectReason;
    x: number;
    z: number;
    fx: number;
    fz: number;
  } | null {
    if (!picked || !tile) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const check = checkSpot(ctx.mirror, picked, tile, rot);
    if (picked.kind === 'decor') {
      ctx.render.setGhost({ kind: 'decor', def: picked.def, fx: tile.fx, fz: tile.fz, rot, valid: check.ok });
    } else {
      ctx.render.setGhost({
        kind: 'building',
        def: picked.def,
        x: check.at.x,
        z: check.at.z,
        rot: (rot & 3) as Rot4,
        valid: check.ok,
      });
    }
    cursorHint(check.ok ? null : rejectText(check.reason ?? 'INVALID'), cx, cy);
    return { ok: check.ok, ...(check.reason && { reason: check.reason }), ...check.at };
  }

  function hover(p: { clientX: number; clientY: number }): void {
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    const what = hit && pickUp(ctx.mirror, hit);
    if (!hit || !what || typeof what === 'string') {
      ctx.render.setGhost(null);
      return;
    }
    if (what.kind === 'building') {
      const def = content.buildingById.get(what.def);
      if (def)
        ctx.render.setGhost({
          kind: 'tiles',
          tiles: footprintTiles(def, what.x, what.z, what.rot),
          valid: true,
        });
    } else {
      ctx.render.setGhost({
        kind: 'tiles',
        tiles: [[Math.floor(what.fx / TILE_FP), Math.floor(what.fz / TILE_FP)]],
        valid: true,
      });
    }
  }

  function drop(): void {
    picked = null;
    busy = false;
    ctx.render.setGhost(null);
    cursorHint(null);
  }

  async function setDown(spot: { x: number; z: number; fx: number; fz: number }): Promise<void> {
    const p = picked;
    if (!p) return;
    busy = true;
    if (p.kind === 'decor') {
      const thing = content.decorById.get(p.def)?.name.toLowerCase() ?? INPUT_COPY.piece;
      await moveWithCare(
        ctx,
        {
          builtBy: p.builtBy,
          handmade: true,
          thing,
          x: Math.floor(p.fx / TILE_FP),
          z: Math.floor(p.fz / TILE_FP),
        },
        { t: 'decor.move', id: p.id, fx: spot.fx, fz: spot.fz, rot },
      );
    } else {
      const thing = content.buildingById.get(p.def)?.name.toLowerCase() ?? INPUT_COPY.piece;
      await moveWithCare(
        ctx,
        { builtBy: p.builtBy, handmade: p.handmade, thing, x: p.x, z: p.z, building: true },
        { t: 'build.move', id: p.id, x: spot.x, z: spot.z, rot: (rot & 3) as Rot4 },
      );
    }
    drop();
  }

  return {
    id: 'move',
    lane: 'shared',
    icon: '✥',
    label: 'Move',
    hint: INPUT_COPY.moveHint,
    order: 42,
    pointerMove(p) {
      tile = p.tile;
      cx = p.clientX;
      cy = p.clientY;
      if (picked) show();
      else hover(p);
    },
    pointerDown(p) {
      if (busy) return;
      tile = p.tile;
      if (!picked) {
        const hit = ctx.render.pickEntity(p.clientX, p.clientY);
        if (!hit) return;
        const what = pickUp(ctx.mirror, hit);
        if (typeof what === 'string') {
          ctx.ui.toast(rejectText(what));
          return;
        }
        if (!what) return;
        picked = what;
        rot = what.rot;
        show();
        return;
      }
      const spot = show();
      if (!spot) return;
      if (!spot.ok) {
        ctx.ui.toast(rejectText(spot.reason ?? 'INVALID'));
        return;
      }
      void setDown(spot);
    },
    key(e) {
      if (e.key === 'Escape' && picked) {
        drop();
        return true;
      }
      if ((e.key !== 'r' && e.key !== 'R') || !picked) return false;
      rot = picked.kind === 'decor' ? (rot + DECOR_ROTATIONS / 8) % DECOR_ROTATIONS : (rot + 1) % 4;
      show();
      return true;
    },
    exit() {
      drop();
    },
  };
}
