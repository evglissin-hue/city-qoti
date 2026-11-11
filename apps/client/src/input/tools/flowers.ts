import { content, type DecorDef } from '@qoti/content';
import { DECOR_CAP, TILE_FP, type RejectReason } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import { costBlock, decorChoices } from '../catalog';
import { brushPieces, brushSeed, isBrushFlower, strokeTiles } from '../compose/brush';
import { type Piece } from '../compose/runs';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

type Point = [number, number];

/** The flowers the brush may paint: unlocked, affordable, one piece at a time (not the verges). */
export function brushDefs(ctx: ToolContext): DecorDef[] {
  return decorChoices(ctx.mirror, 'hearth', false)
    .filter((c) => !c.locked && isBrushFlower(c.def))
    .filter((c) => !costBlock(ctx.mirror, c.def.cost))
    .map((c) => c.def);
}

/** Drag to paint a drift of mixed flowers; it goes out on release as one decor.placeRun. */
export function flowersTool(ctx: ToolContext): Tool {
  let stroke: Point[] | null = null;
  let seed = 0;
  let cx = 0;
  let cy = 0;

  function drift(): Piece[] {
    if (!stroke) return [];
    return brushPieces(ctx.mirror, brushDefs(ctx), strokeTiles(stroke), seed);
  }

  /** Why the drift cannot go down, or null. */
  function blocked(pieces: Piece[]): RejectReason | null {
    if (pieces.length === 0) return 'OCCUPIED';
    if (ctx.mirror.decor.size + pieces.length > DECOR_CAP) return 'TOO_MANY';
    // Each flower def must be affordable for as many pieces as the drift holds of it.
    const counts = new Map<string, number>();
    for (const p of pieces) counts.set(p.def, (counts.get(p.def) ?? 0) + 1);
    for (const [id, n] of counts) {
      const cost = content.decorById.get(id)?.cost;
      const reason = costBlock(
        ctx.mirror,
        cost?.coins === undefined ? cost : { ...cost, coins: cost.coins * n },
      );
      if (reason) return reason;
    }
    return null;
  }

  function show(pieces: Piece[]) {
    const reason = stroke ? blocked(pieces) : null;
    // The renderer has one ghost per tool and no mixed-piece kind yet, so the drift shows as the
    // tiles it will cover.
    const tiles: [number, number][] = [];
    for (const p of pieces) {
      const t: [number, number] = [Math.floor(p.fx / TILE_FP), Math.floor(p.fz / TILE_FP)];
      if (!tiles.some((o) => o[0] === t[0] && o[1] === t[1])) tiles.push(t);
    }
    if (tiles.length) ctx.render.setGhost({ kind: 'tiles', tiles, valid: !reason });
    cursorHint(reason ? rejectText(reason) : null, cx, cy);
  }

  return {
    id: 'flowers',
    lane: 'hearth',
    icon: '❀',
    label: 'Flower brush',
    hint: 'Drag to paint a drift of flowers',
    order: 42,
    pointerDown(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      seed = brushSeed(p.tile.x, p.tile.z);
      stroke = [[p.tile.fx, p.tile.fz]];
      show(drift());
    },
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      if (!stroke) {
        ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
        return;
      }
      stroke.push([p.tile.fx, p.tile.fz]);
      show(drift());
    },
    pointerUp(p) {
      if (!stroke) return;
      if (p.tile) stroke.push([p.tile.fx, p.tile.fz]);
      const pieces = drift();
      const reason = blocked(pieces);
      const from = stroke[0]!;
      const to = stroke[stroke.length - 1]!;
      stroke = null;
      cursorHint(null);
      ctx.render.setGhost(null);
      if (reason) {
        ctx.ui.toast(rejectText(reason));
        return;
      }
      ctx.submit({ t: 'decor.placeRun', def: pieces[0]!.def, from, to, pieces });
    },
    exit() {
      stroke = null;
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}
