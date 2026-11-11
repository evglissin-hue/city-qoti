import { content } from '@qoti/content';
import { MAX_PLAN_ITEMS, MAX_PLAN_NAME_CHARS } from '@qoti/sim';
import { decorChoices } from '../catalog';
import { layoutPieces, type Turn } from '../compose/layout';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import { chosenPattern as chosen, putLayoutAway } from '../layoutPick';
import type { Tool } from '../tool';

/**
 * Lay it out (Hearth): a ghost of a pattern's pieces follows the cursor. Click sketches them as
 * one plan to approve in the Plans book; R turns the layout a quarter; Esc puts it away.
 *
 * The renderer shows one ghost at a time and has no mixed-piece kind, so the layout shows as the
 * tiles it covers, tinted valid when every piece would be accepted on the map as it stands.
 */
export function layoutTool(ctx: ToolContext): Tool {
  let turn: Turn = 0;
  let at: [number, number] | null = null;
  let cx = 0;
  let cy = 0;

  const locked = (id: string) =>
    !!decorChoices(ctx.mirror, 'hearth', true).find((c) => c.def.id === id)?.locked ||
    !!decorChoices(ctx.mirror, 'hearth', false).find((c) => c.def.id === id)?.locked;

  function pieces() {
    const def = chosen.value ? content.patternById.get(chosen.value) : undefined;
    if (!def || !at) return null;
    return { def, placed: layoutPieces(def, at, turn, ctx.mirror, locked) };
  }

  function preview() {
    const shown = pieces();
    if (!shown || shown.placed.length === 0) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const tiles: [number, number][] = [];
    for (const p of shown.placed)
      for (const t of p.tiles) if (!tiles.some((o) => o[0] === t[0] && o[1] === t[1])) tiles.push(t);
    const bad = shown.placed.filter((p) => p.blocked).length;
    ctx.render.setGhost({ kind: 'tiles', tiles, valid: bad === 0 });
    cursorHint(
      bad === 0
        ? null
        : `${bad} of ${shown.placed.length} pieces will not fit here as things stand. The plan will skip them.`,
      cx,
      cy,
    );
    return shown;
  }

  const leave = putLayoutAway;

  return {
    id: 'layout',
    lane: 'hearth',
    icon: 'layout',
    label: 'Lay it out',
    hint: 'Click to sketch it as a plan. R turns it, Esc puts it away',
    order: 80,
    hidden: () => chosen.value === null,
    enter() {
      turn = 0;
      at = null;
    },
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      at = [p.tile.x, p.tile.z];
      preview();
    },
    pointerDown(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      at = [p.tile.x, p.tile.z];
      const shown = pieces();
      if (!shown || shown.placed.length === 0) return;
      const items = shown.placed.slice(0, MAX_PLAN_ITEMS).map((x) => ({ cmd: x.cmd }));
      ctx.submit({ t: 'plan.add', name: shown.def.name.slice(0, MAX_PLAN_NAME_CHARS), items });
      ctx.ui.toast(`${shown.def.name} is sketched in as a plan. Approve it in the Plans book to build it.`);
      leave();
    },
    key(e) {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        leave();
        return true;
      }
      if (k !== 'r' && k !== 't') return false;
      const back4 = k === 't' || e.shiftKey;
      turn = ((turn + (back4 ? 3 : 1)) % 4) as Turn;
      preview();
      return true;
    },
    exit() {
      at = null;
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}
