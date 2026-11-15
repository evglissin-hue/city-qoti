import {
  anchorsFor,
  artKitId,
  kitById,
  resolveDressing,
  rulesFor,
  subjectKey,
  type DressingSubject,
  type GroundBox,
  type Placement,
} from '@qoti/art';
import {
  content,
  type DressingRule,
  type DressingSeason,
  type DressingStat,
  type DressingTier,
} from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, type BuildingView, type LotView } from '@qoti/sim';
import type { Mirror } from '../../state/mirror';
import { drawDef } from '../defs';
import type { LayerContext, RenderLayer } from './types';

/**
 * V3.0: the dressing layer's stub (docs/spec/17-presentation.md, Visual direction, second pass,
 * item 4). It keeps each building's placements (the pieces on its plot, from the resolver) up to
 * date as the Mirror changes, and draws nothing: V3A adds the instanced draws. With the shipped
 * rules table empty, a frame costs nothing and never drops the still frame.
 */

/**
 * Medium's budget for the layer, within the decor detail distance (docs/spec/17-presentation.md,
 * item 4). V3A's pieces go in one instanced draw per piece family.
 */
export const DRESSING_BUDGET = { triangles: 300_000, draws: 12 } as const;

/** The resolver's seed. Nothing seat-specific goes in it: both seats draw the same plot. */
export const DRESSING_SEED = 0x5eed1e55;

const SEASONS: readonly DressingSeason[] = ['spring', 'summer', 'autumn', 'winter'];
/** Tiers by standing, for the `cloth` stand-in. A change in the sim's `TierId` breaks this build. */
const TIER_ORDER: Readonly<Record<DressingTier, number>> = {
  settler: 0,
  craftsfolk: 1,
  merchant: 2,
  patron: 3,
};
/** How long a baby counts toward `births`, in days. */
const BIRTH_DAYS = 28;

function seasonOf(mirror: Mirror): DressingSeason {
  return SEASONS[mirror.clock.value.season] ?? 'spring';
}

