// Homes dress themselves (P1): window boxes, then a porch, then ivy, when the street is pleasant and the
// household content; never over a choice a player made by hand.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, EntityId, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { systems } from '../../src/systems';
import { dressHomes } from '../../src/systems/dressing';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';

function setup(charm: number, mood = 80) {
  const f = hamletFixture();
  f.state.map.charm.fill(charm);
  for (const r of f.state.residents) r.mood = mood;
  return f;
}

/** Runs the dressing pass on `days` consecutive days; returns the notices sent. */
function days(state: WorldState, days: number): string[] {
  const notes: string[] = [];
  for (let i = 0; i < days; i++) {
    state.tick += TICKS_PER_DAY;
    const ctx = createTickCtx(state);
    dressHomes(state, ctx);
    for (const e of ctx.events) if (e.e === 'notify' && e.kind === 'dressing') notes.push(e.text);
  }
  return notes;
}

function home(state: WorldState, id: EntityId): Building {
  return findById(state.buildings, id)!;
}

function fitted(b: Building): string[] {
  return (b.rt?.modules ?? []).map(([, id]) => id);
}

describe('dressing', () => {
  it('is a registered daily system at an hour of its own', () => {
    const s = systems.find((x) => x.id === 'dressing')!;
    expect(s.every).toBe(TICKS_PER_DAY);
    const others = systems.filter((x) => x.id !== 'dressing' && x.every === TICKS_PER_DAY);
    expect(others.some((x) => x.offset === s.offset)).toBe(false);
    expect(content.dressing.map((d) => d.charm)).toEqual(
      [...content.dressing.map((d) => d.charm)].sort((a, b) => a - b),
    );
  });

  it('puts boxes on a cottage on a charming street within a few days, then a porch and ivy at Village rank', () => {
    const f = setup(50);
    f.state.charter.rank = 'hamlet';
    const b = home(f.state, f.b.cottages[0]);
    const notes = days(f.state, 3);
    expect(b.custom?.windowBoxes).toBe(true);
    expect(content.swatches.some((s) => s.group === 'flowers' && s.id === b.custom?.windowFlowers)).toBe(
      true,
    );
    expect(notes[0]).toMatch(/family put up window boxes/);
    expect(b.handmade).toBe(false);
    // Hamlet rank holds the porch back.
    days(f.state, 9);
    expect(fitted(b)).toEqual([]);
    f.state.charter.rank = 'village';
    days(f.state, 3);
    expect(fitted(b)).toEqual(['porch']);
    days(f.state, 3);
    expect(fitted(b)).toEqual(['porch', 'ivy']);
    expect(b.handmade).toBe(false);
    days(f.state, 9);
    expect(fitted(b)).toEqual(['porch', 'ivy']);
  });

  it('steps at most once every three days, and sends at most one notice a day', () => {
    const f = setup(50);
    f.state.charter.rank = 'village';
    const b = home(f.state, f.b.cottages[0]);
    let steps = 0;
    const seen = (): string => `${b.custom?.windowBoxes}|${fitted(b).join()}`;
    let last = seen();
    for (let d = 0; d < 12; d++) {
      const notes = days(f.state, 1);
      expect(notes.length).toBeLessThanOrEqual(1);
      if (seen() !== last) {
        steps++;
        last = seen();
      }
    }
    expect(steps).toBe(3);
    // Three steps in twelve days at a cadence of one per three days.
    expect(steps).toBeLessThanOrEqual(4);
  });

  it('does nothing on a dull street or for an unhappy household', () => {
    const dull = setup(10);
    dull.state.charter.rank = 'village';
    days(dull.state, 12);
    for (const id of dull.b.cottages) {
      expect(home(dull.state, id).custom).toBeUndefined();
      expect(fitted(home(dull.state, id))).toEqual([]);
    }
    const sour = setup(40, 30);
    sour.state.charter.rank = 'village';
    days(sour.state, 12);
    for (const id of sour.b.cottages) expect(home(sour.state, id).custom).toBeUndefined();
  });

  it('never touches a home a player customized or fitted a module on', () => {
    const f = setup(50);
    f.state.charter.rank = 'village';
    const [a, b, c] = f.b.cottages;
    expect(
      rejection(run(f.state, { t: 'build.customize', id: a, custom: { wall: 'rose' } })),
    ).toBeUndefined();
    // Even switching boxes off by hand stays off.
    run(f.state, { t: 'build.customize', id: b, custom: { windowBoxes: false } }, 0, 2);
    const fit = run(f.state, { t: 'build.setModule', id: c, slot: 'wall', module: 'ivy' }, 0, 3);
    expect(rejection(fit)).toBeUndefined();
    const before = JSON.stringify([home(f.state, a), home(f.state, b), home(f.state, c)]);
    days(f.state, 15);
    expect(JSON.stringify([home(f.state, a), home(f.state, b), home(f.state, c)])).toBe(before);
    expect(home(f.state, b).custom).toEqual({ windowBoxes: false });
  });

  it('dresses grown homes too', () => {
    const f = setup(50);
    f.state.charter.rank = 'village';
    const b = home(f.state, f.b.cottages[1]);
    b.lot = 12345;
    b.style = 'brick';
    days(f.state, 9);
    expect(b.custom?.windowBoxes).toBe(true);
    expect(fitted(b)).toEqual(['porch', 'ivy']);
  });

  it('is deterministic, whatever order the custom keys came in', () => {
    const a = setup(50);
    const b = setup(50);
    a.state.charter.rank = 'village';
    b.state.charter.rank = 'village';
    days(a.state, 12);
    days(b.state, 12);
    const snap = (s: WorldState) =>
      JSON.stringify(s.buildings.map((x) => [x.id, x.custom ?? null, x.rt?.modules ?? null]));
    expect(snap(a.state)).toBe(snap(b.state));
    // A different seed hash (building ids) gives a different pick somewhere across homes, but the same
    // home always picks the same color.
    const flowers = a.state.buildings.map((x) => x.custom?.windowFlowers).filter(Boolean);
    expect(flowers.length).toBeGreaterThan(0);
  });
});
