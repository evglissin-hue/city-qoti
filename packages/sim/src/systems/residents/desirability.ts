// Species tastes measured around a tile (docs/spec/11-residents.md, Species). Each taste becomes a
// presence from 0 to 1 times its weight; an `absent` taste counts the missing part. Arrivals pick
// homes by this, and the beauty of home blends it with the charm layer. Charm layers stay zero until
// the Hearth (C3B) fills them, so tags, water and trees carry the tastes on their own until then.
import { content, type SpeciesDef, type Taste } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { Water } from '../../map/layers';
import { worldIndex } from '../../state/worldIndex';
import { doorOf, eachBuildingNear, tileX, tileZ } from './places';

const S = MAP_SIZE;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function layerFor(state: WorldState, what: string | undefined): Uint8Array {
  switch (what) {
    case 'nature':
      return state.map.charmNature;
    case 'comfort':
      return state.map.charmComfort;
    case 'light':
      return state.map.charmLight;
    case 'view':
      return state.map.charmView;
    case 'noise':
      return state.map.charmNoise;
    default:
      return state.map.charm;
  }
}

/** Average of a layer over the square of radius r around (x, z), inside the map. */
export function averageAround(layer: Uint8Array, x: number, z: number, r: number): number {
  let sum = 0;
  let n = 0;
  for (let dz = -r; dz <= r; dz++) {
    const zz = z + dz;
    if (zz < 0 || zz >= S) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= S) continue;
      sum += layer[zz * S + xx]!;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** Buildings and decor carrying a tag within r tiles (Chebyshev) of (x, z). */
export function tagCount(state: WorldState, tag: string, x: number, z: number, r: number, self = 0): number {
  let n = 0;
  eachBuildingNear(state, x, z, r, (b, door) => {
    if (b.id === self || b.stage !== 'built') return;
    if (Math.abs(tileX(door) - x) > r || Math.abs(tileZ(door) - z) > r) return;
    if (content.buildingById.get(b.def)?.tags?.includes(tag)) n++;
  });
  const near = worldIndex(state).decorGrid.near(x * TILE_FP + 128, z * TILE_FP + 128, (r + 0.5) * TILE_FP);
  for (const d of near) if (content.decorById.get(d.def)?.tags.includes(tag)) n++;
  return n;
}

/** Homes (other than `self`) whose door lies within r tiles of (x, z). */
export function homeCount(state: WorldState, x: number, z: number, r: number, self = 0): number {
  let n = 0;
  eachBuildingNear(state, x, z, r, (b, door) => {
    if (b.id === self || Math.abs(tileX(door) - x) > r || Math.abs(tileZ(door) - z) > r) return;
    if (content.buildingById.get(b.def)?.housing) n++;
  });
  return n;
}

/** Distance in tiles (Chebyshev) to the nearest water tile within r, or -1. */
export function waterWithin(state: WorldState, x: number, z: number, r: number): number {
  const water = state.map.water;
  const road = state.map.road;
  for (let d = 0; d <= r; d++) {
    for (let dz = -d; dz <= d; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz >= S) continue;
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const xx = x + dx;
        if (xx < 0 || xx >= S) continue;
        const i = zz * S + xx;
        if (water[i] && !road[i]) return d;
      }
    }
  }
  return -1;
}

/** Trees (tree layer and tree decor) within r tiles of (x, z). */
export function treeCount(state: WorldState, x: number, z: number, r: number): number {
  const tree = state.map.tree;
  let n = 0;
  for (let dz = -r; dz <= r; dz++) {
    const zz = z + dz;
    if (zz < 0 || zz >= S) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      if (xx >= 0 && xx < S && tree[zz * S + xx]) n++;
    }
  }
  return n + tagCount(state, 'tree', x, z, r);
}

