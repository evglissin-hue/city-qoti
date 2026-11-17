// P3A job ranks (systems/residents/jobs.ts, slotPriority): with the town short of food and short of
// timber or stone for the sites, every hand of a food workplace ranks 0, but a lodge's or quarry's
// first hand ranks 0 and its later hands rank 1 (they used to rank 0 for every hand), so a handful
// of hands also reaches the fishery and the storehouse.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, WorldState } from '../../src/contracts';
import {
  assignJobs,
  FIRST_AFTER_CIRCULATION as FIRST,
  shortages,
  slotPriority,
  type Shortages,
} from '../../src/systems/residents/jobs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { building, resident } from '../ledger/helpers';
import { place } from '../village/helpers';

const def = (id: string) => content.buildingById.get(id)!;
const BOTH: Shortages = { food: true, goods: new Set(['timber', 'stone']) };

describe('slotPriority with food and timber both short', () => {
  it('ranks every hand of a food workplace just behind the circulation', () => {
    for (let k = 0; k < 3; k++) expect(slotPriority(def('fishery'), k, BOTH)).toBe(FIRST);
    expect(FIRST).toBeGreaterThan(0);
    expect(FIRST).toBeLessThan(1);
  });

  it('ranks a lodge’s first hand just behind the circulation and its later hands 1', () => {
    expect(slotPriority(def('foresters-lodge'), 0, BOTH)).toBe(FIRST);
    expect(slotPriority(def('foresters-lodge'), 1, BOTH)).toBe(1);
    expect(slotPriority(def('foresters-lodge'), 2, BOTH)).toBe(1);
  });

  it('ranks a quarry’s first hand just behind the circulation and its later hands 1', () => {
    expect(slotPriority(def('quarry'), 0, BOTH)).toBe(FIRST);
    expect(slotPriority(def('quarry'), 1, BOTH)).toBe(1);
    expect(slotPriority(def('quarry'), 2, BOTH)).toBe(1);
  });

  it('does the same with timber alone short', () => {
    const timber: Shortages = { food: false, goods: new Set(['timber']) };
    expect(slotPriority(def('foresters-lodge'), 0, timber)).toBe(FIRST);
    expect(slotPriority(def('foresters-lodge'), 2, timber)).toBe(1);
  });
});

describe('the circulation first, then food', () => {
  it('keeps the first builder and porter ahead of every food hand', () => {
    expect(slotPriority(def('storehouse'), 0, BOTH)).toBe(0);
    expect(slotPriority(def('builders-yard'), 0, BOTH)).toBe(0);
    expect(slotPriority(def('fishery'), 0, BOTH)).toBeGreaterThan(0);
  });

  it('puts a fishery’s first hand ahead of the stall’s vendor and the second builder when food is fine', () => {
    const none: Shortages = { food: false, goods: new Set() };
    const fisher = slotPriority(def('fishery'), 0, none);
    expect(fisher).toBe(FIRST);
    expect(fisher).toBeLessThan(slotPriority(def('market-stall'), 0, none));
    expect(fisher).toBeLessThan(slotPriority(def('builders-yard'), 1, none));
    // Later fishers wait behind other work's first hands as before.
    expect(slotPriority(def('fishery'), 1, none)).toBe(2);
  });
});

describe('a few hands in a hungry, timber-short town', () => {
  function hungry(): { state: WorldState; fishery: Building; lodge: Building; store: Building } {
    const { state, b } = hamletFixture();
    const fishery = place(state, 'fishery', 60, 30, 0);
    const lodge = building(state, b.sawpit);
    const store = building(state, b.storehouse);
    // Nothing in the larder or the stores, and every adult out of work.
    for (const x of state.buildings) {
      if (!x.rt) continue;
      for (const k of ['store', 'input', 'output'] as const)
        (x.rt as unknown as Record<string, number[] | undefined>)[k]?.fill?.(0);
      x.rt.workers.length = 0;
    }
    for (const h of state.households) h.pantry.fill(0);
    for (const r of state.residents) r.jobId = 0;
    return { state, fishery, lodge, store };
  }

  it('is short of food and timber', () => {
    const { state } = hungry();
    const s = shortages(state);
    expect(s.food).toBe(true);
    expect(s.goods.has('timber')).toBe(true);
  });

  it('fills the fishery’s and the storehouse’s first slots, not only the lodge', () => {
    const { state, fishery, lodge, store } = hungry();
    const adults = state.residents.filter((r) => r.stage === 'adult');
    expect(adults.length).toBeGreaterThanOrEqual(5);
    const only = adults.slice(0, 5);
    for (const r of adults.slice(5)) r.stage = 'child';
    assignJobs(state, createTickCtx(state));
    expect(only.every((r) => resident(state, r.id).jobId !== 0)).toBe(true);
    expect(fishery.rt!.workers.length).toBeGreaterThanOrEqual(1);
    expect(store.rt!.workers.length).toBeGreaterThanOrEqual(1);
    expect(lodge.rt!.workers.length).toBeLessThanOrEqual(1);
  });
});
