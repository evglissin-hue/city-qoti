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
      'street',
      'charter',
      'money',
      'hamlet',
      'seasons',
      'hearth',
      'together',
    ]);
  });
});
