import { effect, signal } from '@preact/signals';
import { content, type BuildingDef } from '@qoti/content';
import {
  canPlaceBuilding,
  entranceTiles,
  FIELD_GOOD_FERTILITY,
  FIELD_MIN_FERTILITY,
  footprintSize,
  soilPermille,
  TREE_MATURE,
  type Rot4,
} from '@qoti/sim';
import type { TilePick } from '../../render/api';
import type { Mirror } from '../../state/mirror';
import { rejectText } from '../../ui/messages';
import { buildingChoices, costBlock } from '../catalog';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

/** The deposit a building must sit on, if any (clay pits, quarries). */
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

/**
 * Playtest round five ("we couldn't have logs"): a woodcutter's grown trees in reach at a spot,
 * counted like the sim does (the footprint plus `range` tiles around it).
 */
function treesHint(m: Mirror, def: BuildingDef, x: number, z: number, rot: Rot4): string | null {
  const range = def.methods?.find((x) => x.kind === 'fell')?.range;
  if (!range) return null;
  const [w, d] = footprintSize(def, rot);
  let n = 0;
  for (let tz = z - range; tz < z + d + range; tz++)
    for (let tx = x - range; tx < x + w + range; tx++)
      if (m.tree(tx, tz) && m.treeStage(tx, tz) >= TREE_MATURE) n++;
  if (n === 0) return `No grown trees within ${range} tiles: a woodcutter here would stand idle.`;
  return n < 6
    ? `Only ${n} grown ${n === 1 ? 'tree' : 'trees'} within ${range} tiles. Nearer the woods is better.`
    : `${n} grown trees within ${range} tiles.`;
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

/** Fewer open, fertile tiles than this within a farmhouse's reach, and the cursor says so. */
const FEW_FIELDS = 16;

/**
 * A farmhouse's room for fields at a spot, for the cursor: its fields go on open soil within its
 * reach, so a farmhouse wedged among houses and trees has little to tend.
 */
function fieldRoomHint(m: Mirror, def: BuildingDef, x: number, z: number, rot: Rot4): string | null {
  const range = def.methods?.find((x) => x.kind === 'farm')?.range;
  if (!range) return null;
  const [w, d] = footprintSize(def, rot);
  let n = 0;
  let good = 0;
  for (let tz = z - range; tz < z + d + range; tz++) {
    for (let tx = x - range; tx < x + w + range; tx++) {
      if (tx >= x && tx < x + w && tz >= z && tz < z + d) continue;
      if (m.water(tx, tz) || m.road(tx, tz) || m.occupant(tx, tz) || m.tree(tx, tz)) continue;
      const f = m.fertility(tx, tz);
      if (f < FIELD_MIN_FERTILITY) continue;
      n++;
      if (f >= FIELD_GOOD_FERTILITY) good++;
    }
  }
  if (n < FEW_FIELDS)
    return `Little room for fields here: ${n} tiles of open soil within ${range}. Farms like space around them.`;
  return `Room for ${n} field tiles within ${range}${good < n / 2 ? ', mostly thin soil (slower wheat)' : ''}.`;
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

  const choices = () => buildingChoices(ctx.mirror.settings.value.mode, ctx.ui.lens());

  function preview() {
    const def = content.buildingById.get(variant.value);
    if (!tile || !def) {
      ctx.render.setGhost(null);
      cursorHint(null);
      return null;
    }
    const [w, d] = footprintSize(def, rot);
    const x = tile.x - Math.floor((w - 1) / 2);
    const z = tile.z - Math.floor((d - 1) / 2);
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
    const room = check.ok ? fieldRoomHint(ctx.mirror, def, x, z, rot) : null;
    // Playtest round five: say so before a home or store goes up with no road at its door.
    const { front } = entranceTiles(def, x, z, rot);
    const road =
      check.ok && needsRoadAtDoor(def) && !ctx.mirror.road(front[0], front[1]) ? INPUT_COPY.noRoadYet : null;
    const trees = check.ok ? treesHint(ctx.mirror, def, x, z, rot) : null;
    const why = check.ok
      ? [road, trees, soil, room].filter(Boolean).join(' ') || null
      : check.reason === 'NEEDS_DEPOSIT' && where
        ? (DEPOSIT_HINT[where] ?? rejectText(check.reason))
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
    },
  };
}
