import { canPaintRoad, type RoadKind } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import { proposeRoute } from '../route';
import type { Tool } from '../tool';

/** Drag from A to B: the tool proposes a straight or L-shaped run and paints it on release. */
export function roadTool(kind: RoadKind): (ctx: ToolContext) => Tool {
  return (ctx) => {
    let start: [number, number] | null = null;
    let last: [number, number] | null = null;
    let flip = false;
    let cx = 0;
    let cy = 0;

    function preview(tiles: [number, number][]) {
      const check = canPaintRoad(ctx.mirror, kind, tiles);
      cursorHint(check.ok ? (start ? INPUT_COPY.roadHint : null) : rejectText(check.reason), cx, cy);
      ctx.render.setGhost({
        kind: 'road',
        road: kind,
        tiles,
        valid: check.ok,
        ...(check.firstBadTile ? { badTile: check.firstBadTile } : {}),
      });
      return check;
    }

    return {
      id: kind,
      lane: kind === 'path' ? 'hearth' : 'ledger',
      icon: kind === 'path' ? '┄' : '═',
      label: kind === 'path' ? 'Path' : 'Lane',
      hint: 'Drag to draw, F flips the bend',
      order: kind === 'path' ? 10 : 20,
      pointerMove(p) {
        cx = p.clientX;
        cy = p.clientY;
        if (!p.tile) return;
        last = [p.tile.x, p.tile.z];
        preview(start ? proposeRoute(start, last, flip) : [last]);
      },
      pointerDown(p) {
        cx = p.clientX;
        cy = p.clientY;
        if (!p.tile) return;
        start = [p.tile.x, p.tile.z];
        last = start;
        preview([start]);
      },
      pointerUp(p) {
        if (!start) return;
        const end: [number, number] = p.tile ? [p.tile.x, p.tile.z] : (last ?? start);
        const tiles = proposeRoute(start, end, flip);
        start = null;
        const check = preview(tiles);
        if (check.ok) ctx.submit({ t: 'road.paint', kind, tiles });
        else ctx.ui.toast(rejectText(check.reason));
        preview([end]);
      },
      key(e) {
        if (e.key === 'f' || e.key === 'F') {
          flip = !flip;
          if (start && last) preview(proposeRoute(start, last, flip));
          return true;
        }
        if (e.key === 'Escape' && start) {
          start = null;
          if (last) preview([last]);
          else ctx.render.setGhost(null);
          cursorHint(null);
          return true;
        }
        return false;
      },
      exit() {
        start = null;
        last = null;
        ctx.render.setGhost(null);
        cursorHint(null);
      },
    };
  };
}
