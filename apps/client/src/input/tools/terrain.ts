// Earthworks (playtest item 5): level, raise and lower ground. The sim moves land one level per
// command, 64 tiles at most, and refuses new cliffs, so the tool plans a whole gesture on a copy of
// the heights first (`planEarthworks`, a client copy of the sim's rule in commands/terrain.ts) and
// only sends it when every command would be accepted.
import { signal } from '@preact/signals';
import {
  MAP_SIZE,
  MAX_HEIGHT,
  TERRAFORM_COST,
  TERRAFORM_MAX_TILES,
  TILE_FP,
  type Command,
  type MapReader,
} from '@qoti/sim';
import { rejectText } from '../../ui/messages';
import { costBlock } from '../catalog';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

type Tile = [number, number];
type Dir = 1 | -1;
type EarthCommand = Extract<Command, { t: 'terrain.raise' | 'terrain.lower' }>;

/** What the plan needs to read from the world: the Mirror and the sim's MapReader both fit. */
export type Ground = Pick<
  MapReader,
  'height' | 'water' | 'road' | 'occupant' | 'parcelUnlocked' | 'decorNear'
>;

export type EarthworkKind = 'level' | 'raise' | 'lower';

/** A side of the box is at most this long, so a gesture stays a small number of commands. */
export const EARTH_MAX_SIDE = 12;
/** The room allows 30 commands a second; one gesture stays well under it. */
export const EARTH_MAX_COMMANDS = 24;

export type EarthWhy = 'water' | 'occupied' | 'locked' | 'limit' | 'cliff' | 'tooMuch' | 'flat';

export type EarthPlan =
  | {
      ok: true;
      /** Send in this order. */
      commands: EarthCommand[];
      /** Tiles that change, once each. */
      tiles: Tile[];
      /** Tile-levels moved in all; each costs TERRAFORM_COST coins. */
      moves: number;
    }
  | { ok: false; why: EarthWhy; tiles: Tile[] };

const idx = (x: number, z: number) => z * MAP_SIZE + x;

/** The tiles of the box between two corners, clamped so no side passes EARTH_MAX_SIDE. */
export function earthBox(a: Tile, b: Tile): Tile[] {
  const clamp = (from: number, to: number) =>
    Math.max(from - (EARTH_MAX_SIDE - 1), Math.min(from + (EARTH_MAX_SIDE - 1), to));
  const bx = clamp(a[0], b[0]);
  const bz = clamp(a[1], b[1]);
  const [x0, x1] = [Math.min(a[0], bx), Math.max(a[0], bx)];
  const [z0, z1] = [Math.min(a[1], bz), Math.max(a[1], bz)];
  const out: Tile[] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]);
  return out;
}

/**
 * One command's check, in the sim's order (commands/terrain.ts terraformBlocked): water, buildings
 * and roads, locked parcels, the height limits, decor, then no new cliffs. Neighbors that move in
 * the same command move together. `heights` holds the levels changed so far.
 */
function blocked(g: Ground, heights: Map<number, number>, tiles: Tile[], dir: Dir): EarthWhy | null {
  const at = (i: number, x: number, z: number) => heights.get(i) ?? g.height(x, z);
  const set = new Set(tiles.map(([x, z]) => idx(x, z)));
  for (const i of set) {
    const x = i % MAP_SIZE;
    const z = (i - x) / MAP_SIZE;
    if (g.water(x, z)) return 'water';
    if (g.occupant(x, z) || g.road(x, z)) return 'occupied';
    if (!g.parcelUnlocked(x, z)) return 'locked';
    const now = at(i, x, z);
    const h = now + dir;
    if (h < 1 || h > MAX_HEIGHT - 1) return 'limit';
    const cx = x * TILE_FP + TILE_FP / 2;
    const cz = z * TILE_FP + TILE_FP / 2;
    for (const d of g.decorNear(cx, cz, TILE_FP * 2)) {
      if (Math.floor(d.fx / TILE_FP) === x && Math.floor(d.fz / TILE_FP) === z) return 'occupied';
    }
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
      const nz = k === 2 ? z + 1 : k === 3 ? z - 1 : z;
      if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) continue;
      const n = idx(nx, nz);
      const nh = at(n, nx, nz);
      const before = Math.abs(now - nh);
      const after = Math.abs(h - (nh + (set.has(n) ? dir : 0)));
      if (after >= 2 && after > before) return 'cliff';
    }
  }
  return null;
}

