// R1 (R1C): the season plan's words on the season card.
import { describe, expect, it } from 'vitest';
import { buildFirstChoices, clampDays, dealWords } from './SeasonPlan';

describe('the season plan questions', () => {
  it('words a deal from either side, with the neighbor by name', () => {
    expect(dealWords({ id: 'a', neighbor: 'millhaven', family: 'food', side: 'buy', percent: 110 })).toBe(
      'Millhaven sells us Food at 110% of their price',
    );
    expect(dealWords({ id: 'b', neighbor: 'stonecross', family: 'fuel', side: 'sell', percent: 95 })).toBe(
      'Stonecross buys our Fuel at 95% of their price',
    );
  });

  it('offers Shops as a place to build first only from Village rank', () => {
    expect(buildFirstChoices('hamlet').map((c) => c.word)).toEqual([
      'Homes',
      'Workshops',
      'Farmland',
      'Anywhere',
    ]);
    expect(buildFirstChoices('village').map((c) => c.id)).toEqual([
      'homes-low',
      'shops',
      'crafts',
      'farms',
      null,
    ]);
  });

  it('keeps the reserve between none and the most the sim allows', () => {
    expect(clampDays(-1)).toBe(0);
    expect(clampDays(99)).toBeLessThanOrEqual(30);
  });
});
