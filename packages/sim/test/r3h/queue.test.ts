// R3H, found by the dead-end hunt: a site with every material that waits while the town's builders
// build elsewhere is in a queue, not stalled (hazel's workshop behind one builder and six other sites
// reached the 48th hour once its Lodge's woods reached farther). site-stalled (view/health.ts) flags
// it once no builder has worked a site for STALL_TICKS, or after twice that however busy the queue.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { HealthWatch, STALL_TICKS } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';

/** A site with every material in and no work done yet. */
function readySite(s: WorldState, x: number, z: number): Building {
  const b = insertBuilding(s, null, content.buildingById.get('cottage')!, x, z, 0, 0, { site: true });
  const c = b.rt!.construction!;
  for (let i = 0; i < c.needs.length; i++) c.needs[i] = 0;
  return b;
}

/** Looks every hour for `hours`; returns the hours at which the site was flagged stalled. */
function watch(s: WorldState, w: HealthWatch, site: Building, hours: number, building: () => void): number[] {
  const flagged: number[] = [];
  const start = s.tick;
  for (let h = 0; h <= hours; h++) {
    s.tick = start + h * TICKS_PER_HOUR;
    building();
    if (w.check(s).some((i) => i.kind === 'site-stalled' && i.id === site.id)) flagged.push(h);
  }
  return flagged;
}

describe('R3H: a queue is not a stall', () => {
  const stallHours = STALL_TICKS / TICKS_PER_HOUR;

  it('a ready site behind a builder at work elsewhere waits twice the stall time before it flags', () => {
    const { state } = hamletFixture();
    const site = readySite(state, 120, 100);
    const other = readySite(state, 126, 100);
    const builder = state.residents[0]!;
    const flagged = watch(state, new HealthWatch(), site, 2 * stallHours + 2, () => {
      builder.activity = { kind: 'task', taskId: -other.id };
    });
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0]!).toBeGreaterThanOrEqual(2 * stallHours);
  });

  it('a ready site with no builder at work anywhere flags at the stall time', () => {
    const { state } = hamletFixture();
    const site = readySite(state, 120, 100);
    for (const r of state.residents) if (r.activity.kind === 'task') r.activity = { kind: 'idle' } as never;
    const flagged = watch(state, new HealthWatch(), site, stallHours + 2, () => {});
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0]!).toBeLessThan(2 * stallHours);
    expect(flagged[0]!).toBeGreaterThanOrEqual(stallHours);
  });
});
