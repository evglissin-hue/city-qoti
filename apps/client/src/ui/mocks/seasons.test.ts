import { describe, expect, it } from 'vitest';
import { winterFixture } from '../../../../../packages/sim/test/fixtures/winter';
import {
  mockCommissions,
  mockFestival,
  mockFieldGuide,
  mockRaid,
  mockSeasonCard,
  mockThreat,
  mockTrial,
  mockWeather,
  threatIds,
  winterIds,
} from './seasons';

// The I3 mocks come from the sim's fixtures through the sim's view builders, so their ids name the
// same households, Watch members and buildings as the live ?debug&fixture=winter and =raid valleys.
describe('seasons mocks', () => {
  const f = winterFixture();

  it('name the fixtures by the same ids', () => {
    expect(winterIds.cold).toEqual(f.cold);
    expect(winterIds.watch).toEqual(f.watch);
    expect(winterIds.bathHouse).toBe(f.bathHouse);
    expect(threatIds.raiders).toHaveLength(6);
  });

  it('carry something for every I3 page to show', () => {
    expect(mockSeasonCard.season).toBe(3);
    expect(mockWeather).toMatchObject({ today: 'snow', frozen: true });
    expect(mockFestival.plan?.menu.length).toBeGreaterThan(0);
    expect(mockFieldGuide).toHaveLength(2);
    expect(mockTrial.status).toBe('running');
    expect(mockThreat).toMatchObject({ band: 'medium', daysLeft: 2 });
    expect(mockRaid).toMatchObject({ raiders: 6, bell: true, captures: [threatIds.raiders[0]] });
    expect(mockCommissions).toHaveLength(1);
  });
});
