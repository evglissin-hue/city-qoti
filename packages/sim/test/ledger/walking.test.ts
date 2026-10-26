// Porters and builders with real walking: the movement stub is replaced by one that takes two
// ticks per tile, the way C3A's movement will, so nothing may assume arrival in the same tick.
// The mock factory has to be async (Vitest loads the real module through it); test code only.
/* eslint-disable no-restricted-syntax */
import { describe, expect, it, vi } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { EntityId, WorldState } from '../../src/contracts';
import type * as MovementApi from '../../src/systems/movement/api';
import { findById } from '../../src/state/entities';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';
import { building, everyoneToWork, ticks, untilHour } from './helpers';

const left = new Map<EntityId, number>();

vi.mock('../../src/systems/movement/api', async (importOriginal) => {
  const actual = await importOriginal<typeof MovementApi>();
  return {
    ...actual,
    requestMove(state: WorldState, id: EntityId, target: number) {
      const r = findById(state.residents, id);
      if (!r) return 'unreachable';
      r.inside = 0;
      if (r.tile === target) {
        r.move = null;
        left.delete(id);
        return 'arrived';
      }
      const dx = Math.abs((r.tile % MAP_SIZE) - (target % MAP_SIZE));
      const dz = Math.abs(Math.floor(r.tile / MAP_SIZE) - Math.floor(target / MAP_SIZE));
      r.move = {
        path: [target],
        step: 0,
        progress: 0,
        target,
        reason: 'task',
        version: state.networkVersion,
      };
      left.set(id, 2 * (dx + dz));
      return 'walking';
    },
  };
});

/** The walking half of the fake movement system: run after every tick. */
function walk(state: WorldState): void {
  for (const r of state.residents) {
    if (!r.move) continue;
    const n = (left.get(r.id) ?? 1) - 1;
    if (n > 0) {
      left.set(r.id, n);
      continue;
    }
    r.tile = r.move.target;
    r.move = null;
    left.delete(r.id);
  }
}

describe('with walking', () => {
  it('runs porter trips over many ticks and still builds the site', () => {
    left.clear();
    const f = hamletFixture();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    const site = f.state.buildings[f.state.buildings.length - 1]!;
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 7, walk);
    // Porters start at their own storehouse, pick up at once and then walk with the bundle.
    const job = f.state.logistics.jobs[0]!;
    const porter = findById(f.state.residents, job.porter)!;
    expect(job.stage).toBe(1);
    expect(porter.carry).toEqual([job.good, job.qty]);
    expect(porter.move).not.toBeNull();
    const id = job.id;
    let ticksToDeliver = 0;
    ticks(f.state, 200, (s) => {
      walk(s);
      if (s.logistics.jobs.some((j) => j.id === id)) ticksToDeliver++;
    });
    expect(ticksToDeliver).toBeGreaterThan(10);
    ticks(f.state, 6 * TICKS_PER_HOUR, walk);
    expect(site.stage).toBe('built');
    expect(f.state.logistics.jobs).toHaveLength(0);
    const store = building(f.state, f.b.storehouse);
    expect(store.rt!.reservedOut.every((n) => n === 0)).toBe(true);
  });
});
