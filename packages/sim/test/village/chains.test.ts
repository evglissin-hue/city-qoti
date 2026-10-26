// C4C: every I2 building produces at full and partial staffing, and every chain runs end to end
// with porters carrying between the links. The residents' schedule is off (ledger `ticks`), so
// workers stay where the test puts them; numbers come from content, not from the test.
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { BuildingStatus, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { building, ticks, toWork } from '../ledger/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, place, staff, stocked, villageWith } from './helpers';

const H = TICKS_PER_HOUR;

/** The I2 producers: defs with methods that need a rank or an innovation, or that grow on lots. */
const I2: BuildingDef[] = content.buildings.filter((d) => (d.requires || d.grows) && d.methods?.length);

function setUp(def: BuildingDef, methodIndex: number, crew: number): { state: WorldState; b: Building } {
  const { state } = villageWith();
  const b = place(state, def.id, 44, 100);
  b.rt!.method = methodIndex;
  const m = def.methods![methodIndex]!;
  for (const [g, q] of m.inputs) b.rt!.input[good(g)] = q * 4;
  if (crew > 0) toWork(state, staff(state, b, crew));
  return { state, b };
}

function made(b: Building, m: ProductionMethod): number {
  let n = 0;
  for (const [g] of m.outputs) n += b.rt!.output[good(g)]!;
  return n;
}

function used(state: WorldState, m: ProductionMethod): number {
  let n = 0;
  for (const [g] of m.inputs) n += state.economy.today.consumed[good(g)]!;
  return n;
}

const perCycle = (m: ProductionMethod) => m.outputs.reduce((n, [, q]) => n + q, 0);
const inCycle = (m: ProductionMethod) => m.inputs.reduce((n, [, q]) => n + q, 0);

describe('every I2 building produces', () => {
  for (const def of I2) {
    def.methods!.forEach((m, mi) => {
      it(`${def.id}: ${m.id} with the full crew`, () => {
        const { state, b } = setUp(def, mi, m.workers);
        ticks(state, m.hours * H);
        const crewCycles = m.perWorker ? m.workers : 1;
        expect(made(b, m)).toBe(perCycle(m) * crewCycles);
        expect(used(state, m)).toBe(inCycle(m) * crewCycles);
        for (const [g, q] of m.outputs) expect(state.economy.today.produced[good(g)]).toBe(q * crewCycles);
      });

      it(`${def.id}: ${m.id} with part of the crew`, () => {
        // Half the crew, or one worker of a single-hand method who is only Meh (90%).
        const crew = Math.max(1, Math.floor(m.workers / 2));
        const { state, b } = setUp(def, mi, crew);
        if (m.workers === 1)
          for (const id of b.rt!.workers) state.residents.find((r) => r.id === id)!.mood = 45;
        ticks(state, m.hours * H);
        const fullCrew = perCycle(m) * (m.perWorker ? m.workers : 1);
        if (m.perWorker) {
          expect(made(b, m)).toBe(perCycle(m) * crew);
        } else {
          expect(made(b, m) + used(state, m)).toBe(0);
          ticks(state, m.hours * H);
          expect(made(b, m) + used(state, m)).toBeGreaterThan(0);
        }
        expect(made(b, m)).toBeLessThanOrEqual(fullCrew * 2);
      });
    });
  }

  it('makes nothing without workers, and says so', () => {
    const { state, b } = setUp(content.buildingById.get('brick-kiln')!, 0, 0);
    ticks(state, 2 * H);
    expect(b.rt!.output[good('bricks')]).toBe(0);
    expect(b.rt!.status & BuildingStatus.noWorkers).toBeTruthy();
  });

  it('pours cider at the tavern and brews remedies at the herbalist, and runs dry without them', () => {
    const { state } = villageWith();
    const tavern = place(state, 'tavern', 44, 100);
    const herbalist = place(state, 'herbalist', 50, 100);
    stocked(tavern, 'input', [['cider', 1]]);
    stocked(herbalist, 'input', [['herbs', 2]]);
    toWork(state, [...staff(state, tavern, 2), ...staff(state, herbalist, 1)]);
    ticks(state, 3 * H);
    expect(tavern.rt!.input[good('cider')]).toBe(0);
    expect(herbalist.rt!.input[good('herbs')]).toBe(0);
    ticks(state, 2 * H);
    expect(tavern.rt!.status & BuildingStatus.missingInput).toBeTruthy();
    expect(herbalist.rt!.status & BuildingStatus.missingInput).toBeTruthy();
  });
});

/**
 * A working chain town north of lane A: a storehouse with four porters, the given producers
 * around it, raw stock in the store. Everyone at work; two work days run.
 */
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

/** Runs work days: 08:00 to 17:00 with everyone inside, nights skipped by putting them back. */
function workDays(state: WorldState, n: number): void {
  for (let d = 0; d < n; d++) {
    ticks(state, 9 * H, (s) => {
      // Porters come back inside after a trip; keep the crews in their workplaces.
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

describe('chains end to end', { timeout: 60_000 }, () => {
  it('clay and bricks: the pit feeds the kiln, the chopping shed its fire', () => {
    const { state, byDef } = chainTown(
      [
        ['clay-pit', 54, 38],
        ['brick-kiln', 66, 38],
        ['chopping-shed', 70, 34],
      ],
      [['logs', 40]],
    );
    const before = moneySnapshot(state);
    state.tick = 2 * H; // 08:00
    workDays(state, 2);
    expect(state.economy.everProduced[good('clay')]).toBeGreaterThan(0);
    expect(state.economy.everProduced[good('firewood')]).toBeGreaterThan(0);
    expect(state.economy.everProduced[good('bricks')]).toBeGreaterThan(0);
    expect(
      state.logistics.flows.some(
        ([f, t]) => f === byDef.get('clay-pit')!.id && t === byDef.get('brick-kiln')!.id,
      ),
    ).toBe(true);
    expectMoneyInvariant(before, state);
  });

  it('wool to cloth: pasture, spinner, weaver', () => {
    const { state } = chainTown(
      [
        ['sheep-pasture', 52, 37],
        ['spinner', 64, 38],
        ['weaver', 68, 38],
      ],
      [],
    );
    state.tick = 2 * H;
    workDays(state, 3);
    expect(state.economy.everProduced[good('yarn')]).toBeGreaterThan(0);
    expect(state.economy.everProduced[good('cloth')]).toBeGreaterThan(0);
  });

  it('dairy and cheese, orchards and cider, herbs to the herbalist, tools from the smithy', () => {
    const { state, byDef } = chainTown(
      [
        ['dairy', 50, 37],
        ['cheesemaker', 64, 38],
        ['orchard', 70, 37],
        ['cider-press', 56, 30],
        ['herb-garden', 64, 30],
        ['herbalist', 68, 30],
        ['tavern', 72, 30],
        ['smithy', 52, 30],
      ],
      [
        ['firewood', 30],
        ['stone', 20],
      ],
    );
    state.tick = 2 * H;
    workDays(state, 2);
    for (const g of ['milk', 'cheese', 'apples', 'cider', 'herbs', 'tools'])
      expect(state.economy.everProduced[good(g)], g).toBeGreaterThan(0);
    // The herbalist and the tavern used what the garden and the press made.
    expect(state.economy.season.consumed[good('herbs')]).toBeGreaterThan(0);
    expect(state.economy.season.consumed[good('cider')]).toBeGreaterThan(0);
    expect(building(state, byDef.get('herbalist')!.id).rt!.status & BuildingStatus.noWorkers).toBe(0);
  });
});
