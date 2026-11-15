// R1F: the tune's Ledger view row formats the five families, four bars and the hands percentages.
import { describe, expect, it } from 'vitest';
import { autoplay } from './autoplay';
import { startingTown } from './hamlet';
import { businessesSummary, formatLedger, ledgerLine, ledgerRow, nextTierSummary } from './ledgerRow';

describe('the ledger view', () => {
  it('reads a new valley into one compact row', () => {
    const w = startingTown('willow').world;
    const row = ledgerRow(1, ledgerLine(w));
    for (const f of ['food', 'fuel', 'mats', 'wares', 'treats'])
      expect(row).toMatch(new RegExp(`${f} \\d+\\.\\d/\\d`));
    expect(row).toMatch(/h\d+\*? s\d+\*? w\d+\*? f\d+\*?/);
    expect(row).toMatch(/hands f\d+% h\d+%/);
    expect(row).toMatch(/car \+\d+\/-\d+ \$\d+/);
    expect(row).toMatch(/tab \d+$/);
    expect(row.length).toBeLessThan(160);
  });

  it('records a line a day in a short run and summarizes businesses and next tiers', () => {
    const run = autoplay('willow', 2);
    expect(run.days.every((d) => d.ledger)).toBe(true);
    const table = formatLedger(run.days).split('\n');
    expect(table).toHaveLength(run.days.length + 1);
    for (const r of table.slice(1)) expect(r.length).toBeLessThan(160);
    expect(typeof businessesSummary(run.hamlet.world)).toBe('string');
    expect(typeof nextTierSummary(run.hamlet.world)).toBe('string');
  });
});
