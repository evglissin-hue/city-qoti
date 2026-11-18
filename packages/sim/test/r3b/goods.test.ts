// R3B: the master's own cycle (docs/spec/19-evenings.md, Masters: what a master brings). A master
// inside a bakery bakes pies from the bakery's grain while the other hands make bread; with no grain
// or a full pie buffer the master works the trade's recipe like any hand; a gatherer's master takes
// the raw good from the building's own output; and the lane never counts a short day.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, EntityId, WorldState } from '../../src/contracts';
import { ResidentFlags } from '../../src/constants';
import { emptyCounters } from '../../src/state/zones';
import { crewPower } from '../../src/systems/production/produce';
import { production } from '../../src/systems/production';
import { outputCap } from '../../src/systems/logistics/stores';
import { productivity } from '../../src/systems/logistics/tasks';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire, resident, toWork } from '../ledger/helpers';
import { place, staff, stocked } from '../village/helpers';

const gi = (id: string): number => content.goodIndex.get(id)!;

/** Makes a resident a master of `key` and keeps their building's sign, as the masters' system does. */
function crown(state: WorldState, b: Building, id: EntityId, key: string): void {
  const r = resident(state, id);
  r.flags |= ResidentFlags.master;
  r.mastery = key;
  b.masterId = id;
}

function run(state: WorldState, ticks: number): void {
  const ctx = createTickCtx(state);
  for (let i = 0; i < ticks; i++) {
    production.tick(state, ctx);
    state.tick++;
  }
}

function bakery(hands: number): { state: WorldState; b: Building; master: EntityId; others: EntityId[] } {
  const { state, b } = hamletFixture();
  const bk = building(state, b.bakery);
  bk.counters = emptyCounters();
  bk.level = 3;
  const ids = hire(state, bk.id, hands);
  const master = ids[0]!;
  crown(state, bk, master, 'baker');
  toWork(state, ids);
  return { state, b: bk, master, others: ids.slice(1) };
}

describe('the master baker', () => {
  it('bakes pies from the bakery grain while the other hands make bread', () => {
    const { state, b } = bakery(3);
    stocked(b, 'input', [['grain', 60]]);
    run(state, 600);
    expect(b.rt!.output[gi('pies')]).toBeGreaterThan(0);
    expect(b.rt!.output[gi('bread')]).toBeGreaterThan(0);
    // Pies come in twos, from two grain each cycle.
    expect(b.rt!.output[gi('pies')]! % 2).toBe(0);
  });

  it('is no multiplier: the trade loses the master hands while the lane runs', () => {
    const { state, b } = bakery(3);
    const rt = b.rt!;
    const cap = 4;
    const all = crewPower(state, b, rt, cap);
    const without = crewPower(state, b, rt, cap, b.masterId);
    expect(without).toBe(all - productivity(resident(state, b.masterId!)));
  });

  it('works the trade recipe when no pie can be made (full pie buffer)', () => {
    const { state, b } = bakery(1);
    const def = content.buildingById.get(b.def)!;
    stocked(b, 'input', [['grain', 20]]);
    stocked(b, 'output', [['pies', outputCap(def)]]);
    run(state, 400);
    expect(b.rt!.masterProgress ?? 0).toBe(0);
    expect(b.rt!.output[gi('bread')]).toBeGreaterThan(0);
    expect(b.rt!.output[gi('pies')]).toBe(outputCap(def));
  });

  it('works the trade recipe when the pies lack grain for their cycle (one grain in the buffer)', () => {
    const { state, b } = bakery(1);
    stocked(b, 'input', [['grain', 1]]);
    run(state, 200);
    expect(b.rt!.output[gi('pies')]).toBe(0);
    expect(b.rt!.output[gi('bread')]).toBe(0);
    expect(b.rt!.masterProgress ?? 0).toBe(0);
  });

  it('does nothing without a master (no pies), and a master outside the building does nothing either', () => {
    const { state, b, master } = bakery(2);
    stocked(b, 'input', [['grain', 40]]);
    delete b.masterId;
    run(state, 400);
    expect(b.rt!.output[gi('pies')]).toBe(0);
    b.masterId = master;
    resident(state, master).inside = 0;
    const before = b.rt!.output[gi('pies')]!;
    run(state, 400);
    expect(b.rt!.output[gi('pies')]).toBe(before);
  });
});

describe('a gatherer master', () => {
  function orchard(): { state: WorldState; b: Building; master: EntityId } {
    const { state } = hamletFixture();
    const b = place(state, 'farmstead', 60, 30, 0, 'orchard');
    b.counters = emptyCounters();
    const ids = staff(state, b, 2);
    crown(state, b, ids[0]!, 'orchard');
    toWork(state, ids);
    return { state, b, master: ids[0]! };
  }

  it('boils jam from the fruit in the building own output, and counts no short day', () => {
    const { state, b } = orchard();
    stocked(b, 'output', [['fruit', 6]]);
    // Hold the pickers back: only fruit that is already there may be boiled.
    const rt = b.rt!;
    rt.workers = [b.masterId!];
    run(state, 500);
    expect(rt.output[gi('jam')]).toBeGreaterThan(0);
    expect(rt.output[gi('fruit')]! + 2 * (rt.output[gi('jam')]! / 2)).toBeLessThanOrEqual(6);
    expect(b.counters!.shortToday).toBe(false);
  });

  it('waits, quietly, when there is no fruit to boil', () => {
    const { state, b } = orchard();
    b.rt!.workers = [b.masterId!];
    run(state, 100);
    expect(b.rt!.output[gi('jam')]).toBe(0);
    expect(b.counters!.shortToday).toBe(false);
  });
});

describe('every master with a recipe', () => {
  it('has its lane written from goods its building already takes or makes', () => {
    for (const m of content.masters) {
      if (!m.method) continue;
      expect(m.good, m.of).toBeDefined();
      expect(
        m.method.outputs.map(([g]) => g),
        m.of,
      ).toContain(m.good);
    }
  });
});
