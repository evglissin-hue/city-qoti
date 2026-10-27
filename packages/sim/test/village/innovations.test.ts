// C4C: each I2 innovation fills its notebook bar from what the town does and unlocks in a fixture,
// and what it unlocks becomes buildable (or, for wheelbarrows, porters carry 6). The innovations
// pass is called directly at chosen hours.
import { content, type StoryArc } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, WORK_HOURS } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { hasInnovation } from '../../src/state/village';
import { updateInnovations } from '../../src/systems/innovations';
import { carryOf, WHEELBARROW_CARRY } from '../../src/systems/logistics';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { good, place, villageWith } from './helpers';

/** Sets the clock to `hour`:51 on day `day` (where the hourly pass at offset 170 runs). */
function at(state: WorldState, day: number, hour: number): void {
  state.tick = day * TICKS_PER_DAY + ((hour - START_HOUR + 24) % 24) * TICKS_PER_HOUR + 170;
}

function pass(state: WorldState) {
  const ctx = createTickCtx(state);
  updateInnovations(state, ctx);
  return ctx.events;
}

const progress = (state: WorldState, id: string) => state.innovations.find((i) => i.id === id)!.progress;

describe('innovations', () => {
  it('Brick Kiln: a clay pit worked for two days, then kilns can be built', () => {
    const f = hamletFixture();
    const s = f.state;
    expect(rejection(run(s, { t: 'build.place', def: 'brick-kiln', x: 70, z: 40, rot: 0 }))).toBe('LOCKED');
    s.economy.yesterday.produced[good('clay')] = 12;
    at(s, 1, 0);
    const events = pass(s);
    expect(progress(s, 'brick-kiln')).toBe(50);
    expect(events.some((e) => e.e === 'innovation.updated' && e.i.id === 'brick-kiln')).toBe(true);
    at(s, 1, 5);
    pass(s);
    expect(progress(s, 'brick-kiln')).toBe(50); // counted once a day
    at(s, 2, 0);
    const done = pass(s);
    expect(hasInnovation(s, 'brick-kiln')).toBe(true);
    expect(done.some((e) => e.e === 'innovation.unlocked')).toBe(true);
    expect(done.some((e) => e.e === 'notify' && e.kind === 'innovation')).toBe(true);
    expect(rejection(run(s, { t: 'build.place', def: 'brick-kiln', x: 70, z: 40, rot: 0 }))).toBeUndefined();
  });

  it('Cobbles: twenty stone a day from the quarries', () => {
    const s = hamletFixture().state;
    s.economy.yesterday.produced[good('stone')] = 10;
    at(s, 1, 9);
    pass(s);
    expect(progress(s, 'cobbles')).toBe(50);
    s.economy.yesterday.produced[good('stone')] = 20;
    pass(s);
    expect(hasInnovation(s, 'cobbles')).toBe(true);
    expect(s.hearth.unlocked).toContain('street');
  });

  it('Carts: Village rank and twenty planks a day; never in a Hamlet', () => {
    const hamlet = hamletFixture().state;
    hamlet.economy.yesterday.produced[good('planks')] = 30;
    at(hamlet, 1, 9);
    pass(hamlet);
    expect(hasInnovation(hamlet, 'carts')).toBe(false);
    expect(progress(hamlet, 'carts')).toBe(0);

    const { state } = villageWith();
    expect(rejection(run(state, { t: 'build.place', def: 'cart-shed', x: 44, z: 40, rot: 0 }))).toBe(
      'LOCKED',
    );
    state.economy.yesterday.produced[good('planks')] = 15;
    at(state, 1, 9);
    pass(state);
    expect(progress(state, 'carts')).toBe(75);
    state.economy.yesterday.produced[good('planks')] = 20;
    pass(state);
    expect(hasInnovation(state, 'carts')).toBe(true);
    expect(state.hearth.unlocked).toContain('cart-shed');
    expect(
      rejection(run(state, { t: 'build.place', def: 'cart-shed', x: 44, z: 40, rot: 0 })),
    ).toBeUndefined();
  });

  it('Wheelbarrows: a storehouse whose porters were 80%+ busy for three days; then porters carry 6', () => {
    const { state } = villageWith();
    const store = state.buildings.find((b) => b.def === 'storehouse')!;
    const porters = store.rt!.workers.map((id) => state.residents.find((r) => r.id === id)!);
    expect(carryOf(state, good('planks'))).toBe(4);
    for (let day = 1; day <= 3; day++) {
      for (let h = WORK_HOURS[0]; h <= WORK_HOURS[1]; h++) {
        for (const r of porters)
          r.activity = h < WORK_HOURS[1] ? { kind: 'task', taskId: 1 } : { kind: 'home' };
        at(state, day, h);
        pass(state);
      }
      if (day < 3) expect(hasInnovation(state, 'wheelbarrows'), `day ${day}`).toBe(false);
    }
    // The third day closes at 17:00; the next pass sees the streak.
    at(state, 3, 18);
    pass(state);
    expect(hasInnovation(state, 'wheelbarrows')).toBe(true);
    expect(carryOf(state, good('planks'))).toBe(WHEELBARROW_CARRY);
  });

  it('Wheelbarrows: an idle afternoon breaks the streak', () => {
    const { state } = villageWith();
    const store = state.buildings.find((b) => b.def === 'storehouse')!;
    const porters = store.rt!.workers.map((id) => state.residents.find((r) => r.id === id)!);
    for (let h = WORK_HOURS[0]; h <= WORK_HOURS[1]; h++) {
      for (const r of porters) r.activity = h < 12 ? { kind: 'task', taskId: 1 } : { kind: 'home' };
      at(state, 1, h);
      pass(state);
    }
    expect(state.innovations.find((i) => i.id === 'wheelbarrows')!.counter).toBe(0);
  });

  it("Water Wheel: a sawpit by the river and the story's second step", () => {
    const { state } = villageWith();
    at(state, 1, 9);
    pass(state);
    expect(progress(state, 'water-wheel')).toBe(0);
    place(state, 'sawpit', 96, 90); // two tiles from the river at x 100
    pass(state);
    expect(progress(state, 'water-wheel')).toBe(50);
    // Stand in for C4D's first arc until its stories land.
    const stories = content.stories as StoryArc[];
    const arc = { id: 'test-arc' } as StoryArc;
    stories.unshift(arc);
    try {
      state.stories.push({ arc: arc.id, residentId: state.residents[0]!.id, step: 2, stepTick: 0 });
      pass(state);
      expect(hasInnovation(state, 'water-wheel')).toBe(true);
      expect(state.hearth.unlocked).toContain('sawmill');
    } finally {
      stories.shift();
    }
  });
});
