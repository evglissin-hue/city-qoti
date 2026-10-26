import { content } from '@qoti/content';
import { footprintTiles, MAP_SIZE } from '@qoti/sim';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { removeWithCare } from '../removal';
import type { PointerInfo, Tool } from '../tool';

/** Remove whatever is under the cursor; drag to clear roads and trees. */
export function eraseTool(ctx: ToolContext): Tool {
  let dragging = false;
  const cleared = new Set<number>();
  /** Shift+drag: a rectangle that clears roads and trees inside it on release. */
  let rect: { a: [number, number]; b: [number, number] } | null = null;

  function rectTiles(r: { a: [number, number]; b: [number, number] }): [number, number][] {
    const x0 = Math.min(r.a[0], r.b[0]);
    const z0 = Math.min(r.a[1], r.b[1]);
    const x1 = Math.min(Math.max(r.a[0], r.b[0]), x0 + 47);
    const z1 = Math.min(Math.max(r.a[1], r.b[1]), z0 + 47);
    const tiles: [number, number][] = [];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) tiles.push([x, z]);
    return tiles;
  }

  function clearRect(tiles: [number, number][]): void {
    const trees = tiles.filter(([x, z]) => ctx.mirror.tree(x, z));
    const roads = tiles.filter(([x, z]) => !ctx.mirror.tree(x, z) && ctx.mirror.road(x, z));
    for (let i = 0; i < trees.length; i += 256)
      ctx.submit({ t: 'tree.remove', tiles: trees.slice(i, i + 256) });
    for (let i = 0; i < roads.length; i += 256)
      ctx.submit({ t: 'road.remove', tiles: roads.slice(i, i + 256) });
  }

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
      const b = ctx.mirror.buildings.get(hit.id);
      // I1: a building the partner customized is handmade too: ask first, and tell them.
      if (b) {
        const thing = content.buildingById.get(b.def)?.name.toLowerCase() ?? INPUT_COPY.piece;
        const piece = { builtBy: b.builtBy, handmade: b.handmade, thing, x: b.x, z: b.z, building: true };
        await removeWithCare(ctx, piece, { t: 'build.remove', ids: [b.id] });
      }
      return;
    }
    if (hit?.kind === 'decor') {
      const d = ctx.mirror.decor.get(hit.id);
      if (!d) return;
      // Every decor piece is handmade: ask before removing a partner's work, and tell them.
      const thing = content.decorById.get(d.def)?.name.toLowerCase() ?? INPUT_COPY.piece;
      const at = { x: Math.floor(d.fx / 256), z: Math.floor(d.fz / 256) };
      await removeWithCare(
        ctx,
        { builtBy: d.builtBy, handmade: true, thing, ...at },
        { t: 'decor.remove', ids: [d.id] },
      );
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
    hint: 'Drag to clear roads and trees, Shift+drag for a box',
    order: 90,
    pointerDown(p) {
      if (p.shiftKey && p.tile) {
        rect = { a: [p.tile.x, p.tile.z], b: [p.tile.x, p.tile.z] };
        ctx.render.setGhost({ kind: 'tiles', tiles: rectTiles(rect), valid: false });
        return;
      }
      dragging = true;
      cleared.clear();
      void eraseAt(p);
    },
    pointerMove(p) {
      if (rect) {
        if (p.tile) rect.b = [p.tile.x, p.tile.z];
        ctx.render.setGhost({ kind: 'tiles', tiles: rectTiles(rect), valid: false });
        return;
      }
      hover(p);
      if (dragging && p.buttons & 1) clearTile(p);
    },
    pointerUp(p) {
      if (rect) {
        if (p.tile) rect.b = [p.tile.x, p.tile.z];
        clearRect(rectTiles(rect));
        rect = null;
        hover(p);
      }
      dragging = false;
      cleared.clear();
    },
    key(e) {
      if (e.key !== 'Escape' || !rect) return false;
      rect = null;
      ctx.render.setGhost(null);
      return true;
    },
    exit() {
      dragging = false;
      rect = null;
      ctx.render.setGhost(null);
    },
  };
}
