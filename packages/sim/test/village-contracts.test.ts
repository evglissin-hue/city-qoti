// I2 contracts (C4.0): the village fixture, the money invariant, the cross-track APIs and the
// command baselines every I2 track builds on. R1.0 dropped the save version 3 migration (version 6
// refuses older valleys), standing orders and method pinning (a business pins its trade).
import { content, type StoryArc } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  AGENT_STRIDE,
  AgentAnim,
  LEDGER_CATEGORIES,
  MAP_SIZE,
  PENNIES_PER_COIN,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../src/constants';
import type { Cart, WorldState } from '../src/contracts';
import { withoutNightHurry } from '../src/speed';
import { createValley, defaultSettings } from '../src/state/create';
import { findById } from '../src/state/entities';
import { hashState } from '../src/state/hash';
import { deserialize, serialize } from '../src/state/serialize';
import { pay } from '../src/systems/economy/money';
import { growLot } from '../src/systems/growth/api';
import { unlockInnovation } from '../src/systems/innovations/api';
import { buy, priceOf, sell, tillPrice } from '../src/systems/market/api';
import { storyStep } from '../src/systems/stories/api';
import { cartAt, cartRoute, requestCartMove } from '../src/systems/traffic/api';
import { advanceTo, createTickCtx } from '../src/turn';
import { buildView } from '../src/view';
import { agentFrame } from '../src/view/agents';
import { inspect } from '../src/view/inspect';
import { hamletFixture } from './fixtures/hamlet';
import { villageFixture } from './fixtures/village';
import { flatWorld, rejection, run, S } from './helpers';
import { expectMoneyInvariant, moneySnapshot } from './money';

const standard = () => ({ ...defaultSettings(), mode: 'standard' as const });
const good = (id: string) => content.goodIndex.get(id)!;

describe('village fixture', () => {
  it('builds the same village every time, about 60 residents at Village rank', () => {
    const a = villageFixture();
    const b = villageFixture();
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.residents).toHaveLength(60);
    expect(a.state.households).toHaveLength(15);
    expect(a.craftsfolk).toHaveLength(4);
    expect(a.state.residents.filter((r) => r.tier === 'craftsfolk')).toHaveLength(16);
    expect(a.state.charter.rank).toBe('village');
    expect(a.state.lots).toHaveLength(11);
    expect(findById(a.state.lots, a.lots.homes[0]!)!.buildingId).toBe(a.b.grown);
    expect(findById(a.state.buildings, a.b.grown)!.lot).toBe(a.lots.homes[0]);
    for (const list of [a.state.buildings, a.state.residents, a.state.households, a.state.lots]) {
      expect(list.map((x) => x.id)).toEqual([...list.map((x) => x.id)].sort((p, q) => p - q));
    }
  });

  it('round trips through serialize with the same hash', () => {
    const { state } = villageFixture();
    const back = deserialize(serialize(state));
    expect(hashState(back)).toBe(hashState(state));
    expect(back.map.lot).toBeInstanceOf(Int32Array);
    expect(back.plans[0]!.items[0]!.cmd.t).toBe('decor.place');
  });

  it('runs a day without trouble and keeps the money invariant', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const ctx = createTickCtx(state);
    withoutNightHurry(() => advanceTo(state, TICKS_PER_DAY, ctx));
    expect(state.tick).toBe(TICKS_PER_DAY);
    expectMoneyInvariant(before, state);
    // The market pass rolled the day: demand moved on and today's prices joined the history.
    expect(state.market.history.length).toBe(6);
  });

  it('gives a full view snapshot with the I2 slices', () => {
    const { state } = villageFixture();
    const view = buildView(state);
    expect(view.market!.lines).toHaveLength(content.goods.length);
    expect(view.market!.lines.find((l) => l.good === 'bread')!.history).toHaveLength(5);
    expect(view.lots).toHaveLength(11);
    expect(view.lots![0]!.zone).toBe('shops');
    expect(view.trade!.neighbors.map((n) => n.id)).toEqual(['millhaven', 'stonecross']);
    expect(view.loans!.owed).toBe(100 * PENNIES_PER_COIN);
    expect(view.charter!.rank).toBe('village');
    expect(view.innovations!.find((i) => i.id === 'cobbles')!.unlocked).toBe(true);
    expect(view.plans![0]!.name).toBe('A bench by the well');
    expect(view.requests![0]!.text).toContain('cheese');
    expect(view.town!.rank).toBe('village');
    expect(view.town!.tiers).toEqual([44, 16, 0, 0]);
  });
});