/** How present one taste's subject is around (x, z), 0 to 1. */
export function tasteMeasure(state: WorldState, t: Taste, x: number, z: number, self = 0): number {
  const r = t.within ?? 3;
  switch (t.kind) {
    case 'charm':
      return clamp01(averageAround(layerFor(state, t.what), x, z, r) / (t.what === 'noise' ? 30 : 40));
    case 'tag':
      return clamp01(tagCount(state, t.what ?? '', x, z, r, self) / 2);
    case 'water': {
      const d = waterWithin(state, x, z, r);
      return d < 0 ? 0 : 1 - (0.5 * d) / (r + 1);
    }
    case 'crowd':
      return clamp01(homeCount(state, x, z, r, self) / 5);
    case 'trees':
      return clamp01(treeCount(state, x, z, r) / 6);
    case 'height': {
      const h = state.map.height;
      const here = h[z * S + x] ?? 0;
      let low = here;
      for (let dz = -8; dz <= 8; dz += 2) {
        for (let dx = -8; dx <= 8; dx += 2) {
          const xx = x + dx;
          const zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < S && zz < S && h[zz * S + xx]! < low) low = h[zz * S + xx]!;
        }
      }
      return clamp01((here - low) / 3);
    }
    case 'quiet': {
      const noise = averageAround(state.map.charmNoise, x, z, r) / 30;
      return clamp01(1 - noise - homeCount(state, x, z, r, self) / 10);
    }
  }
}

/** Taste score of a tile for a species (sum of weighted presences, about -15 to +25). */
export function tasteScore(state: WorldState, sp: SpeciesDef, x: number, z: number, self = 0): number {
  let score = 0;
  for (const t of sp.likes) {
    const m = tasteMeasure(state, t, x, z, self);
    score += t.weight * (t.absent ? 1 - m : m);
  }
  for (const t of sp.dislikes) {
    const m = tasteMeasure(state, t, x, z, self);
    score += t.weight * (t.absent ? 1 - m : m);
  }
  return score;
}

/**
 * Desirability of a home for a species: its tastes, the charm around the door, and a well in
 * reach. Rounded to hundredths so comparisons never hinge on float noise.
 */
export function homeDesirability(state: WorldState, home: Building, species: string): number {
  const sp = content.speciesById.get(species);
  const door = doorOf(state, home.id);
  const x = tileX(door);
  const z = tileZ(door);
  let score = sp ? tasteScore(state, sp, x, z, home.id) : 0;
  score += averageAround(state.map.charm, x, z, 3) * 0.15;
  if (tagCount(state, 'well', x, z, 8, home.id) > 0) score += 4;
  return Math.round(score * 100) / 100;
}

/**
 * A few words for where a home is, for the Chronicle ("a cottage by the river"). Water wins when it
 * is close; otherwise one of the true descriptions is picked by the home's id, so a row of cottages
 * by the same well does not all read alike.
 */
export function describeHome(state: WorldState, home: Building): string {
  const name = (content.buildingById.get(home.def)?.name ?? 'home').toLowerCase();
  const door = doorOf(state, home.id);
  const x = tileX(door);
  const z = tileZ(door);
  const a = `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
  if (waterWithin(state, x, z, 3) >= 0) return `${a} by the ${nearestWaterKind(state, x, z, 3)}`;
  const options: string[] = [];
  if (tagCount(state, 'well', x, z, 5, home.id)) options.push(`${a} by the well`);
  if (tagCount(state, 'market', x, z, 6, home.id)) options.push(`${a} near the market`);
  if (tagCount(state, 'bakery', x, z, 6, home.id)) options.push(`${a} that smells of the bakery`);
  if (treeCount(state, x, z, 3) >= 4) options.push(`${a} under the trees`);
  if (tagCount(state, 'flower', x, z, 3, home.id) >= 2) options.push(`${a} among the flowers`);
  if (tagCount(state, 'civic', x, z, 8, home.id)) options.push(`${a} in the shadow of the town hall`);
  if (tagCount(state, 'workshop', x, z, 5, home.id)) options.push(`${a} within earshot of the workshops`);
  if (waterWithin(state, x, z, 8) >= 0) {
    options.push(`${a} a short walk from the ${nearestWaterKind(state, x, z, 8)}`);
  }
  if (homeCount(state, x, z, 4, home.id) === 0) options.push(`${a} with nobody next door`);
  if (options.length > 0) return options[home.id % options.length]!;
  return state.map.road[door] ? `${a} on the lane` : `${a} at the edge of town`;
}

function nearestWaterKind(state: WorldState, x: number, z: number, r: number): string {
  for (let d = 0; d <= r; d++) {
    for (let dz = -d; dz <= d; dz++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        const xx = x + dx;
        const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= S || zz >= S) continue;
        const w = state.map.water[zz * S + xx]!;
        if (w === Water.pond) return 'pond';
        if (w === Water.canal) return 'canal';
        if (w) return 'river';
      }
    }
  }
  return 'water';
}
