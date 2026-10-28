import { content } from '@qoti/content';
import {
  FIELD_GOOD_FERTILITY,
  FIELD_MIN_FERTILITY,
  FIELD_TILE_COST,
  footprintTiles,
  MAP_SIZE,
  MAX_FIELD_TILES,
  PENNIES_PER_COIN,
  type BuildingView,
} from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import { costBlock } from '../catalog';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import type { PointerInfo, Tool } from '../tool';

const DEFAULT_RANGE = 6;

/** How the soil reads on a tile, for the hint while sowing. */
export function soilWord(fertility: number): string {
  if (fertility >= 70) return 'Rich soil';
  if (fertility >= FIELD_GOOD_FERTILITY) return 'Good soil';
  if (fertility >= FIELD_MIN_FERTILITY) return 'Thin soil: the wheat will take its time';
  return 'Too stony for wheat';
}

/** Field tiles a farmhouse can tend: within its method's range of the footprint (square reach). */
export function fieldReach(b: BuildingView): {
  tiles: [number, number][];
  contains(x: number, z: number): boolean;
} {
  const def = content.buildingById.get(b.def);
  const range = def?.methods?.find((m) => m.kind === 'farm')?.range ?? DEFAULT_RANGE;
  const foot = def ? footprintTiles(def, b.x, b.z, b.rot) : [[b.x, b.z] as [number, number]];
  const xs = foot.map(([x]) => x);
  const zs = foot.map(([, z]) => z);
  const x0 = Math.max(0, Math.min(...xs) - range);
  const z0 = Math.max(0, Math.min(...zs) - range);
  const x1 = Math.min(MAP_SIZE - 1, Math.max(...xs) + range);
  const z1 = Math.min(MAP_SIZE - 1, Math.max(...zs) + range);
  const tiles: [number, number][] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) tiles.push([x, z]);
  return { tiles, contains: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 };
}

/**
 * Wheat fields for a farmhouse (Ledger, standard valleys): pick a farmhouse, then drag a box to
 * paint fertile tiles within its reach. Shift+drag clears fields. The reach shows while painting.
 */
