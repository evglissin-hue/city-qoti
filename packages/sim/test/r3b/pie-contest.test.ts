// R3B: the pie contest is offered once a master baker makes pies, in its seasons, and its goal is on
// pies (docs/spec/12-hearth.md, Festivals).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { goodsNamed, twistOffered, twistsOffered } from '../../src/systems/festivals/twists';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire, resident } from '../ledger/helpers';

function bakeryWithMaster(): WorldState {
  const f = hamletFixture();
  const s = f.state;
  const b = building(s, f.b.bakery);
  const [id] = hire(s, b.id, 1);
  const r = resident(s, id!);
  r.flags |= ResidentFlags.master;
  r.mastery = 'baker';
  b.masterId = id;
  return s;
}

const inSeason = (s: WorldState, season: number): void => {
  s.tick = (season * DAYS_PER_SEASON + 1) * TICKS_PER_DAY;
};

describe('the pie contest', () => {
  const t = content.twistById.get('pie-contest')!;

  it('asks for pies on the table, in the warm seasons', () => {
    expect(t.seasons).toEqual([0, 1, 2]);
    expect(goodsNamed(t.goal!)).toEqual(['pies']);
  });

  it('is offered only once a master baker makes pies', () => {
    const f = hamletFixture();
    for (const season of [0, 1, 2, 3]) {
      inSeason(f.state, season);
      expect(twistOffered(f.state, 'pie-contest'), `no master, season ${season}`).toBe(false);
    }
    const s = bakeryWithMaster();
    for (const season of [0, 1, 2]) {
      inSeason(s, season);
      expect(twistOffered(s, 'pie-contest'), `season ${season}`).toBe(true);
      expect(twistsOffered(s)).toContain('pie-contest');
    }
    inSeason(s, 3);
    expect(twistOffered(s, 'pie-contest')).toBe(false);
  });

  it('goes quiet again when the master leaves, unless pies are still in store', () => {
    const s = bakeryWithMaster();
    inSeason(s, 1);
    const b = s.buildings.find((x) => x.trade === 'baker')!;
    delete b.masterId;
    b.rt!.workers = [];
    expect(twistOffered(s, 'pie-contest')).toBe(false);
    b.rt!.output[content.goodIndex.get('pies')!] = 6;
    expect(twistOffered(s, 'pie-contest')).toBe(true);
  });
});
