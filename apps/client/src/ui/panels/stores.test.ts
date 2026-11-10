// P1 (player's chair): the Stores panel groups goods the way a player thinks of them. R1: by family,
// so grain is food, firewood is fuel and timber is a material.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { groupOf } from './Stores';

describe('stores groups', () => {
  it('puts each good under its family', () => {
    expect(groupOf('bread')).toBe('food');
    expect(groupOf('grain')).toBe('food');
    expect(groupOf('firewood')).toBe('fuel');
    expect(groupOf('timber')).toBe('materials');
    expect(groupOf('stone')).toBe('materials');
    expect(groupOf('furniture')).toBe('wares');
    expect(groupOf('honey')).toBe('treats');
  });

  it('files every good under the family content gives it, so the cover counts every food', () => {
    for (const g of content.goods) expect(groupOf(g.id), g.id).toBe(g.family);
  });
});
