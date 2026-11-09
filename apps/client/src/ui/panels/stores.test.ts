// P1 (player's chair): the Stores panel groups goods the way a player thinks of them, so wheat is
// not counted with food, firewood is not a building material, and wool is not a stone.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { groupOf } from './Stores';

describe('stores groups', () => {
  it('puts each good where a player would look for it', () => {
    expect(groupOf('bread')).toBe('food');
    expect(groupOf('fish')).toBe('food');
    expect(groupOf('wheat')).toBe('grain');
    expect(groupOf('flour')).toBe('grain');
    expect(groupOf('planks')).toBe('building');
    expect(groupOf('stone')).toBe('building');
    expect(groupOf('firewood')).toBe('home');
    expect(groupOf('wool')).toBe('crafts');
  });

  it('files every food good under Food, the goods the cover counts', () => {
    for (const g of content.goods) if (g.food) expect(groupOf(g.id), g.id).toBe('food');
  });
});
