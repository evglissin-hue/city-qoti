// Hedgerow Lane: a straight path or lane run of 6+ tiles with hedges on both sides along 4+ of
// them. A road tile is hedged on one side when a hedge segment stands in the row (or column) next
// to it, within a quarter tile either way along the road. Gaps longer than 3 unhedged tiles split
// a run, so two hedged stretches of one long lane are two sites. Anchored on the first tile of the
// stretch.
import type { PatternDef } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../../../constants';
import type { Decor, EntityId, WorldState } from '../../../../contracts';
import { type Detector, param, type SiteCandidate, taggedIn } from '../shared';

const S = MAP_SIZE;
const MAX_GAP = 3;
const SLACK = TILE_FP / 4;

interface Run {
  horizontal: boolean;
  /** The fixed coordinate (z for horizontal runs, x for vertical ones). */
  line: number;
  start: number;
  end: number;
}

function tileAt(run: Run, k: number): number {
  return run.horizontal ? run.line * S + k : k * S + run.line;
}

/** 1 when the hedge is beside tile k before the road (north or west), 2 after it, else 0. */
function sideOf(run: Run, d: Decor, k: number): number {
  const along = run.horizontal ? d.fx : d.fz;
  const across = run.horizontal ? d.fz : d.fx;
  if (along < k * TILE_FP - SLACK || along > (k + 1) * TILE_FP + SLACK) return 0;
  if (across >= (run.line - 1) * TILE_FP && across < run.line * TILE_FP) return 1;
  if (across >= (run.line + 1) * TILE_FP && across < (run.line + 2) * TILE_FP) return 2;
  return 0;
}

function scanRun(state: WorldState, def: PatternDef, run: Run, out: SiteCandidate[]): void {
  const minRun = param(def, 'minRun', 6);
  const minHedged = param(def, 'minHedged', 4);
  const { start, end, line } = run;
  const box: [number, number, number, number] = run.horizontal
    ? [start, line - 1, end, line + 1]
    : [line - 1, start, line + 1, end];
  const hedges = taggedIn(state, box, 'hedge');
  let first = -1;
  let last = -1;
  let count = 0;
  let members: EntityId[] = [];

  const flush = () => {
    if (count >= minHedged) {
      let s0 = Math.max(start, first - 1);
      let s1 = Math.min(end, last + 1);
      // Pad short stretches back out to the minimum run, within the road.
      while (s1 - s0 + 1 < minRun && (s0 > start || s1 < end)) {
        if (s0 > start) s0--;
        if (s1 - s0 + 1 < minRun && s1 < end) s1++;
      }
      const tiles: number[] = [];
      for (let k = s0; k <= s1; k++) tiles.push(tileAt(run, k));
      out.push({ anchor: tiles[0]!, members: [...new Set(members)], tiles });
    }
    first = -1;
    count = 0;
    members = [];
  };

  for (let k = start; k <= end; k++) {
    let sides = 0;
    const here: EntityId[] = [];
    for (const h of hedges) {
      const s = sideOf(run, h, k);
      if (s) {
        sides |= s;
        here.push(h.id);
      }
    }
    if (sides !== 3) continue;
    if (first >= 0 && k - last - 1 > MAX_GAP) flush();
    if (first < 0) first = k;
    last = k;
    count++;
    for (const id of here) members.push(id);
  }
  flush();
}

export const hedgerowLane: Detector = (state, def) => {
  const minRun = param(def, 'minRun', 6);
  const road = state.map.road;
  const out: SiteCandidate[] = [];
  for (const horizontal of [true, false]) {
    const step = horizontal ? 1 : S;
    for (let line = 0; line < S; line++) {
      const base = horizontal ? line * S : line;
      let k = 0;
      while (k < S) {
        const v = road[base + k * step]!;
        if (v === 0 || v > 2) {
          k++;
          continue;
        }
        let end = k;
        while (end + 1 < S) {
          const n = road[base + (end + 1) * step]!;
          if (n === 0 || n > 2) break;
          end++;
        }
        if (end - k + 1 >= minRun) scanRun(state, def, { horizontal, line, start: k, end }, out);
        k = end + 1;
      }
    }
  }
  return out;
};
