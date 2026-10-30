// Worldgen: a deterministic river valley following docs/spec/10-world-and-building.md, "Valley
// generation", steps 1 to 11: river, distance field, height, terrain, forest with soft edges and
// clearings, deposits with guarantees, fertility, start area, valley road, parcels, validation.
import { MAP_SIZE } from '../constants';
import type { MapLayers, Rect, ValleySettings, WorldMeta } from '../contracts';
import { valleyNamePrefixes, valleyNameSuffixes } from '@qoti/content';
import { rngFromSeed, seedStream, StreamRng } from '../rng/streams';
import {
  createLayers,
  Deposit,
  Flags,
  Road,
  Terrain,
  TREE_MATURE,
  TREE_SPECIES,
  treeValue,
  Water,
} from './layers';
import { ValueNoise } from './noise';

export interface GeneratedValley {
  map: MapLayers;
  meta: WorldMeta;
  /** The worldgen stream's words after generation; the world's RNG state continues from here. */
  worldgenRng: Uint32Array;
}

const BORDER = 6;
const START_SIZE = 24;
const START_CLEAR = 16;
const INF = 0xffff;

const MAX_ATTEMPTS = 6;

/**
 * A valley name for a seed from the content word lists ("Willowmere", "Brackenford"). Uses its
 * own stream, so naming never shifts the terrain. The lobby offers it as the default name.
 */
export function valleyNameFor(seed: string): string {
  const rng = rngFromSeed(seed, 'valleyName');
  const prefix = valleyNamePrefixes[rng.int(valleyNamePrefixes.length)]!;
  let suffix = valleyNameSuffixes[rng.int(valleyNameSuffixes.length)]!;
  // Avoid doubled letters at the seam ("Ashhollow"): take the next suffix instead.
  if (prefix.endsWith(suffix[0]!))
    suffix = valleyNameSuffixes[(valleyNameSuffixes.indexOf(suffix) + 1) % valleyNameSuffixes.length]!;
  return prefix + suffix;
}

/**
 * Generates the valley for a seed. Step 11 (validation): if an attempt has no proper start
 * window, regenerate deterministically with `seed + ":r" + n`; the last attempt always succeeds
 * using the fallback start area.
 */
export function generateValley(seed: string, settings: ValleySettings): GeneratedValley {
  for (let n = 0; n < MAX_ATTEMPTS - 1; n++) {
    const v = attempt(n === 0 ? seed : `${seed}:r${n}`, settings, false);
    if (v) return v;
  }
  return attempt(`${seed}:r${MAX_ATTEMPTS - 1}`, settings, true)!;
}

