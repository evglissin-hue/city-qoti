// The first days guide (C5H): each step's goal passes on one fixture and fails on another; the
// system ticks one step an hour, skips the together step for a lone seat, closes on day 6, writes
// its Chronicle line without taking an id, and never moves money or goods. Hiding is per seat.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { GUIDE_LAST_DAY, LEDGER_CATEGORIES, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { createValley, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { startGuide } from '../../src/state/seasons';
import { emptyCounters } from '../../src/state/zones';
import { advanceGuide, guide, stepDone } from '../../src/systems/guide';
import { runningBalance } from '../../src/systems/guide/goals';
import { createTickCtx } from '../../src/turn';
import { buildView } from '../../src/view';
import { guideView } from '../../src/view/seasons';
import { hamletFixture } from '../fixtures/hamlet';
import { placeFree } from '../fixtures/seasonsPlace';
import { rejection, run, S } from '../helpers';

const steps = content.guide.steps;
const at = (id: string) => steps.findIndex((s) => s.id === id);
const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);

/** R1: a market-garden farmstead (3x3), a farm on Farmland. */
function marketGarden(s: WorldState, x: number, z: number): Building {
  const b = placeFree(s, 'farmstead', x, z);
  b.trade = 'market-garden';
  b.keeperId = 0;
  b.counters = emptyCounters();
  return b;
}

/** R1D: a home grown on a lot (lot ids are only read as truthy by the guide). */
function homeOnLot(s: WorldState, x: number, z: number): Building {
  const b = placeFree(s, 'cottage', x, z);
  b.lot = 900 + x;
  return b;
}

/** R1D: Farmland zoned on rich soil, a 3x3 patch at (x, z). */
function richFarmland(s: WorldState, x: number, z: number): void {
  const farms = content.zoneById.get('farms')!.layerValue;
  for (let dz = 0; dz < 3; dz++)
    for (let dx = 0; dx < 3; dx++) {
      s.map.zone[(z + dz) * S + x + dx] = farms;
      s.map.fertility[(z + dz) * S + x + dx] = 80;
    }
}

/** R1D: the town opened a workshop by itself: a baker's business on a lot. */
function grownWorkshop(s: WorldState, x: number, z: number): Building {
  const b = placeFree(s, 'workshop', x, z);
  b.trade = 'baker';
  b.keeperId = 0;
  b.counters = emptyCounters();
  b.lot = 950;
  return b;
}

/** Plenty of Food in the first store: three days and more for everyone. */
function stockFood(s: WorldState): void {
  const store = s.buildings.find(
    (b) => b.rt && content.buildingById.get(b.def)?.tags?.includes('storehouse'),
  )!;
  store.rt!.store[content.goodIndex.get('fish')!] += 10 * s.residents.length;
}

/** The hamlet fixture with the guide open (two seats, standard, at 06:00 on day 1). */
function town() {
  const f = hamletFixture();
  f.state.guide = startGuide(true);
  return f;
}

/**
 * Every goal met: the lane reaches the gate, two homes on lots, rich Farmland, a lodge, a wish,
 * food, a grown workshop, a page, a good day, a plan.
 */
function everythingDone(s: WorldState): void {
  for (let x = 0; x < 40; x++) s.map.road[50 * S + x] = Road.lane;
  homeOnLot(s, 78, 47);
  homeOnLot(s, 78, 40);
  richFarmland(s, 100, 70);
  s.stats.wishesGranted = 1;
  marketGarden(s, 80, 52).rt!.workers.push(s.residents[0]!.id);
  stockFood(s);
  grownWorkshop(s, 86, 40);
  // The fixture's Forester's Lodge stands already.
  s.hearth.discovered.push({
    pattern: content.patterns[0]!.id,
    tick: 0,
    seat: 0,
    together: false,
    anchor: 0,
  });
  s.economy.yesterday.money[cat('taxes')] = 900;
  s.village.plansApproved = 1;
}

