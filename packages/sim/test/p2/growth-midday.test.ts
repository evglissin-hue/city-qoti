// P2 (the R1 playtest): the growth pass can run at 01:00 and again at 13:00 on one day's allowance
// of starts, and a kind the town wants that does not start says why (docs/spec/13-ledger.md, Zoning
// and growth). The owner zoned, saw nothing build and could not tell why.
import { content } from '@qoti/content';
import { describe, expect, it, vi } from 'vitest';
import { DEMAND_KINDS, GROWTH_HOURS, TICKS_PER_DAY, Zone } from '../../src/constants';
import type { Building, DemandKind, DemandReason, DemandReasonCode, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { familyIndex } from '../../src/state/zones';
import { dailyOffset, dayIndex, hourOf } from '../../src/systems/economy/time';
import {
  growth,
  GROWTH_MAX_SITES,
  GROWTH_PER_DAY,
  growthDemand,
  growthPass,
  nextGrowthHour,
  refreshDemand,
} from '../../src/systems/growth';
import { SiteCache, siteMeets, unmetWant } from '../../src/systems/growth/site';
import { createTickCtx } from '../../src/turn';
import { demandView, demandWhy } from '../../src/view/demand';
import { villageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';
import { S } from '../helpers';

// The midday pass ships switched off (GROWTH_MIDDAY in constants.ts says why). These tests run it
// switched on, as a tuning round would; growth-nightly.test.ts covers the game as it ships.
vi.mock('../../src/constants', (original) =>
  original<Record<string, unknown>>().then((actual) => ({ ...actual, GROWTH_MIDDAY: true })),
);

const good = (id: string) => content.goodIndex.get(id)!;

/** The tick of `hour`:00 on calendar day `day` (day 1 or later). */
function at(day: number, hour: number): number {
  return day * TICKS_PER_DAY + dailyOffset(hour) - (hour < 6 ? TICKS_PER_DAY : 0);
}

function grown(state: WorldState): Building[] {
  return state.buildings.filter((b) => b.lot && b.stage === 'construction');
}

function bar(state: WorldState, kind: DemandKind) {
  return demandView(state).bars[DEMAND_KINDS.indexOf(kind)]!;
}

function last(state: WorldState, kind: DemandKind): DemandReason | undefined {
  return bar(state, kind).reasons.at(-1);
}

/** A built Forester's Lodge nobody works at yet: two open jobs, so homes are wanted. */
function openWork(state: WorldState, x: number, z: number): void {
  insertBuilding(state, null, content.buildingById.get('foresters-lodge')!, x, z, 0, 0, { site: false });
}

/** Homes zoned along street B in reach of the east storehouse: seven lots porters can supply. */
function homesInReach(state: WorldState): void {
  paintZone(state, 'homes-low', [66, 71, 80, 72]);
  zoneNow(state);
  expect(lotsIn(state, [66, 71, 80, 72]).length).toBeGreaterThanOrEqual(3);
}

/** Empties every store and buffer of a good. */
function drain(state: WorldState, id: string): void {
  for (const b of state.buildings) {
    if (!b.rt) continue;
    b.rt.store[good(id)] = 0;
    b.rt.output[good(id)] = 0;
  }
}

describe('the growth pass, twice a day', () => {
  it('runs at 01:00 and 13:00 and at no other hour', () => {
    expect(GROWTH_HOURS[1] - GROWTH_HOURS[0]).toBe(12);
    const hours: number[] = [];
    for (let h = 0; h < 24; h++) if (at(3, h) % growth.every! === growth.offset) hours.push(h);
    expect(hours).toEqual([...GROWTH_HOURS]);
    expect(hourOf(at(3, 1))).toBe(1);
    expect(dayIndex(at(3, 1))).toBe(dayIndex(at(3, 13)));
  });

  it('shares the day between its passes: two starts at night leave none for midday', () => {
    const { state: s } = villageFixture();
    homesInReach(s);
    openWork(s, 88, 46);
    expect(growthDemand(s).homes).toBeGreaterThanOrEqual(3);
    s.tick = at(1, 1);
    expect(growthPass(s, createTickCtx(s))).toBe(GROWTH_PER_DAY);
    expect(s.demand.starts).toEqual({ day: 1, n: 2 });
    // More homes are wanted and lots wait, but the day's starts are used: the bar says it waits its
    // turn behind the sites in hand.
    expect(growthDemand(s).homes).toBeGreaterThan(0);
    expect(bar(s, 'homes').lit).toBe(false);
    expect(last(s, 'homes')).toEqual({ code: 'sitesBusy', value: 2 });
    expect(nextGrowthHour(s)).toBe(1);
    s.tick = at(1, 13);
    expect(growthPass(s, createTickCtx(s), true)).toBe(0);
    expect(s.demand.starts).toEqual({ day: 1, n: 2 });
    // A new day brings a new allowance.
    s.tick = at(2, 1);
    for (const b of grown(s)) {
      b.stage = 'built';
      b.rt!.construction = null;
    }
    expect(growthPass(s, createTickCtx(s))).toBeGreaterThan(0);
    expect(s.demand.starts.day).toBe(2);
  });

  it('starts at midday what was zoned in the morning', () => {
    const { state: s } = villageFixture();
    // Nothing to grow at night: no lot of the fixture's is wanted and in reach but one, taken here.
    s.tick = at(1, 1);
    const night = growthPass(s, createTickCtx(s));
    expect(night).toBeLessThan(GROWTH_PER_DAY);
    // By morning the builders have nothing in hand.
    const finish = () => {
      for (const b of s.buildings) {
        if (b.stage !== 'construction') continue;
        b.stage = 'built';
        b.rt!.construction = null;
      }
    };
    finish();
    // The morning's zoning: homes in reach, and work for the folk who would come.
    s.tick = at(1, 9);
    homesInReach(s);
    openWork(s, 88, 46);
    refreshDemand(s, null);
    expect(nextGrowthHour(s)).toBe(13);
    expect(last(s, 'homes')).toEqual({ code: 'lotWaiting', value: 13 });
    const before = grown(s).length;
    s.tick = at(1, 13);
    const started = growthPass(s, createTickCtx(s), true);
    expect(started).toBe(GROWTH_PER_DAY - night);
    expect(grown(s).length).toBe(before + started);
    expect(nextGrowthHour(s)).toBe(1);
  });

  it('leaves a town with a site in hand alone at midday: its builders are busy', () => {
    const { state: s } = villageFixture();
    homesInReach(s);
    openWork(s, 88, 46);
    // One site started by hand, still going up at one in the afternoon.
    const site = insertBuilding(s, null, content.buildingById.get('cottage')!, 90, 51, 0, 0, { site: true });
    expect(site.stage).toBe('construction');
    s.tick = at(1, 9);
    refreshDemand(s, null);
    expect(nextGrowthHour(s)).toBe(1);
    expect(last(s, 'homes')).toEqual({ code: 'lotWaiting', value: 1 });
    s.tick = at(1, 13);
    expect(growthPass(s, createTickCtx(s), true)).toBe(0);
    expect(grown(s)).toHaveLength(0);
    // The night starts them as before.
    s.tick = at(2, 1);
    expect(growthPass(s, createTickCtx(s))).toBe(GROWTH_PER_DAY);
  });

  it('leaves retooling to the night: a business counts its days once', () => {
    const { state: s } = villageFixture();
    const days = () => s.buildings.filter((b) => b.trade).map((b) => ({ ...b.counters }));
    const was = days();
    s.tick = at(1, 13);
    growthPass(s, createTickCtx(s), true);
    expect(days()).toEqual(was);
  });
});

describe('a wanted kind that does not start says why', () => {
  it('materials: the stores are short and the carrier may not buy', () => {
    const { state: s } = villageFixture();
    homesInReach(s);
    openWork(s, 88, 46);
    drain(s, 'timber');
    s.carrier.families[familyIndex('materials')]!.rule = 'never';
    s.tick = at(1, 1);
    expect(growthPass(s, createTickCtx(s))).toBe(0);
    expect(bar(s, 'homes').lit).toBe(false);
    expect(last(s, 'homes')).toEqual({ code: 'materials', good: 'timber' });
    expect(bar(s, 'homes').why.at(-1)).toBe(
      'A lot is free, but the stores are too short of timber to start on it.',
    );
    // Zoning more in the morning reads the bars again: the hold the pass found still stands.
    s.tick = at(1, 9);
    refreshDemand(s, null);
    expect(last(s, 'homes')).toEqual({ code: 'materials', good: 'timber' });
    // Timber in, and the midday pass starts on it.
    for (const b of s.buildings) if (b.def === 'storehouse' && b.rt) b.rt.store[good('timber')] = 200;
    s.tick = at(1, 13);
    expect(growthPass(s, createTickCtx(s), true)).toBeGreaterThan(0);
    expect(last(s, 'homes')?.code).not.toBe('materials');
  });

  it('sitesBusy: the most grown sites at once are going up', () => {
    const f = villageFixture();
    const s = f.state;
    // The fixture's one grown cottage stands empty and would count as a home waiting: take it away.
    const cottage = s.buildings.find((b) => b.lot)!;
    findById(s.lots, cottage.lot!)!.buildingId = 0;
    s.buildings.splice(s.buildings.indexOf(cottage), 1);
    homesInReach(s);
    for (const [x, z] of [
      [88, 46],
      [92, 46],
      [88, 42],
    ] as const) {
      openWork(s, x, z);
    }
    s.tick = at(1, 1);
    growthPass(s, createTickCtx(s));
    s.tick = at(2, 1);
    growthPass(s, createTickCtx(s));
    expect(grown(s).length).toBe(GROWTH_MAX_SITES);
    expect(growthDemand(s).homes).toBeGreaterThan(0);
    s.tick = at(3, 1);
    expect(growthPass(s, createTickCtx(s))).toBe(0);
    expect(bar(s, 'homes').lit).toBe(false);
    expect(last(s, 'homes')).toEqual({ code: 'sitesBusy', value: GROWTH_MAX_SITES });
  });

  it('outOfReach: free lots lie beyond every storehouse, and the bar asks', () => {
    const { state: s } = villageFixture();
    // The fixture's shop lots by the stalls are past both storehouses' porters.
    s.tick = at(1, 1);
    growthPass(s, createTickCtx(s));
    expect(bar(s, 'shops').value).toBeGreaterThan(0);
    expect(bar(s, 'shops').lit).toBe(true);
    expect(last(s, 'shops')).toEqual({ code: 'outOfReach' });
  });

  it('noRoad: land zoned in the open, with no street to cut it into lots', () => {
    const { state: s } = villageFixture();
    const crafts = content.zoneById.get('crafts')!.layerValue;
    paintZone(s, 'crafts', [80, 40, 90, 45]);
    zoneNow(s);
    expect(s.lots.some((l) => l.zone === crafts)).toBe(false);
    s.tick = at(1, 1);
    growthPass(s, createTickCtx(s));
    expect(bar(s, 'workshops').value).toBeGreaterThan(0);
    expect(bar(s, 'workshops').lit).toBe(true);
    expect(last(s, 'workshops')).toEqual({ code: 'noRoad' });
  });

  it('needsLand: nothing is zoned for it at all', () => {
    const { state: s } = villageFixture();
    s.tick = at(1, 1);
    growthPass(s, createTickCtx(s));
    expect(bar(s, 'workshops').lit).toBe(true);
    expect(last(s, 'workshops')).toEqual({ code: 'needsLand' });
  });

  it('unsuitable: farm lots with no Farmland behind them for a grain farm that is wanted', () => {
    const f = villageFixture();
    const s = f.state;
    // A strip of Farmland one lot deep on lane A, in reach of the east storehouse, on soil a grain
    // farm can use (15) and the dairy, the orchard and the sheep run cannot (30 and 40).
    for (let z = 51; z <= 53; z++) for (let x = 83; x <= 95; x++) s.map.fertility[z * S + x] = 20;
    paintZone(s, 'farms', [83, 51, 95, 53]);
    zoneNow(s);
    const lots = s.lots.filter((l) => l.zone === Zone.farms);
    expect(lots.length).toBeGreaterThan(0);
    const grain = content.tradeById.get('grain-farm')!;
    const cache = new SiteCache(s);
    for (const l of lots) {
      expect(unmetWant(cache, l, grain)).toBe('fields');
      expect(siteMeets(cache, l, grain)).toBe(false);
    }
    // Larders full and nothing else asked of the market, but the carrier keeps bringing grain: only a
    // grain farm is wanted.
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[good('vegetables')] = 600;
    s.carrier.bought[s.carrier.bought.length - 1]![good('grain')] = s.residents.length;
    s.tick = at(1, 1);
    growthPass(s, createTickCtx(s));
    expect(grown(s).some((b) => findById(s.lots, b.lot!)!.zone === Zone.farms)).toBe(false);
    const why = last(s, 'farmland');
    expect(why).toEqual({ code: 'unsuitable', good: 'grain', want: 'fields' });
    expect(bar(s, 'farmland').lit).toBe(true);
    expect(bar(s, 'farmland').why.at(-1)).toBe(
      'Lots are free, but none has open Farmland behind it for fields. Zone Farmland deeper.',
    );
  });

  it('unmetWant agrees with siteMeets on every trade and lot', () => {
    const { state: s } = villageFixture();
    paintZone(s, 'crafts', [83, 51, 95, 53]);
    zoneNow(s);
    const cache = new SiteCache(s);
    for (const l of s.lots) {
      for (const t of content.trades) {
        expect(unmetWant(cache, l, t) === null, `${t.id} on lot ${l.id}`).toBe(siteMeets(cache, l, t));
      }
    }
  });
});

describe("the bars' words", () => {
  it('has a sentence for every reason code', () => {
    const all: Record<DemandReasonCode, DemandReason> = {
      newcomers: { code: 'newcomers', value: 2 },
      noOutlet: { code: 'noOutlet', value: 6 },
      crowded: { code: 'crowded' },
      short: { code: 'short', good: 'cloth', from: 'wool' },
      firstMaker: { code: 'firstMaker', good: 'bread', from: 'grain' },
      foodCover: { code: 'foodCover', value: 203 },
      imported: { code: 'imported', good: 'grain' },
      needsLand: { code: 'needsLand' },
      lotWaiting: { code: 'lotWaiting', value: 13 },
      marketStall: { code: 'marketStall' },
      hands: { code: 'hands' },
      noRoad: { code: 'noRoad' },
      outOfReach: { code: 'outOfReach' },
      unsuitable: { code: 'unsuitable', good: 'bread', want: 'reach:windmill' },
      materials: { code: 'materials', good: 'timber' },
      sitesBusy: { code: 'sitesBusy', value: 3 },
      unservedPlaces: { code: 'unservedPlaces', value: 2 },
    };
    const codes: DemandReasonCode[] = [
      'newcomers',
      'noOutlet',
      'crowded',
      'short',
      'firstMaker',
      'foodCover',
      'imported',
      'needsLand',
      'lotWaiting',
      'marketStall',
      'hands',
      'noRoad',
      'outOfReach',
      'unsuitable',
      'materials',
      'sitesBusy',
      'unservedPlaces',
    ];
    for (const code of codes) {
      const r = all[code];
      const words = demandWhy(r);
      expect(words.length, r.code).toBeGreaterThan(12);
      expect(words.endsWith('.'), words).toBe(true);
      expect(words.includes('—'), words).toBe(false);
      expect(words.includes('undefined'), words).toBe(false);
    }
    expect(demandWhy(all.lotWaiting)).toBe('A lot is free and waiting. Building starts at 13:00.');
    expect(demandWhy(all.unsuitable)).toBe(
      'Lots are free, but none is in reach of a Windmill with room to spare.',
    );
    expect(demandWhy({ code: 'sitesBusy', value: 1 })).toBe(
      'One is going up already. The next starts when it is done.',
    );
    for (const want of ['households', 'fields', 'fertility', 'pollinators', 'reach:sawmill', undefined]) {
      const words = demandWhy({ code: 'unsuitable', good: 'honey', ...(want && { want }) });
      expect(words.startsWith('Lots are free, but'), words).toBe(true);
    }
  });
});
