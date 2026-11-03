// I3 (C5F): the season tools. Festival site (drag a box of 6 to 24 a side, or click a pattern site;
// it fills the planner's draft), guard points (up to three, filling the Watch's draft), walls
// (palisade and stone wall runs, the ghost refusing what the sim would, enclosures included) and
// ponds (Hearth: dig still water on open grass). The site and guard tools open from their books.
import { signal } from '@preact/signals';
import { content } from '@qoti/content';
import {
  canPaintWall,
  FESTIVAL_SITE_MAX,
  FESTIVAL_SITE_MIN,
  MAP_SIZE,
  MAX_WALL_TILES,
  MAX_ZONE_TILES,
  TERRAFORM_MAX_TILES,
  TILE_FP,
  WATCH_POSTURE_MAX,
  type RoadPlacement,
} from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import { rankAtLeast } from '../../ui/village';
import type { ToolContext } from '../context';
import { cursorHint } from '../hint';
import { proposeRoute } from '../route';
import type { Tool } from '../tool';

type Tile = [number, number];

function boxTiles(a: Tile, b: Tile): Tile[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [z0, z1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  const out: Tile[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]);
  return out;
}

/** Is a box a fair festival site? Open ground, 6 to 24 tiles a side (the sim's rule). */
export function festivalSiteOk(
  ctx: Pick<ToolContext, 'mirror'>,
  a: Tile,
  b: Tile,
): { ok: boolean; why?: string } {
  const w = Math.abs(a[0] - b[0]) + 1;
  const d = Math.abs(a[1] - b[1]) + 1;
  if (w < FESTIVAL_SITE_MIN || d < FESTIVAL_SITE_MIN)
    return {
      ok: false,
      why: `A festival wants at least ${FESTIVAL_SITE_MIN} by ${FESTIVAL_SITE_MIN} tiles (${w} by ${d}).`,
    };
  if (w > FESTIVAL_SITE_MAX || d > FESTIVAL_SITE_MAX)
    return { ok: false, why: `At most ${FESTIVAL_SITE_MAX} a side, or nobody finds the pies.` };
  let blocked = 0;
  for (const [x, z] of boxTiles(a, b)) if (ctx.mirror.occupant(x, z) || ctx.mirror.water(x, z)) blocked++;
  // Stalls go round a cottage or two; a site that is mostly buildings is no site.
  if (blocked * 3 > w * d) return { ok: false, why: 'Too much of that is buildings or water.' };
  return { ok: true };
}

/** The pattern site whose tiles include (x, z), if any. */
function patternSiteAt(ctx: ToolContext, x: number, z: number): { pattern: string; anchor: number } | null {
  const i = z * MAP_SIZE + x;
  for (const p of ctx.mirror.patterns.values()) {
    if (!p.discovered) continue;
    for (const s of p.sites) if (s.tiles.includes(i)) return { pattern: p.id, anchor: s.z * MAP_SIZE + s.x };
  }
  return null;
}

export function festivalSiteTool(ctx: ToolContext): Tool {
  let start: Tile | null = null;
  let end: Tile | null = null;
  let cx = 0;
  let cy = 0;
  const done = (
    site: NonNullable<ReturnType<typeof patternSiteAt>> | { rect: [number, number, number, number] },
  ) => {
    const draft = ctx.ui.drafts?.().festival;
    if (draft) draft.value = { ...(draft.value ?? { menu: [], twist: '', music: 'none' }), site };
    ctx.ui.openPanel?.('festival');
  };
  const clear = () => {
    start = null;
    end = null;
    ctx.render.setGhost(null);
    cursorHint(null);
  };
  return {
    id: 'festival-site',
    lane: 'hearth',
    icon: 'festival',
    label: 'Festival site',
    hint: 'Drag a box for the festival, or click a Pattern Book site',
    order: 95,
    modes: ['standard'],
    hidden: () => true,
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      if (!start) {
        const site = patternSiteAt(ctx, p.tile.x, p.tile.z);
        ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
        cursorHint(
          site
            ? `${content.patternById.get(site.pattern)?.name ?? 'A pattern site'}: click to hold it here`
            : 'Drag a box',
          cx,
          cy,
        );
        return;
      }
      end = [p.tile.x, p.tile.z];
      const ok = festivalSiteOk(ctx, start, end);
      ctx.render.setGhost({ kind: 'tiles', tiles: boxTiles(start, end), valid: ok.ok });
      cursorHint(ok.ok ? 'Here, then' : (ok.why ?? null), cx, cy);
    },
    pointerDown(p) {
      if (!p.tile) return;
      start = [p.tile.x, p.tile.z];
      end = start;
    },
    pointerUp(p) {
      if (!start) return;
      if (p.tile) end = [p.tile.x, p.tile.z];
      const a = start;
      const b = end ?? start;
      clear();
      if (a[0] === b[0] && a[1] === b[1]) {
        const site = patternSiteAt(ctx, a[0], a[1]);
        if (site) done(site);
        return;
      }
      const ok = festivalSiteOk(ctx, a, b);
      if (!ok.ok) {
        ctx.ui.toast(ok.why ?? 'That will not do for a festival.');
        return;
      }
      done({
        rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      });
    },
    exit: clear,
  };
}