describe('money', () => {
  it('pay moves money between purses and keeps the invariant; book counts the outside', () => {
    const f = villageFixture();
    const s = f.state;
    const h = f.households[0]!;
    const before = moneySnapshot(s);
    const savings = findById(s.households, h)!.savings;
    expect(pay(s, 'treasury', { household: h }, 500, 'wages')).toBe(500);
    expect(findById(s.households, h)!.savings).toBe(savings + 500);
    expect(pay(s, { household: h }, 'treasury', 10_000_000, 'sales')).toBe(savings + 500);
    expect(findById(s.households, h)!.savings).toBe(0);
    pay(s, 'outside', 'treasury', 700, 'exports');
    pay(s, 'treasury', 'outside', 200, 'imports');
    expectMoneyInvariant(before, s);
    expect(s.economy.external).toBe(before.external + 500);
    const wages = LEDGER_CATEGORIES.findIndex((c) => c.id === 'wages');
    expect(s.economy.today.money[wages]).toBe(500);
  });

  it('a household buys at the till price from an outlet, into its pantry', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const h = f.households[0]!;
    const bread = good('bread');
    expect(priceOf(s, bread)).toBe(260);
    s.levers.priceCaps[bread] = 240;
    s.levers.subsidies[bread] = 25;
    expect(tillPrice(s, bread)).toBe(180);
    const pantry = findById(s.households, h)!.pantry[bread]!;
    expect(buy(s, h, bread, 4, f.b.stalls[0])).toBe(4);
    expect(findById(s.households, h)!.pantry[bread]).toBe(pantry + 4);
    expect(findById(s.households, h)!.savings).toBe(20 * PENNIES_PER_COIN - 720);
    expect(findById(s.buildings, f.b.stalls[0])!.rt!.store[bread]).toBe(8);
    expect(s.market.demandToday[bread]).toBe(4);
    expect(sell(s, h, bread, 1, f.b.stalls[0])).toBe(1);
    expectMoneyInvariant(before, s);
  });

  it('every I1 path through book() keeps the invariant (taxes, upkeep, construction)', () => {
    const f = hamletFixture();
    const before = moneySnapshot(f.state);
    run(f.state, { t: 'build.place', def: 'cottage', x: 80, z: 52, rot: 0 });
    const ctx = createTickCtx(f.state);
    advanceTo(f.state, TICKS_PER_DAY + 10, ctx);
    expectMoneyInvariant(before, f.state);
  });
});

