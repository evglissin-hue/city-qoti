// Walks residents along their paths (docs/spec/11-residents.md, Movement). Speed in ticks per
// tile from the tile being entered (road 5, grass 10, forest floor and fields 15, rock 20), Sporty
// x0.8. Progress is 0 to 255 toward path[step]; leftover progress carries into the next tile so
// average speeds hold. A step onto a tile that has since become blocked replans the walk; when no
// path is left the resident stops and is marked stuck for the schedule to deal with.
import { content } from '@qoti/content';
import { ResidentFlags } from '../../constants';
import type { Resident, System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
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

/** Progress per tick (0 to 256 per tile) for a tile's ticks and a resident's walk factor. */
export function stepPerTick(ticks: number, pct: number): number {
  return Math.ceil(25600 / ((ticks > 0 ? ticks : 10) * pct));
}

export const movement: System = {
  id: 'movement',
  order: 52,
  every: 1,
  tick(state) {
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
      m.progress += stepPerTick(grid.ticks[next]!, walkFactor(r));
      if (m.progress < 256) continue;
      r.tile = next;
      m.step += 1;
      if (m.step >= m.path.length) {
        r.move = null;
        continue;
      }
      m.progress = Math.min(255, m.progress - 256);
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
  for (const t of path) total += Math.ceil(256 / stepPerTick(grid.ticks[t]!, pct));
  return total;
}
