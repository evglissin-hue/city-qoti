import { content } from '@qoti/content';
import { footprintTiles, MAP_SIZE } from '@qoti/sim';
import type { ToolContext } from '../context';
import type { PointerInfo, Tool } from '../tool';

/** Remove whatever is under the cursor; drag to clear roads and trees. */
export function eraseTool(ctx: ToolContext): Tool {
  let dragging = false;
  const cleared = new Set<number>();

  function hover(p: PointerInfo): void {
    if (!p.tile) {
      ctx.render.setGhost(null);
      return;
    }
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    if (hit?.kind === 'building') {
      const b = ctx.mirror.buildings.get(hit.id);
      const def = b ? content.buildingById.get(b.def) : undefined;
      if (b && def) {
        ctx.render.setGhost({ kind: 'tiles', tiles: footprintTiles(def, b.x, b.z, b.rot), valid: false });
        return;
      }
    }
    ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: false });
  }

  async function eraseAt(p: PointerInfo): Promise<void> {
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    if (hit?.kind === 'building') {
      ctx.submit({ t: 'build.remove', ids: [hit.id] });
      return;
    }
    if (hit?.kind === 'decor') {
      const d = ctx.mirror.decor.get(hit.id);
      if (d && d.builtBy !== ctx.seat) {
        // Every decor piece is handmade: ask before removing a partner's work.
        const owner = ctx.mirror.seats.value.find((s) => s.seat === d.builtBy)?.name ?? 'Your partner';
        const name = content.decorById.get(d.def)?.name.toLowerCase() ?? 'piece';
        const ok = await ctx.ui.confirm(
          `${owner} placed this ${name} by hand. Remove it anyway?`,
          'Remove it',
          'Keep it',
        );
        if (!ok) return;
      }
      ctx.submit({ t: 'decor.remove', ids: [hit.id] });
      return;
    }
    if (hit?.kind === 'note') {
      ctx.submit({ t: 'note.remove', id: hit.id });
      return;
    }
    clearTile(p);
  }

  function clearTile(p: PointerInfo): void {
    if (!p.tile) return;
    const { x, z } = p.tile;
    const key = z * MAP_SIZE + x;
    if (cleared.has(key)) return;
    cleared.add(key);
    if (ctx.mirror.tree(x, z)) ctx.submit({ t: 'tree.remove', tiles: [[x, z]] });
    else if (ctx.mirror.road(x, z)) ctx.submit({ t: 'road.remove', tiles: [[x, z]] });
  }

  return {
    id: 'erase',
    lane: 'shared',
    icon: '✕',
    label: 'Erase',
    hint: 'Drag to clear roads and trees',
    order: 90,
    pointerDown(p) {
      dragging = true;
      cleared.clear();
      void eraseAt(p);
    },
    pointerMove(p) {
      hover(p);
      if (dragging && p.buttons & 1) clearTile(p);
    },
    pointerUp() {
      dragging = false;
      cleared.clear();
    },
    exit() {
      dragging = false;
      ctx.render.setGhost(null);
    },
  };
}