/** Today's absolute day, as the agents layer counts it for `bornDay`. */
function absoluteDay(mirror: Mirror): number {
  return Math.floor((mirror.tick.value + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

function sum(pairs: readonly (readonly [string, number])[] | undefined): number {
  let n = 0;
  for (const p of pairs ?? []) n += p[1];
  return n;
}

/** The household whose home this building is (the lowest id when several), or undefined. */
function householdOf(mirror: Mirror, buildingId: number) {
  let best;
  for (const h of mirror.households.values())
    if (h.homeId === buildingId && (!best || h.id < best.id)) best = h;
  return best;
}

/**
 * What the resolver knows about one building. Shared state only: everything here is the same in
 * both seats' Mirrors. Never a seat's own state, never `custom` or anything one seat set alone.
 * `place` is left out (R2's places are not on `main`: a gap until R2X).
 */
export function dressingSubject(mirror: Mirror, b: BuildingView): DressingSubject {
  const def = drawDef(b.def);
  const season = seasonOf(mirror);
  let kind: DressingSubject['kind'] = null;
  if (b.stage === 'built' && def) {
    if (b.trade) kind = 'business';
    else if (def.category === 'home') kind = 'home';
    else if (def.specialized) kind = 'specialized';
  }
  const level = b.level ?? 1;
  const h = householdOf(mirror, b.id);
  const tier: DressingTier | undefined = h?.tier;
  const members = h?.members.length ?? 0;
  let births = 0;
  if (h) {
    const today = absoluteDay(mirror);
    for (const id of h.members) {
      const r = mirror.residents.get(id);
      if (r && r.stage === 'child' && r.bornDay !== undefined && today - r.bornDay < BIRTH_DAYS) births++;
    }
  }
  const capacity = def?.storage ?? 0;
  const fill = capacity > 0 ? Math.min(100, Math.max(0, Math.round((sum(b.rt?.store) / capacity) * 100))) : 0;
  const stats: Partial<Record<DressingStat, number>> = {
    births,
    cloth: tier ? TIER_ORDER[tier] : 0,
    fill,
    firewood: season === 'autumn' || season === 'winter' ? members * 2 : members,
    level,
    members,
    stock: sum(b.rt?.output),
    workers: b.rt?.workers ?? 0,
  };
  return {
    id: b.id,
    def: b.def,
    kind,
    ...(b.trade ? { trade: b.trade } : {}),
    level,
    ...(tier ? { tier } : {}),
    season,
    stats,
  };
}

/** The lot as a box in the building's kit-local space (the inverse of `buildingMatrix`). */
function lotBox(b: BuildingView, lot: LotView, size: readonly [number, number]): GroundBox {
  const [w, d] = size;
  const rot = b.rot;
  const swap = rot % 2 === 1;
  const cx = b.x + (swap ? d : w) / 2;
  const cz = b.z + (swap ? w : d) / 2;
  // buildingMatrix turns by -rot quarter turns about y; undo it with +rot.
  const c = rot === 0 ? 1 : rot === 2 ? -1 : 0;
  const s = rot === 1 ? 1 : rot === 3 ? -1 : 0;
  const toLocal = (x: number, z: number): [number, number] => {
    const dx = x - cx;
    const dz = z - cz;
    return [dx * c - dz * s + w / 2, dx * s + dz * c + d / 2];
  };
  const a = toLocal(lot.x, lot.z);
  const e = toLocal(lot.x + lot.w, lot.z + lot.d);
  return [Math.min(a[0], e[0]), Math.min(a[1], e[1]), Math.max(a[0], e[0]), Math.max(a[1], e[1])];
}

export interface DressingLayer extends RenderLayer {
  /** The placements on one building's plot (kit-local), empty when none. */
  placementsOf(id: number): readonly Placement[];
  /** All placements over all buildings, for the debug overlay. */
  placementCount(): number;
}

interface Cached {
  key: string;
  placements: Placement[];
}

function signature(p: readonly Placement[]): string {
  let s = '';
  for (const q of p)
    s += `${q.rule}|${q.kit}|${q.at.join(',')}|${q.yaw}|${q.scale}|${q.seed}|${JSON.stringify(q.params ?? null)};`;
  return s;
}

export function dressingLayer(rules: readonly DressingRule[] = content.dressingRules): DressingLayer {
  let ctx: LayerContext | null = null;
  let dirty = true;
  let lastSeason = '';
  let lastLevel = '';
  const cache = new Map<number, Cached>();

  function rebuild(active: readonly DressingRule[]): boolean {
    if (!ctx) return false;
    const mirror = ctx.mirror;
    let changed = false;
    const seen = new Set<number>();
    for (const b of mirror.buildings.values()) {
      seen.add(b.id);
      const subject = dressingSubject(mirror, b);
      const def = drawDef(b.def);
      const lot = b.lot !== undefined ? mirror.lots.get(b.lot) : undefined;
      const box = def && lot ? lotBox(b, lot, def.size) : undefined;
      const key = `${subjectKey(subject)}|${box ? box.join(',') : ''}`;
      const hit = cache.get(b.id);
      if (hit && hit.key === key) continue;
      let placements: Placement[] = [];
      if (subject.kind !== null && def) {
        const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
        const art = trade ? trade.look : def.art;
        const kit = kitById.get(artKitId(art));
        if (kit) {
          const anchors = anchorsFor(kit, {
            size: def.size,
            entrance: def.entrance,
            ...(art.params ? { params: art.params } : {}),
            ...(box ? { lot: box } : {}),
          });
          placements = resolveDressing(subject, active, anchors, DRESSING_SEED);
        }
      }
      const before = hit?.placements ?? [];
      if (signature(before) === signature(placements)) {
        // Same pieces: keep the old array, so a no-op re-resolve is not a change.
        cache.set(b.id, { key, placements: hit ? hit.placements : placements });
      } else {
        cache.set(b.id, { key, placements });
        changed = true;
      }
    }
    for (const [id, c] of cache) {
      if (seen.has(id)) continue;
      cache.delete(id);
      if (c.placements.length > 0) changed = true;
    }
    return changed;
  }

  return {
    id: 'dressing',
    motion: 'static',
    shadowless: true,
    init(c) {
      ctx = c;
      dirty = true;
    },
    update(change) {
      if (change.full || change.buildings || change.households || change.residents || change.village)
        dirty = true;
    },
    frame() {
      // The shipped table is empty: nothing to resolve, nothing to draw, no cost.
      if (!ctx || rules.length === 0) return false;
      const level = ctx.env?.dressing ?? 'all';
      const season = seasonOf(ctx.mirror);
      if (season !== lastSeason || level !== lastLevel) {
        lastSeason = season;
        lastLevel = level;
        dirty = true;
      }
      if (!dirty) return false;
      dirty = false;
      return rebuild(rulesFor(level, rules));
    },
    placementsOf(id) {
      return cache.get(id)?.placements ?? [];
    },
    placementCount() {
      let n = 0;
      for (const c of cache.values()) n += c.placements.length;
      return n;
    },
    dispose() {
      cache.clear();
      ctx = null;
    },
  };
}
