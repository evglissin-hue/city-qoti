// C5.0: the advisor registry stays one alphabetical line each, with distinct ids and visit slots.
import { describe, expect, it } from 'vitest';
import { advisors } from '.';

describe('the advisors', () => {
  it('are registered alphabetically, once each', () => {
    const ids = advisors.map((a) => a.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('visit in distinct slots, in the I2 order', () => {
    const order = [...advisors].sort((a, b) => a.slot - b.slot).map((a) => a.id);
    expect(new Set(advisors.map((a) => a.slot)).size).toBe(advisors.length);
    expect(order).toEqual([
      'village',
      // R1F: the land advisor took the street advisor's slot, the plan advisor the seasons advisor's.
      'land',
      'shops',
      'charter',
      'money',
      // R3E: the Ledger makes what places burn
      'supplies',
      'watch',
      'hamlet',
      'plan',
      'festivals',
      'hearth',
      // R2E: the Hearth's places, after the wishes
      'places',
      // R3E: the Hearth keeps places alive, after the places are composed
      'lamps',
      // R3X: the pair read the Town Book, after the places and lamps
      'townBook',
      // I3 (C5C)
      'nature',
      'together',
      'guide',
    ]);
  });
});
