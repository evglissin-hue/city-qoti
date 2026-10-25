import { content } from '@qoti/content';
import { footprintTiles, MAP_SIZE, MAX_NOTE_CHARS } from '@qoti/sim';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { askRemoval } from '../removal';
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
        // Every decor piece is handmade: ask before removing a partner's work, and tell them.
        const seats = ctx.mirror.seats.value;
        const owner = seats.find((s) => s.seat === d.builtBy)?.name ?? INPUT_COPY.partner;
        const me = seats.find((s) => s.seat === ctx.seat)?.name ?? INPUT_COPY.someone;
        const thing = content.decorById.get(d.def)?.name.toLowerCase() ?? INPUT_COPY.piece;
        const reason = await askRemoval({
          title: INPUT_COPY.removeTitle(owner, thing),
          body: INPUT_COPY.removeBody,
          placeholder: INPUT_COPY.removeReason,
          ok: INPUT_COPY.removeOk,
          cancel: INPUT_COPY.removeCancel,
        });
        if (reason === null) return;
        ctx.submit({ t: 'decor.remove', ids: [hit.id] });
        const x = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(d.fx / 256)));
        const z = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(d.fz / 256)));
        const text = INPUT_COPY.removeNote(me, thing, reason).slice(0, MAX_NOTE_CHARS);
        ctx.submit({ t: 'note.pin', x, z, text });
        return;
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
