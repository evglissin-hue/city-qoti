import { describe, expect, it } from 'vitest';
import { hamletFixture } from '../../../../../packages/sim/test/fixtures/hamlet';
import { mockBuildings, mockHouseholds, mockResidents } from './hamlet';

// The mocks stand in for the live hamlet in component tests and the ?fixture&mock screenshots, so
// their ids have to name the same people and places as the sim's fixture.
describe('hamlet mocks', () => {
  const f = hamletFixture();
  it('name the fixture residents and households by the same ids', () => {
    for (const r of mockResidents) {
      const live = f.state.residents.find((x) => x.id === r.id);
      expect(live && `${live.given} ${live.family}`, `resident ${r.id}`).toBe(`${r.given} ${r.family}`);
      expect(live?.jobId).toBe(r.jobId);
    }
    for (const h of mockHouseholds) {
      const live = f.state.households.find((x) => x.id === h.id);
      expect(live?.family).toBe(h.family);
      expect(live?.members).toEqual(h.members);
      expect(live?.homeId).toBe(h.homeId);
    }
  });

  it('name the fixture buildings by the same ids', () => {
    for (const b of mockBuildings) {
      const live = f.state.buildings.find((x) => x.id === b.id);
      expect(live?.def, `building ${b.id}`).toBe(b.def);
      expect([live?.x, live?.z]).toEqual([b.x, b.z]);
    }
  });
});