export function fieldTool(ctx: ToolContext): Tool {
  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  let erase = false;
  let cx = 0;
  let cy = 0;

  const farm = (): BuildingView | null => {
    const id = ctx.ui.farm?.() ?? null;
    const b = id !== null ? ctx.mirror.buildings.get(id) : undefined;
    return b && b.def === 'farmhouse' ? b : null;
  };

  function showReach(): void {
    const b = farm();
    ctx.render.setOverlay('fields');
    ctx.render.highlight?.(b ? { tiles: fieldReach(b).tiles, tone: 'ledger' } : null);
  }

  function pickFarm(p: PointerInfo): boolean {
    const hit = ctx.render.pickEntity(p.clientX, p.clientY);
    const b = hit?.kind === 'building' ? ctx.mirror.buildings.get(hit.id) : undefined;
    if (b?.def !== 'farmhouse') return false;
    ctx.ui.setFarm?.(b.id);
    ctx.ui.select({ kind: 'building', id: b.id });
    showReach();
    return true;
  }

  /** The box from start to end, split into tiles that can be painted (or cleared) and the rest. */
  function box(): { good: [number, number][]; bad: [number, number][]; reason: string | null; thin: number } {
    const b = farm();
    const good: [number, number][] = [];
    const bad: [number, number][] = [];
    if (!start || !end || !b) return { good, bad, reason: null, thin: 0 };
    const reach = fieldReach(b);
    const m = ctx.mirror;
    const owner = m.layers.fieldOwner;
    let reason: string | null = null;
    const [x0, x1] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
    const [z0, z1] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const tile: [number, number] = [x, z];
        const owned = owner ? owner[z * MAP_SIZE + x]! : 0;
        if (erase) {
          (owned ? good : bad).push(tile);
          continue;
        }
        let why: string | null = null;
        if (!reach.contains(x, z)) why = rejectText('OUT_OF_RANGE');
        else if (m.water(x, z) || m.road(x, z) || m.occupant(x, z) || m.tree(x, z))
          why = rejectText('OCCUPIED');
        else if (m.fertility(x, z) < FIELD_MIN_FERTILITY) why = rejectText('NEEDS_FERTILITY');
        else if (owned === b.id) why = '';
        if (why === null) good.push(tile);
        else {
          bad.push(tile);
          if (why) reason ??= why;
        }
      }
    }
    const sown = good.slice(0, MAX_FIELD_TILES);
    const thin = erase ? 0 : sown.filter(([x, z]) => m.fertility(x, z) < FIELD_GOOD_FERTILITY).length;
    return { good: sown, bad, reason, thin };
  }

  function preview(): void {
    const { good, bad, reason, thin } = box();
    if (!start) return;
    const tiles = good.length ? good : bad;
    ctx.render.setGhost({ kind: 'tiles', tiles, valid: good.length > 0 });
    if (erase) {
      cursorHint(
        good.length ? `Clear ${good.length} field ${good.length === 1 ? 'tile' : 'tiles'}` : null,
        cx,
        cy,
      );
      return;
    }
    const coins = good.length * FIELD_TILE_COST;
    const blocked = good.length ? costBlock(ctx.mirror, { coins }) : null;
    cursorHint(
      blocked
        ? rejectText(blocked)
        : good.length
          ? `${good.length} ${good.length === 1 ? 'tile' : 'tiles'} of wheat, ${coins} ${coins === 1 ? 'coin' : 'coins'}${thin ? ` (${thin === good.length ? 'all' : thin} on thin soil, slower)` : ''}${bad.length && reason ? `. Some are not: ${reason.toLowerCase()}` : ''}`
          : (reason ?? 'Nothing to plant here'),
      cx,
      cy,
    );
  }

  return {
    id: 'field',
    lane: 'ledger',
    icon: '⁂',
    label: 'Fields',
    hint: 'Pick a farmhouse, drag to sow, Shift+drag to clear',
    order: 25,
    modes: ['standard'],
    enter() {
      const sel = ctx.ui.selection?.();
      if (sel?.kind === 'building' && ctx.mirror.buildings.get(sel.id)?.def === 'farmhouse')
        ctx.ui.setFarm?.(sel.id);
      if (!farm()) {
        const first = [...ctx.mirror.buildings.values()].find(
          (b) => b.def === 'farmhouse' && b.stage === 'built',
        );
        ctx.ui.setFarm?.(first?.id ?? null);
      }
      showReach();
    },
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      if (start) {
        end = [p.tile.x, p.tile.z];
        preview();
        return;
      }
      const b = farm();
      const inReach = !!b && fieldReach(b).contains(p.tile.x, p.tile.z);
      ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: !!b });
      cursorHint(
        !b
          ? 'Pick a farmhouse first: its fields go within reach of the door.'
          : inReach
            ? soilWord(ctx.mirror.fertility(p.tile.x, p.tile.z))
            : null,
        cx,
        cy,
      );
    },
    pointerDown(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (pickFarm(p)) return;
      if (!farm()) {
        ctx.ui.toast('Pick a farmhouse first. Fields need someone to tend them.');
        return;
      }
      if (!p.tile) return;
      erase = p.shiftKey;
      start = [p.tile.x, p.tile.z];
      end = start;
      preview();
    },
    pointerUp() {
      const b = farm();
      const { good, reason } = box();
      start = null;
      end = null;
      cursorHint(null);
      ctx.render.setGhost(null);
      if (!b) return;
      if (!good.length) {
        if (reason && !erase) ctx.ui.toast(reason);
        return;
      }
      if (erase) {
        ctx.submit({ t: 'field.remove', tiles: good });
        return;
      }
      const blocked = costBlock(ctx.mirror, { coins: good.length * FIELD_TILE_COST });
      if (blocked) {
        ctx.ui.toast(rejectText(blocked));
        return;
      }
      ctx.submit({ t: 'field.paint', farm: b.id, tiles: good });
    },
    key(e) {
      if (e.key !== 'Escape' || !start) return false;
      start = null;
      end = null;
      ctx.render.setGhost(null);
      cursorHint(null);
      return true;
    },
    exit() {
      start = null;
      end = null;
      ctx.render.setGhost(null);
      ctx.render.setOverlay(null);
      ctx.render.highlight?.(null);
      cursorHint(null);
    },
  };
}

/** Coins for painting `tiles` field tiles, for the picker. */
export function fieldCost(tiles: number): number {
  return tiles * FIELD_TILE_COST * PENNIES_PER_COIN;
}
