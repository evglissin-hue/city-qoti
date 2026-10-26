// C4C: service coverage (school, tavern, herbalist) and the tier-aware needs it fills. Calls the
// services pass directly; the other systems are not involved.
import { describe, expect, it } from 'vitest';
import { BuildingStatus } from '../../src/constants';
import type { Building, Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { computeMood } from '../../src/systems/residents/needs';
import { serviceCoverage, servedBy, SHORT_QUALITY } from '../../src/systems/services/coverage';
import { UNCOVERED, updateServices } from '../../src/systems/services';
import { SERVICE_NEED, weightsOf } from '../../src/systems/services/weights';
import { buildingDetail } from '../../src/view/inspect';
import { addHousehold, place, staff, villageWith } from './helpers';

function settle(state: WorldState, hours = 30): void {
  for (let i = 0; i < hours; i++) updateServices(state);
}

function members(state: WorldState, h: Household) {
  return h.members.map((id) => findById(state.residents, id)!);
}

/** The village with a tavern, a herbalist and a school just north of street B's houses. */
function servedVillage(): { state: WorldState; tavern: Building; herbalist: Building; school: Building } {
  const f = villageWith();
  const state = f.state;
  const tavern = place(state, 'tavern', 36, 62);
  const herbalist = place(state, 'herbalist', 41, 62);
  const school = place(state, 'school', 38, 58);
  staff(state, tavern, 2);
  staff(state, herbalist, 1);
  staff(state, school, 2, 'craftsfolk');
  return { state, tavern, herbalist, school };
}

describe('service coverage', () => {
  it('covers Craftsfolk homes within reach: social and health go to 100, Settlers stay at 100', () => {
    const { state } = servedVillage();
    settle(state);
    const crafts = state.households.filter((h) => h.tier === 'craftsfolk');
    expect(crafts.length).toBe(4);
    for (const h of crafts) {
      for (const r of members(state, h)) {
        if (r.stage !== 'child') expect(r.needs[SERVICE_NEED.social]).toBe(100);
        else expect(r.needs[SERVICE_NEED.social]).toBe(100); // children have no tavern need
        expect(r.needs[SERVICE_NEED.health]).toBe(100);
      }
    }
    for (const h of state.households.filter((x) => x.tier === 'settler'))
      for (const r of members(state, h))
        for (const k of ['social', 'health', 'education'] as const)
          expect(r.needs[SERVICE_NEED[k]]).toBe(100);
  });

  it('leaves Craftsfolk without services wanting, and their mood shows it', () => {
    const covered = servedVillage().state;
    const bare = villageWith().state;
    settle(covered);
    settle(bare);
    const h = bare.households.find((x) => x.tier === 'craftsfolk')!;
    const adult = members(bare, h).find((r) => r.stage === 'adult')!;
    expect(adult.needs[SERVICE_NEED.social]).toBe(UNCOVERED.social);
    expect(adult.needs[SERVICE_NEED.health]).toBe(UNCOVERED.health);
    const twin = findById(covered.residents, adult.id)!;
    expect(computeMood(bare, adult)).toBeLessThan(computeMood(covered, twin));
    // Settlers weigh exactly as in I1: the service needs carry no weight for them.
    const settler = bare.residents.find((r) => r.tier === 'settler')!;
    expect(weightsOf(settler).w[SERVICE_NEED.social]).toBe(0);
    expect(weightsOf(settler).total).toBe(90);
  });

  it('a tavern out of cider and a herbalist out of herbs cover at a lower level', () => {
    const { state, tavern, herbalist } = servedVillage();
    tavern.rt!.status |= BuildingStatus.missingInput;
    herbalist.rt!.status |= BuildingStatus.missingInput;
    settle(state);
    const h = state.households.find((x) => x.tier === 'craftsfolk')!;
    const adult = members(state, h).find((r) => r.stage === 'adult')!;
    expect(adult.needs[SERVICE_NEED.social]).toBe(SHORT_QUALITY);
    expect(adult.needs[SERVICE_NEED.health]).toBe(SHORT_QUALITY);
  });

  it('teaches Craftsfolk children at the school; others hold education at 100', () => {
    const { state } = servedVillage();
    settle(state);
    for (const r of state.residents) {
      const kid = r.stage === 'child' && r.tier === 'craftsfolk';
      expect(r.needs[SERVICE_NEED.education], `${r.tier} ${r.stage}`).toBe(100);
      expect(weightsOf(r).w[SERVICE_NEED.education] > 0).toBe(kid);
    }
    const bare = villageWith().state;
    settle(bare);
    const kid = bare.residents.find((r) => r.stage === 'child' && r.tier === 'craftsfolk')!;
    expect(kid.needs[SERVICE_NEED.education]).toBe(UNCOVERED.education);
  });

  it('needs staff, stays within its radius and its capacity, and the inspector counts who it serves', () => {
    const { state, tavern } = servedVillage();
    const cov = serviceCoverage(state, 'social');
    // Homes beyond 10 tiles of the tavern's door are not covered (the far end of street B).
    const far = state.households.find((h) => findById(state.buildings, h.homeId)!.x >= 56)!;
    expect(cov.quality.has(far.id)).toBe(false);
    const served = servedBy(state, tavern, 'social');
    expect(served).toBeGreaterThan(0);
    expect(served).toBeLessThanOrEqual(60);
    expect(buildingDetail(state, tavern.id)!.served).toEqual({ residents: served, capacity: 60 });
    // Fill the tavern up: a big family next door finds no room.
    const home = place(state, 'cottage', 36, 58);
    const big = addHousehold(state, home, 'craftsfolk', 60 - served + 1);
    expect(serviceCoverage(state, 'social').quality.has(big.id)).toBe(false);
    // No staff, no tavern.
    tavern.rt!.workers.length = 0;
    expect(serviceCoverage(state, 'social').quality.size).toBe(0);
  });
});