interface Chunk {
  dir: Dir;
  tiles: Tile[];
}

/** Chunks of at most TERRAFORM_MAX_TILES tiles: row-major runs, or compact 8 by 8 blocks. */
function chunksOf(tiles: Tile[], dir: Dir, blocks: boolean): Chunk[] {
  if (!blocks) {
    const out: Chunk[] = [];
    for (let i = 0; i < tiles.length; i += TERRAFORM_MAX_TILES)
      out.push({ dir, tiles: tiles.slice(i, i + TERRAFORM_MAX_TILES) });
    return out;
  }
  const byBlock = new Map<number, Tile[]>();
  for (const t of tiles) {
    const key = (t[1] >> 3) * 64 + (t[0] >> 3);
    const list = byBlock.get(key) ?? [];
    list.push(t);
    byBlock.set(key, list);
  }
  return [...byBlock.values()].map((list) => ({ dir, tiles: list }));
}

/**
 * Orders chunks so each is accepted when it runs: take the first one that passes, apply it to the
 * copy, repeat. Fails when some chunk never can (a cliff or a blocked tile in the way).
 */
function sequence(g: Ground, heights: Map<number, number>, chunks: Chunk[]): Chunk[] | EarthWhy {
  const left = [...chunks];
  const done: Chunk[] = [];
  while (left.length) {
    let why: EarthWhy = 'cliff';
    let pick = -1;
    for (let k = 0; k < left.length; k++) {
      const r = blocked(g, heights, left[k]!.tiles, left[k]!.dir);
      if (!r) {
        pick = k;
        break;
      }
      // A cliff may clear once a neighbor has moved; anything else never will.
      if (r !== 'cliff') return r;
      why = r;
    }
    if (pick < 0) return why;
    const c = left.splice(pick, 1)[0]!;
    for (const [x, z] of c.tiles) heights.set(idx(x, z), (heights.get(idx(x, z)) ?? g.height(x, z)) + c.dir);
    done.push(c);
  }
  return done;
}

/**
 * Plans a gesture over `box`: raise or lower every tile one level, or level the box to `target`
 * (the ground where the drag began) in passes of one level. Every command is checked against a
 * copy of the heights as the earlier ones leave them, so a plan that comes back ok is accepted by
 * the sim in full.
 */