function attempt(seed: string, _settings: ValleySettings, allowFallback: boolean): GeneratedValley | null {
  const S = MAP_SIZE;
  const words = new Uint32Array(4);
  seedStream(words, 0, seed, 'worldgen');
  const rng = new StreamRng(words, 0);
  const map = createLayers(S);
  const { height, terrain, water, fertility, tree, road, flags } = map;

  // Along-axis coordinate a follows the river; c crosses it.
  const flow: 'ns' | 'we' = rng.chance(0.5) ? 'ns' : 'we';
  const idx = flow === 'ns' ? (a: number, c: number) => a * S + c : (a: number, c: number) => c * S + a;

  // 1. River: a gentle meander. Two low octaves of 1D value noise around a seeded middle,
  // smoothed with a 9-tile moving average and limited per step so bends stay soft; 3 tiles wide.
  const mid = rng.uniform(80, 112);
  const bend = new ValueNoise(rng, S, 64);
  const wiggle = new ValueNoise(rng, S, 28);
  const raw = new Float64Array(S);
  for (let a = 0; a < S; a++) raw[a] = mid + (bend.at(a, 0) - 0.5) * 48 + (wiggle.at(a, 0) - 0.5) * 10;
  const center = new Float64Array(S);
  for (let a = 0; a < S; a++) {
    let sum = 0;
    let n = 0;
    for (let k = -4; k <= 4; k++) {
      const j = a + k;
      if (j >= 0 && j < S) {
        sum += raw[j]!;
        n++;
      }
    }
    center[a] = sum / n;
  }
  for (let a = 1; a < S; a++) {
    const step = center[a]! - center[a - 1]!;
    if (step > 0.7) center[a] = center[a - 1]! + 0.7;
    else if (step < -0.7) center[a] = center[a - 1]! - 0.7;
  }
  for (let a = 0; a < S; a++) {
    const c = Math.max(40, Math.min(152, Math.round(center[a]!)));
    for (let ct = c - 1; ct <= c + 1; ct++) {
      const i = idx(a, ct);
      water[i] = ct === c ? Water.riverDeep : Water.river;
      terrain[i] = Terrain.water;
      height[i] = 0;
    }
  }

  // 2. Chamfer (3-4) distance to the nearest water tile, in tiles.
  const d3 = new Uint16Array(S * S).fill(INF);
  for (let i = 0; i < S * S; i++) if (water[i]) d3[i] = 0;
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      let best = d3[i]!;
      if (x > 0) best = Math.min(best, d3[i - 1]! + 3);
      if (z > 0) {
        best = Math.min(best, d3[i - S]! + 3);
        if (x > 0) best = Math.min(best, d3[i - S - 1]! + 4);
        if (x < S - 1) best = Math.min(best, d3[i - S + 1]! + 4);
      }
      d3[i] = best;
    }
  }
  for (let z = S - 1; z >= 0; z--) {
    for (let x = S - 1; x >= 0; x--) {
      const i = z * S + x;
      let best = d3[i]!;
      if (x < S - 1) best = Math.min(best, d3[i + 1]! + 3);
      if (z < S - 1) {
        best = Math.min(best, d3[i + S]! + 3);
        if (x < S - 1) best = Math.min(best, d3[i + S + 1]! + 4);
        if (x > 0) best = Math.min(best, d3[i + S - 1]! + 4);
      }
      d3[i] = best;
    }
  }
  const dist = new Uint16Array(S * S);
  for (let i = 0; i < S * S; i++) dist[i] = Math.floor((d3[i]! + 1) / 3);

  // 3. Height: gentle banks rising into hills, plus three octaves of value noise.
  // Soft rolling hills: low-frequency octaves, so most neighbors differ by one level at most.
  const o1 = new ValueNoise(rng, S, 48);
  const o2 = new ValueNoise(rng, S, 24);
  const o3 = new ValueNoise(rng, S, 12);
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      if (water[i]) continue;
      const edge = Math.min(x, z, S - 1 - x, S - 1 - z);
      if (edge < BORDER) {
        height[i] = 13 + Math.floor(((BORDER - 1 - edge) * 2) / (BORDER - 1));
        terrain[i] = Terrain.mountain;
        continue;
      }
      const d = dist[i]!;
      // Wide terraces step up gently from the river; hills grow taller toward the border.
      const base = d <= 3 ? 1 : Math.min(8, 1 + (d - 3) / 10);
      const rise = edge < 34 ? (34 - edge) / 8 : 0;
      const n = (o1.at(x, z) - 0.5) * 5 + (o2.at(x, z) - 0.5) * 2 + (o3.at(x, z) - 0.5) * 0.6;
      // Damp the noise near the river so the banks stay buildable.
      const h = Math.floor(base + rise + n * Math.min(1, d / 12));
      height[i] = Math.max(1, Math.min(12, h));
    }
  }

  // 4. Terrain and 5. forest.
  const sandNoise = new ValueNoise(rng, S, 8);
  const moisture = new ValueNoise(rng, S, 20);
  const forestNoise = new ValueNoise(rng, S, 24);
  const clearingNoise = new ValueNoise(rng, S, 10);
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      if (water[i] || terrain[i] === Terrain.mountain) continue;
      const h = height[i]!;
      const d = dist[i]!;
      let slope = 0;
      if (x > 0) slope = Math.max(slope, Math.abs(h - height[i - 1]!));
      if (x < S - 1) slope = Math.max(slope, Math.abs(h - height[i + 1]!));
      if (z > 0) slope = Math.max(slope, Math.abs(h - height[i - S]!));
      if (z < S - 1) slope = Math.max(slope, Math.abs(h - height[i + S]!));
      const f = forestNoise.at(x, z);
      const forested = f > 0.55 && d >= 6 && h <= 11;
      // Clearings: small open glades inside the woods, read from above as soft meadow pockets.
      const clearing = forested && clearingNoise.at(x, z) > 0.74;
      // Sandy banks, one to two tiles wide on both sides.
      if (d === 1 || (d === 2 && sandNoise.at(x, z) > 0.45)) terrain[i] = Terrain.sand;
      else if (slope >= 3 || h >= 11) terrain[i] = Terrain.rock;
      else if (clearing) terrain[i] = Terrain.meadow;
      else if (forested) terrain[i] = Terrain.forestFloor;
      else if (h <= 3 && moisture.at(x, z) > 0.55) terrain[i] = Terrain.meadow;
      else terrain[i] = Terrain.grass;

      const t = terrain[i];
      // Soft edges: density rises from the rim of the mask (about 35%) to the heart (about 85%),
      // and a sparse fringe of trees steps out onto the grass around each wood.
      const density = 0.35 + 0.5 * Math.min(1, (f - 0.55) / 0.1);
      const fringe = t === Terrain.grass && f > 0.47 && d >= 4 ? 0.14 : 0.025;
      if ((t === Terrain.forestFloor && rng.chance(density)) || (t === Terrain.grass && rng.chance(fringe))) {
        let species: number;
        if (h <= 3) species = rng.chance(0.6) ? TREE_SPECIES.oak : TREE_SPECIES.birch;
        else if (h <= 8) species = rng.chance(0.5) ? TREE_SPECIES.oak : TREE_SPECIES.pine;
        else species = TREE_SPECIES.pine;
        // Wild trees start mature; only planted saplings grow (the trees system).
        tree[i] = treeValue(species, TREE_MATURE);
      }
    }
  }

  // 7. Fertility. Playtest round six: rich loam lies in broad patches across the whole valley
  // (the same noise read at two scales: patches about 40 tiles across, and a finer grain), not
  // only on the river banks, which add a little silt.
  const fertNoise = new ValueNoise(rng, S, 16);
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      const t = terrain[i];
      if (t === Terrain.water || t === Terrain.mountain) continue;
      const broad = Math.max(0, Math.min(1, (fertNoise.at(x * 0.4, z * 0.4) - 0.28) / 0.44));
      let f = 22 + 66 * broad + (fertNoise.at(x, z) - 0.5) * 18;
      if (dist[i]! < 5) f += (5 - dist[i]!) * 3;
      if (t === Terrain.meadow) f += 10;
      if (t === Terrain.forestFloor) f -= 12;
      if (t === Terrain.rock) f -= 60;
      fertility[i] = Math.max(0, Math.min(100, Math.round(f)));
    }
  }

  // 8. Start area: the flattest dry 24 x 24 window 6 to 14 tiles from the river, mid-valley.
  let bestA = -1;
  let bestC = -1;
  let bestScore = Infinity;
  const aFrom = Math.floor(S / 3) - START_SIZE / 2;
  const aTo = Math.floor((2 * S) / 3) - START_SIZE / 2;
  for (let a0 = aFrom; a0 <= aTo; a0 += 2) {
    for (let c0 = BORDER; c0 + START_SIZE <= S - BORDER; c0 += 2) {
      let minD = INF;
      let hMin = 99;
      let hMax = -1;
      let bad = 0;
      for (let a = a0; a < a0 + START_SIZE; a++) {
        for (let c = c0; c < c0 + START_SIZE; c++) {
          const i = idx(a, c);
          const t = terrain[i];
          if (t === Terrain.water || t === Terrain.mountain || t === Terrain.rock) bad++;
          const d = dist[i]!;
          if (d < minD) minD = d;
          const h = height[i]!;
          if (h < hMin) hMin = h;
          if (h > hMax) hMax = h;
        }
      }
      if (minD < 6 || minD > 14) continue;
      const mid = Math.abs(a0 + START_SIZE / 2 - S / 2);
      const score = bad * 1000 + Math.max(0, hMax - hMin - 2) * 100 + (hMax - hMin) * 10 + mid;
      if (score < bestScore) {
        bestScore = score;
        bestA = a0;
        bestC = c0;
      }
    }
  }
  if (bestA < 0 || bestScore >= 1000) {
    // Step 11: a start area with rock or water in it fails validation; try the next seed.
    if (!allowFallback) return null;
  }
  if (bestA < 0) {
    // No window at the right distance (an unusually wide bend): fall back to the far bank side.
    bestA = Math.floor(S / 2) - START_SIZE / 2;
    const rc = Math.round(center[bestA + START_SIZE / 2]!);
    bestC = rc < S / 2 ? Math.min(S - BORDER - START_SIZE, rc + 8) : Math.max(BORDER, rc - 8 - START_SIZE);
  }
  // Level the window so the first buildings always fit: clamp to median +- 1, no rock.
  const startHeights: number[] = [];
  for (let a = bestA; a < bestA + START_SIZE; a++) {
    for (let c = bestC; c < bestC + START_SIZE; c++) startHeights.push(height[idx(a, c)]!);
  }
  startHeights.sort((p, q) => p - q);
  const median = Math.max(1, startHeights[startHeights.length >> 1]!);
  for (let a = bestA; a < bestA + START_SIZE; a++) {
    for (let c = bestC; c < bestC + START_SIZE; c++) {
      const i = idx(a, c);
      if (terrain[i] === Terrain.water) continue;
      height[i] = Math.max(median - 1, Math.min(median + 1, height[i]!));
      if (terrain[i] === Terrain.rock || terrain[i] === Terrain.mountain) terrain[i] = Terrain.grass;
      flags[i]! |= Flags.startArea;
      // Playtest round six: the first homes stand on workable soil, so their kitchen gardens grow;
      // the patches still show (the floor is 45, the noise keeps rich and thin apart above it).
      fertility[i] = Math.max(fertility[i]!, 45 + Math.round(fertNoise.at(S - 1 - c, a) * 30));
      const inner = START_SIZE / 2 - START_CLEAR / 2;
      if (
        a - bestA >= inner &&
        a - bestA < inner + START_CLEAR &&
        c - bestC >= inner &&
        c - bestC < inner + START_CLEAR
      ) {
        tree[i] = 0;
        // A clearing is grass, not forest floor with the trees taken away.
        if (terrain[i] === Terrain.forestFloor) terrain[i] = Terrain.grass;
      }
    }
  }
  const startRect: Rect =
    flow === 'ns'
      ? [bestC, bestA, bestC + START_SIZE - 1, bestA + START_SIZE - 1]
      : [bestA, bestC, bestA + START_SIZE - 1, bestC + START_SIZE - 1];

  // 9. Valley road: A* from the map edge on the start area's side to its center, painted as lane.
  const sa = bestA + START_SIZE / 2;
  const sc = bestC + START_SIZE / 2;
  const gateC = sc > center[sa]! ? S - 1 : 0;
  const gate = idx(sa, gateC);
  const goal = idx(sa, sc);
  const route = findRoute(map, gate, goal);
  // Walk from the start area outward so each step differs by at most one level: a pass.
  for (let k = route.length - 2; k >= 0; k--) {
    const i = route[k]!;
    const prev = height[route[k + 1]!]!;
    height[i] = Math.max(prev - 1, Math.min(prev + 1, height[i]!));
  }
  for (const i of route) {
    road[i] = Road.lane;
    tree[i] = 0;
  }
  flags[gate]! |= Flags.valleyGate;

  // 6. Deposits, then 10. parcels.
  placeDeposits(map, rng, dist, startRect);
  assignParcels(map, rng, sa, sc, idx);

  return {
    map,
    meta: { startArea: startRect, valleyGate: [gate % S, Math.floor(gate / S)], flow },
    worldgenRng: words,
  };
}

