// R3.0: the skating spots are fixed when the river freezes and saved with it, so a seat joining
// mid-freeze (from a snapshot) reads the spots its partner reads, whatever changed on the bank since.
import { describe, expect, it } from 'vitest';
import { RIVER_FREEZE_DAY } from '../../src/constants';
import { deserialize, serialize } from '../../src/state/serialize';
import { hashState } from '../../src/state/hash';
import { placeIndex } from '../../src/systems/places';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { turnDay } from '../../src/systems/seasons';
import { findSkatingSpots, skatingSpots } from '../../src/systems/seasons/place';
import { createTickCtx } from '../../src/turn';
import { tickAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';

const iceIds = (state: Parameters<typeof placeIndex>[0]): string[] =>
  placeIndex(state)
    .places.filter((p) => p.id.startsWith('ice:'))
    .map((p) => p.id);

describe('skating spots fixed at the freeze', () => {
  it('a seat joining mid-freeze reads the same spots and ice places, and the thaw drops them', () => {
    const { state } = villageFixture();
    expect(skatingSpots(state)).toEqual([]);
    state.tick = tickAt(0, 3, RIVER_FREEZE_DAY, 0) + 2;
    const before = findSkatingSpots(state);
    expect(before.length).toBeGreaterThan(0);
    turnDay(state, createTickCtx(state));
    expect(state.weather.river.frozen).toBe(true);
    const saved = [...skatingSpots(state)];
    expect(saved).toEqual(before);
    expect(state.weather.river.spots).toEqual(before);
    const ice = iceIds(state);
    expect(ice.length).toBe(saved.length);

    // The bank changes behind the freeze: the first saved spot is planted over.
    const first = saved[0]!;
    state.map.tree[first] = 1;
    bumpPlaceInputs(state);
    expect(findSkatingSpots(state)).not.toEqual(saved);
    expect([...skatingSpots(state)]).toEqual(saved);
    expect(iceIds(state)).toEqual(ice);

    // The joining seat loads the snapshot: the spots and the ice places are the ones saved.
    const joined = deserialize(serialize(state));
    expect(joined.weather.river.frozen).toBe(true);
    expect(joined.weather.river.spots).toEqual(saved);
    expect([...skatingSpots(joined)]).toEqual([...skatingSpots(state)]);
    expect(findSkatingSpots(joined)).toEqual(findSkatingSpots(state));
    expect(findSkatingSpots(joined)).not.toEqual(saved);
    expect(iceIds(joined)).toEqual(iceIds(state));
    expect(iceIds(joined)).toEqual(ice);
    expect(hashState(joined)).toBe(hashState(state));

    // The thaw drops the spots on both.
    for (const s of [state, joined]) {
      s.tick = tickAt(1, 0, 1, 0) + 2;
      turnDay(s, createTickCtx(s));
      expect(s.weather.river.frozen).toBe(false);
      expect(s.weather.river.spots).toBeUndefined();
      expect(skatingSpots(s)).toEqual([]);
      expect(iceIds(s)).toEqual([]);
    }
  });
});
