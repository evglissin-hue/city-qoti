// Worldgen v0: a deterministic river valley that is good enough to build in. C2A replaces it
// with the full algorithm from docs/spec/10-world-and-building.md behind the same signature.
import { MAP_SIZE } from '../constants';
import type { MapLayers, Rect, ValleySettings, WorldMeta } from '../contracts';
import { seedStream, StreamRng } from '../rng/streams';
import { createLayers, Flags, Road, Terrain, TREE_MATURE, TREE_SPECIES, treeValue, Water } from './layers';
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

export function generateValley(seed: string, _settings: ValleySettings): GeneratedValley {
  const S = MAP_SIZE;
  const words = new Uint32Array(4);
  seedStream(words, 0, seed, 'worldgen');
  const rng = new StreamRng(words, 0);
  const map = createLayers(S);
  const { height, terrain, water, fertility, tree, road, flags } = map;

  // Along-axis coordinate a follows the river; c crosses it.
  const flow: 'ns' | 'we' = rng.chance(0.5) ? 'ns' : 'we';
  const idx = flow === 'ns' ? (a: number, c: number) => a * S + c : (a: number, c: number) => c * S + a;

  // 1. River: a wandering centerline, smoothed, two or three tiles wide.
  const raw = new Float64Array(S);
  let pos = rng.uniform(72, 120);
  let v = 0;
  for (let a = 0; a < S; a++) {
    v = Math.max(-0.6, Math.min(0.6, v + rng.uniform(-0.15, 0.15)));
    pos += v;
    if (pos < 40) {
      pos = 40;
      v = Math.abs(v) * 0.5;
    } else if (pos > 152) {
      pos = 152;
      v = -Math.abs(v) * 0.5;
    }
    raw[a] = pos;
  }
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
  const widthNoise = new ValueNoise(rng, S, 24);
  for (let a = 0; a < S; a++) {
    const c = Math.round(center[a]!);
    const wide = widthNoise.at(a, 0) > 0.6;
    for (let ct = c - 1; ct <= (wide ? c + 1 : c); ct++) {
      const i = idx(a, ct);
      water[i] = wide && ct === c ? Water.riverDeep : Water.river;
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
  const o1 = new ValueNoise(rng, S, 32);
  const o2 = new ValueNoise(rng, S, 16);
  const o3 = new ValueNoise(rng, S, 8);
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
      const base = d <= 2 ? 1 : Math.min(10, 1 + (d - 2) / 6);
      const n = (o1.at(x, z) - 0.5) * 6 + (o2.at(x, z) - 0.5) * 3 + (o3.at(x, z) - 0.5) * 1.5;
      // Damp the noise near the river so the banks stay buildable.
      const h = Math.floor(base + n * Math.min(1, d / 10));
      height[i] = Math.max(1, Math.min(12, h));
    }
  }

  // 4. Terrain and 5. forest.
  const sandNoise = new ValueNoise(rng, S, 8);
  const moisture = new ValueNoise(rng, S, 20);
  const forestNoise = new ValueNoise(rng, S, 24);
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
      if (d === 1 && sandNoise.at(x, z) > 0.5) terrain[i] = Terrain.sand;
      else if (slope >= 3 || h >= 11) terrain[i] = Terrain.rock;
      else if (forestNoise.at(x, z) > 0.55 && d >= 6 && h <= 11) terrain[i] = Terrain.forestFloor;
      else if (h <= 3 && moisture.at(x, z) > 0.55) terrain[i] = Terrain.meadow;
      else terrain[i] = Terrain.grass;

      const t = terrain[i];
      if ((t === Terrain.forestFloor && rng.chance(0.7)) || (t === Terrain.grass && rng.chance(0.03))) {
        let species: number;
        if (h <= 3) species = rng.chance(0.6) ? TREE_SPECIES.oak : TREE_SPECIES.birch;
        else if (h <= 8) species = rng.chance(0.5) ? TREE_SPECIES.oak : TREE_SPECIES.pine;
        else species = TREE_SPECIES.pine;
        const stage = rng.chance(0.8) ? TREE_MATURE : rng.int(TREE_MATURE);
        tree[i] = treeValue(species, stage);
      }
    }
  }

  // 7. Fertility (deposits and parcels arrive with C2A).
  const fertNoise = new ValueNoise(rng, S, 16);
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      const t = terrain[i];
      if (t === Terrain.water || t === Terrain.mountain) continue;
      let f = Math.max(20, 100 - 3 * dist[i]!);
      if (t === Terrain.meadow) f += 15;
      if (t === Terrain.forestFloor) f -= 30;
      if (t === Terrain.rock) f -= 60;
      f += (fertNoise.at(x, z) - 0.5) * 20;
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
      const inner = START_SIZE / 2 - START_CLEAR / 2;
      if (
        a - bestA >= inner &&
        a - bestA < inner + START_CLEAR &&
        c - bestC >= inner &&
        c - bestC < inner + START_CLEAR
      ) {
        tree[i] = 0;
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

  return {
    map,
    meta: { startArea: startRect, valleyGate: [gate % S, Math.floor(gate / S)], flow },
    worldgenRng: words,
  };
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
