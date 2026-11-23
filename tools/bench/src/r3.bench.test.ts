import { describe, expect, it } from 'vitest';
import { R3_BUDGET, R3_SCENES } from './r3.bench';

describe('the R3 bench scenes', () => {
  it('are listed one a line, sorted by id, with unique ids', () => {
    const ids = R3_SCENES.map((s) => s.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('run the masters day at City scale, report a line, and stay in budget', () => {
    const scene = R3_SCENES.find((s) => s.id === 'masters-day')!;
    const result = scene.run();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain('r3 masters day');
    expect(result.report).toHaveProperty('medianMs');
    expect(R3_BUDGET.togetherMsPerHour).toBe(1);
  });
});
