import { content } from '@qoti/content';
import { MAP_SIZE } from '@qoti/sim';
import { STATUS_WORDS } from '../../ui/hamlet';
import { purposeOf } from '../../ui/purpose';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { PointerInfo, Tool } from '../tool';
import { soilWord } from './building';

const TERRAIN = ['Grass', 'Meadow', 'Forest floor', 'Sand', 'Rock', 'Mountain', 'Water', 'Field'];
const DEPOSITS = ['', 'stone', 'clay', 'sand', 'coal'];
/** The pointer rests this long (ms) before the hover label says what is under it. */
const HOVER_DWELL = 450;

/**
 * Playtest round five ("show stats without switching tools"): a short line about what is under a
 * resting pointer: a building and what it is for (and what holds it up), or the ground, its soil
 * and any deposit.
 */
export function hoverText(ctx: ToolContext, p: PointerInfo): string | null {
  const m = ctx.mirror;
  const hit = ctx.render.pickEntity(p.clientX, p.clientY);
  if (hit?.kind === 'building') {
    const b = m.buildings.get(hit.id);
    const def = b && content.buildingById.get(b.def);
    if (!b || !def) return null;
    const parts = [`${def.name}${b.stage === 'construction' ? ' (being built)' : ''}: ${purposeOf(def.id)}`];
    const status = b.rt?.status ?? 0;
    const trouble = STATUS_WORDS.find(([bit]) => (status & bit) !== 0);
    if (trouble) parts.push(`${trouble[1]}.`);
    return parts.join(' ');
  }
  if (hit) return null;
  const t = p.tile;
  if (!t) return null;
  if (m.water(t.x, t.z)) return 'Water.';
  const terrain = TERRAIN[m.terrain(t.x, t.z)] ?? 'Ground';
  const f = m.fertility(t.x, t.z);
  const parts = [`${terrain}. Soil ${f} (${soilWord(f)}).`];
  const dep = DEPOSITS[m.deposit(t.x, t.z)];
  if (dep) parts.push(`There is ${dep} here.`);
  if (m.road(t.x, t.z)) parts.push(m.road(t.x, t.z) === 1 ? 'A path.' : 'A lane.');
  return parts.join(' ');
}

/** Click to look at something; left-drag on the ground pans the camera. */
export function inspectTool(ctx: ToolContext): Tool {
  let down: { x: number; y: number } | null = null;
  let dragging = false;
  let dwell: ReturnType<typeof setTimeout> | 0 = 0;

  function rest(p: PointerInfo): void {
    if (dwell) clearTimeout(dwell);
    cursorHint(null);
    dwell = setTimeout(() => {
      dwell = 0;
      const text = hoverText(ctx, p);
      if (text) cursorHint(text, p.clientX, p.clientY);
    }, HOVER_DWELL);
  }

  function stopHover(): void {
    if (dwell) clearTimeout(dwell);
    dwell = 0;
    cursorHint(null);
  }

  function select(p: PointerInfo): void {
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    if (hit?.kind === 'tree')
      ctx.ui.select({ kind: 'tree', x: hit.id % MAP_SIZE, z: Math.floor(hit.id / MAP_SIZE) });
    else if (hit) ctx.ui.select({ kind: hit.kind, id: hit.id });
    else if (p.tile) ctx.ui.select({ kind: 'tile', x: p.tile.x, z: p.tile.z });
    else ctx.ui.select(null);
  }

  return {
    id: 'inspect',
    lane: 'shared',
    icon: '◎',
    label: 'Inspect',
    hint: 'Click to look, drag to pan',
    order: 0,
    pointerDown(p) {
      stopHover();
      down = { x: p.clientX, y: p.clientY };
      dragging = false;
    },
    pointerMove(p) {
      if (!down || !(p.buttons & 1)) {
        if (!p.buttons) rest(p);
        return;
      }
      stopHover();
      const dx = p.clientX - down.x;
      const dy = p.clientY - down.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 5) return;
      dragging = true;
      ctx.camera.panByPixels(dx, dy);
      down = { x: p.clientX, y: p.clientY };
    },
    pointerUp(p) {
      if (down && !dragging) select(p);
      down = null;
      dragging = false;
    },
    pointerLeave() {
      stopHover();
    },
    exit() {
      stopHover();
      down = null;
      dragging = false;
    },
  };
}
