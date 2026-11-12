// R1B labor (docs/spec/13-ledger.md, Labor; 11-residents.md, Jobs): no lever needed. A business with
// nothing to do rests and frees its hands, who take the most important open job elsewhere; the
// granary's porters no longer swallow a fresh town's few hands; firewood is short from Summer day 4
// while the woodpile is under the Fuel mark.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, DAYS_PER_SEASON, TICKS_PER_DAY } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { familyIndex } from '../../src/state/zones';
import { refreshAllStatus } from '../../src/systems/production/status';
import { assignJobs, auditJobs, openJobs, shortages, slotPriority } from '../../src/systems/residents/jobs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { building, good, hire, resident } from '../ledger/helpers';
import { place } from '../village/helpers';
import { playDays, zonedValley } from './valley';

function atSeason(state: WorldState, season: number, day = 1): void {
  state.tick = (season * DAYS_PER_SEASON + day) * TICKS_PER_DAY;
}

function refresh(state: WorldState): void {
  refreshAllStatus(state, createTickCtx(state));
}

describe('start labor', () => {
  it('the granary’s first porter ranks behind the storehouse’s and its second behind the rest', () => {
    const granary = content.buildingById.get('granary')!;
    const storehouse = content.buildingById.get('storehouse')!;
    expect(slotPriority(storehouse, 0)).toBe(0);
    expect(slotPriority(granary, 0)).toBe(1);
    expect(slotPriority(granary, 1)).toBe(4);
    // A workplace's first hand now comes before the granary's second porter.
    const lodge = content.buildingById.get('foresters-lodge')!;
    expect(slotPriority(lodge, 0)).toBeLessThan(slotPriority(granary, 1));
  });

  for (const seed of ['willow', 'hazel']) {
    it(`a fresh ${seed} valley puts hands to work at a business once one stands`, { timeout: 60_000 }, () => {
      const state = zonedValley(seed);
      let atBusiness = 0;
      playDays(state, 6, () => {
        const n = state.residents.filter((r) => state.buildings.find((b) => b.id === r.jobId)?.trade).length;
        atBusiness = Math.max(atBusiness, n);
      });
      expect(state.buildings.some((b) => b.trade && b.stage === 'built')).toBe(true);
      expect(atBusiness).toBeGreaterThan(0);
    });
  }
});

describe('resting', () => {
  /** A market garden or orchard with two hands in the hamlet fixture. */
  function orchard(): { state: WorldState; b: Building; ids: number[] } {
    const { state } = hamletFixture();
    const o = place(state, 'farmstead', 60, 30, 0, 'orchard');
    const ids = hire(state, o.id, 2);
    return { state, b: o, ids };
  }

  it('a business out of season rests, frees its hands, and they take open work elsewhere', () => {
    const { state, b, ids } = orchard();
    atSeason(state, 1);
    refresh(state);
    expect(b.rt!.status & BuildingStatus.resting).toBe(0);
    atSeason(state, 3);
    refresh(state);
    expect(b.rt!.status & BuildingStatus.resting).toBeTruthy();
    expect(openJobs(b)).toBe(0);
    auditJobs(state);
    expect(b.rt!.workers).toEqual([]);
    for (const id of ids) expect(resident(state, id).jobId).toBe(0);
    assignJobs(state, createTickCtx(state));
    for (const id of ids) {
      const j = resident(state, id).jobId;
      expect(j).not.toBe(0);
      expect(j).not.toBe(b.id);
    }
  });

  it('a hand mid-task or carrying is not turned out', () => {
    const { state, b, ids } = orchard();
    atSeason(state, 3);
    refresh(state);
    resident(state, ids[0]!).carry = [good('fruit'), 2];
    auditJobs(state);
    expect(b.rt!.workers).toEqual([ids[0]]);
  });

  it('when it stops resting it has open jobs again (no thrash)', () => {
    const { state, b } = orchard();
    atSeason(state, 3);
    refresh(state);
    auditJobs(state);
    atSeason(state, 1);
    refresh(state);
    expect(b.rt!.status & BuildingStatus.resting).toBe(0);
    expect(openJobs(b)).toBeGreaterThan(0);
  });

  it('a farm with nothing sown rests, and pausing still works as a command', () => {
    const { state } = hamletFixture();
    const farm = place(state, 'farmstead', 60, 30, 0, 'grain-farm');
    atSeason(state, 0, 2);
    refresh(state);
    expect(farm.rt!.status & BuildingStatus.noFields).toBeTruthy();
    expect(farm.rt!.status & BuildingStatus.resting).toBeTruthy();
    expect(openJobs(farm)).toBe(0);
    farm.rt!.paused = true;
    expect(openJobs(farm)).toBe(0);
  });

  it('a full shelf rests the business until the goods are carried off', () => {
    const { state, b } = hamletFixture();
    const bk = building(state, b.bakery);
    bk.rt!.output[good('bread')] = 99;
    refresh(state);
    expect(bk.rt!.status & BuildingStatus.outputFull).toBeTruthy();
    expect(bk.rt!.status & BuildingStatus.resting).toBeTruthy();
    bk.rt!.output[good('bread')] = 0;
    refresh(state);
    expect(bk.rt!.status & BuildingStatus.resting).toBe(0);
  });

  it('a craft short of a raw good the town has none of rests only when the carrier may not bring it', () => {
    const { state, b } = hamletFixture();
    const bk = building(state, b.bakery);
    bk.rt!.input[good('grain')] = 0;
    for (const x of state.buildings) if (x.rt) x.rt.store[good('grain')] = 0;
    refresh(state);
    expect(bk.rt!.status & BuildingStatus.missingInput).toBeTruthy();
    expect(bk.rt!.status & BuildingStatus.resting).toBe(0);
    state.carrier.families[familyIndex('food')]!.rule = 'never';
    refresh(state);
    expect(bk.rt!.status & BuildingStatus.resting).toBeTruthy();
    // Grain in town stock (a storehouse shelf) is raw good enough to wait for.
    building(state, b.granary).rt!.store[good('grain')] = 10;
    refresh(state);
    expect(bk.rt!.status & BuildingStatus.resting).toBe(0);
  });

  it('a specialized building never rests by this rule', () => {
    const { state, b } = hamletFixture();
    const lodge = building(state, b.sawpit);
    lodge.rt!.output.fill(500);
    refresh(state);
    expect(lodge.rt!.status & BuildingStatus.resting).toBe(0);
  });
});

describe('firewood', () => {
  it('is short from Summer day 4 while the woodpile is under the Fuel mark, not before', () => {
    const { state } = hamletFixture();
    for (const x of state.buildings) if (x.rt) x.rt.store[good('firewood')] = 0;
    for (const h of state.households) h.pantry[good('firewood')] = 0;
    atSeason(state, 1, 2);
    expect(shortages(state).goods.has('firewood')).toBe(false);
    atSeason(state, 1, 4);
    expect(shortages(state).goods.has('firewood')).toBe(true);
    // Enough for the mark (days times households) and it is no longer short.
    const mark = state.seasonPlan.reserve * state.households.length;
    state.buildings.find((x) => x.def === 'storehouse')!.rt!.store[good('firewood')] = mark + 50;
    expect(shortages(state).goods.has('firewood')).toBe(false);
  });
});
