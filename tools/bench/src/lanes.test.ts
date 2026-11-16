import { describe, expect, it } from 'vitest';
import { autoplay } from './autoplay';
import { formatLanes, lanesVerdict, type LaneMode, type LaneRun } from './lanes';

describe('the lanes verdict', () => {
  const run = (seed: string, mode: LaneMode, residents: number, craftsfolk: number): LaneRun => ({
    seed,
    mode,
    days: 70,
    residents,
    households: Math.ceil(residents / 3),
    craftsfolk,
    decisions: [],
  });
  const failing = [
    run('oak', 'both', 100, 10),
    run('oak', 'hearthOff', 93, 4),
    run('oak', 'ledgerOff', 40, 2),
  ];
  const passing = [
    run('willow', 'both', 100, 10),
    run('willow', 'hearthOff', 60, 3),
    run('willow', 'ledgerOff', 75, 5),
  ];

  it('fails a one-lane town that keeps 93% of the residents', () => {
    const fails = lanesVerdict(failing, ['oak']);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain('oak: Hearth off town keeps too much');
    expect(fails[0]).toContain('93 of 100 residents');
    expect(fails[0]).not.toContain('Craftsfolk');
    const table = formatLanes(failing, ['oak'], 70);
    expect(table).toMatch(/ 93 +93% +4 +40% FAIL/);
    expect(table).toMatch(/ 40 +40% +2 +20% PASS/);
  });

  it('fails on the Craftsfolk half alone', () => {
    const runs = [run('a', 'both', 100, 10), run('a', 'hearthOff', 75, 6), run('a', 'ledgerOff', 75, 5)];
    const fails = lanesVerdict(runs, ['a']);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain('6 of 10 Craftsfolk households');
  });

  it('passes a table inside the limits, and 0 Craftsfolk of 0 passes the Craftsfolk half', () => {
    expect(lanesVerdict(passing, ['willow'])).toEqual([]);
    const table = formatLanes(passing, ['willow'], 70);
    expect(table).not.toContain('FAIL');
    expect(table).toContain('PASS');
    const none = [run('z', 'both', 50, 0), run('z', 'hearthOff', 30, 0), run('z', 'ledgerOff', 30, 0)];
    expect(lanesVerdict(none, ['z'])).toEqual([]);
  });
});

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
