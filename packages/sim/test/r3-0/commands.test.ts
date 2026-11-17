// R3.0 commands (docs/spec/19-evenings.md, Supplies: which places first; the carrier's places switch):
// place.setPriority and carrier.setRule's optional `places` validate, store and tell the books.
import { describe, expect, it } from 'vitest';
import type { Command, WorldState } from '../../src/contracts';
import { newPlaceState } from '../../src/state/evenings';
import { hamletFixture } from '../fixtures/hamlet';
import { flatWorld, rejection, run } from '../helpers';

function withPlace(state: WorldState, id = 'seats:12'): void {
  state.places.push(newPlaceState(id, 'The Long Bench', 0));
  state.places.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const set = (id: unknown, priority: unknown): Command =>
  ({ t: 'place.setPriority', id, priority }) as unknown as Command;

describe('place.setPriority', () => {
  it('refuses a bad priority or a non-string id as INVALID', () => {
    const s = flatWorld();
    withPlace(s);
    for (const bad of ['first', '', 'KEEP', 1, null, undefined])
      expect(rejection(run(s, set('seats:12', bad))), String(bad)).toBe('INVALID');
    for (const id of [12, null, undefined, {}]) expect(rejection(run(s, set(id, 'keep')))).toBe('INVALID');
    expect(s.places[0]!.priority).toBeUndefined();
    expect(s.places[0]!.prioritySet).toBeUndefined();
  });

  it('refuses an unknown place as NOT_FOUND', () => {
    const s = flatWorld();
    withPlace(s);
    expect(rejection(run(s, set('seats:99', 'keep')))).toBe('NOT_FOUND');
    expect(s.places[0]!.priority).toBeUndefined();
  });

  it("stores 'keep' and 'rest' on the row with the seat and tick, and tells the places", () => {
    const s = flatWorld();
    withPlace(s);
    s.tick = 1234;
    const ctx = run(s, set('seats:12', 'keep'), 1);
    expect(rejection(ctx)).toBeUndefined();
    expect(s.places[0]!.priority).toBe('keep');
    expect(s.places[0]!.prioritySet).toEqual({ seat: 1, tick: 1234 });
    expect(ctx.events.some((e) => e.e === 'places.updated')).toBe(true);
    s.tick = 2000;
    const again = run(s, set('seats:12', 'rest'), 0);
    expect(rejection(again)).toBeUndefined();
    expect(s.places[0]!.priority).toBe('rest');
    expect(s.places[0]!.prioritySet!.seat).toBe(0);
    expect(s.places[0]!.prioritySet!.tick).toBeGreaterThanOrEqual(2000);
    expect(again.events.some((e) => e.e === 'places.updated')).toBe(true);
  });

  it("'normal' deletes the stored priority and still records who asked", () => {
    const s = flatWorld();
    withPlace(s);
    run(s, set('seats:12', 'keep'));
    expect('priority' in s.places[0]!).toBe(true);
    const ctx = run(s, set('seats:12', 'normal'), 1);
    expect(rejection(ctx)).toBeUndefined();
    expect('priority' in s.places[0]!).toBe(false);
    expect(s.places[0]!.prioritySet!.seat).toBe(1);
    expect(ctx.events.some((e) => e.e === 'places.updated')).toBe(true);
  });
});

describe('carrier.setRule places', () => {
  const rule = (places?: unknown): Command =>
    ({
      t: 'carrier.setRule',
      family: 'wares',
      rule: 'always',
      sell: true,
      ...(places !== undefined && { places }),
    }) as unknown as Command;
  const row = (s: WorldState) => s.carrier.families.find((f) => f.set)!;

  it('turns places on, with the seat and tick, and off again', () => {
    const s = hamletFixture().state;
    s.tick = 500;
    expect(rejection(run(s, rule(true), 1))).toBeUndefined();
    const f = row(s);
    expect(f.places).toBe(true);
    expect(f.placesSet).toEqual({ seat: 1, tick: 500 });
    s.tick = 900;
    expect(rejection(run(s, rule(false), 0))).toBeUndefined();
    expect(f.places).toBeUndefined();
    expect(f.placesSet!.seat).toBe(0);
    expect(f.placesSet!.tick).toBeGreaterThanOrEqual(900);
  });

  it('leaves places and placesSet as they were when absent', () => {
    const s = hamletFixture().state;
    run(s, rule(true), 1);
    const f = row(s);
    const before = { places: f.places, placesSet: { ...f.placesSet! } };
    expect(rejection(run(s, { t: 'carrier.setRule', family: 'wares', rule: 'never', sell: false }, 0))).toBe(
      undefined,
    );
    expect(f.rule).toBe('never');
    expect(f.places).toBe(before.places);
    expect(f.placesSet).toEqual(before.placesSet);
    // And with no places ever sent, nothing is added.
    const t = hamletFixture().state;
    run(t, rule());
    expect(row(t).places).toBeUndefined();
    expect(row(t).placesSet).toBeUndefined();
  });

  it('refuses a places that is not a boolean as INVALID, changing nothing', () => {
    const s = hamletFixture().state;
    for (const bad of ['yes', 1, 0, null, {}]) {
      const ctx = run(s, rule(bad));
      expect(rejection(ctx), String(bad)).toBe('INVALID');
    }
    expect(s.carrier.families.every((f) => !f.set && f.places === undefined)).toBe(true);
  });
});
