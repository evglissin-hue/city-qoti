// R3X: the Town Book advisor. It reads the hints and sends at most one action a day; the lamps
// advisor keeps a hinted place's lanterns first when candles run short; at Hamlet rank it does nothing.
import type { PlaceView, WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { advisors } from '.';
import { bookPlaceIds, supplyPlaceFor } from './lamps';
import { townBook } from './townBook';

const place = (id: string, extra: Record<string, unknown> = {}): PlaceView =>
  ({
    id,
    name: id,
    tile: 20 * 128 + 20,
    members: [],
    visitors: [3],
    serves: [],
    ...extra,
  }) as unknown as PlaceView;

function village(): WorldState {
  const w = startingTown('willow').world;
  w.charter.rank = 'village';
  return w;
}

describe('the Town Book advisor', () => {
  it('is registered, plays in a Village run, and sits in both lanes', () => {
    const def = advisors.find((a) => a.id === 'townBook');
    expect(def).toBe(townBook);
    expect(def!.lane).toBe('both');
    expect(def!.plays({ village: true }, village())).toBe(true);
    expect(def!.plays({}, village())).toBe(false);
  });

  it('does nothing at Hamlet rank, and sends nothing when no hint has a place', () => {
    const h = startingTown('willow');
    const p = new Planner(h);
    const advisor = townBook.create(p);
    h.world.townBook.hints = ['evening-walk'];
    advisor.visit({ afternoon: false });
    expect(p.decisions).toHaveLength(0);
    h.world.charter.rank = 'village';
    advisor.visit({ afternoon: false });
    expect(p.decisions).toHaveLength(0);
  });

  it('names the places its hints point at, for the lamps advisor to keep first', () => {
    const w = village();
    w.townBook.hints = ['evening-walk', 'well-gathering-cider', 'market-night'];
    const live = [
      place('site:lantern-walk:100'),
      place('site:well-gathering-place:200'),
      place('site:small-square:300'),
    ];
    expect([...bookPlaceIds(w, live)].sort()).toEqual([
      'site:lantern-walk:100',
      'site:well-gathering-place:200',
    ]);
    expect(supplyPlaceFor(w, live, 'nightly')).toBeNull();
  });
});