/** Radius around the start area within which stone and clay are guaranteed. */
export const DEPOSIT_REACH = 40;
/**
 * C3X: one stone cluster of 9+ tiles also lies within this many tiles of the start area, so the
 * first quarry fits inside the starting storehouse's porter range (20 tiles from the town center).
 */
export const NEAR_STONE_REACH = 8;

/**
 * Step 6: stone clusters on and around rock, clay clusters on banks and sand. Guarantees at least
 * two stone clusters of 12+ tiles and one clay cluster within DEPOSIT_REACH tiles of the start
 * area, stamping them deterministically when the noise did not provide them.
 */
function placeDeposits(map: MapLayers, rng: StreamRng, dist: Uint16Array, start: Rect): void {
  const S = MAP_SIZE;
  const { deposit, terrain, height, road, flags, water } = map;
  const stoneNoise = new ValueNoise(rng, S, 7);
  const clayNoise = new ValueNoise(rng, S, 6);
  for (let z = BORDER; z < S - BORDER; z++) {
    for (let x = BORDER; x < S - BORDER; x++) {
      const i = z * S + x;
      if (water[i] || road[i] || flags[i]! & Flags.startArea) continue;
      const t = terrain[i];
      const nearRock =
        t === Terrain.rock ||
        terrain[i - 1] === Terrain.rock ||
        terrain[i + 1] === Terrain.rock ||
        terrain[i - S] === Terrain.rock ||
        terrain[i + S] === Terrain.rock;
      if (nearRock && stoneNoise.at(x, z) > 0.45) deposit[i] = Deposit.stone;
      else if (height[i]! >= 7 && t !== Terrain.mountain && stoneNoise.at(x, z) > 0.82)
        deposit[i] = Deposit.stone;
      else if ((t === Terrain.sand || dist[i]! <= 2) && clayNoise.at(x, z) > 0.55) deposit[i] = Deposit.clay;
    }
  }
  const [sx0, sz0, sx1, sz1] = start;
  const clusters = (kind: number, min: number, reach = DEPOSIT_REACH): number => {
    const seen = new Uint8Array(S * S);
    let count = 0;
    const bx0 = Math.max(BORDER, sx0 - reach);
    const bz0 = Math.max(BORDER, sz0 - reach);
    const bx1 = Math.min(S - 1 - BORDER, sx1 + reach);
    const bz1 = Math.min(S - 1 - BORDER, sz1 + reach);
    for (let z = bz0; z <= bz1; z++) {
      for (let x = bx0; x <= bx1; x++) {
        const i0 = z * S + x;
        if (seen[i0] || deposit[i0] !== kind) continue;
        let size = 0;
        const stack = [i0];
        seen[i0] = 1;
        while (stack.length) {
          const i = stack.pop()!;
          size++;
          for (const n of [i + 1, i - 1, i + S, i - S]) {
            if (n < 0 || n >= S * S || seen[n] || deposit[n] !== kind) continue;
            if (Math.abs((n % S) - (i % S)) > 1) continue;
            // Only tiles inside the reach count toward a cluster's size.
            const nx = n % S;
            const nz = (n - nx) / S;
            if (nx < bx0 || nx > bx1 || nz < bz0 || nz > bz1) continue;
            seen[n] = 1;
            stack.push(n);
          }
        }
        if (size >= min) count++;
      }
    }
    return count;
  };
  // Candidate stamp spots: a deterministic scan outward from the start area, ring by ring.
  /** Stamps a side x side cluster as close to the start center as it fits (outside the start area). */
  const stampNear = (kind: number, side: number): boolean => {
    const cx = (sx0 + sx1) >> 1;
    const cz = (sz0 + sz1) >> 1;
    let best = -1;
    let bestD = Infinity;
    for (let z = sz0 - NEAR_STONE_REACH; z <= sz1 + NEAR_STONE_REACH; z++) {
      for (let x = sx0 - NEAR_STONE_REACH; x <= sx1 + NEAR_STONE_REACH; x++) {
        if (x < BORDER || z < BORDER || x + side > S - BORDER || z + side > S - BORDER) continue;
        const d = Math.abs(x + (side >> 1) - cx) + Math.abs(z + (side >> 1) - cz);
        if (d >= bestD) continue;
        let ok = true;
        for (let dz = 0; dz < side && ok; dz++) {
          for (let dx = 0; dx < side && ok; dx++) {
            const i = (z + dz) * S + x + dx;
            if (water[i] || road[i] || flags[i]! & Flags.startArea || deposit[i]) ok = false;
          }
        }
        if (ok) {
          best = z * S + x;
          bestD = d;
        }
      }
    }
    if (best < 0) return false;
    for (let dz = 0; dz < side; dz++) for (let dx = 0; dx < side; dx++) deposit[best + dz * S + dx] = kind;
    return true;
  };
  const stamp = (kind: number, side: number, wantBank: boolean, reach = DEPOSIT_REACH): boolean => {
    for (let ring = 2; ring <= reach - side; ring += 2) {
      for (let z = sz0 - ring; z <= sz1 + ring; z += 2) {
        for (let x = sx0 - ring; x <= sx1 + ring; x += 2) {
          const onRing = z === sz0 - ring || z === sz1 + ring || x === sx0 - ring || x === sx1 + ring;
          if (!onRing) continue;
          if (x < BORDER || z < BORDER || x + side > S - BORDER || z + side > S - BORDER) continue;
          let ok = true;
          let bank = false;
          for (let dz = 0; dz < side && ok; dz++) {
            for (let dx = 0; dx < side && ok; dx++) {
              const i = (z + dz) * S + x + dx;
              if (water[i] || road[i] || flags[i]! & Flags.startArea || deposit[i]) ok = false;
              if (dist[i]! <= 3) bank = true;
            }
          }
          if (!ok || (wantBank && !bank)) continue;
          for (let dz = 0; dz < side; dz++) {
            for (let dx = 0; dx < side; dx++) deposit[(z + dz) * S + x + dx] = kind;
          }
          return true;
        }
      }
    }
    return false;
  };
  if (clusters(Deposit.stone, 9, NEAR_STONE_REACH) < 1) stampNear(Deposit.stone, 4);
  for (let k = clusters(Deposit.stone, 12); k < 2; k++) if (!stamp(Deposit.stone, 4, false)) break;
  if (clusters(Deposit.clay, 1) < 1 && !stamp(Deposit.clay, 3, true)) stamp(Deposit.clay, 3, false);
}

