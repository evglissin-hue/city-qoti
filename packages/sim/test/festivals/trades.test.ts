// C5B: the I3 trades (pie shop, chandler, tailor, carpenter). Each makes its good at full and part
// crew (the I2 chain tests cover every ranked producer, these included); here each chain runs end
// to end with porters between the links, and each trade pays its way at base prices.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN, TICKS_PER_HOUR, WAGES, WORK_HOURS } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { ticks, toWork } from '../ledger/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, place, staff, stocked, villageWith } from '../village/helpers';

const H = TICKS_PER_HOUR;
const TRADES = ['pie-shop', 'chandler', 'tailor', 'carpenter'];

function chainTown(
  defs: [def: string, x: number, z: number][],
  store: [string, number][],
): { state: WorldState; byDef: Map<string, Building> } {
  const { state } = villageWith();
  const hub = place(state, 'storehouse', 60, 34);
  stocked(hub, 'store', store);
  const ids = staff(state, hub, 4);
  const byDef = new Map<string, Building>();
  for (const [def, x, z] of defs) {
    const b = place(state, def, x, z);
    byDef.set(def, b);
    const d = content.buildingById.get(def)!;
    ids.push(...staff(state, b, d.jobs?.count ?? 0, d.jobs?.tier ?? 'settler'));
  }
  toWork(state, ids);
  return { state, byDef };
}

function workDays(state: WorldState, n: number): void {
  for (let d = 0; d < n; d++) {
    ticks(state, 9 * H, (s) => {
      for (const b of s.buildings) {
        if (!b.rt || content.buildingById.get(b.def)?.jobs?.role !== 'worker') continue;
        for (const id of b.rt.workers) {
          const r = s.residents.find((x) => x.id === id)!;
          if (r.inside !== b.id && r.activity.kind !== 'task') toWork(s, [id]);
        }
      }
    });
  }
}

describe('the I3 trades', () => {
  it('each pays its way at base prices: a full day of the first method covers wages and upkeep', () => {
    const base = (g: string) => content.goodById.get(g)!.basePrice;
    const day = WORK_HOURS[1] - WORK_HOURS[0];
    for (const id of TRADES) {
      const def = content.buildingById.get(id)!;
      const m = def.methods![0]!;
      const cycles = day / m.hours;
      const margin =
        cycles *
        (m.outputs.reduce((n, [g, q]) => n + base(g) * q, 0) -
          m.inputs.reduce((n, [g, q]) => n + base(g) * q, 0));
      const costs = (def.jobs?.count ?? 0) * WAGES[0] + (def.upkeep ?? 0) * PENNIES_PER_COIN;
      expect(margin, id).toBeGreaterThan(costs);
    }
  });

  it('every I3 trade good has a buyer at the Trading Post', () => {
    for (const g of ['pies', 'candles', 'coats', 'furniture']) {
      expect(
        content.neighbors.some((n) => n.buys.some(([x]) => x === g)),
        g,
      ).toBe(true);
    }
  });

  it(
    'runs end to end: wheat to flour to pies, herbs to candles, cloth to coats, planks to furniture',
    { timeout: 60_000 },
    () => {
      const { state } = chainTown(
        [
          ['windmill', 50, 37],
          ['pie-shop', 64, 38],
          ['herb-garden', 70, 37],
          ['chandler', 56, 30],
          ['tailor', 64, 30],
          ['carpenter', 68, 30],
        ],
        [
          ['wheat', 30],
          ['apples', 30],
          ['cloth', 12],
          ['planks', 30],
        ],
      );
      const before = moneySnapshot(state);
      state.tick = 2 * H; // 08:00
      workDays(state, 2);
      for (const g of ['flour', 'pies', 'herbs', 'candles', 'coats', 'furniture']) {
        expect(state.economy.everProduced[good(g)], g).toBeGreaterThan(0);
      }
      expectMoneyInvariant(before, state);
    },
  );
});
