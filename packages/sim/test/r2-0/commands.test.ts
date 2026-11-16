import { describe, expect, it } from 'vitest';
import { MAX_PLACE_NAME_CHARS } from '../../src/constants';
import type { Command, WorldState } from '../../src/contracts';
import { Flags } from '../../src/map/layers';
import { newPlaceState } from '../../src/state/evenings';
import { hashState } from '../../src/state/hash';
import { flatWorld, rejection, run, S, tile } from '../helpers';

const at = (x: number, z: number) => z * S + x;

function withRoad(state: WorldState, tiles: [number, number][]): void {
  for (const [x, z] of tiles) state.map.road[at(x, z)] = 1;
}

function withStreet(state: WorldState, name = 'Mill Lane'): number {
  const id = state.nextId++;
  state.streets.push({ id, anchor: at(50, 50), name });
  return id;
}

function withPlace(state: WorldState, id = 'seats:12', name = 'The Long Bench'): void {
  state.places.push(newPlaceState(id, name, 0));
  state.places.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const eve = (tiles: [number, number][], on: boolean): Command => ({ t: 'road.setEvening', tiles, on });

describe('road.setEvening', () => {
  it('rejects an empty list, too many tiles, out of bounds and no road', () => {
    const s = flatWorld();
    withRoad(s, [[50, 50]]);
    expect(rejection(run(s, eve([], true)))).toBe('INVALID');
    const many: [number, number][] = Array.from({ length: 257 }, (_, i) => [i % 200, 50 + ((i / 200) | 0)]);
    expect(rejection(run(s, eve(many, true)))).toBe('TOO_MANY');
    expect(rejection(run(s, eve([[S, 5]], true)))).toBe('OUT_OF_BOUNDS');
    expect(rejection(run(s, eve([[60, 60]], true)))).toBe('INVALID');
  });

  it('sets and clears the bit on road tiles only, skipping bare ones', () => {
    const s = flatWorld();
    withRoad(s, [[50, 50]]);
    const ctx = run(
      s,
      eve(
        [
          [50, 50],
          [51, 50],
        ],
        true,
      ),
    );
    expect(rejection(ctx)).toBeUndefined();
    expect(tile(s, 'flags', 50, 50) & Flags.evening).toBe(Flags.evening);
    expect(tile(s, 'flags', 51, 50)).toBe(0);
    const changed = ctx.events.find((e) => e.e === 'tiles.changed');
    expect(changed && changed.e === 'tiles.changed' && changed.layers).toEqual(['flags']);
  });

  it('on then off leaves flags as before and never touches road or networkVersion', () => {
    const s = flatWorld();
    withRoad(s, [
      [50, 50],
      [51, 50],
    ]);
    s.map.flags[at(50, 50)] = Flags.stairs;
    const flags = s.map.flags.slice();
    const road = s.map.road.slice();
    const version = s.networkVersion;
    run(
      s,
      eve(
        [
          [50, 50],
          [51, 50],
        ],
        true,
      ),
    );
    // Stairs bit kept while the evening bit is set.
    expect(tile(s, 'flags', 50, 50)).toBe(Flags.stairs | Flags.evening);
    expect(s.networkVersion).toBe(version);
    run(
      s,
      eve(
        [
          [50, 50],
          [51, 50],
        ],
        false,
      ),
    );
    expect(Array.from(s.map.flags)).toEqual(Array.from(flags));
    expect(Array.from(s.map.road)).toEqual(Array.from(road));
    expect(s.networkVersion).toBe(version);
  });

  it('road.remove clears the evening bit (stairs are recomputed by the road change)', () => {
    const s = flatWorld();
    withRoad(s, [[50, 50]]);
    s.map.flags[at(50, 50)] = Flags.stairs;
    run(s, eve([[50, 50]], true));
    const ctx = run(s, { t: 'road.remove', tiles: [[50, 50]] });
    expect(rejection(ctx)).toBeUndefined();
    expect(tile(s, 'road', 50, 50)).toBe(0);
    expect(tile(s, 'flags', 50, 50) & Flags.evening).toBe(0);
    const changed = ctx.events.find((e) => e.e === 'tiles.changed');
    expect(changed && changed.e === 'tiles.changed' && changed.layers).toContain('flags');
  });
});

describe('road.rename', () => {
  it('is NOT_FOUND for an unknown street and INVALID for a long name', () => {
    const s = flatWorld();
    const id = withStreet(s);
    expect(rejection(run(s, { t: 'road.rename', id: id + 99, name: 'Elm' }))).toBe('NOT_FOUND');
    const long = 'x'.repeat(MAX_PLACE_NAME_CHARS + 1);
    expect(rejection(run(s, { t: 'road.rename', id, name: long }))).toBe('INVALID');
  });

  it('records the seat, shows the name in the event, and restores on empty or generated name', () => {
    const s = flatWorld();
    const id = withStreet(s);
    const ctx = run(s, { t: 'road.rename', id, name: '  Bakers   Row ' }, 1);
    expect(rejection(ctx)).toBeUndefined();
    expect(s.streets[0]).toMatchObject({ custom: 'Bakers Row', renamedBy: 1 });
    const ev = ctx.events.find((e) => e.e === 'streets.updated');
    expect(ev && ev.e === 'streets.updated' && ev.s[0]!.name).toBe('Bakers Row');
    run(s, { t: 'road.rename', id, name: '' });
    expect(s.streets[0]!.custom).toBeUndefined();
    expect(s.streets[0]!.renamedBy).toBeUndefined();
    run(s, { t: 'road.rename', id, name: 'Elm' });
    expect(s.streets[0]!.custom).toBe('Elm');
    run(s, { t: 'road.rename', id, name: 'Mill Lane' });
    expect(s.streets[0]!.custom).toBeUndefined();
    expect(s.streets[0]!.renamedBy).toBeUndefined();
  });
});

describe('place.rename', () => {
  it('is NOT_FOUND for an unknown place and INVALID for a long name', () => {
    const s = flatWorld();
    withPlace(s);
    expect(rejection(run(s, { t: 'place.rename', id: 'seats:99', name: 'Elm' }))).toBe('NOT_FOUND');
    const long = 'x'.repeat(MAX_PLACE_NAME_CHARS + 1);
    expect(rejection(run(s, { t: 'place.rename', id: 'seats:12', name: long }))).toBe('INVALID');
  });

  it('records the seat, emits places.updated, and restores on empty or generated name', () => {
    const s = flatWorld();
    withPlace(s);
    withPlace(s, 'fire:3', 'The Ember');
    const ctx = run(s, { t: 'place.rename', id: 'seats:12', name: 'Gossip Corner' }, 1);
    expect(rejection(ctx)).toBeUndefined();
    const row = s.places.find((p) => p.id === 'seats:12')!;
    expect(row).toMatchObject({ custom: 'Gossip Corner', renamedBy: 1 });
    expect(s.places.find((p) => p.id === 'fire:3')!.custom).toBeUndefined();
    expect(ctx.events.some((e) => e.e === 'places.updated')).toBe(true);
    run(s, { t: 'place.rename', id: 'seats:12', name: '' });
    expect(row.custom).toBeUndefined();
    expect(row.renamedBy).toBeUndefined();
    run(s, { t: 'place.rename', id: 'seats:12', name: 'Gossip Corner' });
    run(s, { t: 'place.rename', id: 'seats:12', name: 'The Long Bench' });
    expect(row.custom).toBeUndefined();
  });
});

describe('valley.setSettings eveningLingers', () => {
  it('accepts a boolean and rejects other types', () => {
    const s = flatWorld();
    run(s, { t: 'valley.setSettings', settings: { eveningLingers: false } });
    expect(s.settings.eveningLingers).toBe(false);
    const ctx = run(s, { t: 'valley.setSettings', settings: { eveningLingers: 'yes' as never } });
    expect(rejection(ctx)).toBe('INVALID');
  });
});

describe('determinism', () => {
  it('the same sequence on two fresh worlds gives the same hash', () => {
    const play = (): string => {
      const s = flatWorld();
      withRoad(s, [
        [50, 50],
        [51, 50],
      ]);
      const id = withStreet(s);
      withPlace(s);
      run(
        s,
        eve(
          [
            [50, 50],
            [51, 50],
          ],
          true,
        ),
      );
      run(s, { t: 'road.rename', id, name: 'Elm' }, 1);
      run(s, { t: 'place.rename', id: 'seats:12', name: 'Gossip Corner' }, 0);
      run(s, { t: 'road.remove', tiles: [[51, 50]] });
      return hashState(s);
    };
    expect(play()).toBe(play());
  });
});
