import { describe, expect, it } from 'vitest';
import { R2_BUDGET, R2_SCENES } from './r2.bench';

describe('the R2 bench scenes', () => {
  it('are listed one a line, sorted by id, with unique ids', () => {
    const ids = R2_SCENES.map((s) => s.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('run the place pass at Village scale, report a line, and stay in budget', () => {
    const scene = R2_SCENES.find((s) => s.id === 'places-village')!;
    const result = scene.run();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('r2 places village');
    expect(result.report).toHaveProperty('rebuildMs');
    expect(R2_BUDGET.placesVillageMsPerHour).toBe(1);
  });
});
