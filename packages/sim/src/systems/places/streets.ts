// Street names by road run (docs/spec/10-world-and-building.md, Roads [R2]). A run is a maximal
// straight stretch of road tiles along x or along z, long enough to be a street. Each run is named once
// from what stands along it, and `state.streets` is kept in step as roads change. All words and numbers
// live in content (`STREET_NAMES`).
import { STREET_NAMES as N } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Street, TickCtx, WorldState } from '../../contracts';
import { streetViews } from '../../view/places';

const S = MAP_SIZE;

/** A maximal straight stretch of road: along x (axis 0) or along z (axis 1). */
interface Run {
  axis: 0 | 1;
  /** Tiles in order (ascending tile index). */
  tiles: number[];
}

const stepOf = (axis: 0 | 1): number => (axis === 0 ? 1 : S);

/** Every run, rows top to bottom (left to right in a row), then columns left to right. */
function findRuns(state: WorldState): Run[] {
  const road = state.map.road;
  const runs: Run[] = [];
  for (const axis of [0, 1] as const) {
    for (let a = 0; a < S; a++) {
      let tiles: number[] = [];
      for (let b = 0; b <= S; b++) {
        const i = axis === 0 ? a * S + b : b * S + a;
        if (b < S && road[i]! > 0) {
          tiles.push(i);
        } else {
          if (tiles.length >= N.minTiles) runs.push({ axis, tiles });
          tiles = [];
        }
      }
    }
  }
  return runs;
}

/** The run through `tile` along an axis, walking the road layer fresh, or null when too short. */
function runThrough(state: WorldState, tile: number, axis: 0 | 1): number[] | null {
  const road = state.map.road;
  if (road[tile]! <= 0) return null;
  const step = stepOf(axis);
  const x = tile % S;
  const z = (tile - x) / S;
  const along = axis === 0 ? x : z;
  let lo = 0;
  while (along - lo - 1 >= 0 && road[tile - (lo + 1) * step]! > 0) lo++;
  let hi = 0;
  while (along + hi + 1 < S && road[tile + (hi + 1) * step]! > 0) hi++;
  if (lo + hi + 1 < N.minTiles) return null;
  const tiles: number[] = [];
  for (let k = -lo; k <= hi; k++) tiles.push(tile + k * step);
  return tiles;
}

/** The extent of the run through `tile` along an axis, as tiles before and after it, or null (as runThrough). */
function runExtent(state: WorldState, tile: number, axis: 0 | 1): [lo: number, hi: number] | null {
  const road = state.map.road;
  if (road[tile]! <= 0) return null;
  const step = stepOf(axis);
  const x = tile % S;
  const z = (tile - x) / S;
  const along = axis === 0 ? x : z;
  let lo = 0;
  while (along - lo - 1 >= 0 && road[tile - (lo + 1) * step]! > 0) lo++;
  let hi = 0;
  while (along + hi + 1 < S && road[tile + (hi + 1) * step]! > 0) hi++;
  if (lo + hi + 1 < N.minTiles) return null;
  return [lo, hi];
}

/** The Manhattan distance from (x, z) to the nearest tile of `streetTiles(state, street)`, without listing them. */
export function streetDistance(state: WorldState, street: Street, x: number, z: number): number {
  const ax = street.anchor % S;
  const az = (street.anchor - ax) / S;
  for (const axis of [0, 1] as const) {
    const run = runExtent(state, street.anchor, axis);
    if (!run) continue;
    const a = axis === 0 ? ax : az;
    const along = axis === 0 ? x : z;
    const across = axis === 0 ? Math.abs(z - az) : Math.abs(x - ax);
    return across + Math.max(0, a - run[0] - along, along - (a + run[1]));
  }
  return Math.abs(x - ax) + Math.abs(z - az);
}

/**
 * The tiles of a street's run, sorted (for labels, the endpaper map and rename by a click): the run
 * holding its anchor, the x-run when the anchor lies on two. `[anchor]` when no run holds it.
 */
