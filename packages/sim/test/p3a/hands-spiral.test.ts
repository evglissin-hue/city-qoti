// P3A hands spiral (view/health.ts): handsSpiral words the moment (food under three days in hand
// and food jobs open, while hands work past the first at workplaces that do not feed the town, or
// three sites wait with the Homes bar silent), and HealthWatch's 'hands-spiral' flags it at the
// day's first look from 12:00 two days running, the run resetting on a day it does not hold.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { hourOf } from '../../src/systems/economy/time';
import { HealthWatch, handsSpiral, SPIRAL_DAYS, SPIRAL_HOUR, SPIRAL_SITES } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';
import { building, good, hire } from '../ledger/helpers';
import { place } from '../village/helpers';

/** A hungry hamlet with a grain farm standing open: food jobs are open, nothing else yet. */
function hungry() {
  const f = hamletFixture();
  const s = f.state;
  for (const b of s.buildings) if (b.rt) b.rt.store.fill(0);
  for (const h of s.households) h.pantry.fill(0);
  const farm = place(s, 'farmstead', 60, 30, 0, 'grain-farm');
  // Quiet to begin with: nobody works past the first hand anywhere that does not feed the town.
  for (const b of s.buildings)
    if (b.rt && b.id !== farm.id && b.rt.workers.length > 1) b.rt.workers.length = 1;
  return { f, s, farm };
}

/** Two hands at the lodge: one past the first at a workplace that does not feed the town. */
function crowdLodge(f: ReturnType<typeof hamletFixture>) {
  const lodge = building(f.state, f.b.sawpit);
  lodge.rt!.workers.length = 0;
  hire(f.state, lodge.id, 2);
}

/** Three construction sites waiting on materials. */
function waitingSites(s: WorldState): void {
  for (let i = 0; i < SPIRAL_SITES; i++) {
    const site = insertBuilding(s, null, content.buildingById.get('cottage')!, 90 + i * 4, 51, 0, 0, {
      site: true,
    });
    site.rt!.status |= BuildingStatus.waitingMaterials;
  }
}

describe('handsSpiral', () => {
  it('is null in a quiet town', () => {
    const { s } = hungry();
    expect(handsSpiral(s)).toBeNull();
  });

  it('words it when food is short, food jobs are open and hands work past the first elsewhere', () => {
    const { f, s } = hungry();
    crowdLodge(f);
    const why = handsSpiral(s);
    expect(why).toContain('food jobs open');
    expect(why).toContain('1 hands work past the first at other workplaces');
  });

  it('words it for three waiting sites with the Homes bar silent', () => {
    const { s } = hungry();
    waitingSites(s);
    s.demand.reasons[0] = [];
    const why = handsSpiral(s);
    expect(why).toContain('3 sites waiting');
    expect(why).toContain('Homes bar names no lever');
  });

  it('is null when the Homes bar names a lever', () => {
    const { s } = hungry();
    waitingSites(s);
    s.demand.reasons[0] = [{ code: 'needsLand' }];
    expect(handsSpiral(s)).toBeNull();
  });

  it('is null with fewer than three sites waiting', () => {
    const { s } = hungry();
    waitingSites(s);
    const sites = s.buildings.filter((b) => b.stage === 'construction');
    sites[0]!.rt!.status = 0;
    s.demand.reasons[0] = [];
    expect(handsSpiral(s)).toBeNull();
  });

  it('is null when food is plentiful, whatever else holds', () => {
    const { f, s } = hungry();
    crowdLodge(f);
    building(s, f.b.granary).rt!.store[good('bread')] = 500;
    expect(handsSpiral(s)).toBeNull();
  });

  it('is null when no food job is open', () => {
    const { f, s, farm } = hungry();
    crowdLodge(f);
    hire(s, farm.id, 3);
    expect(handsSpiral(s)).toBeNull();
  });
});

describe('the hands-spiral watch', () => {
  /** The tick of the first hour from SPIRAL_HOUR on the given day (a look at it is the day's first). */
  function lookTick(day: number, hour = SPIRAL_HOUR): number {
    let t = day * TICKS_PER_DAY;
    while (hourOf(t) < hour) t += TICKS_PER_HOUR;
    return t;
  }
  const flagged = (w: HealthWatch, s: WorldState) => w.check(s).some((i) => i.kind === 'hands-spiral');

  it('flags on the second day running, not the first', () => {
    const { f, s } = hungry();
    crowdLodge(f);
    const w = new HealthWatch();
    s.tick = lookTick(4);
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(5);
    expect(SPIRAL_DAYS).toBe(2);
    const issue = w.check(s).find((i) => i.kind === 'hands-spiral');
    expect(issue?.text).toContain('food jobs open');
  });

  it('does not look before 12:00 and counts a day once', () => {
    const { f, s } = hungry();
    crowdLodge(f);
    const w = new HealthWatch();
    s.tick = lookTick(4, 9);
    expect(hourOf(s.tick)).toBeLessThan(SPIRAL_HOUR);
    flagged(w, s);
    s.tick = lookTick(5, 9);
    expect(flagged(w, s)).toBe(false);
    // Two looks on one day after noon are one day.
    s.tick = lookTick(6);
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(6) + TICKS_PER_HOUR;
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(7);
    expect(flagged(w, s)).toBe(true);
  });

  it('starts the run again after a day it does not hold', () => {
    const { f, s } = hungry();
    crowdLodge(f);
    const w = new HealthWatch();
    s.tick = lookTick(4);
    flagged(w, s);
    // Day 5 the town eats: the run resets.
    const granary = building(s, f.b.granary);
    granary.rt!.store[good('bread')] = 500;
    s.tick = lookTick(5);
    expect(flagged(w, s)).toBe(false);
    granary.rt!.store.fill(0);
    s.tick = lookTick(6);
    expect(flagged(w, s)).toBe(false);
    s.tick = lookTick(7);
    expect(flagged(w, s)).toBe(true);
  });
});