describe('the first days guide: each goal', () => {
  it('has ten steps in the brief order, a letter, a hint and lanes for both players', () => {
    // R1D: the letters for the zones-first first days (02-game-overview.md, From R1).
    expect(steps.map((s) => s.id)).toEqual([
      'lane-to-gate',
      'first-homes',
      'farmland',
      'timber',
      'first-wish',
      'food-in-store',
      'first-workshop',
      'first-pattern',
      'in-the-black',
      'together',
    ]);
    for (const s of steps) {
      const lines = s.letter.split('\n');
      expect(lines.length, s.id).toBeGreaterThanOrEqual(4);
      expect(lines.length, s.id).toBeLessThanOrEqual(6);
      expect(lines[0], s.id).toMatch(/^Dear /);
      expect(s.hint.length, s.id).toBeGreaterThan(0);
      for (const t of [s.letter, s.hint]) expect(t, s.id).not.toMatch(/—/);
    }
    expect(new Set(steps.map((s) => s.lens))).toEqual(new Set(['hearth', 'ledger', 'both']));
    expect(content.guide.farewell).toMatch(/Pippa Quill/);
    expect(content.guide.farewellAfterPippa).toMatch(/Pippa Quill/);
  });

  it('lane-to-gate: a workplace door on a road that runs to the gate, not the founding lane alone', () => {
    const { state } = town();
    // The fixture's lane stops at x 40; the gate is at x 0 on the same row.
    expect(stepDone(state, at('lane-to-gate'))).toBe(false);
    for (let x = 0; x < 40; x++) state.map.road[50 * S + x] = Road.lane;
    expect(stepDone(state, at('lane-to-gate'))).toBe(true);
    // The town hall and storehouse alone do not count.
    const solo = town().state;
    for (let x = 0; x < 40; x++) solo.map.road[50 * S + x] = Road.lane;
    solo.buildings = solo.buildings.filter((b) => b.def === 'town-hall' || b.def === 'storehouse');
    expect(stepDone(solo, at('lane-to-gate'))).toBe(false);
  });

  it('first-homes: two homes built on zoned lots; a cottage by hand does not count', () => {
    const { state } = town();
    expect(stepDone(state, at('first-homes'))).toBe(false);
    placeFree(state, 'cottage', 78, 40);
    homeOnLot(state, 78, 47);
    expect(stepDone(state, at('first-homes'))).toBe(false);
    const site = homeOnLot(state, 82, 40);
    site.stage = 'construction';
    expect(stepDone(state, at('first-homes'))).toBe(false);
    site.stage = 'built';
    expect(stepDone(state, at('first-homes'))).toBe(true);
  });

  it('farmland: nine tiles of Farmland on rich soil', () => {
    const { state } = town();
    expect(stepDone(state, at('farmland'))).toBe(false);
    richFarmland(state, 100, 70);
    expect(stepDone(state, at('farmland'))).toBe(true);
    for (let z = 70; z < 73; z++) state.map.fertility[z * S + 100] = 5;
    expect(stepDone(state, at('farmland'))).toBe(false);
  });

  it('first-workshop: a workshop the town opened by itself', () => {
    const { state } = town();
    state.buildings = state.buildings.filter((b) => !(b.def === 'workshop' && b.lot));
    expect(stepDone(state, at('first-workshop'))).toBe(false);
    const w = grownWorkshop(state, 86, 40);
    w.lot = undefined;
    expect(stepDone(state, at('first-workshop'))).toBe(false);
    w.lot = 950;
    expect(stepDone(state, at('first-workshop'))).toBe(true);
  });

  it('first-wish: a wish granted', () => {
    const { state } = town();
    expect(stepDone(state, at('first-wish'))).toBe(false);
    state.stats.wishesGranted = 1;
    expect(stepDone(state, at('first-wish'))).toBe(true);
  });

  it('food-in-store: a farm or a fishery worked and three days of Food in store', () => {
    const { state } = town();
    stockFood(state);
    expect(stepDone(state, at('food-in-store'))).toBe(false);
    const plot = marketGarden(state, 80, 52);
    expect(stepDone(state, at('food-in-store'))).toBe(false);
    plot.rt!.workers.push(state.residents[0]!.id);
    expect(stepDone(state, at('food-in-store'))).toBe(true);
    plot.rt!.workers.length = 0;
    const fishery = placeFree(state, 'fishery', 97, 60);
    expect(stepDone(state, at('food-in-store'))).toBe(false);
    fishery.rt!.workers.push(state.residents[0]!.id);
    expect(stepDone(state, at('food-in-store'))).toBe(true);
    // Worked, but the stores are bare.
    for (const b of state.buildings) {
      b.rt?.store.fill(0);
      b.rt?.output.fill(0);
    }
    expect(stepDone(state, at('food-in-store'))).toBe(false);
  });

  it("timber: a Forester's Lodge built", () => {
    const f = town();
    const state = f.state;
    // Without the fixture's lodge.
    state.buildings = state.buildings.filter((b) => b.id !== f.b.sawpit);
    expect(stepDone(state, at('timber'))).toBe(false);
    const lodge = placeFree(state, 'foresters-lodge', 85, 52);
    lodge.stage = 'construction';
    expect(stepDone(state, at('timber'))).toBe(false);
    lodge.stage = 'built';
    expect(stepDone(state, at('timber'))).toBe(true);
  });

  it('first-pattern: a Pattern Book page', () => {
    const { state } = town();
    expect(stepDone(state, at('first-pattern'))).toBe(false);
    state.hearth.discovered.push({
      pattern: content.patterns[0]!.id,
      tick: 0,
      seat: 0,
      together: false,
      anchor: 0,
    });
    expect(stepDone(state, at('first-pattern'))).toBe(true);
  });

  it('in-the-black: yesterday took in more than it cost to run; building is left out', () => {
    const { state } = town();
    const m = state.economy.yesterday.money;
    expect(stepDone(state, at('in-the-black'))).toBe(false);
    m[cat('taxes')] = 500;
    m[cat('upkeep')] = 100;
    m[cat('construction')] = 5000;
    expect(runningBalance(m)).toBe(400);
    expect(stepDone(state, at('in-the-black'))).toBe(true);
    m[cat('wages')] = 450;
    expect(stepDone(state, at('in-the-black'))).toBe(false);
  });

  it('together: a plan approved or a request filled, skipped when only one seat ever came', () => {
    const { state } = town();
    expect(stepDone(state, at('together'))).toBe(false);
    state.village.requestsFulfilled = 1;
    expect(stepDone(state, at('together'))).toBe(true);
    state.village.requestsFulfilled = 0;
    state.village.plansApproved = 1;
    expect(stepDone(state, at('together'))).toBe(true);
    const solo = town().state;
    solo.seats = solo.seats.slice(0, 1);
    expect(stepDone(solo, at('together'))).toBe(true);
  });
});

