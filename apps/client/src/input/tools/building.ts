import { effect, signal } from '@preact/signals';
import { content, type BuildingDef } from '@qoti/content';
import {
  canPlaceBuilding,
  entranceTiles,
  FIELD_GOOD_FERTILITY,
  FIELD_MIN_FERTILITY,
  footprintSize,
  MAP_SIZE,
  reachRoadTiles,
  TERRAFORM_COST,
  soilPermille,
  TREE_MATURE,
  type Rot4,
} from '@qoti/sim';
import type { TilePick } from '../../render/api';
import type { Mirror } from '../../state/mirror';
import { setGroundMarks, type GroundMark } from '../../ui/marks';
import { rejectText } from '../../ui/messages';
import { buildingChoices, costBlock, lostTownHall } from '../catalog';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

/** The Ledger's ochre, for the reach rings. */
const RING_INK = '#c48a3f';

/** The deposit a building must sit on, if any (the quarry's stone, the Brickworks' clay). */
export function depositOf(def: string): string | null {
  const rule = content.buildingById.get(def)?.placement?.find((r) => r.kind === 'deposit');
  return rule && rule.kind === 'deposit' ? rule.deposit : null;
}

/** Where to look, when a building wants a deposit it is not on. */
const DEPOSIT_HINT: Record<string, string> = {
  clay: 'Clay lies in the terracotta patches, mostly on river banks and sand.',
  coal: 'Coal shows dark in the hills.',
  sand: 'Sand lies by the water.',
  stone: 'Stone shows grey: rocky ground and outcrops.',
};

/** Farms and plots: placing them shows the soil (playtest round three). */
function wantsSoil(def: string): boolean {
  const d = content.buildingById.get(def);
  return (
    !!d?.methods?.some((m) => m.kind === 'farm') ||
    !!d?.tags?.includes('soil') ||
    !!d?.placement?.some((r) => r.kind === 'fertility')
  );
}

/** Playtest round five: the soil under a plot or farm, as a number and a word, for the cursor. */
function soilHint(m: Mirror, def: BuildingDef, x: number, z: number, rot: Rot4): string | null {
  if (!wantsSoil(def.id)) return null;
  const [w, d] = footprintSize(def, rot);
  let sum = 0;
  for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) sum += m.fertility(tx, tz);
  const f = Math.round(sum / (w * d));
  // Playtest round six: gardens grow anywhere, by the soil (sim: production/soil.ts).
  if (def.tags?.includes('soil'))
    return `Soil ${f} (${soilWord(f)}): ${soilYieldPercent(f)}% of a full crop.`;
  return `Soil ${f} (${soilWord(f)}).`;
}

/** The yield of a 'soil' building on this fertility, percent (sim: soilPermille). */
export function soilYieldPercent(f: number): number {
  return Math.round(soilPermille(f) / 10);
}

export function soilWord(f: number): string {
  return f >= 70 ? 'rich' : f >= FIELD_GOOD_FERTILITY ? 'good' : f >= FIELD_MIN_FERTILITY ? 'thin' : 'poor';
}

/** The woods a building's site rule asks for (the Forester's Lodge), or null. */
function woodsRule(def: BuildingDef): { trees: number; within: number } | null {
  const rule = def.placement?.find((r) => r.kind === 'woods');
  return rule && rule.kind === 'woods' ? rule : null;
}

/**
 * Playtest round five ("we couldn't have logs"), R1: a Forester's Lodge needs grown trees around
 * it. Counted like its site rule: the footprint plus `within` tiles around it.
 */
function woodsHint(m: Mirror, def: BuildingDef, x: number, z: number, rot: Rot4): string | null {
  const rule = woodsRule(def);
  if (!rule) return null;
  const { trees, within } = rule;
  const [w, d] = footprintSize(def, rot);
  let n = 0;
  for (let tz = z - within; tz < z + d + within; tz++)
    for (let tx = x - within; tx < x + w + within; tx++)
      if (m.tree(tx, tz) && m.treeStage(tx, tz) >= TREE_MATURE) n++;
  if (n < trees)
    return `A ${def.name} needs ${trees} grown trees within ${within} tiles; ${n === 0 ? 'none' : `only ${n}`} here. Nearer the woods.`;
  return `${n} grown trees within ${within} tiles. The woods will do.`;
}