/** Number of parcels: Voronoi cells around jittered points on a 4 x 4 grid. */
export const PARCEL_COUNT = 16;

/** Step 10: Voronoi parcels; the cell holding the start area center becomes parcel 0. */
function assignParcels(
  map: MapLayers,
  rng: StreamRng,
  startA: number,
  startC: number,
  idx: (a: number, c: number) => number,
): void {
  const S = MAP_SIZE;
  const cell = S / 4;
  const px: number[] = [];
  const pz: number[] = [];
  for (let gz = 0; gz < 4; gz++) {
    for (let gx = 0; gx < 4; gx++) {
      px.push(gx * cell + 8 + rng.int(cell - 16));
      pz.push(gz * cell + 8 + rng.int(cell - 16));
    }
  }
  const { parcel } = map;
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < PARCEL_COUNT; p++) {
        const dx = x - px[p]!;
        const dz = z - pz[p]!;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) {
          bestD = d2;
          best = p;
        }
      }
      parcel[z * S + x] = best;
    }
  }
  const home = parcel[idx(startA, startC)]!;
  if (home !== 0) {
    for (let i = 0; i < S * S; i++) {
      if (parcel[i] === home) parcel[i] = 0;
      else if (parcel[i] === 0) parcel[i] = home;
    }
  }
}

