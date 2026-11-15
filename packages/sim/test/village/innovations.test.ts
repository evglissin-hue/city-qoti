// C4C: each I2 innovation fills its notebook bar from what the town does and unlocks in a fixture,
// and what it unlocks becomes buildable (or, for wheelbarrows, porters carry 8). The innovations
// pass is called directly at chosen hours. R1: the Brick Kiln follows a worked quarry and opens the
// Brickworks, Carts count timber, the Water Wheel a Forester's Lodge by the river.
import { describe, expect, it } from 'vitest';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, WORK_HOURS } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Deposit } from '../../src/map/layers';
import { hasInnovation } from '../../src/state/village';
import { countsAsBuilt, hasBuilt } from '../../src/systems/innovations/api';
import { updateInnovations } from '../../src/systems/innovations';
import { carryOf, WHEELBARROW_CARRY } from '../../src/systems/logistics';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run, S } from '../helpers';
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
  it('Brick Kiln: a quarry worked for two days, then the Brickworks can be built', () => {
    const f = hamletFixture();
    const s = f.state;
    // Clay under the Brickworks' spot (it wants two tiles of it).
    for (let z = 40; z < 43; z++) for (let x = 70; x < 73; x++) s.map.deposit[z * S + x] = Deposit.clay;
    const cmd = { t: 'build.place', def: 'brickworks', x: 70, z: 40, rot: 0 } as const;
    expect(rejection(run(s, cmd))).toBe('LOCKED');
    // R1B: a day counts when a quarry with hands cut stone that day (counted at 23:00).
    const quarry = place(s, 'quarry', 120, 40);
    quarry.rt!.workers.push(s.residents[0]!.id);
    at(s, 1, 23);
    pass(s);
    expect(progress(s, 'brick-kiln')).toBe(0); // no stone cut yet
    quarry.rt!.producedToday[good('stone')] = 12;
    const events = pass(s);
    expect(progress(s, 'brick-kiln')).toBe(50);
    expect(events.some((e) => e.e === 'innovation.updated' && e.i.id === 'brick-kiln')).toBe(true);
    at(s, 1, 5);
    pass(s);
    expect(progress(s, 'brick-kiln')).toBe(50); // counted once a day
    at(s, 2, 23);
    const done = pass(s);
    expect(hasInnovation(s, 'brick-kiln')).toBe(true);
    expect(done.some((e) => e.e === 'innovation.unlocked')).toBe(true);
    expect(done.some((e) => e.e === 'notify' && e.kind === 'innovation')).toBe(true);
    expect(rejection(run(s, cmd))).toBeUndefined();
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

  it('Carts: Village rank and twenty timber a day; never in a Hamlet', () => {
    const hamlet = hamletFixture().state;
    hamlet.economy.yesterday.produced[good('timber')] = 30;
    at(hamlet, 1, 9);
    pass(hamlet);
    expect(hasInnovation(hamlet, 'carts')).toBe(false);
    expect(progress(hamlet, 'carts')).toBe(0);

    const { state } = villageWith();
    expect(rejection(run(state, { t: 'build.place', def: 'cart-shed', x: 88, z: 47, rot: 0 }))).toBe(
      'LOCKED',
    );
    state.economy.yesterday.produced[good('timber')] = 15;
    at(state, 1, 9);
    pass(state);
    expect(progress(state, 'carts')).toBe(75);
    state.economy.yesterday.produced[good('timber')] = 20;
    pass(state);
    expect(hasInnovation(state, 'carts')).toBe(true);
    expect(state.hearth.unlocked).toContain('cart-shed');
    expect(
      rejection(run(state, { t: 'build.place', def: 'cart-shed', x: 88, z: 47, rot: 0 })),
    ).toBeUndefined();
  });

  it('Wheelbarrows: a storehouse whose porters were 80%+ busy for three days; then porters carry 8', () => {
    const { state } = villageWith();
    const store = state.buildings.find((b) => b.def === 'storehouse')!;
    const porters = store.rt!.workers.map((id) => state.residents.find((r) => r.id === id)!);
    expect(carryOf(state, good('timber'))).toBe(4);
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
    expect(WHEELBARROW_CARRY).toBe(8);
    expect(carryOf(state, good('timber'))).toBe(WHEELBARROW_CARRY);
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

  it("Water Wheel: a Forester's Lodge by the river, three days felling, or the story's second step", () => {
    const { state } = villageWith();
    at(state, 1, 9);
    pass(state);
    expect(progress(state, 'water-wheel')).toBe(0);
    const lodge = place(state, 'foresters-lodge', 96, 90); // two tiles from the river at x 100
    // A day of felling (timber or firewood) counts at 23:00: one day of three.
    lodge.rt!.producedToday[good('firewood')] = 6;
    at(state, 2, 23);
    pass(state);
    expect(progress(state, 'water-wheel')).toBe(33);
    // C5.0: the condition names Pippa's arc by id ('inventor'), wherever it sits in the list.
    const s = state.stories.find((x) => x.arc === 'inventor')!;
    s.residentId = state.residents[0]!.id;
    s.step = 2;
    pass(state);
    expect(hasInnovation(state, 'water-wheel')).toBe(true);
    expect(state.hearth.unlocked).toContain('sawmill');
  });
});

describe('requires.built', () => {
  it('counts upgrades: a cottage that became a townhouse is still one of the four', () => {
    expect(countsAsBuilt('cottage', 'cottage')).toBe(true);
    expect(countsAsBuilt('townhouse', 'cottage')).toBe(true);
    expect(countsAsBuilt('cottage', 'townhouse')).toBe(false);
    expect(countsAsBuilt('farmstead', 'cottage')).toBe(false);
    const s = hamletFixture().state;
    const cottages = s.buildings.filter((b) => b.def === 'cottage' && b.stage === 'built');
    const need = cottages.length;
    expect(hasBuilt(s, [['cottage', need]])).toBe(true);
    cottages[0]!.def = 'townhouse';
    expect(hasBuilt(s, [['cottage', need]])).toBe(true);
    cottages[0]!.stage = 'construction';
    expect(hasBuilt(s, [['cottage', need]])).toBe(false);
  });
});
