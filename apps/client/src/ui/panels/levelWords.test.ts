// P3A: the business and home progress lines, every branch.
import { content } from '@qoti/content';
import { KEEPER_DAYS_L3, LEVEL_DOWN_DAYS, LEVEL_UP_DAYS, SHOP_CUSTOMERS } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { homeProgressLine, nextLevelLine } from './levelWords';

const trade = (id: string) => content.tradeById.get(id)!;

describe('nextLevelLine', () => {
  it('uses the sim constants', () => {
    expect([LEVEL_UP_DAYS, LEVEL_DOWN_DAYS, SHOP_CUSTOMERS, KEEPER_DAYS_L3]).toEqual([2, 4, [6, 15], 20]);
  });
  it('says none yet at zero days', () => {
    expect(nextLevelLine({ level: 1, levelDays: 0 }, trade('baker'))).toBe(
      'Level 2 after 2 good days running: none yet. A good day sells four fifths of what it makes, never runs short of grain, with a lane at the door.',
    );
  });
  it('counts the good days so far', () => {
    expect(nextLevelLine({ level: 1, levelDays: 1 }, trade('baker'))).toContain('1 so far');
  });
  it('asks a street and the keeper for level 3', () => {
    expect(nextLevelLine({ level: 2, levelDays: 1 }, trade('baker'))).toBe(
      "Level 3 after 2 good days running: 1 so far. A good day sells four fifths of what it makes, never runs short of grain, with a street at the door, and its keeper's 20 working days.",
    );
  });
  it('asks farmland for a farmstead, and no raw good', () => {
    expect(nextLevelLine({ level: 1, levelDays: 0 }, trade('dairy'))).toBe(
      'Level 2 after 2 good days running: none yet. A good day sells four fifths of what it makes, with free Farmland nearby for a third hand.',
    );
    expect(nextLevelLine({ level: 2, levelDays: 1 }, trade('dairy'))).toContain('a fourth hand');
  });
  it('counts customers for a shop', () => {
    expect(nextLevelLine({ level: 1, levelDays: 1 }, trade('shop'))).toBe(
      'Level 2 after 2 good days running: 1 so far. A good day brings 6 customers, with a lane at the door.',
    );
    expect(nextLevelLine({ level: 2, levelDays: 0 }, trade('shop'))).toContain('15 customers');
  });
  it('warns of a slide, counting the days left', () => {
    expect(nextLevelLine({ level: 2, levelDays: -2 }, trade('baker'))).toBe(
      'A poor day: 2 more in a row and it shrinks to level 1.',
    );
    expect(nextLevelLine({ level: 3, levelDays: -1 }, trade('baker'))).toBe(
      'A poor day: 3 more in a row and it shrinks to level 2.',
    );
  });
  it('is content at the top', () => {
    expect(nextLevelLine({ level: 3, levelDays: 0 }, trade('baker'))).toBe('Level 3, the top of its trade.');
  });
  it('says nothing for an unknown trade', () => {
    expect(nextLevelLine({ level: 1, levelDays: 0 }, undefined)).toBeNull();
  });
});

describe('homeProgressLine', () => {
  it('names days and what is missing', () => {
    expect(
      homeProgressLine({
        next: 'craftsfolk',
        days: 1,
        needed: 3,
        missing: ['a second Food flavor', 'evenings of 50'],
      }),
    ).toBe('1 of 3 days toward a craftsfolk home. Still wants: a second Food flavor, evenings of 50.');
  });
  it('leads with the want when no days count yet', () => {
    expect(homeProgressLine({ next: 'craftsfolk', days: 0, needed: 3, missing: ['evenings of 50'] })).toBe(
      'Toward a craftsfolk home: still wants evenings of 50.',
    );
  });
  it('gives just the days when nothing is missing', () => {
    expect(homeProgressLine({ next: 'merchant', days: 2, needed: 3, missing: [] })).toBe(
      '2 of 3 days toward a merchant home.',
    );
  });
  it('adds nothing without progress', () => {
    expect(homeProgressLine(undefined)).toBeNull();
    expect(homeProgressLine({ next: 'merchant', days: 0, needed: 3 })).toBeNull();
  });
});