/** A* over 4-neighbor tiles, favoring flat, treeless, dry ground. Returns tile indices gate to goal. */
function findRoute(map: MapLayers, from: number, to: number): number[] {
  const S = MAP_SIZE;
  const { height, terrain, water, tree } = map;
  const g = new Int32Array(S * S).fill(0x7fffffff);
  const came = new Int32Array(S * S).fill(-1);
  const closed = new Uint8Array(S * S);
  const heap = new MinHeap();
  const tx = to % S;
  const tz = Math.floor(to / S);
  const h = (i: number) => Math.abs((i % S) - tx) + Math.abs(Math.floor(i / S) - tz);
  g[from] = 0;
  heap.push(h(from), from);
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === to) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % S;
    const cz = Math.floor(cur / S);
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      if (closed[n]) continue;
      const dh = Math.abs(height[n]! - height[cur]!);
      const t = terrain[n];
      const cost =
        1 +
        2 * dh +
        (dh >= 2 ? 8 : 0) +
        (tree[n] ? 3 : 0) +
        (t === Terrain.rock || t === Terrain.mountain ? 4 : 0) +
        (water[n] ? 10000 : 0);
      const ng = g[cur]! + cost;
      if (ng < g[n]!) {
        g[n] = ng;
        came[n] = cur;
        heap.push(ng + h(n), n);
      }
    }
  }
  const route: number[] = [];
  for (let i = to; i !== -1; i = came[i]!) {
    route.push(i);
    if (i === from) break;
  }
  return route.reverse();
}

/** Binary min-heap of (priority, tile index), ties broken by index for determinism. */
class MinHeap {
  private pri: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.val.length;
  }

  private less(i: number, j: number): boolean {
    const a = this.pri[i]!;
    const b = this.pri[j]!;
    return a < b || (a === b && this.val[i]! < this.val[j]!);
  }

  private swap(i: number, j: number): void {
    const p = this.pri[i]!;
    this.pri[i] = this.pri[j]!;
    this.pri[j] = p;
    const v = this.val[i]!;
    this.val[i] = this.val[j]!;
    this.val[j] = v;
  }

  push(priority: number, value: number): void {
    this.pri.push(priority);
    this.val.push(value);
    let i = this.val.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.val[0]!;
    const lastPri = this.pri.pop()!;
    const lastVal = this.val.pop()!;
    if (this.val.length > 0) {
      this.pri[0] = lastPri;
      this.val[0] = lastVal;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.val.length && this.less(l, m)) m = l;
        if (r < this.val.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
