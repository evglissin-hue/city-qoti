// R3E: the variety check's static reading (no autoplay): the counts R3.0 states.
import { describe, expect, it } from 'vitest';
import { familyReach, formatReach, tierVerdict, TIER_WANTS, VARIETY_FAMILIES } from './variety';

const total = (f: 'food' | 'wares' | 'treats') => {
  const r = familyReach(f);
  return [r.base.length, r.base.length + r.masters.length];
};

describe('the variety reading', () => {
  it('counts base goods and masters by family as R3.0 states (Food 6 to 8, Wares 3 to 6, Treats 2 to 6)', () => {
    expect(total('food')).toEqual([6, 8]);
    expect(total('wares')).toEqual([3, 6]);
    expect(total('treats')).toEqual([2, 6]);
  });

  it('puts every master good in its own family and names the trade that makes it', () => {
    const treats = familyReach('treats').masters.map((m) => `${m.good}:${m.trade}`);
    expect(treats).toEqual(
      expect.arrayContaining(['pies:baker', 'jam:orchard', 'cordial:cider-maker', 'mead:hives']),
    );
    expect(
      familyReach('food')
        .masters.map((m) => m.trade)
        .sort(),
    ).toEqual(['dairy', 'fishery']);
  });

  it('counts specialties as Treats only, one flavor each', () => {
    expect(familyReach('food').specialties.count).toBe(0);
    expect(familyReach('treats').specialties.count).toBe(21);
  });

  it('holds the Merchants and Patrons wants of 13-ledger.md', () => {
    expect(TIER_WANTS.merchant).toEqual({ food: 5, wares: 3, treats: 3 });
    expect(TIER_WANTS.patron).toEqual({ food: 7, wares: 5, treats: 5 });
  });

  it('says what each tier needs on top of the base goods', () => {
    const treats = familyReach('treats');
    expect(tierVerdict(treats, 'merchant').mastersNeeded).toBe(1);
    expect(tierVerdict(treats, 'patron').mastersNeeded).toBe(3);
    expect(tierVerdict(familyReach('food'), 'merchant').mastersNeeded).toBe(0);
    for (const f of VARIETY_FAMILIES) expect(tierVerdict(familyReach(f), 'patron').met).toBe(true);
  });

  it('prints one block a family and the wants table', () => {
    const text = formatReach().join('\n');
    expect(text).toContain('Food');
    expect(text).toContain('masters needed');
  });
});