/** Guard points for the Watch: click to add (up to three), click one again to lift it. */
export function guardTool(ctx: ToolContext): Tool {
  const draft = () => ctx.ui.drafts?.().posture;
  const current = (): Tile[] =>
    draft()?.value ?? (ctx.mirror.watch.value?.posture ?? []).map(([x, z]) => [x, z]);
  return {
    id: 'guard',
    lane: 'ledger',
    icon: 'guard',
    label: 'Guard points',
    hint: `Click up to ${WATCH_POSTURE_MAX} spots the Watch should stand at`,
    order: 96,
    modes: ['standard'],
    hidden: () => true,
    pointerMove(p) {
      if (!p.tile) return;
      const tiles = current();
      const full = tiles.length >= WATCH_POSTURE_MAX;
      const on = tiles.some(([x, z]) => x === p.tile!.x && z === p.tile!.z);
      ctx.render.setGhost({ kind: 'tiles', tiles: [...tiles, [p.tile.x, p.tile.z]], valid: on || !full });
      cursorHint(
        on
          ? 'Click to lift this guard point'
          : full
            ? 'Three is plenty. Lift one first.'
            : 'A guard point here',
        p.clientX,
        p.clientY,
      );
    },
    pointerDown(p) {
      if (!p.tile) return;
      const d = draft();
      if (!d) return;
      const tiles = current();
      const at = tiles.findIndex(([x, z]) => x === p.tile!.x && z === p.tile!.z);
      if (at >= 0) d.value = tiles.filter((_, i) => i !== at);
      else if (tiles.length < WATCH_POSTURE_MAX) d.value = [...tiles, [p.tile.x, p.tile.z]];
      else ctx.ui.toast('Three guard points at most. Lift one first.');
      ctx.render.setGhost({ kind: 'tiles', tiles: d.value ?? [], valid: true });
      ctx.ui.openPanel?.('watch');
    },
    exit() {
      ctx.render.setGhost(null);
      cursorHint(null);
    },
  };
}

/**
 * The wall ghost: the sim's wall.paint checks in the same order (tiles, then whether the piece is
 * open to this valley, then rules/walls.ts on the Mirror), so it agrees with the command.
 */
export function wallGhost(ctx: Pick<ToolContext, 'mirror'>, def: string, tiles: Tile[]): RoadPlacement {
  const d = content.buildingById.get(def);
  if (!d?.defense?.blocks) return { ok: false, reason: 'INVALID' };
  if (!Array.isArray(tiles) || tiles.length === 0) return { ok: false, reason: 'INVALID' };
  if (tiles.length > MAX_ZONE_TILES) return { ok: false, reason: 'TOO_MANY' };
  for (const [x, z] of tiles) {
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE)
      return { ok: false, reason: 'OUT_OF_BOUNDS', firstBadTile: [x, z] };
  }
  const m = ctx.mirror;
  if (d.modes && !d.modes.includes(m.settings.value.mode)) return { ok: false, reason: 'LOCKED' };
  if (!rankAtLeast(m.town.value?.rank ?? m.charter.value?.rank, d.requires?.rank ?? 'village'))
    return { ok: false, reason: 'LOCKED' };
  return canPaintWall(m, def, tiles, { gate: m.meta.valleyGate, buildings: m.buildings.values() });
}

export const WALL_DEFS = ['palisade', 'stone-wall'] as const;

