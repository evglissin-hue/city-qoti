// Hearth benches (C3B): charm recompute per dirty chunk and the Pattern Book pass per in-game hour,
// on the shared hamlet fixture and on a dense block built next to it, against the budgets in the
// C3B brief (charm under 2 ms per chunk, patterns under 3 ms per hour on the hamlet).
import {
  CHUNKS_PER_SIDE,
  createTickCtx,
  createValley,
  defaultSettings,
  TILE_FP,
  type Decor,
  type WorldState,
} from '@qoti/sim';
import { content } from '@qoti/content';
import { hamletFixture } from '../../../packages/sim/test/fixtures/hamlet';
import { worldIndex } from '../../../packages/sim/src/state/worldIndex';
import { insertBuilding } from '../../../packages/sim/src/state/place';
import { recomputeChunk } from '../../../packages/sim/src/systems/hearth/charm/compute';
import { recomputeDirty } from '../../../packages/sim/src/systems/hearth/charm';
import { markChunks } from '../../../packages/sim/src/systems/hearth/charm/dirty';
import { runPatterns } from '../../../packages/sim/src/systems/hearth/patterns/engine';

export const HEARTH_BUDGET = { charmChunkMs: 2, patternsHourMs: 3 };

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function addDecor(state: WorldState, def: string, x: number, z: number, dx = 128, dz = 128): void {
  const grid = worldIndex(state).decorGrid;
  const d: Decor = {
    id: state.nextId++,
    def,
    fx: x * TILE_FP + dx,
    fz: z * TILE_FP + dz,
    rot: 0,
    builtBy: 0,
  };
  state.decor.push(d);
  grid.add(d);
}

/** A crowded 16 x 16 block east of the river: homes, workshops, paths and about 300 pieces. */
function denseBlock(state: WorldState): number {
  const x0 = 128;
  const z0 = 32;
  for (let z = z0; z < z0 + 16; z += 5) for (let x = x0; x < x0 + 16; x++) state.map.road[z * 192 + x] = 1;
  for (let i = 0; i < 6; i++) {
    const def = content.buildingById.get(i % 3 === 2 ? 'sawpit' : 'cottage')!;
    insertBuilding(state, null, def, x0 + 1 + (i % 3) * 5, z0 + 1 + Math.floor(i / 3) * 10, 0, 0, {
      site: false,
    });
  }
  const pieces = ['bench', 'lantern', 'flower-bed', 'planter', 'barrels', 'crates', 'apple-tree', 'signpost'];
  let n = 0;
  for (let z = z0; z < z0 + 16; z++) {
    for (let x = x0; x < x0 + 16; x++) {
      if (state.map.occupant[z * 192 + x]) continue;
      addDecor(state, pieces[(x * 7 + z * 3) % pieces.length]!, x, z, 64, 64);
      if ((x + z) % 2 === 0) addDecor(state, pieces[(x + z * 5) % pieces.length]!, x, z, 192, 192);
      n += (x + z) % 2 === 0 ? 2 : 1;
    }
  }
  for (let z = z0 - 4; z < z0; z++) for (let x = x0; x < x0 + 16; x++) state.map.tree[z * 192 + x] = 8 + 3;
  return n;
}

export function hearthBench(): { lines: string[]; failures: string[]; report: Record<string, number> } {
  const lines: string[] = [];
  const failures: string[] = [];

  // Charm: every chunk of the hamlet, then the dense block's chunk at night.
  const hamlet = hamletFixture().state;
  denseBlock(hamlet);
  runPatterns(hamlet, createTickCtx(hamlet));
  recomputeDirty(hamlet, null);
  const all: number[] = [];
  const cache = new Map<number, boolean>();
  for (let round = 0; round < 5; round++) {
    for (let c = 0; c < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE; c++) {
      const t = performance.now();
      recomputeChunk(hamlet, c, false, null, cache);
      all.push(performance.now() - t);
    }
  }
  const town = 3 * CHUNKS_PER_SIDE + 3;
  const dense = 2 * CHUNKS_PER_SIDE + 8;
  const time = (chunk: number, night: boolean) => {
    const runs: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      recomputeChunk(hamlet, chunk, night, null, new Map());
      runs.push(performance.now() - t);
    }
    return { median: median(runs), max: Math.max(...runs) };
  };
  const townChunk = time(town, false);
  const denseChunk = time(dense, true);
  const anyMedian = median(all);
  const worst = Math.max(townChunk.median, denseChunk.median);
  if (worst > HEARTH_BUDGET.charmChunkMs) failures.push(`charm chunk ${worst.toFixed(2)} ms`);
  lines.push(
    `charm chunk     hamlet ${townChunk.median.toFixed(2)} ms (max ${townChunk.max.toFixed(2)}), ` +
      `dense block at night ${denseChunk.median.toFixed(2)} ms (max ${denseChunk.max.toFixed(2)}), ` +
      `any chunk ${anyMedian.toFixed(2)} ms (budget ${HEARTH_BUDGET.charmChunkMs} ms)  ` +
      (worst <= HEARTH_BUDGET.charmChunkMs ? 'ok' : 'OVER BUDGET'),
  );

  // Patterns: the hourly pass on the plain hamlet, and on the hamlet with the dense block.
  const pass = (state: WorldState) => {
    const ctx = createTickCtx(state);
    runPatterns(state, ctx);
    const runs: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      runPatterns(state, ctx);
      runs.push(performance.now() - t);
      ctx.events.length = 0;
    }
    return { median: median(runs), max: Math.max(...runs) };
  };
  const plain = pass(hamletFixture().state);
  const busy = pass(hamlet);
  if (plain.median > HEARTH_BUDGET.patternsHourMs)
    failures.push(`patterns pass ${plain.median.toFixed(2)} ms`);
  lines.push(
    `patterns pass   hamlet ${plain.median.toFixed(2)} ms (max ${plain.max.toFixed(2)}), ` +
      `with the dense block ${busy.median.toFixed(2)} ms (max ${busy.max.toFixed(2)}) ` +
      `(budget ${HEARTH_BUDGET.patternsHourMs} ms on the hamlet)  ` +
      (plain.median <= HEARTH_BUDGET.patternsHourMs ? 'ok' : 'OVER BUDGET'),
  );

  // A full map recompute, as on a valley's first tick.
  markChunks(hamlet, [0, 0, 191, 191]);
  const t = performance.now();
  recomputeDirty(hamlet, null);
  const fullMs = performance.now() - t;
  // And on a generated standard valley (forests, river, hills): its first tick computes it all.
  // The first run pays for compiling the forest and river paths; the best of three is reported.
  const valley = createValley('bench-hearth', { ...defaultSettings(), mode: 'standard' });
  let valleyMs = Infinity;
  for (let i = 0; i < 3; i++) {
    markChunks(valley, [0, 0, 191, 191]);
    const tv = performance.now();
    recomputeDirty(valley, null);
    valleyMs = Math.min(valleyMs, performance.now() - tv);
  }
  lines.push(
    `charm full map  ${CHUNKS_PER_SIDE * CHUNKS_PER_SIDE} chunks: hamlet ${fullMs.toFixed(0)} ms, ` +
      `generated valley ${valleyMs.toFixed(0)} ms (once, on a valley's first tick)`,
  );

  return {
    lines,
    failures,
    report: {
      charmHamletChunkMs: townChunk.median,
      charmDenseChunkMs: denseChunk.median,
      charmAnyChunkMs: anyMedian,
      charmFullMapMs: fullMs,
      charmValleyMs: valleyMs,
      patternsHamletMs: plain.median,
      patternsDenseMs: busy.median,
    },
  };
}