describe('the first days guide: the system', () => {
  it('opens one step an hour, in order, and ends with a farewell and a Chronicle line', () => {
    const { state } = town();
    everythingDone(state);
    const money = state.economy.treasury;
    const stock = state.buildings.map((b) => [...(b.rt?.store ?? [])]);
    const nextId = state.nextId;
    const seen: number[] = [];
    for (let h = 0; h < steps.length + 2; h++) {
      const ctx = createTickCtx(state);
      advanceGuide(state, ctx);
      for (const e of ctx.events) if (e.e === 'guide.step') seen.push(e.g.step);
      state.tick += TICKS_PER_HOUR;
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.guide.over).toBe(true);
    expect(state.guide.doneTicks).toHaveLength(steps.length);
    // Nothing paid, nothing given, no id taken.
    expect(state.economy.treasury).toBe(money);
    expect(state.buildings.map((b) => [...(b.rt?.store ?? [])])).toEqual(stock);
    expect(state.nextId).toBe(nextId);
    const line = state.chronicle.at(-1)!;
    expect(line.kind).toBe('guide-done');
    expect(line.text).toMatch(/Tobias Merriweather/);
    expect(line.id).toBe(nextId - 0.5);
    const view = guideView(state);
    expect(view).toMatchObject({ id: 'farewell', over: true, step: steps.length });
    expect(view.letter).toBe(content.guide.farewell);
  });

  it('a later step met early ticks when its turn comes; an unmet step waits', () => {
    const { state } = town();
    state.stats.wishesGranted = 1; // the wish step, early
    const ctx = createTickCtx(state);
    expect(advanceGuide(state, ctx)).toBe(false);
    expect(ctx.events).toHaveLength(0);
    for (let x = 0; x < 40; x++) state.map.road[50 * S + x] = Road.lane;
    expect(advanceGuide(state, ctx)).toBe(true);
    homeOnLot(state, 78, 47);
    homeOnLot(state, 78, 40);
    expect(advanceGuide(state, ctx)).toBe(true);
    // Farmland is not zoned yet: the guide waits there although the wish was granted long ago.
    expect(advanceGuide(state, ctx)).toBe(false);
    expect(state.guide.step).toBe(at('farmland'));
  });

  it('the farewell says so when Pippa Quill is already in the valley', () => {
    const { state } = town();
    everythingDone(state);
    const inventor = state.stories.find((s) => s.arc === 'inventor');
    if (inventor) inventor.residentId = state.residents[0]!.id;
    else
      state.stories.push({
        arc: 'inventor',
        residentId: state.residents[0]!.id,
        step: 0,
        stepTick: 0,
      } as never);
    for (let h = 0; h < steps.length; h++) advanceGuide(state, createTickCtx(state));
    expect(guideView(state).letter).toBe(content.guide.farewellAfterPippa);
  });

  it('closes on day 6 wherever it stands, and is quiet after', () => {
    const { state } = town();
    state.tick = GUIDE_LAST_DAY * TICKS_PER_DAY;
    const ctx = createTickCtx(state);
    expect(advanceGuide(state, ctx)).toBe(true);
    expect(state.guide.over).toBe(true);
    expect(ctx.events).toContainEqual(expect.objectContaining({ e: 'guide.step' }));
    expect(state.chronicle.some((c) => c.kind === 'guide-done')).toBe(false);
    everythingDone(state);
    const later = createTickCtx(state);
    expect(advanceGuide(state, later)).toBe(false);
    expect(later.events).toHaveLength(0);
    expect(buildView(state).town?.guide).toBeUndefined();
  });

  it('does nothing in sandbox valleys or with the box unticked', () => {
    const sandbox = createValley('meadow', defaultSettings());
    const ctx = createTickCtx(sandbox);
    guide.tick(sandbox, ctx);
    expect(ctx.events).toHaveLength(0);
    const off = createValley('meadow', { ...defaultSettings(), mode: 'standard', guide: false });
    expect(off.guide.over).toBe(true);
    expect(advanceGuide(off, createTickCtx(off))).toBe(false);
    expect(buildView(off).town?.guide).toBeUndefined();
  });

  it('saves and loads with the half-step Chronicle id in place, hashing the same', () => {
    const { state } = town();
    everythingDone(state);
    for (let h = 0; h < steps.length; h++) {
      advanceGuide(state, createTickCtx(state));
      state.tick += TICKS_PER_HOUR;
    }
    // Something written after the guide's line keeps its place after a load.
    state.chronicle.push({
      id: state.nextId++,
      tick: state.tick,
      kind: 'founding',
      text: 'later',
      refs: [],
      seats: [],
    });
    const loaded = deserialize(serialize(state));
    expect(loaded.chronicle.map((c) => c.kind)).toEqual(state.chronicle.map((c) => c.kind));
    expect(hashState(loaded)).toBe(hashState(state));
  });

  it('hides per seat; progress is shared', () => {
    const { state } = town();
    expect(rejection(run(state, { t: 'guide.setHidden', on: true }, 1))).toBeUndefined();
    expect(state.guide.hidden.slice(0, 2)).toEqual([false, true]);
    expect(state.guide.step).toBe(0);
    expect(rejection(run(state, { t: 'guide.setHidden', on: false }, 1))).toBeUndefined();
    expect(state.guide.hidden[1]).toBe(false);
  });
});

// R1: the v3 to v4 migration is gone with every migration before version 6 (an older valley is
// refused), so this checks the over flag it set, not the migration.
describe('a guide that is over', () => {
  it('never shows again, even when every goal holds', () => {
    const s = town().state;
    s.guide.over = true;
    everythingDone(s);
    for (let h = 0; h < 30; h++) {
      const ctx = createTickCtx(s);
      guide.tick(s, ctx);
      expect(ctx.events.filter((e) => e.e === 'guide.step')).toHaveLength(0);
      s.tick += TICKS_PER_HOUR;
    }
    expect(buildView(s).town).toBeDefined();
    expect(buildView(s).town?.guide).toBeUndefined();
  });
});
