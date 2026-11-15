import { effect, signal } from '@preact/signals';
import { content, type Cost, type DecorDef } from '@qoti/content';
import {
  canPlaceDecor,
  DECOR_CAP,
  DECOR_ROTATIONS,
  MAX_RUN_SEGMENTS,
  type Placement,
  type RejectReason,
} from '@qoti/sim';
import type { TilePick } from '../../render/api';
import { rejectText } from '../../ui/messages';
import { costBlock, decorChoices } from '../catalog';
import { composedRun, dragTiles, isRunnable, type Piece } from '../compose/runs';
import { isFacingSeat, seatRotation } from '../compose/seat';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

type Point = [number, number];

/** The cost of `n` pieces of one def, for the client-side affordability check. */
function scaled(cost: Cost | undefined, n: number): Cost | undefined {
  return cost?.coins === undefined ? cost : { ...cost, coins: cost.coins * n };
}

/**
 * Place decor exactly where the cursor is; R turns it an eighth. A seat set down without turning
 * it faces what is worth looking at. Lanterns and flowers dragged 2 or more tiles become a run
 * that spaces itself (one decor.placeRun with pieces); a click places one.
 */
export function decorTool(ctx: ToolContext): Tool {
  const variant = signal('bench');
  /** The player's own rotation, once they have pressed R since picking this variant. */
  let rot = 0;
  let turned = false;
  let lastVariant = variant.value;
  let tile: TilePick | null = null;
  /** A drag in progress (runnable pieces only): where it began and where it is now. */
  let dragFrom: Point | null = null;
  let dragTo: Point | null = null;
  let cx = 0;
  let cy = 0;
  let stop: (() => void) | null = null;

  /** The rotation to show and place: the player's, or a seat's own. */
  function rotationAt(def: DecorDef, fx: number, fz: number): number {
    if (turned || !isFacingSeat(def)) return rot;
    return seatRotation(ctx.mirror, fx, fz) ?? rot;
  }

  function blockedFor(defId: string, n: number): RejectReason | null {
    const def = content.decorById.get(defId);
    if (!def) return 'INVALID';
    const locked = decorChoices(ctx.mirror, 'hearth', false).find((c) => c.def.id === def.id)?.locked;
    return locked ? 'LOCKED' : costBlock(ctx.mirror, scaled(def.cost, n));
  }

  function resetDrag() {
    dragFrom = null;
    dragTo = null;
  }

  function showRun(): { def: string; pieces: Piece[]; reason: RejectReason | null } | null {
    const def = content.decorById.get(variant.value);
    if (!def || !dragFrom || !dragTo) return null;
    const pieces = composedRun(ctx.mirror, def, dragFrom, dragTo);
    const blocked: RejectReason | null = pieces.length === 0 ? 'OCCUPIED' : blockedFor(def.id, pieces.length);
    const room = ctx.mirror.decor.size + pieces.length > DECOR_CAP ? 'TOO_MANY' : null;
    const reason = blocked ?? room;
    if (pieces.length > 0)
      ctx.render.setGhost({ kind: 'decorRun', def: def.id, segments: pieces, valid: !reason });
    else ctx.render.setGhost(null);
    cursorHint(reason ? rejectText(reason) : null, cx, cy);
    return { def: def.id, pieces, reason };
  }

  function preview() {
    if (dragFrom && dragTo && dragTiles(dragFrom, dragTo) >= 2) {
      showRun();
      return null;
    }
    const def = content.decorById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const at = rotationAt(def, tile.fx, tile.fz);
    const blocked = blockedFor(def.id, 1);
    const check: Placement = blocked
      ? { ok: false, reason: blocked }
      : ctx.mirror.decor.size >= DECOR_CAP
        ? { ok: false, reason: 'TOO_MANY' }
        : canPlaceDecor(ctx.mirror, def, tile.fx, tile.fz, at);
    ctx.render.setGhost({ kind: 'decor', def: def.id, fx: tile.fx, fz: tile.fz, rot: at, valid: check.ok });
    cursorHint(check.ok ? null : rejectText(check.reason), cx, cy);
    return { def, fx: tile.fx, fz: tile.fz, rot: at, check };
  }

  function placeHere() {
    const spot = preview();
    if (!spot) return;
    if (spot.check.ok)
      ctx.submit({ t: 'decor.place', def: spot.def.id, fx: spot.fx, fz: spot.fz, rot: spot.rot });
    else ctx.ui.toast(rejectText(spot.check.reason));
  }

  function finishRun() {
    const from = dragFrom;
    const to = dragTo;
    const run = showRun();
    resetDrag();
    cursorHint(null);
    if (!run || !from || !to) return;
    if (run.reason) ctx.ui.toast(rejectText(run.reason));
    else
      ctx.submit({
        t: 'decor.placeRun',
        def: run.def,
        from,
        to,
        pieces: run.pieces.slice(0, MAX_RUN_SEGMENTS),
      });
  }

  return {
    id: 'decor',
    lane: 'hearth',
    icon: '✿',
    label: 'Decor',
    hint: 'R turns, Shift+R nudges',
    order: 40,
    get variants() {
      return decorChoices(ctx.mirror, 'hearth', false).map((c) => ({ id: c.def.id, label: c.def.name }));
    },
    variant,
    enter() {
      stop = effect(() => {
        // Picking another piece starts afresh: a seat is free to face something again.
        if (variant.value !== lastVariant) {
          lastVariant = variant.value;
          turned = false;
          resetDrag();
        }
        preview();
      });
    },
    pointerMove(p) {
      tile = p.tile;
      cx = p.clientX;
      cy = p.clientY;
      if (dragFrom && p.tile && (p.buttons & 1) !== 0) dragTo = [p.tile.fx, p.tile.fz];
      preview();
    },
    pointerDown(p) {
      tile = p.tile;
      const def = content.decorById.get(variant.value);
      if (def && isRunnable(def)) {
        // A click or a drag: it is settled on release.
        if (p.tile) {
          dragFrom = [p.tile.fx, p.tile.fz];
          dragTo = dragFrom;
        }
        preview();
        return;
      }
      placeHere();
    },
    pointerUp(p) {
      if (!dragFrom) return;
      if (p.tile) dragTo = [p.tile.fx, p.tile.fz];
      if (dragTo && dragTiles(dragFrom, dragTo) >= 2) {
        finishRun();
        return;
      }
      tile = p.tile ?? tile;
      resetDrag();
      placeHere();
    },
    key(e) {
      if (e.key !== 'r' && e.key !== 'R') return false;
      // R turns an eighth; Shift+R nudges one of the 64 fine steps. The first press starts from
      // the rotation the piece is showing (a seat's own), then the player's choice is kept.
      const def = content.decorById.get(variant.value);
      if (!turned && def && tile) rot = rotationAt(def, tile.fx, tile.fz);
      turned = true;
      rot = (rot + (e.shiftKey ? 1 : DECOR_ROTATIONS / 8)) % DECOR_ROTATIONS;
      preview();
      return true;
    },
    exit() {
      stop?.();
      stop = null;
      tile = null;
      resetDrag();
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}