export function streetTiles(state: WorldState, street: Street): number[] {
  return runThrough(state, street.anchor, 0) ?? runThrough(state, street.anchor, 1) ?? [street.anchor];
}

/** A run's key: its axis and first tile. */
const runKey = (axis: number, tiles: readonly number[]): number => axis * S * S + tiles[0]!;

/**
 * The hourly pass over street names (called by the places system): names each new run once, drops a
 * street whose run is gone (or that shares its run with an older one), emits `streets.updated` when
 * something changed.
 */
export function refreshStreets(state: WorldState, ctx: TickCtx): void {
  const runs = findRuns(state);
  const cover = new Uint8Array(S * S);
  for (const r of runs) for (const t of r.tiles) cover[t]!++;
  const claimed = new Set<number>();
  const kept: Street[] = [];
  let changed = false;
  for (const street of [...state.streets].sort((a, b) => a.id - b.id)) {
    const tiles = runThrough(state, street.anchor, 0) ?? runThrough(state, street.anchor, 1);
    const axis = tiles && runThrough(state, street.anchor, 0) ? 0 : 1;
    const key = tiles ? runKey(axis, tiles) : -1;
    if (!tiles || claimed.has(key)) {
      changed = true;
      continue;
    }
    claimed.add(key);
    kept.push(street);
  }
  state.streets = kept;
  const homes = homeFamilies(state);
  for (const r of runs) {
    if (claimed.has(runKey(r.axis, r.tiles))) continue;
    const anchor = r.tiles.find((t) => cover[t] === 1) ?? r.tiles[0]!;
    state.streets.push({ id: state.nextId++, anchor, name: nameRun(state, r, anchor, homes) });
    changed = true;
  }
  if (changed) ctx.events.push({ e: 'streets.updated', s: streetViews(state) });
}

/** Home building id to its household's family name. */
function homeFamilies(state: WorldState): Map<number, string> {
  const m = new Map<number, string>();
  for (const h of state.households) m.set(h.homeId, h.family);
  return m;
}