describe('I2 commands', () => {
  it('zones tiles at Village rank, skipping roads, and clears empty lots with the zone', () => {
    const f = villageFixture();
    const s = f.state;
    let ctx = run(s, {
      t: 'zone.paint',
      zone: 'crafts',
      tiles: [
        [70, 60],
        [71, 60],
        [64, 60],
      ],
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(s.map.zone[60 * S + 70]).toBe(4);
    expect(s.map.zone[60 * S + 64]).toBe(0);
    const lot = findById(s.lots, f.lots.homes[1]!)!;
    ctx = run(s, { t: 'zone.clear', tiles: [[lot.x, lot.z]] });
    expect(findById(s.lots, lot.id)).toBeUndefined();
    expect(s.map.lot[lot.z * S + lot.x]).toBe(0);
    expect(ctx.events.some((e) => e.e === 'lot.removed')).toBe(true);
    // The grown cottage's lot stays.
    const first = findById(s.lots, f.lots.homes[0]!)!;
    run(s, { t: 'zone.clear', tiles: [[first.x, first.z]] });
    expect(findById(s.lots, first.id)).toBeDefined();
  });

  it('refuses zoning before the Village rank and in sandbox valleys', () => {
    const h = hamletFixture();
    expect(rejection(run(h.state, { t: 'zone.paint', zone: 'shops', tiles: [[70, 60]] }))).toBe('LOCKED');
    const w = flatWorld();
    expect(rejection(run(w, { t: 'zone.paint', zone: 'shops', tiles: [[70, 60]] }))).toBe('NOT_ALLOWED');
  });

  it('sets wage level, tax and price caps within their ranges', () => {
    const { state } = villageFixture();
    expect(rejection(run(state, { t: 'ledger.setWageLevel', percent: 130 }))).toBe('INVALID');
    run(state, { t: 'ledger.setWageLevel', percent: 110 });
    run(state, { t: 'ledger.setTaxRate', percent: 15 });
    expect(state.levers.wageLevel).toBe(110);
    expect(state.levers.taxRate).toBe(15);
    expect(rejection(run(state, { t: 'ledger.setPriceCap', good: 'timber', cap: 100, subsidy: 0 }))).toBe(
      'INVALID',
    );
    run(state, { t: 'ledger.setPriceCap', good: 'bread', cap: 250, subsidy: 10 });
    expect(state.levers.priceCaps[good('bread')]).toBe(250);
  });

  it('takes and repays loans through the County Bank, money crossing the edge', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    const treasury = state.economy.treasury;
    run(state, { t: 'loan.take', coins: 200 });
    expect(state.economy.treasury).toBe(treasury + 200 * PENNIES_PER_COIN);
    expect(rejection(run(state, { t: 'loan.take', coins: 100_000 }))).toBe('CREDIT_LIMIT');
    const loan = state.loans.loans[1]!;
    run(state, { t: 'loan.repay', id: loan.id, coins: 500 });
    expect(findById(state.loans.loans, loan.id)).toBeUndefined();
    expectMoneyInvariant(before, state);
  });

  it('adds, comments on and approves a plan, running its commands where still valid', () => {
    const { state } = villageFixture();
    run(
      state,
      {
        t: 'plan.add',
        name: 'Benches',
        items: [
          { cmd: { t: 'decor.place', def: 'bench', fx: 70 * 256 + 128, fz: 58 * 256 + 128, rot: 0 } },
          { cmd: { t: 'decor.place', def: 'bench', fx: 100 * 256 + 128, fz: 58 * 256 + 128, rot: 0 } },
        ],
      },
      1,
    );
    const p = state.plans[state.plans.length - 1]!;
    expect(p.seenBy).toEqual([1]);
    expect(
      rejection(run(state, { t: 'plan.add', name: 'Nope', items: [{ cmd: { t: 'charter.claim' } }] })),
    ).toBe('INVALID');
    run(state, { t: 'plan.comment', id: p.id, text: 'Lovely.' }, 0);
    expect(p.seenBy).toEqual([1, 0]);
    const decor = state.decor.length;
    const ctx = run(state, { t: 'plan.approve', id: p.id }, 0);
    expect(p.status).toBe('approved');
    expect([p.applied, p.skipped]).toEqual([1, 1]);
    expect(state.decor.length).toBe(decor + 1);
    expect(ctx.events.some((e) => e.e === 'plan.updated')).toBe(true);
    expect(state.village.plansApproved).toBe(1);
    run(state, { t: 'plan.remove', id: p.id });
    expect(findById(state.plans, p.id)).toBeUndefined();
  });

  it('adds and resolves requests, counting the fulfilled ones', () => {
    const f = villageFixture();
    const s = f.state;
    run(s, { t: 'request.add', ask: { kind: 'charm', x: 60, z: 60, radius: 4, target: 40 } }, 1);
    expect(s.requests).toHaveLength(2);
    run(s, { t: 'request.resolve', id: f.request, status: 'done' });
    expect(findById(s.requests, f.request)!.status).toBe('done');
    expect(s.village.requestsFulfilled).toBe(1);
    expect(rejection(run(s, { t: 'request.resolve', id: f.request, status: 'done' }))).toBe('NOT_FOUND');
  });

  it('counts the Charter hourly and grants the rank on the claim', () => {
    const f = hamletFixture();
    const s = f.state;
    expect(rejection(run(s, { t: 'charter.claim' }))).toBe('NOT_READY');
    // Meet every Village goal by hand.
    s.stats.wishesGranted = 5;
    s.economy.seasonsInSurplus = 1;
    for (let i = 0; i < 3; i++)
      s.hearth.discovered.push({ pattern: `p${i}`, tick: 0, seat: 0, together: false, anchor: i });
    while (s.residents.length < 30) s.residents.push({ ...s.residents[0]!, id: s.nextId++ });
    findById(s.buildings, f.b.storehouse)!.rt!.store[good('bread')] = 200;
    const ctx = createTickCtx(s);
    advanceTo(s, TICKS_PER_HOUR + 200, ctx);
    expect(s.charter.ready).toBe(true);
    const claimed = run(s, { t: 'charter.claim' });
    expect(s.charter.rank).toBe('village');
    expect(s.hearth.unlocked).toContain('shops-zone');
    expect(claimed.events.some((e) => e.e === 'rank.up' && e.text.includes(s.settings.townName))).toBe(true);
  });

  it('raises and lowers land one level, never under buildings or roads', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    run(s, {
      t: 'terrain.raise',
      tiles: [
        [90, 60],
        [91, 60],
      ],
    });
    expect(s.map.height[60 * S + 90]).toBe(3);
    run(s, { t: 'terrain.lower', tiles: [[90, 60]] });
    expect(s.map.height[60 * S + 90]).toBe(2);
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[64, 60]] }))).toBe('OCCUPIED');
    expect(rejection(run(s, { t: 'terrain.raise', tiles: [[100, 60]] }))).toBe('WATER');
    expectMoneyInvariant(before, s);
  });

  it("pins a business's trade and lets go of it", () => {
    const f = villageFixture();
    const s = f.state;
    const bakery = findById(s.buildings, f.b.bakery)!;
    run(s, { t: 'build.pinRecipe', id: bakery.id, trade: 'baker' });
    expect(bakery.pinned).toBe(true);
    expect(bakery.trade).toBe('baker');
    expect(rejection(run(s, { t: 'build.pinRecipe', id: bakery.id, trade: 'nonsense' }))).toBe('INVALID');
    // A farm's trade does not fit a workshop.
    expect(rejection(run(s, { t: 'build.pinRecipe', id: bakery.id, trade: 'grain-farm' }))).toBe('INVALID');
    run(s, { t: 'build.pinRecipe', id: bakery.id, trade: null });
    expect(bakery.pinned).toBeUndefined();
  });
});

