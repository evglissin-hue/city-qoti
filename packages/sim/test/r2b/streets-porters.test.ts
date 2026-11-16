// R2B: a porter whose barrow has no way while evening streets are closed waits where they stand, task
// kept, and their store says so; the job completes once the path returns. `pathFor` is R2A's
// stand-in and never returns null today, so the null is mocked (`pathBetween` stays real).
/* eslint-disable no-restricted-syntax */
import { describe, expect, it, vi } from 'vitest';
import type * as Paths from '../../src/systems/movement/paths';
import { BuildingStatus, TICKS_PER_HOUR } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { refreshStatus } from '../../src/systems/production/status';
import { createTickCtx } from '../../src/turn';
import { buildingDetail } from '../../src/view/inspect';
import { everyoneToWork, ticks, ticksUntil } from '../ledger/helpers';
import { villageWith } from '../village/helpers';

const mocks = vi.hoisted(() => ({ blocked: false }));

vi.mock('../../src/systems/movement/paths', async (orig) => {
  const real = await orig<typeof Paths>();
  return {
    ...real,
    pathFor: (...args: Parameters<typeof real.pathFor>) =>
      mocks.blocked && args[3] === 'barrow' ? null : real.pathFor(...args),
  };
});

const H = TICKS_PER_HOUR;

describe('evening streets: barrows', { timeout: 120_000 }, () => {
  it('waits where it stands with no barrow path, its store says so, and finishes once the path returns', () => {
    const f = villageWith();
    const state = f.state;
    for (const fam of state.carrier.families) fam.rule = 'never';
    everyoneToWork(state);
    state.tick = 11 * H; // 17:00
    mocks.blocked = true;
    try {
      let waiter: number | null = null;
      ticks(state, H, () => {
        if (waiter !== null) return;
        for (const r of state.residents) {
          if (r.activity.kind === 'task' && r.activity.taskId > 0 && !r.move) waiter = r.id;
        }
      });
      expect(waiter).not.toBeNull();
      const r = findById(state.residents, waiter!)!;
      const jobId = r.activity.kind === 'task' ? r.activity.taskId : 0;
      const where = r.tile;
      ticks(state, 100);
      expect(r.tile).toBe(where);
      expect(state.logistics.jobs.some((j) => j.id === jobId)).toBe(true);
      const store = findById(state.buildings, r.jobId)!;
      refreshStatus(state, createTickCtx(state), store);
      expect(store.rt!.status & BuildingStatus.eveningWait).toBeTruthy();
      expect(buildingDetail(state, store.id)!.status).toContain(
        'Waiting at the edge of an evening street until 21:00',
      );
      // The path returns: the job completes and the note goes.
      mocks.blocked = false;
      ticksUntil(state, (s) => !s.logistics.jobs.some((j) => j.id === jobId), 2 * H);
      expect(state.logistics.jobs.some((j) => j.id === jobId)).toBe(false);
      expect(r.carry).toBeNull();
      ticks(state, 40);
      refreshStatus(state, createTickCtx(state), store);
      expect(store.rt!.status & BuildingStatus.eveningWait).toBe(0);
    } finally {
      mocks.blocked = false;
    }
  });
});