/** A name for a run that no street in `state.streets` carries yet. */
function nameRun(state: WorldState, run: Run, anchor: number, homes: Map<number, string>): string {
  const m = state.map;
  const cross = stepOf(run.axis === 0 ? 1 : 0);
  // The tiles beside the run, both sides, with their place along it.
  const beside: { tile: number; along: number }[] = [];
  run.tiles.forEach((t, along) => {
    const c = run.axis === 0 ? t % S : Math.floor(t / S);
    for (let d = 1; d <= N.reach; d++) {
      if (c - d >= 0) beside.push({ tile: t - d * cross, along });
      if (c + d < S) beside.push({ tile: t + d * cross, along });
    }
  });

  // Road kind: the commonest layer value on the run (the bigger kind on a tie).
  const kinds = [0, 0, 0, 0, 0];
  for (const t of run.tiles) kinds[Math.min(m.road[t]!, 4)]!++;
  let kind = 1;
  for (let k = 2; k <= 4; k++) if (kinds[k]! >= kinds[kind]!) kind = k;
  const suffixes = N.suffixes.find(([k]) => k === kind)?.[1] ?? ['Lane'];
  let suffix = suffixes[anchor % suffixes.length]!;

  // What stands along it: distinct buildings, and the places along the run that homes fill.
  const seen = new Set<number>();
  const defs = new Set<string>();
  const trades = new Set<string>();
  const homeCount = new Map<string, number>();
  const homeAlong = new Map<string, Set<number>>();
  for (const { tile, along } of beside) {
    const id = m.occupant[tile]!;
    if (id <= 0) continue;
    const b = state.buildings.find((x) => x.id === id);
    if (!b) continue;
    if (!seen.has(id)) {
      seen.add(id);
      defs.add(b.def);
      if (b.trade) trades.add(b.trade);
    }
    const family = homes.get(id);
    if (family !== undefined && N.homeDefs.includes(b.def)) {
      let set = homeAlong.get(family);
      if (!set) homeAlong.set(family, (set = new Set()));
      set.add(along);
    }
  }
  for (const id of seen) {
    const family = homes.get(id);
    if (family !== undefined) homeCount.set(family, (homeCount.get(family) ?? 0) + 1);
  }

  let word = '';
  for (const [def, w] of N.buildingWords)
    if (defs.has(def)) {
      word = w;
      break;
    }
  if (!word)
    for (const [trade, w] of N.tradeWords)
      if (trades.has(trade)) {
        word = w;
        break;
      }
  if (!word) {
    let best = '';
    let bestN = 0;
    for (const [family, n] of homeCount) {
      if (n > bestN || (n === bestN && family < best)) {
        best = family;
        bestN = n;
      }
    }
    if (bestN >= N.homeMin) {
      word = best;
      if ((homeAlong.get(best)?.size ?? 0) * 100 >= run.tiles.length * N.rowShare) suffix = N.rowSuffix;
    }
  }
  if (!word) {
    const water = [0, 0, 0, 0, 0];
    for (const { tile } of beside) water[Math.min(m.water[tile]!, 4)]!++;
    let bestW = 0;
    for (let w = 1; w <= 4; w++) if (water[w]! > (bestW > 0 ? water[bestW]! : 0)) bestW = w;
    const words = bestW > 0 ? N.waterWords.find(([w]) => w === bestW)?.[1] : undefined;
    if (words) word = words[anchor % words.length]!;
  }
  if (!word) {
    const set = new Set(beside.map((b) => b.tile));
    let fruit = 0;
    for (const d of state.decor) {
      if (!N.orchardDecor.includes(d.def)) continue;
      if (set.has(Math.floor(d.fz / 256) * S + Math.floor(d.fx / 256))) fruit++;
    }
    if (fruit >= N.orchardMin) word = N.orchardWord;
  }
  if (!word) {
    const trees = new Map<number, number>();
    let total = 0;
    for (const { tile } of beside) {
      const v = m.tree[tile]!;
      if (v > 0) {
        trees.set(v >> 3, (trees.get(v >> 3) ?? 0) + 1);
        total++;
      }
    }
    if (total >= N.treeMin) {
      let bestN = 0;
      for (const [species, w] of N.treeWords) {
        const n = trees.get(species) ?? 0;
        if (n > bestN) {
          bestN = n;
          word = w;
        }
      }
    }
  }

  return unusedName(state, word, suffix, anchor);
}

/** The first candidate nobody carries: the word, then prefixed, then plain fallbacks, then both. */
function unusedName(state: WorldState, word: string, suffix: string, anchor: number): string {
  const taken = new Set<string>();
  for (const s of state.streets) {
    taken.add(s.name.toLowerCase());
    if (s.custom) taken.add(s.custom.toLowerCase());
  }
  const fall = N.fallbackWords;
  const start = anchor % fall.length;
  const words = word ? [word] : [];
  for (let k = 0; k < fall.length; k++) words.push(fall[(start + k) % fall.length]!);
  const ok = (n: string): boolean => n.length <= N.maxLength && !taken.has(n.toLowerCase());
  const plain = word ? [word] : [fall[start]!];
  for (const w of plain) {
    const n = `${w} ${suffix}`;
    if (ok(n)) return n;
  }
  for (const w of plain) {
    for (const p of N.prefixes) {
      const n = `${p} ${w} ${suffix}`;
      if (ok(n)) return n;
    }
  }
  for (const w of words) {
    const n = `${w} ${suffix}`;
    if (ok(n)) return n;
  }
  for (const w of words) {
    for (const p of N.prefixes) {
      const n = `${p} ${w} ${suffix}`;
      if (ok(n)) return n;
    }
  }
  // Last resort: two plain words, which the lists make far more combinations than a town has streets.
  for (const a of fall) {
    for (const b of fall) {
      const n = `${a} ${b} ${suffix}`;
      if (a !== b && ok(n)) return n;
    }
  }
  return `${words[0]!} ${suffix}`;
}
