import { canPaintRoad, type RoadKind } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import { proposeRoute } from '../route';
import type { Tool } from '../tool';

/** Drag from A to B: the tool proposes a straight or L-shaped run and paints it on release. */
export function roadTool(kind: RoadKind): (ctx: ToolContext) => Tool {
  return (ctx) => {
    let start: [number, number] | null = null;
    let last: [number, number] | null = null;

    function preview(tiles: [number, number][]) {
      const check = canPaintRoad(ctx.mirror, kind, tiles);
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
      hint: 'Drag to draw',
      order: kind === 'path' ? 10 : 20,
      pointerMove(p) {
        if (!p.tile) return;
        last = [p.tile.x, p.tile.z];
        preview(start ? proposeRoute(start, last) : [last]);
      },
      pointerDown(p) {
        if (!p.tile) return;
        start = [p.tile.x, p.tile.z];
        last = start;
        preview([start]);
      },
      pointerUp(p) {
        if (!start) return;
        const end: [number, number] = p.tile ? [p.tile.x, p.tile.z] : (last ?? start);
        const tiles = proposeRoute(start, end);
        start = null;
        const check = preview(tiles);
        if (check.ok) ctx.submit({ t: 'road.paint', kind, tiles });
        else ctx.ui.toast(rejectText(check.reason));
      },
      exit() {
        start = null;
        last = null;
        ctx.render.setGhost(null);
      },
    };
  };
}