export function planEarthworks(g: Ground, kind: EarthworkKind, box: Tile[], target = 0): EarthPlan {
  const heights = new Map<number, number>();
  const changed = new Set<number>();
  const commands: EarthCommand[] = [];
  let moves = 0;
  const h = (t: Tile) => heights.get(idx(t[0], t[1])) ?? g.height(t[0], t[1]);
  const shown = (): Tile[] => {
    const out = [...changed].map((i): Tile => [i % MAP_SIZE, Math.floor(i / MAP_SIZE)]);
    return out.length ? out : box;
  };
  const passes = kind === 'level' ? MAX_HEIGHT : 1;
  for (let pass = 0; pass < passes; pass++) {
    const lower: Tile[] = [];
    const raise: Tile[] = [];
    for (const t of box) {
      if (kind === 'lower') lower.push(t);
      else if (kind === 'raise') raise.push(t);
      else if (h(t) > target) lower.push(t);
      else if (h(t) < target) raise.push(t);
    }
    if (!lower.length && !raise.length) break;
    for (const t of [...lower, ...raise]) changed.add(idx(t[0], t[1]));
    // Row-major runs first (fewest commands), then blocks; lowers first, then raises first.
    let found: Chunk[] | null = null;
    let why: EarthWhy = 'cliff';
    for (const blocks of [false, true]) {
      for (const lowFirst of [true, false]) {
        const a = chunksOf(lower, -1, blocks);
        const b = chunksOf(raise, 1, blocks);
        const trial = new Map(heights);
        const r = sequence(g, trial, lowFirst ? [...a, ...b] : [...b, ...a]);
        if (typeof r === 'string') {
          why = r;
          continue;
        }
        found = r;
        for (const [k, v] of trial) heights.set(k, v);
        break;
      }
      if (found) break;
    }
    if (!found) return { ok: false, why, tiles: shown() };
    for (const c of found) {
      commands.push({ t: c.dir === 1 ? 'terrain.raise' : 'terrain.lower', tiles: c.tiles });
      moves += c.tiles.length;
    }
    if (commands.length > EARTH_MAX_COMMANDS) return { ok: false, why: 'tooMuch', tiles: shown() };
  }
  if (!commands.length) return { ok: false, why: 'flat', tiles: [] };
  return { ok: true, commands, tiles: shown(), moves };
}

/** The cost in coins of a plan (the sim charges per tile per level). */
export const earthCoins = (moves: number) => moves * TERRAFORM_COST;

const VARIANTS = [
  { id: 'level', label: 'Level' },
  { id: 'raise', label: 'Raise' },
  { id: 'lower', label: 'Lower' },
];

export function terrainTool(ctx: ToolContext): Tool {
  const variant = signal<string>('level');
  let start: Tile | null = null;
  let end: Tile | null = null;
  const clear = () => {
    start = null;
    end = null;
    ctx.render.setGhost(null);
    cursorHint(null);
  };
  const kind = () => variant.value as EarthworkKind;

  /** The plan for a drag, whether it may go, and what the cursor should say about it. */
  function assess(a: Tile, b: Tile) {
    const k = kind();
    const plan = planEarthworks(ctx.mirror, k, earthBox(a, b), ctx.mirror.height(a[0], a[1]));
    if (!plan.ok) return { plan, go: false, text: INPUT_COPY.earthWhy(plan.why, k) };
    const coins = earthCoins(plan.moves);
    const money = costBlock(ctx.mirror, { coins });
    if (money) return { plan, go: false, text: rejectText(money) };
    const standard = ctx.mirror.settings.value.mode === 'standard';
    return { plan, go: true, text: INPUT_COPY.earthSummary(k, plan.tiles.length, standard ? coins : null) };
  }

  return {
    id: 'terrain',
    lane: 'ledger',
    icon: 'earthworks',
    label: 'Earthworks',
    hint: INPUT_COPY.earthHint,
    order: 34,
    modes: ['standard', 'sandbox'],
    variants: VARIANTS,
    variant,
    pointerMove(p) {
      if (!p.tile) return;
      if (start) {
        end = [p.tile.x, p.tile.z];
        const r = assess(start, end);
        ctx.render.setGhost({ kind: 'tiles', tiles: r.plan.tiles, valid: r.go });
        cursorHint(r.text, p.clientX, p.clientY);
      } else {
        ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: true });
        cursorHint(
          INPUT_COPY.earthStart(kind(), ctx.mirror.height(p.tile.x, p.tile.z)),
          p.clientX,
          p.clientY,
        );
      }
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
      const r = assess(a, b);
      if (!r.plan.ok || !r.go) {
        ctx.ui.toast(r.text);
        return;
      }
      for (const cmd of r.plan.commands) ctx.submit(cmd);
    },
    key(e) {
      if (e.key === 'Escape' && start) {
        clear();
        return true;
      }
      return false;
    },
    exit: clear,
  };
}