export function wallTool(ctx: ToolContext): Tool {
  const variant = signal<string>('palisade');
  let start: Tile | null = null;
  let tiles: Tile[] = [];
  let flip = false;
  const clear = () => {
    start = null;
    tiles = [];
    ctx.render.setGhost(null);
    cursorHint(null);
  };
  const preview = (x: number, y: number) => {
    const r = wallGhost(ctx, variant.value, tiles);
    ctx.render.setGhost({ kind: 'tiles', tiles, valid: r.ok });
    const name = content.buildingById.get(variant.value)?.name ?? 'Wall';
    cursorHint(
      r.ok ? `${name}: ${tiles.length} ${tiles.length === 1 ? 'piece' : 'pieces'}` : rejectText(r.reason),
      x,
      y,
    );
  };
  return {
    id: 'wall',
    lane: 'ledger',
    icon: 'wall',
    label: 'Walls',
    hint: 'Drag a run of wall. Walls never shut anyone in; leave room for a gate.',
    order: 32,
    modes: ['standard'],
    variants: WALL_DEFS.map((id) => ({ id, label: content.buildingById.get(id)?.name ?? id })),
    variant,
    // Until C5D opens the defense pieces (modes), there is nothing to paint.
    hidden: () => !WALL_DEFS.some((id) => content.buildingById.get(id)?.modes?.includes('standard') ?? true),
    pointerMove(p) {
      if (!p.tile) return;
      if (!start) {
        tiles = [[p.tile.x, p.tile.z]];
      } else tiles = proposeRoute(start, [p.tile.x, p.tile.z], flip).slice(0, MAX_WALL_TILES);
      preview(p.clientX, p.clientY);
    },
    pointerDown(p) {
      if (!p.tile) return;
      start = [p.tile.x, p.tile.z];
      tiles = [start];
      preview(p.clientX, p.clientY);
    },
    pointerUp(p) {
      if (!start) return;
      if (p.tile) tiles = proposeRoute(start, [p.tile.x, p.tile.z], flip).slice(0, MAX_WALL_TILES);
      const run = tiles;
      const r = wallGhost(ctx, variant.value, run);
      clear();
      if (!r.ok) {
        ctx.ui.toast(rejectText(r.reason));
        return;
      }
      ctx.submit({ t: 'wall.paint', def: variant.value, tiles: run });
    },
    key(e) {
      if (e.key === 'f' || e.key === 'F') {
        flip = !flip;
        return true;
      }
      if (e.key === 'Escape' && start) {
        clear();
        return true;
      }
      return false;
    },
    exit: clear,
  };
}

/** Can these tiles be dug as a pond? The sim's rule (commands/pond.ts) on the Mirror. */
export function pondOk(ctx: Pick<ToolContext, 'mirror'>, tiles: Tile[]): { ok: boolean; why?: string } {
  if (tiles.length > TERRAFORM_MAX_TILES) return { ok: false, why: rejectText('TOO_MANY') };
  const m = ctx.mirror;
  for (const [x, z] of tiles) {
    const i = z * MAP_SIZE + x;
    if (m.water(x, z)) return { ok: false, why: rejectText('WATER') };
    if (m.occupant(x, z) || m.road(x, z) || m.layers.fieldOwner[i])
      return { ok: false, why: rejectText('OCCUPIED') };
    if (!m.parcelUnlocked(x, z)) return { ok: false, why: rejectText('LOCKED_PARCEL') };
    const near = m.decorNear(x * TILE_FP + TILE_FP / 2, z * TILE_FP + TILE_FP / 2, TILE_FP * 2);
    if (near.some((d) => Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z))
      return { ok: false, why: rejectText('OCCUPIED') };
  }
  return { ok: true };
}

export function pondTool(ctx: ToolContext): Tool {
  let start: Tile | null = null;
  let end: Tile | null = null;
  const clear = () => {
    start = null;
    end = null;
    ctx.render.setGhost(null);
    cursorHint(null);
  };
  return {
    id: 'pond',
    lane: 'hearth',
    icon: 'pond',
    label: 'Pond',
    hint: 'Drag to dig a pond on open grass. Frogs will hear of it.',
    order: 62,
    modes: ['standard'],
    pointerMove(p) {
      if (!p.tile) return;
      const tiles = start ? boxTiles(start, (end = [p.tile.x, p.tile.z])) : [[p.tile.x, p.tile.z] as Tile];
      const ok = pondOk(ctx, tiles);
      ctx.render.setGhost({ kind: 'tiles', tiles, valid: ok.ok });
      cursorHint(
        ok.ok ? (start ? `A pond of ${tiles.length} tiles` : null) : (ok.why ?? null),
        p.clientX,
        p.clientY,
      );
    },
    pointerDown(p) {
      if (!p.tile) return;
      start = [p.tile.x, p.tile.z];
      end = start;
    },
    pointerUp(p) {
      if (!start) return;
      if (p.tile) end = [p.tile.x, p.tile.z];
      const tiles = boxTiles(start, end ?? start);
      clear();
      const ok = pondOk(ctx, tiles);
      if (!ok.ok) {
        ctx.ui.toast(ok.why ?? rejectText('INVALID'));
        return;
      }
      ctx.submit({ t: 'terrain.pond', tiles });
    },
    exit: clear,
  };
}
