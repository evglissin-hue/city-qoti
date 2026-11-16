import { content } from '@qoti/content';
import { doorFront, MAP_SIZE } from '@qoti/sim';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import { proposeRoute } from '../route';
import type { Tool } from '../tool';

type Tile = [number, number];

/** Names of the workshops, sheds and stores whose door opens on a marked tile (they wait for carts). */
function waiting(ctx: ToolContext, marked: ReadonlySet<number>): string[] {
  const names: string[] = [];
  for (const b of ctx.mirror.buildings.values()) {
    const def = content.buildingById.get(b.def);
    if (!def || def.category === 'home' || def.category === 'landmark') continue;
    if (marked.has(doorFront(b))) names.push(def.name);
  }
  return names;
}

/** The evening street brush: drag along a road to keep it for strolling (Shift+drag gives it back). */
export function eveningTool(ctx: ToolContext): Tool {
  let start: Tile | null = null;
  let last: Tile | null = null;
  let unmark = false;
  let flip = false;
  let cx = 0;
  let cy = 0;

  const run = (end: Tile): Tile[] => (start ? proposeRoute(start, end, flip) : [end]);
  const isRoad = ([x, z]: Tile) => ctx.mirror.road(x, z) !== 0;

  /** Road tiles of the run whose mark would change: the ones worth sending. */
  function changes(tiles: Tile[]): Tile[] {
    return tiles.filter((t) => isRoad(t) && ctx.mirror.eveningStreet(t[0], t[1]) === unmark);
  }

  function preview(tiles: Tile[]) {
    const roads = tiles.filter(isRoad);
    if (!roads.length) {
      cursorHint(INPUT_COPY.eveningNoRoad, cx, cy);
      ctx.render.setGhost({ kind: 'tiles', tiles: tiles.slice(0, 1), valid: false });
      return;
    }
    ctx.render.setGhost({ kind: 'tiles', tiles: roads, valid: true });
    if (!start) {
      cursorHint(INPUT_COPY.eveningHint, cx, cy);
    } else if (unmark) {
      cursorHint(INPUT_COPY.eveningOff, cx, cy);
    } else {
      const marked = new Set(changes(tiles).map(([x, z]) => z * MAP_SIZE + x));
      cursorHint(INPUT_COPY.eveningOn(waiting(ctx, marked)), cx, cy);
    }
  }

  return {
    id: 'evening',
    lane: 'ledger',
    icon: 'lantern',
    label: 'Evening streets',
    order: 24,
    hint: INPUT_COPY.eveningTool,
    overlay: () => 'town:ledger',
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!start) unmark = p.shiftKey;
      if (!p.tile) return;
      last = [p.tile.x, p.tile.z];
      preview(run(last));
    },
    pointerDown(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      unmark = p.shiftKey;
      start = [p.tile.x, p.tile.z];
      last = start;
      preview([start]);
    },
    pointerUp(p) {
      if (!start) return;
      const end: Tile = p.tile ? [p.tile.x, p.tile.z] : (last ?? start);
      const tiles = run(end);
      const todo = changes(tiles);
      start = null;
      if (todo.length) ctx.submit({ t: 'road.setEvening', tiles: todo, on: !unmark });
      else ctx.ui.toast(tiles.some(isRoad) ? INPUT_COPY.eveningSame(unmark) : INPUT_COPY.eveningNoRoad);
      last = end;
      preview([end]);
    },
    pointerLeave() {
      if (!start) {
        ctx.render.setGhost(null);
        cursorHint(null);
      }
    },
    key(e) {
      if (e.key === 'f' || e.key === 'F') {
        flip = !flip;
        if (start && last) preview(run(last));
        return true;
      }
      if (e.key === 'Escape' && start) {
        start = null;
        ctx.render.setGhost(null);
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
}
