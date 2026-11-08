import { describe, expect, it } from 'vitest';
import { villageFixture } from '../../../../../packages/sim/test/fixtures/village';
import {
  mockCharter,
  mockLetters,
  mockLots,
  mockMarket,
  mockPlans,
  mockRequests,
  mockTrade,
  mockVillageBuildingDetail,
  mockVillageResidentDetail,
  villageIds,
} from './village';

// The village mocks come from the sim's fixture through the sim's view builders, so their ids name
// the same people, lots and buildings as the live ?debug&fixture=village valley.
describe('village mocks', () => {
  const f = villageFixture();

  it('name the fixture by the same ids', () => {
    expect(villageIds.residents).toEqual(f.residents);
    expect(mockLots.map((l) => l.id)).toEqual(f.state.lots.map((l) => l.id));
    expect(mockPlans[0]!.id).toBe(f.plan);
    expect(mockRequests[0]!.id).toBe(f.request);
    expect(mockVillageResidentDetail.r.id).toBe(f.residents[0]);
    expect(mockVillageBuildingDetail.b.id).toBe(f.b.bakery);
  });

  it('carry something for every I2 panel to show', () => {
    expect(mockMarket.lines.find((l) => l.good === 'bread')!.history.length).toBeGreaterThan(1);
    expect(mockTrade.log.length).toBeGreaterThan(0);
    expect(mockTrade.caravans.length).toBe(1);
    expect(mockCharter.goals.some((g) => !g.done)).toBe(true);
    expect(mockLetters.length).toBeGreaterThan(0);
    expect(mockVillageResidentDetail.partner?.married).toBe(true);
    expect(mockVillageBuildingDetail.profit?.lines.length).toBeGreaterThan(0);
  });
});
