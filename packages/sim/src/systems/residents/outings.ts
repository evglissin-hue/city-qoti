// Where residents go when they are free (docs/spec/11-residents.md, Leisure spot): benches, flower
// beds, the well, a good tree, the water's edge, the market for a fox or the bakery for a mouse,
// scored by charm, species tastes and traits, a little distance and a little whim. Friends tend to
// pick the same spot. Children play near home; strolls follow the lanes; visits go to a friend's.
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { Resident, Rng, WorldState } from '../../contracts';
import { treeStage, TREE_MATURE } from '../../map/layers';
import { findById } from '../../state/entities';
import { worldIndex } from '../../state/worldIndex';
import { walkGrid } from '../movement/grid';
import { doorOf, householdOf, tileX, tileZ } from './places';
import { hasTrait, traitFactor, traitPercent } from './traits';

const S = MAP_SIZE;

/** Base leisure radius in tiles (about 15 walking minutes on a lane); Curious x1.5, Homebody x0.5. */
export const LEISURE_RADIUS = 12;

export interface Spot {
  /** The thing they came for (bench, tree, well door, water); they face it. */
  feature: number;
  /** Where they stand. */
  stand: number;
  score: number;
}

/** Leisure appeal of decor tags: [tag, base score, species that love it, bonus]. */
const DECOR_APPEAL: readonly [tag: string, base: number, species: string, bonus: number][] = [
  ['bench', 10, '', 0],
  ['seat', 9, '', 0],
  ['birdbath', 8, '', 0],
  ['flower', 6, 'rabbit', 5],
  ['herb', 5, 'hedgehog', 4],
  ['verge', 4, 'rabbit', 3],
  ['tree', 6, 'squirrel', 8],
  ['fruit', 2, 'squirrel', 3],
  ['blossom', 3, 'rabbit', 2],
  ['hedge', 1, 'hedgehog', 7],
  ['lantern', 3, '', 0],
  ['mooring', 3, 'otter', 7],
  ['sign', 1, 'fox', 1],
];

/** Leisure appeal of building tags. */
const BUILDING_APPEAL: readonly [tag: string, base: number, species: string, bonus: number][] = [
  ['well', 8, '', 0],
  ['market', 4, 'fox', 8],
  ['bakery', 3, 'mouse', 6],
  ['civic', 2, 'fox', 2],
  ['garden', 3, 'rabbit', 4],
];

function walkableTile(cost: Uint8Array, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < S && z < S && cost[z * S + x]! > 0;
}

/** A walkable tile at or next to (x, z), picked with the rng among the free ones, or -1. */
export function standNear(state: WorldState, rng: Rng, x: number, z: number, self = true): number {
  const cost = walkGrid(state).cost;
  if (self && walkableTile(cost, x, z)) return z * S + x;
  const k0 = rng.int(8);
  for (let k = 0; k < 8; k++) {
    const d = (k0 + k) % 8;
    const dx = d === 0 || d === 4 || d === 5 ? 1 : d === 2 || d === 6 || d === 7 ? -1 : 0;
    const dz = d === 1 || d === 4 || d === 6 ? 1 : d === 3 || d === 5 || d === 7 ? -1 : 0;
    if (walkableTile(cost, x + dx, z + dz)) return (z + dz) * S + (x + dx);
  }
  return -1;
}

/** Leisure radius for a resident in tiles. */
export function leisureRadius(r: Resident): number {
  return Math.max(4, Math.round((LEISURE_RADIUS * traitPercent(r, 'leisureRadius')) / 100));
}

/** Feature tiles where the resident's friends are spending their leisure right now. */
function friendSpots(state: WorldState, r: Resident): number[] {
  const out: number[] = [];
  for (const f of r.friends) {
    if (f.level < 1) continue;
    const o = findById(state.residents, f.id);
    if (o && o.activity.kind === 'leisure') out.push(o.activity.tile);
  }
  return out;
}

/**
 * The best leisure spot around the resident: features within their radius, scored by appeal,
 * charm, species and traits, distance, friends and a little whim. Null when nothing is in reach.
 */
