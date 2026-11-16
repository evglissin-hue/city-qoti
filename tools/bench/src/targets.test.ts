// R2E: the targets table's new columns, fed hand-made rows (no autoplay).
import { describe, expect, it } from 'vitest';
import { failedTargets, formatTarget, TARGET_HEAD, type TargetRow } from './targets';

const row = (over: Partial<TargetRow> = {}): TargetRow => ({
  seed: 'willow',
  villageDay: 9,
  residents40: 30,
  residents70: 60,
  households70: 20,
  foodHands40: 20,
  foodHands70: 18,
  foodHandsMean: 19,
  decisions: 120,
  verdict: [],
  kinds: '',
  firstCraftsfolk: 31,
  craftsfolkShare70: 38,
  craftsfolkBest: 40,
  stalls: [],
  lowestCoins: 40,
  owed70: 0,
  tab70: 0,
  coins70: 200,
  firewoodMade: 10,
  firewoodBought: 2,
  leanDays: 0,
  departures: 0,
  shareOutMean: 82,
  shareOutLast: 90,
  avgEvening: 64,
  places: 4,
  seatsPer100: 55,
  treatsRound: 85,
  gapsOpened: 3,
  gapsClosed: 2,
  closedBySeat: '1/1',
  hearthDecisions: 40,
  cobblesDay: 20,
  rowLots: 8,
  rows: 2,
  gardens: 3,
  corners: 1,
  grownRowLots: 4,
  craftsBy40: true,
  craftsThird70: true,
  ...over,
});

describe('the targets table', () => {
  it('prints the evening columns and PASS for R1 lines that hold', () => {
    const line = formatTarget(row());
    expect(line).toContain(' 82 ');
    expect(line).toContain('3/2');
    expect(line).toContain('1/1');
    expect(line).toContain('PASS');
    expect(line).toContain('PASS 38%');
    expect(line).not.toContain('FAIL');
    expect(TARGET_HEAD).toContain('treats%round');
    expect(failedTargets(row())).toEqual([]);
  });

  it('prints a dash where no evening was tallied and no place stands', () => {
    const line = formatTarget(
      row({
        shareOutMean: null,
        shareOutLast: null,
        avgEvening: null,
        seatsPer100: null,
        treatsRound: null,
        places: 0,
      }),
    );
    expect(line.split(/\s+/).filter((c) => c === '-').length).toBeGreaterThanOrEqual(6);
    expect(failedTargets(row({ treatsRound: null, places: 0 }))).toEqual([]);
  });

  it('names each failed R1 and R2 target, one line apiece', () => {
    const r = row({
      craftsBy40: false,
      firstCraftsfolk: 52,
      craftsThird70: false,
      craftsfolkShare70: 12,
      treatsRound: 60,
      verdict: ['the Ledger sent 160 accepted commands in 70 days (limit 150)'],
    });
    const fails = failedTargets(r);
    expect(fails).toHaveLength(4);
    expect(fails.join('\n')).toContain('first on day 52');
    expect(fails.join('\n')).toContain('12% of households');
    expect(fails.join('\n')).toContain('60% of Treats');
    expect(formatTarget(r)).toContain('FAIL 12%');
  });
});
