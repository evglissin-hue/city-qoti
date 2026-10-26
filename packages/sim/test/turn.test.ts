import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/constants';
import { systems } from '../src/systems';
import { calendar } from '../src/systems/clock/calendar';
import { advanceTo, applyTurn, applyTurns, createTickCtx, effectiveSpeed } from '../src/turn';
import { buildView } from '../src/view';
import { flatWorld, run } from './helpers';

describe('calendar', () => {
  it('starts at Year 1, Spring, day 1, 06:00', () => {
    expect(calendar(0)).toEqual({ year: 1, season: 0, day: 1, hour: 6, minute: 0 });
  });

  it('counts hours, days, seasons and years', () => {
    expect(calendar(TICKS_PER_HOUR)).toMatchObject({ hour: 7, minute: 0 });
    expect(calendar(TICKS_PER_HOUR / 2)).toMatchObject({ hour: 6, minute: 30 });
    expect(calendar(18 * TICKS_PER_HOUR)).toMatchObject({ day: 2, hour: 0 });
    expect(calendar(6 * TICKS_PER_DAY)).toMatchObject({ season: 1, day: 1, hour: 6 });
    expect(calendar(24 * TICKS_PER_DAY)).toMatchObject({ year: 2, season: 0, day: 1 });
  });
});

describe('effective speed', () => {
  it('is the minimum over connected seats and 0 when nobody is there', () => {
    const w = flatWorld();
    w.time.desired = [3, 2, 1, 1];
    expect(effectiveSpeed(w)).toBe(2);
    w.time.connected = [0];
    expect(effectiveSpeed(w)).toBe(3);
    w.time.connected = [];
    expect(effectiveSpeed(w)).toBe(0);
  });

  it('holds still in a together-only valley with one seat', () => {
    const w = flatWorld();
    w.settings.togetherOnly = true;
    w.time.connected = [1];
    expect(effectiveSpeed(w)).toBe(0);
  });
});

describe('applyTurn', () => {
  it('runs effectiveSpeed ticks per turn and emits clock each in-game hour', () => {
    const w = flatWorld();
    w.time.desired = [2, 2, 1, 1];
    const ctx = createTickCtx(w);
    for (let t = 1; t <= 100; t++) applyTurn(w, { t, cmds: [] }, ctx);
    expect(w.lastTurn).toBe(100);
    expect(w.tick).toBe(200);
    expect(ctx.events.filter((e) => e.e === 'clock')).toHaveLength(1);
  });

  it('refuses turns out of order', () => {
    const w = flatWorld();
    expect(() => applyTurn(w, { t: 2, cmds: [] }, createTickCtx(w))).toThrow();
  });

  it('fills gaps left by empty turns and skips old ones', () => {
    const w = flatWorld();
    const ctx = createTickCtx(w);
    applyTurns(
      w,
      [{ t: 5, cmds: [{ seat: 0, seq: 1, cmd: { t: 'note.pin', x: 1, z: 1, text: 'gap' } }] }],
      ctx,
    );
    expect(w.lastTurn).toBe(5);
    expect(w.tick).toBe(5);
    expect(w.notes[0]!.tick).toBe(4);
    applyTurns(w, [{ t: 3, cmds: [] }], ctx);
    expect(w.lastTurn).toBe(5);
    advanceTo(w, 9, ctx);
    expect(w.lastTurn).toBe(9);
  });

  it('applies commands before ticking, in order', () => {
    const w = flatWorld();
    w.time.connected = [];
    const ctx = createTickCtx(w);
    applyTurn(
      w,
      {
        t: 1,
        cmds: [
          { seat: 0, seq: 0, cmd: { t: 'sys.seatJoined', seat: 0 } },
          { seat: 0, seq: 1, cmd: { t: 'time.setSpeed', speed: 3 } },
        ],
      },
      ctx,
    );
    expect(w.tick).toBe(3);
  });

  it('pauses when either seat pauses', () => {
    const w = flatWorld();
    run(w, { t: 'time.setSpeed', speed: 0 }, 1);
    const tick = w.tick;
    run(w, { t: 'note.pin', x: 2, z: 2, text: 'still' });
    expect(w.tick).toBe(tick);
  });
});

describe('systems and views', () => {
  it('registers the I0 systems and the I1 and I2 slots at their orders', () => {
    const orders = new Map(systems.map((s) => [s.id, s.order]));
    expect([...orders]).toEqual([
      ['achievements', 90],
      ['baskets', 67],
      ['caravans', 65],
      ['charm', 70],
      ['charter', 94],
      ['chronicle', 100],
      ['clock', 10],
      ['construction', 20],
      ['economy', 60],
      ['growth', 26],
      ['innovations', 92],
      ['loans', 66],
      ['logistics', 40],
      ['market', 62],
      ['movement', 52],
      ['patterns', 72],
      ['plans', 97],
      ['production', 30],
      ['requests', 98],
      ['residents', 50],
      ['services', 56],
      ['stories', 96],
      ['tiers', 58],
      ['trade', 64],
      ['traffic', 54],
      ['trees', 30],
      ['wages', 63],
      ['wishes', 74],
      ['zoning', 24],
    ]);
  });

  it('builds a complete view snapshot with copied layers', () => {
    const w = flatWorld();
    run(w, { t: 'build.place', def: 'cottage', x: 50, z: 50, rot: 0 });
    const view = buildView(w);
    expect(view.buildings).toHaveLength(1);
    expect(view.seats.map((s) => s.connected)).toEqual([true, true]);
    expect(view.layers.occupant).not.toBe(w.map.occupant);
    expect(view.layers.occupant).toEqual(w.map.occupant);
    expect(view.clock.speed).toBe(1);
    expect(view.simVersion).toMatch(/^[0-9a-f]{12}$/);
  });
});
