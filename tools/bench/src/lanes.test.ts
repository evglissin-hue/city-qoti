import { describe, expect, it } from 'vitest';
import { autoplay } from './autoplay';

describe('lanes', () => {
  it('a run with the Hearth off sends no Hearth-lane command', () => {
    const run = autoplay('willow', 4, { hearthOffFrom: 1 });
    expect(run.decisions.filter((r) => r.lane === 'hearth' && r.ok)).toEqual([]);
    expect(run.decisions.some((r) => r.lane === 'ledger' && r.ok)).toBe(true);
  }, 60_000);

  it('a run with the Ledger off after founding sends Ledger commands on day 1 only', () => {
    const run = autoplay('willow', 4, { ledgerOffFrom: 2 });
    const ledger = run.decisions.filter((r) => r.lane === 'ledger');
    expect(ledger.some((r) => r.day === 1 && r.ok)).toBe(true);
    expect(ledger.filter((r) => r.day > 1)).toEqual([]);
  }, 60_000);

  it('a plain run zones in the Ledger lane and days count from 1', () => {
    const run = autoplay('willow', 3);
    expect(run.decisions.some((r) => r.kind === 'zone.paint' && r.lane === 'ledger' && r.ok)).toBe(true);
    expect(Math.min(...run.decisions.map((r) => r.day))).toBe(1);
    expect(Math.max(...run.decisions.map((r) => r.day))).toBeLessThanOrEqual(3);
  }, 60_000);
});
