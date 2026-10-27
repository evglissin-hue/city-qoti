// C5.0: the year view prints '-' for I3 state that is not there yet, and reads it once it is.
import { describe, expect, it } from 'vitest';
import { startingTown } from './hamlet';
import { yearRow } from './yearRow';

describe('the year view', () => {
  it('prints a dash for every I3 field a valley does not have', () => {
    const w = startingTown('willow').world;
    const bare = { ...w, households: w.households.map((h) => ({ ...h, warmth: undefined })) };
    for (const k of ['weather', 'festival', 'threats', 'raid']) delete (bare as Record<string, unknown>)[k];
    expect(yearRow(bare, 1)).toBe('  1   1 Spring 1  -           -     - -          -');
  });

  it('reads the season, weather, warmth, festival, threat and raid once they exist', () => {
    const w = startingTown('willow').world;
    const filled = {
      ...w,
      households: [{ warmth: { coldHours: 3 } }, { warmth: { coldHours: 0 } }, {}],
      weather: { today: { kind: 'snow' }, river: { frozen: true } },
      festival: { outcome: { stars: 4 } },
      threats: { scheduled: { band: 'medium' }, history: [{ outcome: 'repelled' }] },
      raid: null,
    };
    expect(yearRow(filled as unknown as typeof w, 9)).toBe(
      '  9   1 Spring 1  snow*       1     4 medium     repelled',
    );
  });
});
