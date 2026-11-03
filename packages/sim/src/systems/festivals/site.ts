// Where a festival is held (C5B; docs/spec/12-hearth.md, Festivals): a rect of open ground (6x6 or
// more, no buildings, water or trees on it) or a pattern site standing now, whose footprint is the
// bounding box of its members and tiles grown by FESTIVAL_SITE_MARGIN and to FESTIVAL_SITE_MIN a
// side. Pure reads of state.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Decor, FestivalSite, PatternSite, Rect, RejectReason, WorldState } from '../../contracts';
import { buildingRect, decorInRect, decorTileX, decorTileZ } from '../../conditions/geo';
import { findById } from '../../state/entities';

/** Festival sites: at least this many tiles a side. */
export const FESTIVAL_SITE_MIN = 6;
/** A pattern site's festival ground reaches this far past its members. */
export const FESTIVAL_SITE_MARGIN = 2;

/** The pattern site a plan names, if it stands now. */
export function patternSiteOf(state: WorldState, pattern: string, anchor: number): PatternSite | null {
  for (const s of state.hearth.sites) if (s.pattern === pattern && s.anchor === anchor) return s;
  return null;
}

function clampRect(r: Rect): Rect {
  const m = MAP_SIZE - 1;
  return [Math.max(0, r[0]), Math.max(0, r[1]), Math.min(m, r[2]), Math.min(m, r[3])];
}

/** Grows a rect evenly until it is at least FESTIVAL_SITE_MIN a side. */
function atLeastMin(r: Rect): Rect {
  let [x0, z0, x1, z1] = r;
  while (x1 - x0 + 1 < FESTIVAL_SITE_MIN) {
    x0 -= 1;
    if (x1 - x0 + 1 < FESTIVAL_SITE_MIN) x1 += 1;
  }
  while (z1 - z0 + 1 < FESTIVAL_SITE_MIN) {
    z0 -= 1;
    if (z1 - z0 + 1 < FESTIVAL_SITE_MIN) z1 += 1;
  }
  return [x0, z0, x1, z1];
}

/** The pattern site's ground: its members' and tiles' bounding box, grown by the margin. */
export function patternRect(state: WorldState, site: PatternSite): Rect {
  let x0 = site.anchor % MAP_SIZE;
  let z0 = Math.floor(site.anchor / MAP_SIZE);
  let x1 = x0;
  let z1 = z0;
  const take = (x: number, z: number) => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  };
  for (const t of site.tiles) take(t % MAP_SIZE, Math.floor(t / MAP_SIZE));
  for (const id of site.members) {
    const d = findById(state.decor, id);
    if (d) {
      take(decorTileX(d), decorTileZ(d));
      continue;
    }
    const b = findById(state.buildings, id);
    if (b) {
      const r = buildingRect(b);
      take(r[0], r[1]);
      take(r[2], r[3]);
    }
  }
  const g = FESTIVAL_SITE_MARGIN;
  return clampRect(atLeastMin([x0 - g, z0 - g, x1 + g, z1 + g]));
}

/** The tiles a plan's site covers now, or null when it names a pattern site that is gone. */
export function siteRect(state: WorldState, site: FestivalSite | null): Rect | null {
  if (!site) return null;
  if ('rect' in site) return [site.rect[0], site.rect[1], site.rect[2], site.rect[3]];
  const s = patternSiteOf(state, site.pattern, site.anchor);
  return s ? patternRect(state, s) : null;
}

/** WATER or OCCUPIED when a rect is not open ground (water, or a building or a tree stands on it). */
export function openGround(state: WorldState, r: Rect): RejectReason | null {
  const m = state.map;
  for (let z = r[1]; z <= r[3]; z++) {
    for (let x = r[0]; x <= r[2]; x++) {
      const i = z * MAP_SIZE + x;
      if (m.water[i]) return 'WATER';
      if (m.occupant[i] || m.tree[i]) return 'OCCUPIED';
    }
  }
  return null;
}

/** The middle tile of a rect (x, z). */
export function rectCenter(r: Rect): [number, number] {
  return [(r[0] + r[2]) >> 1, (r[1] + r[3]) >> 1];
}

/** Decor standing on the site. */
export function decorOnSite(state: WorldState, r: Rect): Decor[] {
  return decorInRect(state, r);
}

/** Distinct festival piece defs on the site. */
export function pieceVariety(state: WorldState, r: Rect): number {
  const seen = new Set<string>();
  for (const d of decorOnSite(state, r)) if (content.decorById.get(d.def)?.festival) seen.add(d.def);
  return seen.size;
}

/** Average charm over the site's tiles (0 to 255 scale, as the charm layer). */
export function siteCharm(state: WorldState, r: Rect): number {
  let sum = 0;
  let n = 0;
  for (let z = r[1]; z <= r[3]; z++) {
    for (let x = r[0]; x <= r[2]; x++) {
      sum += state.map.charm[z * MAP_SIZE + x] ?? 0;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * A walkable tile on the site for a guest to stand on, spread over the site by `seed` (a resident
 * id): open, dry tiles only, scanning on from the seeded tile. -1 when the site has none.
 */
export function standTile(state: WorldState, r: Rect, seed: number): number {
  const w = r[2] - r[0] + 1;
  const d = r[3] - r[1] + 1;
  const n = w * d;
  const m = state.map;
  const start = (Math.imul(seed, 2654435761) >>> 0) % n;
  for (let k = 0; k < n; k++) {
    const j = (start + k * 7) % n;
    const i = (r[1] + Math.floor(j / w)) * MAP_SIZE + r[0] + (j % w);
    if (!m.occupant[i] && !m.water[i] && !m.tree[i]) return i;
  }
  return -1;
}