describe('I2 APIs', () => {
  it('grows a building on an empty lot, once', () => {
    const f = villageFixture();
    const s = f.state;
    const lotId = f.lots.homes[2]!;
    const ctx = createTickCtx(s);
    const b = growLot(s, ctx, lotId, 'cottage');
    expect(b).not.toBeNull();
    expect(b!.stage).toBe('construction');
    expect(b!.style).toBe('timber');
    expect(findById(s.lots, lotId)!.buildingId).toBe(b!.id);
    expect(growLot(s, ctx, lotId, 'cottage')).toBeNull();
    expect(growLot(s, ctx, f.lots.homes[3]!, 'town-hall')).toBeNull();
    // Removing it frees the lot.
    run(s, { t: 'build.remove', ids: [b!.id] });
    expect(findById(s.lots, lotId)!.buildingId).toBe(0);
  });

  it('routes carts over lanes and streets, never paths, and drives them there', () => {
    const f = villageFixture();
    const s = f.state;
    const from = 50 * S + 40;
    const to = 70 * S + 80;
    const route = cartRoute(s, from, to)!;
    expect(route[route.length - 1]).toBe(to);
    expect(route.every((t) => s.map.road[t] === 2 || s.map.road[t] === 3)).toBe(true);
    expect(cartRoute(s, from, 60 * S + 64)).toBeNull();
    const cart: Cart = {
      id: s.nextId++,
      def: 'cart',
      home: f.b.storehouses[0],
      tile: from,
      move: null,
      load: [[good('timber'), 16]],
      job: 0,
      dir: 1,
      parked: false,
    };
    s.carts.push(cart);
    expect(requestCartMove(s, cart.id, to)).toBe('driving');
    const ctx = createTickCtx(s);
    advanceTo(s, s.tick + route.length * 5, ctx);
    expect(cartAt(s, cart.id, to)).toBe(true);
    expect(s.map.traffic[to]).toBeGreaterThan(0);
    const frame = agentFrame(s);
    const rows = frame.length / AGENT_STRIDE;
    const row = [...Array(rows).keys()].find((i) => frame[i * AGENT_STRIDE] === cart.id)!;
    expect(frame[row * AGENT_STRIDE + 5]).toBe(AgentAnim.cart);
    expect(frame[row * AGENT_STRIDE + 6]).toBe(good('timber') + 1);
  });

  it('unlocks innovations into the unlocked list, once', () => {
    const { state } = villageFixture();
    const ctx = createTickCtx(state);
    expect(unlockInnovation(state, ctx, 'wheelbarrows')).toBe(true);
    expect(unlockInnovation(state, ctx, 'wheelbarrows')).toBe(false);
    expect(state.hearth.unlocked).toContain('porter-carry-8');
    expect(ctx.events.some((e) => e.e === 'innovation.unlocked')).toBe(true);
  });

  it('moves a story arc on step by step, paying rewards and sending letters', () => {
    const f = villageFixture();
    const s = f.state;
    const arc: StoryArc = {
      id: 'test-arc',
      character: {
        given: 'Pippa',
        family: 'Quill',
        species: 'mouse',
        traits: ['curious'],
        stage: 'young',
        bio: '',
      },
      arrival: { count: { what: 'residents', atLeast: 1 } },
      hello: 'Hello, {town}!',
      steps: [
        {
          letter: 'Step one.',
          goal: { count: { what: 'residents', atLeast: 1 } },
          reward: { coins: 10 },
          hint: 'One',
        },
        {
          letter: 'Step two.',
          goal: { count: { what: 'residents', atLeast: 1 } },
          reward: { unlock: ['x'] },
          hint: 'Two',
        },
      ],
      finale: { letter: 'The end.', innovation: ['water-wheel'] },
    };
    const stories = content.stories as StoryArc[];
    const byId = content.storyById as Map<string, StoryArc>;
    stories.push(arc);
    byId.set(arc.id, arc);
    try {
      s.stories.push({ arc: arc.id, residentId: f.residents[0]!, step: -1, stepTick: 0 });
      const before = moneySnapshot(s);
      const ctx = createTickCtx(s);
      const treasury = s.economy.treasury;
      expect(storyStep(s, ctx, arc.id)).toBe(true);
      expect(s.stories.find((x) => x.arc === arc.id)!.step).toBe(0);
      const first = ctx.events.find((e) => e.e === 'story.step');
      expect(first?.e === 'story.step' && first.letter.text).toBe('Step one.');
      storyStep(s, ctx, arc.id);
      expect(s.economy.treasury).toBe(treasury + 10 * PENNIES_PER_COIN);
      storyStep(s, ctx, arc.id);
      expect(s.hearth.unlocked).toContain('x');
      expect(s.innovations.find((i) => i.id === 'water-wheel')!.unlockedTick).toBeGreaterThanOrEqual(0);
      expect(storyStep(s, ctx, arc.id)).toBe(false);
      expectMoneyInvariant(before, s);
    } finally {
      stories.pop();
      byId.delete(arc.id);
    }
  });

  it('inspects village residents and buildings with the I2 detail', () => {
    const f = villageFixture();
    const s = f.state;
    const [a, b] = f.residents;
    findById(s.residents, a!)!.partner = b!;
    findById(s.residents, b!)!.partner = a!;
    const r = inspect(s, 'resident', a!) as { partner?: { id: number }; savings?: number; needs: unknown[] };
    expect(r.partner!.id).toBe(b);
    expect(r.savings).toBe(20 * PENNIES_PER_COIN);
    expect(r.needs).toHaveLength(6);
    const bakery = inspect(s, 'building', f.b.bakery) as { profit?: { perDay: number; lines: unknown[] } };
    expect(bakery.profit!.lines.length).toBeGreaterThan(0);
    const grown = inspect(s, 'building', f.b.grown) as { lot?: { zone: string } };
    expect(grown.lot!.zone).toBe('homes-low');
  });
});

describe('standard valleys start neutral', () => {
  it('starts at Hamlet rank with base prices and the Village Charter on the board', () => {
    const w: WorldState = createValley('meadow', standard());
    expect(w.charter).toMatchObject({ rank: 'hamlet', charter: 'village', ready: false });
    expect(w.market.prices).toEqual(content.goods.map((g) => g.basePrice));
    expect(w.innovations.map((i) => i.id)).toEqual([
      'barometer',
      'brick-kiln',
      'carts',
      'cobbles',
      'seed-drill',
      'water-wheel',
      'wheelbarrows',
    ]);
    expect(w.map.lot.length).toBe(MAP_SIZE * MAP_SIZE);
  });
});
