// Helpers for the C4C tests (chains, services, tiers, carts, innovations, patterns), on top of the
// shared village fixture (packages/sim/test/fixtures/village.ts) and the Ledger helpers. The open
// ground north of lane A (z 30 to 44) and south of the home lots (z 76 and on) is free for tests.
import { content } from '@qoti/content';
import { NEED_IDS, PENNIES_PER_COIN } from '../../src/constants';
import type { Building, EntityId, Household, Resident, Rot4, TierId, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { goodsArray } from '../../src/state/hamlet';
import { insertBuilding } from '../../src/state/place';
import { doorTile } from '../../src/systems/movement/api';
import { villageFixture, type VillageFixture } from '../fixtures/village';

export { good } from '../ledger/helpers';

export function place(state: WorldState, def: string, x: number, z: number, rot: Rot4 = 0): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, rot, 0, { site: false });
}

/** A fresh adult (or child) in a household, tier as the household's, unemployed and at home. */
export function addResident(state: WorldState, h: Household, stage: Resident['stage'] = 'adult'): Resident {
  const home = findById(state.buildings, h.homeId)!;
  const r: Resident = {
    id: state.nextId++,
    given: `Test${state.nextId}`,
    family: h.family,
    species: 'mouse',
    stage,
    bornDay: stage === 'child' ? -30 : -200,
    traits: ['cheerful', 'practical'],
    householdId: h.id,
    jobId: 0,
    tier: h.tier,
    mood: 70,
    needs: NEED_IDS.map(() => 70),
    modifiers: [],
    bond: 1,
    friends: [],
    activity: { kind: 'home' },
    move: null,
    tile: doorTile(home),
    inside: home.id,
    carry: null,
    wishId: 0,
    history: [],
    flags: 0,
    look: 7,
  };
  state.residents.push(r);
  h.members.push(r.id);
  return r;
}

/** A household of `adults` grown-ups and `children` children in a home. */
export function addHousehold(
  state: WorldState,
  home: Building,
  tier: TierId = 'settler',
  adults = 2,
  children = 0,
  savingsCoins = 0,
): Household {
  const h: Household = {
    id: state.nextId++,
    family: 'Tester',
    members: [],
    homeId: home.id,
    pantry: goodsArray(),
    recentFoods: [],
    savings: savingsCoins * PENNIES_PER_COIN,
    tier,
    arrivedDay: 0,
    lowMoodDays: 0,
  };
  state.households.push(h);
  for (let i = 0; i < adults; i++) addResident(state, h, 'adult');
  for (let i = 0; i < children; i++) addResident(state, h, 'child');
  if (home.rt) home.rt.tier = tier;
  return h;
}

/** Workers for a building: fresh adults in a new household living in the building's own spot. */
export function staff(state: WorldState, b: Building, n: number, tier: TierId = 'settler'): EntityId[] {
  const h = state.households.find((x) => x.tier === tier) ?? state.households[0]!;
  const ids: EntityId[] = [];
  for (let k = 0; k < n; k++) {
    const r = addResident(state, h, 'adult');
    r.tier = tier;
    r.jobId = b.id;
    b.rt!.workers.push(r.id);
    ids.push(r.id);
  }
  return ids;
}

export function villageWith(): VillageFixture {
  return villageFixture();
}

export function stocked(b: Building, where: 'store' | 'input' | 'output', pairs: [string, number][]): void {
  for (const [g, q] of pairs) b.rt![where][content.goodIndex.get(g)!] = q;
}
