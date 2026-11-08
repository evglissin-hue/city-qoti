// P1 (playtest): the town hall could be removed but never rebuilt, and its builders raise everything
// else, so a valley without it could not build again and had to start over.
import { describe, expect, it } from 'vitest';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';

describe('the town hall stays', () => {
  it('refuses to remove a standard valley town hall, alone or among others', () => {
    const f = hamletFixture();
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.townHall] }))).toBe('HALL_STAYS');
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.well, f.b.townHall] }))).toBe('HALL_STAYS');
    expect(f.state.buildings.some((b) => b.id === f.b.townHall)).toBe(true);
    expect(f.state.buildings.some((b) => b.id === f.b.well)).toBe(true);
    // Everything else still comes down as before.
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.well] }))).toBeUndefined();
  });

  it('lets a sandbox valley remove it as before', () => {
    const f = hamletFixture();
    f.state.settings.mode = 'sandbox';
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.townHall] }))).toBeUndefined();
    expect(f.state.buildings.some((b) => b.id === f.b.townHall)).toBe(false);
  });

  it('offers no second town hall while one stands', () => {
    const f = hamletFixture();
    expect(rejection(run(f.state, { t: 'build.place', def: 'town-hall', x: 70, z: 53, rot: 0 }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('lets a valley that lost its town hall raise one again, at once and free', () => {
    const f = hamletFixture();
    // A save from before P1: the hall came down while that was still allowed.
    f.state.settings.mode = 'sandbox';
    run(f.state, { t: 'build.remove', ids: [f.b.townHall] });
    f.state.settings.mode = 'standard';
    f.state.economy.treasury = -1;
    f.state.economy.leanTimes = true;
    const ctx = run(f.state, { t: 'build.place', def: 'town-hall', x: 44, z: 46, rot: 0 });
    expect(rejection(ctx)).toBeUndefined();
    const hall = f.state.buildings.find((b) => b.def === 'town-hall')!;
    expect(hall.stage).toBe('built');
    expect(hall.rt?.construction).toBeNull();
    expect(f.state.economy.treasury).toBe(-1);
    expect(ctx.events.some((e) => e.e === 'notify' && e.text.includes('town hall'))).toBe(true);
    // And the new one stays too.
    expect(rejection(run(f.state, { t: 'build.remove', ids: [hall.id] }))).toBe('HALL_STAYS');
  });
});