/** Buildings that idle without a road at the door (the sim's noRoad status). */
function needsRoadAtDoor(def: BuildingDef): boolean {
  return (
    def.category === 'home' ||
    def.category === 'storage' ||
    !!def.tags?.includes('market') ||
    !!def.tags?.includes('builders')
  );
}

/**
 * Playtest item 5: about what Earthworks would charge to level a footprint to its door tile, one
 * coin tally per level above or below it. Null in a sandbox, where the work is free.
 */
export function levelingCoins(m: Mirror, def: BuildingDef, x: number, z: number, rot: Rot4): number | null {
  const [w, d] = footprintSize(def, rot);
  const [dx, dz] = entranceTiles(def, x, z, rot).entrance;
  const door = m.height(dx, dz);
  let levels = 0;
  for (let tz = z; tz < z + d; tz++)
    for (let tx = x; tx < x + w; tx++) levels += Math.abs(m.height(tx, tz) - door);
  return m.settings.value.mode === 'standard' ? levels * TERRAFORM_COST : null;
}

/**
 * Place buildings with the cursor at the footprint's center; R turns it clockwise and Shift+R (or
 * T) back, and the cursor says so. The picker offers what the
 * valley's mode allows (and, in the Hearth lens, the homely ones), with costs; a refusal says why.
 */
