// R1B: the innovations open specialized buildings and capabilities (docs/spec/13-ledger.md, Land and
// specialized buildings; 15-progression.md, Innovations): what each measure counts, and the Seed
// Drill's same-day sowing.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { hasInnovation } from '../../src/state/village';
import { updateInnovations } from '../../src/systems/innovations';
import { carryOf } from '../../src/systems/logistics';
import { CROP_RIPE, HARVEST_MIN, RESOW_SAME_DAY, tendFields } from '../../src/systems/production/fields';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { good, place, villageWith } from '../village/helpers';

function at(state: WorldState, day: number, hour: number): void {
  state.tick = day * TICKS_PER_DAY + ((hour - START_HOUR + 24) % 24) * TICKS_PER_HOUR + 170;
}

function pass(state: WorldState): void {
  updateInnovations(state, createTickCtx(state));
}

const counter = (state: WorldState, id: string) => state.innovations.find((i) => i.id === id)!.counter;

describe('what the measures count', () => {
  it('a quarry day needs hands at work and stone cut that day, not stone from anywhere', () => {
    const s = hamletFixture().state;
    const quarry = place(s, 'quarry', 120, 40);
    s.economy.yesterday.produced[good('stone')] = 30;
    quarry.rt!.producedToday[good('stone')] = 6;
    at(s, 1, 23);
    pass(s);
    expect(counter(s, 'brick-kiln')).toBe(0); // nobody at the quarry
    quarry.rt!.workers.push(s.residents[0]!.id);
    pass(s);
    expect(counter(s, 'brick-kiln')).toBe(1);
  });

  it('a lodge day by the river counts firewood as well as timber, and a lodge far from the river counts nothing', () => {
    const { state } = villageWith();
    const far = place(state, 'foresters-lodge', 60, 90);
    const near = place(state, 'foresters-lodge', 96, 94); // by the river at x 100
    far.rt!.producedToday[good('timber')] = 8;
    at(state, 1, 23);
    pass(state);
    expect(counter(state, 'water-wheel')).toBe(0);
    near.rt!.producedToday[good('firewood')] = 6;
    pass(state);
    expect(counter(state, 'water-wheel')).toBe(1);
  });

  it('Carts count timber made a day (Village rank)', () => {
    const { state } = villageWith();
    state.economy.yesterday.produced[good('timber')] = 20;
    at(state, 1, 9);
    pass(state);
    expect(hasInnovation(state, 'carts')).toBe(true);
    expect(state.hearth.unlocked).toContain('cart-shed');
  });

  it('Wheelbarrows raise a porter load to 8 once unlocked', () => {
    const { state } = villageWith();
    expect(carryOf(state, good('timber'))).toBe(4);
    state.hearth.unlocked.push('porter-carry-8');
    expect(carryOf(state, good('timber'))).toBe(8);
  });

  it('the specialized buildings are each opened by an innovation, none by a story alone', () => {
    const opens = new Map<string, string>();
    for (const i of content.innovations) for (const u of i.unlocks) opens.set(u, i.id);
    expect(opens.get('brickworks')).toBe('brick-kiln');
    expect(opens.get('sawmill')).toBe('water-wheel');
    expect(opens.get('cart-shed')).toBe('carts');
    expect(opens.get('street')).toBe('cobbles');
    expect(opens.get('porter-carry-8')).toBe('wheelbarrows');
    const wheel = content.innovationById.get('water-wheel')!.condition;
    expect(JSON.stringify(wheel)).toContain('lodgeByRiver');
  });
});

describe('the Seed Drill', () => {
  it('opens on three grain farms and a windmill', () => {
    const { state } = villageWith();
    at(state, 1, 9);
    pass(state);
    expect(hasInnovation(state, 'seed-drill')).toBe(false);
    place(state, 'windmill', 40, 34);
    for (const x of [60, 66, 72]) place(state, 'farmstead', x, 34, 0, 'grain-farm');
    pass(state);
    expect(hasInnovation(state, 'seed-drill')).toBe(true);
    expect(state.hearth.unlocked).toContain(RESOW_SAME_DAY);
  });

  function cutField(unlocked: boolean) {
    const f = hamletFixture();
    const farm = place(f.state, 'farmstead', 130, 120, 0, 'grain-farm');
    const def = content.buildingById.get('farmstead')!;
    const tile = 118 * MAP_SIZE + 128;
    const m = f.state.map;
    m.fieldOwner[tile] = farm.id;
    m.fertility[tile] = 60;
    // One bite from bare: golden, with one step left to cut.
    m.crop[tile] = HARVEST_MIN + 2;
    if (unlocked) f.state.hearth.unlocked.push(RESOW_SAME_DAY);
    return { f, farm, def, tile };
  }

  function cut(
    f: ReturnType<typeof hamletFixture>,
    farm: ReturnType<typeof place>,
    def: never,
    tick: number,
  ) {
    f.state.tick = tick;
    const g = good('grain');
    tendFields(f.state, createTickCtx(f.state), farm, def, 100, g);
  }

  it('with the unlock, a tile cut bare inside the sowing window is sown the same day', () => {
    const { f, farm, def, tile } = cutField(true);
    cut(f, farm, def as never, tickAt(0, 1, 2, 9)); // Summer day 2: harvest and sowing both open
    expect(f.state.map.crop[tile]).toBe(1);
    expect(farm.rt!.output[good('grain')]).toBe(2);
  });

  it('without it, the same tile stays bare', () => {
    const { f, farm, def, tile } = cutField(false);
    cut(f, farm, def as never, tickAt(0, 1, 2, 9));
    expect(f.state.map.crop[tile]).toBe(0);
  });

  it('with the unlock, a tile cut after the window shuts stays bare', () => {
    const { f, farm, def, tile } = cutField(true);
    cut(f, farm, def as never, tickAt(0, 1, 5, 9)); // Summer day 5: past the sowing window
    expect(f.state.map.crop[tile]).toBe(0);
    expect(CROP_RIPE).toBeGreaterThan(HARVEST_MIN);
  });
});
