import { content } from '@qoti/content';
import { canPaintRoad, type RoadKind } from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import { proposeRoute } from '../route';
import type { Tool } from '../tool';

// I2 (C4F): streets need the Cobbles innovation (content `requires`), in standard valleys.
const LOOKS: Record<RoadKind, { lane: Tool['lane']; icon: string; label: string; order: number }> = {
  path: { lane: 'hearth', icon: '┄', label: 'Path', order: 10 },
  lane: { lane: 'ledger', icon: '═', label: 'Lane', order: 20 },
  street: { lane: 'ledger', icon: '▦', label: 'Street', order: 22 },
};

/** Drag from A to B: the tool proposes a straight or L-shaped run and paints it on release. */
export function roadTool(kind: RoadKind): (ctx: ToolContext) => Tool {
  return (ctx) => {
    let start: [number, number] | null = null;
    let last: [number, number] | null = null;
    let flip = false;
    let cx = 0;
    let cy = 0;

    /** Why this road cannot be painted yet (a locked street), or null. */
    function locked(): string | null {
      const def = content.roads.find((r) => r.id === kind);
      const needs = def?.requires?.innovation;
      if (!needs || ctx.mirror.settings.value.mode !== 'standard') return null;
      if (ctx.mirror.town.value?.unlocked.includes(kind)) return null;
      return INPUT_COPY.streetLocked(content.innovationById.get(needs)?.name ?? needs);
    }

    function preview(tiles: [number, number][]) {
      const lock = locked();
      if (lock) {
        cursorHint(lock, cx, cy);
        ctx.render.setGhost({ kind: 'road', road: kind, tiles, valid: false });
        return { ok: false as const, reason: undefined, lock };
      }
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
      ...LOOKS[kind],
      hint: 'Drag to draw, F flips the bend',
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
        else ctx.ui.toast('lock' in check && check.lock ? check.lock : rejectText(check.reason));
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