export function buildingTool(ctx: ToolContext): Tool {
  const variant = signal('cottage');
  let rot: Rot4 = 0;
  let tile: TilePick | null = null;
  let cx = 0;
  let cy = 0;
  let stop: (() => void) | null = null;

  const choices = () =>
    buildingChoices(ctx.mirror.settings.value.mode, ctx.ui.lens(), lostTownHall(ctx.mirror));

  /**
   * R1X: the reach of a specialized building on the ground, along the roads as the sim walks it: a
   * wash on every road tile within reach, for each standing one of the chosen kind (faint) and for
   * the ghost. Walked once per spot and per change of the map or the buildings, not per frame. Where
   * no road is in reach (a ghost in an empty field) the straight-line ring stays as the fallback.
   */
  let reachKey = '';
  let reachMarks: GroundMark[] = [];
  function reachWash(
    def: BuildingDef,
    at: { x: number; z: number; rot: number },
    faint: boolean,
  ): GroundMark[] {
    const tiles = reachRoadTiles((x, z) => ctx.mirror.road(x, z) > 0, { def: def.id, ...at });
    const out: GroundMark[] = [];
    for (const i of tiles.keys()) {
      out.push({
        x: i % MAP_SIZE,
        z: Math.floor(i / MAP_SIZE),
        w: 1,
        d: 1,
        ink: RING_INK,
        fill: true,
        dashed: faint,
      });
    }
    return out;
  }
  function rings(def: BuildingDef | undefined, ghost?: { x: number; z: number; w: number; d: number }) {
    if (!def?.reach) {
      reachKey = '';
      setGroundMarks([]);
      return;
    }
    const key = `${def.id}:${rot}:${ghost ? `${ghost.x},${ghost.z}` : '-'}:${ctx.mirror.layerRevision}:${ctx.mirror.buildings.size}`;
    if (key !== reachKey) {
      reachKey = key;
      const marks: GroundMark[] = [];
      for (const b of ctx.mirror.buildings.values()) {
        if (b.def !== def.id) continue;
        const wash = reachWash(def, b, true);
        if (wash.length) marks.push(...wash);
        else {
          const [bw, bd] = footprintSize(def, b.rot);
          marks.push({ x: b.x, z: b.z, w: bw, d: bd, ink: RING_INK, ring: def.reach, dashed: true });
        }
      }
      if (ghost) {
        const wash = reachWash(def, { x: ghost.x, z: ghost.z, rot }, false);
        marks.push(...(wash.length ? wash : [{ ...ghost, ink: RING_INK, ring: def.reach }]));
      }
      reachMarks = marks;
    }
    setGroundMarks(reachMarks);
  }

  function preview() {
    const def = content.buildingById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      cursorHint(null);
      rings(def);
      return null;
    }
    const [w, d] = footprintSize(def, rot);
    const x = tile.x - Math.floor((w - 1) / 2);
    const z = tile.z - Math.floor((d - 1) / 2);
    rings(def, { x, z, w, d });
    const place = canPlaceBuilding(ctx.mirror, def, x, z, rot);
    // Playtest round three: a door nobody can walk to would never be built (the sim says CUT_OFF).
    const cutOff =
      place.ok &&
      ctx.mirror.settings.value.mode === 'standard' &&
      !ctx.mirror.townReaches({ def: def.id, x, z, rot });
    const blocked = place.ok ? (cutOff ? 'CUT_OFF' : costBlock(ctx.mirror, def.cost)) : null;
    const check = blocked ? { ok: false, reason: blocked } : place;
    ctx.render.setGhost({ kind: 'building', def: def.id, x, z, rot, valid: check.ok });
    const where = depositOf(def.id);
    const soil = soilHint(ctx.mirror, def, x, z, rot);
    // Playtest round five: say so before a home or store goes up with no road at its door.
    const { front } = entranceTiles(def, x, z, rot);
    const road =
      check.ok && needsRoadAtDoor(def) && !ctx.mirror.road(front[0], front[1]) ? INPUT_COPY.noRoadYet : null;
    const trees = check.ok || check.reason === 'NEEDS_WOODS' ? woodsHint(ctx.mirror, def, x, z, rot) : null;
    const why = check.ok
      ? [road, trees, soil].filter(Boolean).join(' ') || null
      : check.reason === 'NEEDS_WOODS' && trees
        ? trees
        : check.reason === 'NEEDS_DEPOSIT' && where
          ? (DEPOSIT_HINT[where] ?? rejectText(check.reason))
          : check.reason === 'TOO_STEEP'
            ? `${rejectText(check.reason)} ${INPUT_COPY.earthSteep(levelingCoins(ctx.mirror, def, x, z, rot))}`
            : rejectText(check.reason);
    // Playtest round five: nobody found R, so the cursor always says how to turn the building.
    cursorHint(why ? `${why} ${INPUT_COPY.turnHint}` : INPUT_COPY.turnHint, cx, cy);
    return { def, x, z, check };
  }

  return {
    id: 'building',
    lane: 'shared',
    icon: '⌂',
    label: 'Build',
    hint: 'R turns it, Shift+R back; the arrow marks the door',
    order: 30,
    get variants() {
      return choices().map((d) => ({ id: d.id, label: d.name }));
    },
    variant,
    overlay() {
      const dep = depositOf(variant.value);
      if (dep) return `deposit:${dep}`;
      return wantsSoil(variant.value) ? 'soil' : null;
    },
    enter() {
      // A valley mode or lens may not offer the last pick (a house in a standard valley).
      const offered = choices();
      if (offered.length && !offered.some((d) => d.id === variant.value)) variant.value = offered[0]!.id;
      stop = effect(() => {
        void variant.value;
        preview();
      });
    },
    pointerMove(p) {
      tile = p.tile;
      cx = p.clientX;
      cy = p.clientY;
      preview();
    },
    pointerDown(p) {
      tile = p.tile;
      const spot = preview();
      if (!spot) return;
      if (spot.check.ok) ctx.submit({ t: 'build.place', def: spot.def.id, x: spot.x, z: spot.z, rot });
      else ctx.ui.toast(rejectText(spot.check.reason));
    },
    key(e) {
      const k = e.key.toLowerCase();
      if (k !== 'r' && k !== 't') return false;
      const back = k === 't' || e.shiftKey;
      rot = ((rot + (back ? 3 : 1)) % 4) as Rot4;
      preview();
      return true;
    },
    exit() {
      stop?.();
      stop = null;
      tile = null;
      ctx.render.setGhost(null);
      cursorHint(null);
      setGroundMarks([]);
    },
  };
}
