// Playtest round seven: pricier decor that helps. A piece with `boost` (content/fineDecor.ts) makes
// the production buildings beside it, whose def id or tag it names, work faster. Boosts from every
// piece within reach add up, to at most DECOR_BOOST_CAP permille per building. Registered in the
// yield hook (./modifiers); felling and planting are never modified, so the pieces name no such
// building. The sum is cached per building and rebuilt whenever a piece is added or removed.
import { content, type BuildingDef } from '@qoti/content';
import { TILE_FP } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import type { DecorGrid } from '../../map/decorGrid';
import { footprintSize } from '../../rules/footprint';
import { worldIndex } from '../../state/worldIndex';
import type { YieldModifier } from './modifiers';

/** The most any building gains from decor, permille. */
export const DECOR_BOOST_CAP = 150;

const MAX_REACH = Math.max(0, ...content.decor.map((p) => p.boost?.radius ?? 0));
const HAS_BOOSTERS = content.decor.some((p) => !!p.boost);

function targets(boostTags: readonly string[], def: BuildingDef): boolean {
  for (const t of boostTags) if (t === def.id || def.tags?.includes(t)) return true;
  return false;
}

/** What a building gains from the decor around it: permille (capped) and the piece defs giving it. */
export function decorBoostOf(
  state: WorldState,
  b: Building,
  def: BuildingDef,
): { permille: number; defs: string[] } {
  const grid = worldIndex(state).decorGrid;
  const [w, d] = footprintSize(def, b.rot);
  const x0 = b.x * TILE_FP;
  const z0 = b.z * TILE_FP;
  const x1 = (b.x + w) * TILE_FP;
  const z1 = (b.z + d) * TILE_FP;
  let sum = 0;
  const defs: string[] = [];
  // The widest reach of any piece bounds the grid query; the exact test follows per piece.
  const reach = (MAX_REACH + w + d) * TILE_FP;
  for (const piece of grid.near(x0 + (w * TILE_FP) / 2, z0 + (d * TILE_FP) / 2, reach)) {
    const boost = content.decorById.get(piece.def)?.boost;
    if (!boost || !targets(boost.tags, def)) continue;
    // Distance from the piece's center to the nearest edge of the footprint, squared (fixed point).
    const dx = piece.fx < x0 ? x0 - piece.fx : piece.fx > x1 ? piece.fx - x1 : 0;
    const dz = piece.fz < z0 ? z0 - piece.fz : piece.fz > z1 ? piece.fz - z1 : 0;
    const r = boost.radius * TILE_FP;
    if (dx * dx + dz * dz > r * r) continue;
    sum += boost.permille;
    if (!defs.includes(piece.def)) defs.push(piece.def);
  }
  defs.sort();
  return { permille: Math.min(DECOR_BOOST_CAP, sum), defs };
}

interface Cached {
  version: number;
  byBuilding: Map<number, { def: string; permille: number }>;
}
const caches = new WeakMap<DecorGrid, Cached>();

/** Permille gained, cached by building id; a pure function of the decor and the building. */
export function decorBoostPermille(state: WorldState, b: Building, def: BuildingDef): number {
  if (!HAS_BOOSTERS) return 0;
  const grid = worldIndex(state).decorGrid;
  let c = caches.get(grid);
  if (!c || c.version !== grid.version) {
    c = { version: grid.version, byBuilding: new Map() };
    caches.set(grid, c);
  }
  const hit = c.byBuilding.get(b.id);
  if (hit && hit.def === b.def) return hit.permille;
  const permille = decorBoostOf(state, b, def).permille;
  c.byBuilding.set(b.id, { def: b.def, permille });
  return permille;
}

export const decorYield: YieldModifier = (state, b, def) => 1000 + decorBoostPermille(state, b, def);
