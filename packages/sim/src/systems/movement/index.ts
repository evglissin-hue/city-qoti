// Walks residents along their paths (docs/spec/11-residents.md, Movement). Speed in ticks per
// tile from the tile being entered (road 5, grass 10, forest floor and fields 15, rock 20), Sporty
// x0.8. Progress is 0 to 255 toward path[step] and moves in even steps, so a tile of T ticks takes
// exactly T ticks (road 51 or 52 a tick, never a tick too fast or slow). A step onto a tile that has since become blocked replans the walk; when no
// path is left the resident stops and is marked stuck for the schedule to deal with.
// I2 (C4B): every step onto open ground wears a desire path in (systems/traffic/wear).
import { content } from '@qoti/content';
import { ResidentFlags } from '../../constants';
import type { Resident, System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { wearStep } from '../traffic/wear';
import { walkPermille } from './factors';
import { walkGrid } from './grid';
import { pathBetween } from './paths';

/** Walk speed percent by trait id (100 = normal; Sporty 80 means 80% of the ticks per tile). */
const walkPercent = new Map<string, number>();

function traitWalk(trait: string): number {
  let v = walkPercent.get(trait);
  if (v === undefined) {
    v = 100;
    for (const [name, value] of content.traitById.get(trait)?.effects ?? []) {
      if (name === 'walkSpeed') v = value;
    }
    walkPercent.set(trait, v);
  }
  return v;
}

/** Ticks-per-tile percent for a resident (traits multiply). */
export function walkFactor(r: Resident): number {
  let pct = 100;
  for (let i = 0; i < r.traits.length; i++) pct = (pct * traitWalk(r.traits[i]!)) / 100;
  return pct;
}

/** Ticks to cross a tile for its walking ticks and a resident's walk factor (at least 1). */
export function tileTicks(ticks: number, pct: number): number {
  return Math.max(1, Math.round(((ticks > 0 ? ticks : 10) * pct) / 100));
}

/**
 * Progress after one more tick on a tile that takes T ticks: the k-th tick of the tile lands on
 * floor(256 k / T), so k is recovered from the progress itself (nothing else is stored).
 */
export function advance(progress: number, T: number): number {
  const k = Math.ceil((progress * T) / 256);
  return Math.floor((256 * (k + 1)) / T);
}

export const movement: System = {
  id: 'movement',
  order: 52,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const residents = state.residents;
    let grid = walkGrid(state);
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i]!;
      const m = r.move;
      if (!m) continue;
      if (m.step >= m.path.length) {
        r.move = null;
        continue;
      }
      const next = m.path[m.step]!;
      // I3 (C5.0): snow and the like slow the step through the walk hook.
      const p = walkPermille(state, { kind: 'resident', id: r.id }, next);
      const pct = p === 1000 ? walkFactor(r) : (walkFactor(r) * p) / 1000;
      m.progress = advance(m.progress, tileTicks(grid.ticks[next]!, pct));
      if (m.progress < 256) continue;
      r.tile = next;
      wearStep(state, ctx, next);
      m.step += 1;
      if (m.step >= m.path.length) {
        r.move = null;
        continue;
      }
      m.progress = 0;
      const ahead = m.path[m.step]!;
      if (grid.cost[ahead] === 0 && ahead !== m.target) {
        // The way ahead closed since the walk was planned: find another one from here.
        const path = pathBetween(state, r.tile, m.target);
        grid = walkGrid(state);
        if (!path || path.length === 0) {
          r.move = null;
          r.flags |= ResidentFlags.stuck;
          continue;
        }
        m.path = path;
        m.step = 0;
        m.version = state.networkVersion;
      }
    }
  },
};

/** Ticks a resident needs to walk a path from where they stand (estimates and tests). */
export function walkTicks(state: WorldState, r: Resident, path: readonly number[]): number {
  const grid = walkGrid(state);
  const pct = walkFactor(r);
  let total = 0;
  for (const t of path) total += tileTicks(grid.ticks[t]!, pct);
  return total;
}