export function chooseLeisure(state: WorldState, rng: Rng, r: Resident, evening: boolean): Spot | null {
  const R = leisureRadius(r);
  const cx = tileX(r.tile);
  const cz = tileZ(r.tile);
  const charm = state.map.charm;
  const noise = state.map.charmNoise;
  const road = state.map.road;
  const friends = friendSpots(state, r);
  const nature = traitFactor(r, 'natureWeight');
  const light = traitFactor(r, 'lightWeight');
  const quiet = traitFactor(r, 'quietWeight');
  const bakery = traitFactor(r, 'bakeryWeight');
  const sp = r.species;
  let best: Spot | null = null;

  const consider = (fx: number, fz: number, appeal: number, standSelf: boolean) => {
    if (appeal <= 0) return;
    const feature = fz * S + fx;
    const dist = Math.abs(fx - cx) + Math.abs(fz - cz);
    if (dist > R) return;
    let score = appeal + charm[feature]! * 0.25 - dist * 0.35;
    if (quiet > 1) score += (quiet - 1) * (road[feature] ? -1 : 2) - (noise[feature]! * (quiet - 1)) / 10;
    for (const f of friends) if (f === feature) score += 8;
    score += rng.float() * 5;
    if (best && score <= best.score) return;
    const stand = standNear(state, rng, fx, fz, standSelf);
    if (stand < 0) return;
    best = { feature, stand, score };
  };

  // Decor: benches to sit on, flowers and trees to stand by.
  const near = worldIndex(state).decorGrid.near(cx * TILE_FP + 128, cz * TILE_FP + 128, (R + 0.5) * TILE_FP);
  near.sort((a, b) => a.id - b.id);
  for (const d of near) {
    const def = content.decorById.get(d.def);
    if (!def) continue;
    let appeal = 0;
    for (const [tag, base, species, bonus] of DECOR_APPEAL) {
      if (!def.tags.includes(tag)) continue;
      let v = base + (species === sp ? bonus : 0);
      if (tag === 'flower' || tag === 'tree' || tag === 'herb' || tag === 'verge') v *= nature;
      if (tag === 'lantern') v = (v + (evening ? 4 : 0)) * light;
      if (v > appeal) appeal = v;
    }
    const seat = def.tags.includes('bench') || def.tags.includes('seat');
    consider(Math.floor(d.fx / TILE_FP), Math.floor(d.fz / TILE_FP), appeal, seat && !def.blocksWalking);
  }

  // Buildings: the well, the market for a fox, the bakery for a mouse.
  for (const b of state.buildings) {
    if (b.stage !== 'built' || Math.abs(b.x - cx) > R + 3 || Math.abs(b.z - cz) > R + 3) continue;
    const tags = content.buildingById.get(b.def)?.tags;
    if (!tags) continue;
    let appeal = 0;
    for (const [tag, base, species, bonus] of BUILDING_APPEAL) {
      if (!tags.includes(tag)) continue;
      let v = base + (species === sp ? bonus : 0);
      if (tag === 'bakery') v *= bakery;
      if (v > appeal) appeal = v;
    }
    if (appeal <= 0) continue;
    const door = doorOf(state, b.id);
    consider(tileX(door), tileZ(door), appeal, true);
  }

  // Mature trees and the water's edge, on a coarse lattice so big radii stay cheap.
  const tree = state.map.tree;
  const water = state.map.water;
  const cost = walkGrid(state).cost;
  const otter = sp === 'otter' ? 8 : 0;
  const squirrel = sp === 'squirrel' ? 8 : 0;
  for (let z = cz - R; z <= cz + R; z += 2) {
    if (z < 1 || z >= S - 1) continue;
    for (let x = cx - R; x <= cx + R; x += 2) {
      if (x < 1 || x >= S - 1) continue;
      const i = z * S + x;
      const tv = tree[i]!;
      if (tv && treeStage(tv) >= TREE_MATURE) consider(x, z, (5 + squirrel) * nature, false);
      else if (cost[i]! > 0 && (water[i + 1] || water[i - 1] || water[i + S] || water[i - S])) {
        consider(x, z, 5 + otter + (hasTrait(r, 'romantic') && evening ? 3 : 0), true);
      }
    }
  }
  return best;
}

/** A tile for a child to play on: grass near home, off the lane when possible. */
export function choosePlay(state: WorldState, rng: Rng, r: Resident): number {
  const h = householdOf(state, r);
  const home = doorOf(state, h?.homeId ?? 0);
  const base = home >= 0 ? home : r.tile;
  const cost = walkGrid(state).cost;
  const bx = tileX(base);
  const bz = tileZ(base);
  let fallback = -1;
  for (let k = 0; k < 8; k++) {
    const x = bx + rng.range(-4, 4);
    const z = bz + rng.range(-4, 4);
    if (!walkableTile(cost, x, z)) continue;
    const i = z * S + x;
    if (!state.map.road[i]) return i;
    if (fallback < 0) fallback = i;
  }
  return fallback >= 0 ? fallback : base;
}

/** A stroll destination: a lane or path tile 4 to `far` tiles away, the most charming of a few tries. */
export function chooseStroll(state: WorldState, rng: Rng, around: number, far = 10): number {
  const cost = walkGrid(state).cost;
  const road = state.map.road;
  const ax = tileX(around);
  const az = tileZ(around);
  let best = -1;
  let bestScore = -Infinity;
  for (let k = 0; k < 10; k++) {
    const x = ax + rng.range(-far, far);
    const z = az + rng.range(-far, far);
    if (Math.abs(x - ax) + Math.abs(z - az) < 4 || !walkableTile(cost, x, z)) continue;
    const i = z * S + x;
    const score = (road[i] ? 10 : 0) + state.map.charm[i]! * 0.2 + rng.float() * 4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** The friend to visit: the closest friend (level 1+) with a home of their own, or 0. */
export function chooseVisit(state: WorldState, r: Resident): [friend: number, door: number] {
  const own = householdOf(state, r)?.homeId ?? 0;
  let best = 0;
  let bestDoor = -1;
  let bestKey = -1;
  for (const f of r.friends) {
    if (f.level < 1) continue;
    const o = findById(state.residents, f.id);
    if (!o) continue;
    const home = householdOf(state, o)?.homeId ?? 0;
    if (!home || home === own) continue;
    const door = doorOf(state, home);
    if (door < 0) continue;
    const key = f.points;
    if (key > bestKey) {
      bestKey = key;
      best = f.id;
      bestDoor = door;
    }
  }
  return [best, bestDoor];
}
