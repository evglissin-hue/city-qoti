// R3E: the supplies advisor (the Ledger's) makes what places burn: the carrier's places switch goes
// on with money and off with debt (R3X: while it owes, over the cushion with steady income), at most once a day a family, with the family's rule and sell left
// as they stand; and the two lanes stay apart (the Ledger sends no decor or priority, the Hearth no
// zone, carrier rule or business). State is built by hand where the stand-ins cannot reach it.
import { content } from '@qoti/content';
import {
  LEDGER_CATEGORIES,
  PENNIES_PER_COIN,
  TILE_FP,
  type Building,
  type Resident,
  type WorldState,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { G } from '../town';
import { advisors } from '.';
import { LANTERN_FLOOR } from './lamps';
import {
  CANDLE_POP,
  OWING_OFF_COINS,
  OWING_ON_COINS,
  PLACES_OFF_COINS,
  PLACES_ON_COINS,
  supplies,
} from './supplies';

/** The Ledger's `upkeep` category index (an expense). */
const UPKEEP = LEDGER_CATEGORIES.findIndex((c) => c.id === 'upkeep');

/** A planner on a Village-rank town with 12 lanterns and no candles (so Wares are short), seen as the supplies advisor. */
function seen(): { p: Planner; w: WorldState } {
  const h = startingTown('willow');
  const p = new Planner(h);
  const w = p.w;
  w.charter.rank = 'village';
  w.decor = [];
  for (let i = 0; i < 12; i++)
    w.decor.push({
      id: 9001 + i,
      def: 'lantern',
      fx: (20 + i) * TILE_FP,
      fz: 20 * TILE_FP,
      rot: 0,
      builtBy: 0,
    });
  p.advisor = { id: 'supplies', lane: 'ledger' };
  return { p, w };
}

const setRules = (p: Planner) =>
  p.decisions
    .filter((d) => d.cmd.t === 'carrier.setRule')
    .map((d) => d.cmd as { family: string; places?: boolean });

describe('the supplies advisor', () => {
  it('is a Ledger-lane advisor that plays with the Village', () => {
    const def = advisors.find((a) => a.id === 'supplies')!;
    expect(def).toBe(supplies);
    expect(def.lane).toBe('ledger');
    expect(def.plays({ village: true }, {} as WorldState)).toBe(true);
    expect(def.plays({}, {} as WorldState)).toBe(false);
    expect(advisors.map((a) => a.id)).toEqual([...advisors.map((a) => a.id)].sort());
  });

  it('switches the carrier on for places with money, off with debt (R3X: while it owes, over the cushion with steady income), at most once a day a family', () => {
    const { p, w } = seen();
    const advisor = supplies.create(p);
    const wares = () => w.carrier.families[3]!;
    const before = { rule: wares().rule, sell: wares().sell };
    // A flush treasury, no debt, Wares short for the lanterns: on, for Wares.
    w.economy.treasury = (PLACES_ON_COINS + 200) * PENNIES_PER_COIN;
    p.runDay = 10;
    advisor.visit({ afternoon: false });
    expect(setRules(p)).toContainEqual(expect.objectContaining({ family: 'wares', places: true }));
    expect(wares().places).toBe(true);
    // The family's own rule and sell stand as they were.
    expect({ rule: wares().rule, sell: wares().sell }).toEqual(before);
    // Hard up the same day: no second flip.
    const sent = setRules(p).length;
    w.economy.treasury = (PLACES_OFF_COINS - 100) * PENNIES_PER_COIN;
    advisor.visit({ afternoon: true });
    expect(setRules(p).length).toBe(sent);
    expect(wares().places).toBe(true);
    // The next day: off.
    p.runDay = 11;
    advisor.visit({ afternoon: false });
    expect(!!wares().places).toBe(false);
    // Flush again and the town owes, but yesterday lost coins: stays off.
    w.economy.treasury = (PLACES_ON_COINS + 200) * PENNIES_PER_COIN;
    w.loans.loans.push({ id: 9999, principal: 50000, balance: 50000, rate: 5, takenTick: w.tick });
    w.economy.yesterday.money[UPKEEP] = 100000;
    p.runDay = 12;
    advisor.visit({ afternoon: false });
    expect(!!wares().places).toBe(false);
    // R3X: owing with the treasury over its cushion of 150 and three days with no loss: on, debt and all.
    w.economy.yesterday.money[UPKEEP] = 0;
    w.economy.treasury = (OWING_ON_COINS + 50) * PENNIES_PER_COIN;
    for (const day of [13, 14]) {
      p.runDay = day;
      advisor.visit({ afternoon: false });
      expect(!!wares().places).toBe(false);
    }
    p.runDay = 15;
    advisor.visit({ afternoon: false });
    expect(wares().places).toBe(true);
    // Under the owing floor: off the next day.
    w.economy.treasury = (OWING_OFF_COINS - 20) * PENNIES_PER_COIN;
    p.runDay = 16;
    advisor.visit({ afternoon: false });
    expect(!!wares().places).toBe(false);
    // Over the cushion again but in lean times: stays off.
    w.economy.treasury = (OWING_ON_COINS + 50) * PENNIES_PER_COIN;
    w.economy.leanTimes = true;
    p.runDay = 17;
    advisor.visit({ afternoon: false });
    expect(!!wares().places).toBe(false);
  });

  it('pins a chandler beside the honey when lanterns outrun the candles', () => {
    const { p, w } = seen();
    const base = w.buildings[0]!;
    const biz = (id: number, trade: string): Building =>
      ({ ...base, id, stage: 'built', def: 'workshop', trade, pinned: undefined }) as unknown as Building;
    w.buildings.push(
      biz(9301, 'hives'),
      biz(9302, 'carpenter'),
      biz(9303, 'carpenter'),
      biz(9304, 'carpenter'),
    );
    w.economy.treasury = 100 * PENNIES_PER_COIN;
    // A young town's workshops feed it: the candle chain waits for CANDLE_POP residents.
    while (w.residents.length < CANDLE_POP)
      w.residents.push({ id: 90000 + w.residents.length, activity: { kind: 'home' } } as unknown as Resident);
    const store = w.buildings.find((b) => b.rt && content.buildingById.get(b.def)?.storage)!;
    store.stage = 'built';
    store.rt!.store[G('honey')] = 10;
    supplies.create(p).visit({ afternoon: false });
    const pins = p.decisions.filter((d) => d.cmd.t === 'build.pinRecipe');
    expect(pins.map((d) => (d.cmd as { trade: string }).trade)).toContain('chandler');
    expect(pins.every((d) => d.lane === 'ledger')).toBe(true);
  });

  it('begins the candle chain as the Charter nears with lanterns standing, and not before', () => {
    const build = (lanterns: number, near: boolean) => {
      const { p, w } = seen();
      w.charter.rank = 'hamlet';
      w.decor = [];
      for (let i = 0; i < lanterns; i++)
        w.decor.push({
          id: 9001 + i,
          def: 'lantern',
          fx: (20 + i) * TILE_FP,
          fz: 20 * TILE_FP,
          rot: 0,
          builtBy: 0,
        });
      const def = content.charterById.get(w.charter.charter)!;
      w.charter.progress = def.goals.map((g, i) => (near || i === 0 ? g.target : 0));
      const base = w.buildings[0]!;
      const biz = (id: number, trade: string): Building =>
        ({ ...base, id, stage: 'built', def: 'workshop', trade, pinned: undefined }) as unknown as Building;
      w.buildings.push(biz(9302, 'carpenter'), biz(9303, 'carpenter'), biz(9304, 'carpenter'));
      while (w.residents.length < CANDLE_POP)
        w.residents.push({
          id: 90000 + w.residents.length,
          activity: { kind: 'home' },
        } as unknown as Resident);
      const store = w.buildings.find((b) => b.rt && content.buildingById.get(b.def)?.storage)!;
      store.stage = 'built';
      store.rt!.store[G('honey')] = 10;
      supplies.create(p).visit({ afternoon: false });
      return p.decisions.filter((d) => d.cmd.t === 'build.pinRecipe');
    };
    // Near, with a street of lanterns: a chandler is pinned beside the honey.
    expect(build(LANTERN_FLOOR, true).map((d) => (d.cmd as { trade: string }).trade)).toContain('chandler');
    // The Charter far off: nothing, however many lanterns.
    expect(build(LANTERN_FLOOR, false)).toEqual([]);
    // Near, with only a few lanterns: the County's crate will see them through, nothing yet.
    expect(build(LANTERN_FLOOR - 1, true)).toEqual([]);
  });

  it('never buys for places in a Hamlet', () => {
    const { p, w } = seen();
    w.charter.rank = 'hamlet';
    w.economy.treasury = 100000 * PENNIES_PER_COIN;
    supplies.create(p).visit({ afternoon: false });
    expect(setRules(p)).toEqual([]);
  });

  it('keeps the lanes apart on a played town: the Ledger sends no decor or priority, the Hearth no zone, rule or trade', () => {
    const run = autoplay('willow', 30, {
      village: true,
      villageDay: 6,
      onDay: (w) => {
        if (w.economy.treasury < 50000) w.economy.treasury = 50000;
      },
    });
    const mine = run.decisions.filter((d) => d.advisor === 'supplies');
    for (const d of mine) {
      expect(d.lane).toBe('ledger');
      expect(['decor.place', 'place.setPriority']).not.toContain(d.cmd.t);
    }
    const lamps = run.decisions.filter((d) => d.advisor === 'lamps');
    for (const d of lamps) {
      expect(d.lane).toBe('hearth');
      // R3X: and an Apiary now and then, the Hearth's own bees (a Hearth building, no zone or trade).
      expect(['place.setPriority', 'build.place', 'road.paint']).toContain(d.cmd.t);
      if (d.cmd.t === 'build.place') expect(d.cmd.def).toBe('apiary');
    }
    for (const d of run.decisions.filter((d) => d.lane === 'hearth'))
      expect(['zone.paint', 'zone.clear', 'carrier.setRule', 'build.pinRecipe']).not.toContain(d.cmd.t);
  }, 180_000);
});
