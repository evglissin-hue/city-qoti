// R1X E11: the carrier's day and the growth night put the same events on the wire, in the same
// order, whatever is cached inside. The expectations were written before the speed-up.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { flatTown } from './residents';
import { marketVillage } from './market';
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../packages/sim/src/constants';
import { Road } from '@qoti/sim';
import { insertBuilding } from '../../../packages/sim/src/state/place';
import { createTickCtx } from '../../../packages/sim/src/turn';
import { pipeline } from '../../../packages/sim/src/systems';
import { carrierDay } from '../../../packages/sim/src/systems/carrier';
import { dayIndex } from '../../../packages/sim/src/systems/economy/time';
import { BOAT_DAYS } from '../../../packages/sim/src/systems/carrier/terms';
import { withTradingPost } from '../../../packages/sim/test/market/helpers';

const S = MAP_SIZE;
type Ev = { e: string };
/** Two FNV-1a passes (different bases) over the JSON, as 16 hex digits: a fingerprint of the events, content and order. */
const sha = (events: unknown[]): string => {
  const text = JSON.stringify(events);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
};
const kinds = (events: Ev[]): string => {
  const m: Record<string, number> = {};
  for (const e of events) {
    const k = e.e;
    m[k] = (m[k] ?? 0) + 1;
  }
  return JSON.stringify(Object.entries(m).sort());
};

function carrierEvents(): Ev[] {
  const state = marketVillage(300);
  state.charter.rank = 'city';
  state.economy.treasury = 1_000_000_00;
  state.carrier.budget = 1000_00;
  for (const b of state.buildings) b.rt?.store.fill(0);
  const out: Ev[] = [];
  withTradingPost(state, () => {
    const ctx = createTickCtx(state);
    for (let day = 0; day < 4; day++) {
      for (const h of state.households) h.pantry.fill(0);
      for (const b of state.buildings) b.rt?.store.fill(0);
      state.dock.boats.length = 0;
      state.carrier.boatDay = dayIndex(state.tick) - BOAT_DAYS;
      carrierDay(state, ctx);
      out.push(...(ctx.events as Ev[]));
      ctx.events.length = 0;
      state.tick += TICKS_PER_DAY;
    }
  });
  return out;
}

function growthTown(): ReturnType<typeof flatTown> {
  const town = flatTown('r1x-events', 8, 120, 200, 4);
  const { world, ctx } = town;
  world.charter.rank = 'city';
  for (let i = 0; i < S * S; i++) if (world.map.fertility[i]! < 60) world.map.fertility[i] = 60;
  const zones = ['homes-low', 'homes-medium', 'shops', 'crafts', 'farms'];
  for (const z of [120, 128]) {
    for (let x = 2; x < S - 2; x++) world.map.road[z * S + x] = Road.lane;
    for (let x = 4; x < S - 4; x += 18)
      for (let dz = -6; dz <= 8; dz++) world.map.road[(z + dz) * S + x] ||= Road.path;
    for (let x = 10; x + 3 < S - 4; x += 30) {
      const st = insertBuilding(world, null, content.buildingById.get('storehouse')!, x, z + 1, 2, 0, {
        site: false,
      });
      st.rt?.workers.push(world.residents[0]!.id);
    }
    for (let x = 2; x < S - 2; x++)
      for (const dz of [-3, -2, -1, 1, 2, 3]) {
        const i = (z + dz) * S + x;
        if (world.map.road[i] || world.map.occupant[i]) continue;
        world.map.zone[i] = content.zoneById.get(zones[Math.floor(x / 24) % zones.length]!)!.layerValue;
      }
  }
  world.networkVersion += 1;
  world.economy.treasury = 5_000_000;
  for (let g = 0; g < content.goods.length; g++) {
    world.market.demand[g] = 40;
    world.economy.yesterday.consumed[g] = 40;
  }
  pipeline.find((s) => s.id === 'zoning')!.tick(world, ctx);
  ctx.events.length = 0;
  return town;
}

function growthEvents(): Ev[] {
  const { world, ctx } = growthTown();
  const systems = pipeline.filter((s) => ['zoning', 'growth'].includes(s.id));
  world.tick = Math.ceil(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  world.tick += pipeline.find((s) => s.id === 'growth')!.offset! - TICKS_PER_HOUR;
  const out: Ev[] = [];
  for (let n = 0; n < 3; n++) {
    const end = world.tick + 3 * TICKS_PER_HOUR;
    for (; world.tick < end; world.tick++) {
      for (const s of systems) if (world.tick % (s.every ?? 1) === (s.offset ?? 0)) s.tick(world, ctx);
      out.push(...(ctx.events as Ev[]));
      ctx.events.length = 0;
      ctx.dirty.clear();
    }
    world.tick += TICKS_PER_DAY - 3 * TICKS_PER_HOUR;
  }
  return out;
}

const EXPECT = {
  carrier: {
    n: 20,
    kinds:
      '[["balances.updated",4],["budget.updated",4],["notify",4],["town.updated",4],["trade.updated",4]]',
    sha: '084126526773b5a0',
  },
  growth: {
    n: 44,
    kinds:
      '[["building.added",3],["business.updated",2],["demand.updated",3],["lot.updated",33],["tiles.changed",3]]',
    sha: '4634846256528138',
  },
};

describe('R1X events are unchanged by the speed-up', () => {
  it('the carrier days', () => {
    const ev = carrierEvents();
    expect(ev.length).toBeGreaterThan(0);
    expect({ n: ev.length, kinds: kinds(ev), sha: sha(ev) }).toEqual(EXPECT.carrier);
  });
  it('the growth nights', () => {
    const ev = growthEvents();
    expect(ev.length).toBeGreaterThan(0);
    expect({ n: ev.length, kinds: kinds(ev), sha: sha(ev) }).toEqual(EXPECT.growth);
  });
});
