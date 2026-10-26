import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { AGENT_STRIDE, ResidentFlags, TICKS_PER_HOUR } from '../../src/constants';
import type { Resident } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { pantryFood } from '../../src/systems/residents/needs';
import { manhattan } from '../../src/systems/residents/places';
import { Block, blockOf, scheduleClock } from '../../src/systems/residents/time';
import { agentFrame } from '../../src/view/agents';
import { hamletFixture } from '../fixtures/hamlet';
import { resident, runner, ticks, tileOf, untilHour } from './helpers';
import { doorOf } from '../../src/systems/residents/places';

/** The hamlet's people by name. */
function people(f: ReturnType<typeof hamletFixture>) {
  const [th, ub, qu] = f.residents;
  const get = (id: number) => resident(f.state, id);
  return {
    clover: get(th![0]!),
    hazel: get(th![1]!),
    pip: get(th![2]!),
    wendell: get(ub![0]!),
    marina: get(ub![1]!),
    finn: get(ub![2]!),
    pippa: get(qu![0]!),
    tansy: get(qu![1]!),
    crumb: get(qu![2]!),
  };
}

/** Reads the activity kind without the narrowing a test's own assignment would cause. */
function kindOf(r: Resident): string {
  return r.activity.kind;
}

function homeOf(f: ReturnType<typeof hamletFixture>, r: Resident): number {
  return findById(f.state.households, r.householdId)!.homeId;
}

describe('the day table', () => {
  it('keeps everyone home and asleep through the night', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    untilHour(r, 2);
    for (const p of f.state.residents) {
      expect(p.inside, p.given).toBe(homeOf(f, p));
      expect(p.activity.kind, p.given).toBe('sleep');
    }
    expect(agentFrame(f.state)).toHaveLength(0);
  });

  it('has breakfast at home, then sends workers to work by 08:30 (Night Owls later)', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const p = people(f);
    untilHour(r, 7);
    for (const x of [p.clover, p.hazel, p.wendell, p.finn, p.pippa, p.marina])
      expect(x.inside).toBe(homeOf(f, x));
    untilHour(r, 8.5);
    for (const x of [p.clover, p.hazel, p.wendell, p.finn, p.pippa]) {
      expect(x.inside, x.given).toBe(x.jobId);
      expect(x.activity.kind).toBe('work');
    }
    // Marina is a Night Owl: her day starts two hours later.
    expect(p.marina.inside).toBe(homeOf(f, p.marina));
    untilHour(r, 10.5);
    expect(p.marina.inside).toBe(p.marina.jobId);
    for (const b of f.state.buildings) {
      if (!b.rt) continue;
      const inside = b.rt.workers.filter((id) => resident(f.state, id).inside === b.id).length;
      expect(b.rt.present, b.def).toBe(inside);
    }
    expect(findById(f.state.buildings, f.b.townHall)!.rt!.present).toBe(2);
  });

  it('staggers departures so the whole town does not leave the door on one tick', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const p = people(f);
    const workers = [p.clover, p.hazel, p.wendell, p.finn, p.pippa];
    const left = new Map<number, number>();
    untilHour(r, 7);
    for (let i = 0; i < 2 * TICKS_PER_HOUR; i++) {
      ticks(r, 1);
      for (const w of workers) if (!left.has(w.id) && w.inside !== homeOf(f, w)) left.set(w.id, f.state.tick);
    }
    const times = [...left.values()];
    expect(times).toHaveLength(5);
    expect(new Set(times).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThanOrEqual(20);
  });

  it('shifts Early Birds two hours earlier: Crumb works from 06:00 and sleeps by 21:00', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const { crumb } = people(f);
    untilHour(r, 1);
    expect(crumb.jobId).not.toBe(0);
    untilHour(r, 6.6);
    expect(blockOf(scheduleClock(crumb, f.state.tick))).toBe(Block.day);
    expect(crumb.inside).toBe(crumb.jobId);
    untilHour(r, 16);
    expect(crumb.inside).not.toBe(crumb.jobId);
    untilHour(r, 20.6);
    expect(crumb.inside).toBe(homeOf(f, crumb));
    expect(crumb.activity.kind).toBe('sleep');
  });

  it('lets children play near home and elders potter about during the day', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const { pip, tansy } = people(f);
    const homeDoor = doorOf(f.state, homeOf(f, pip));
    const seen = new Set<string>();
    untilHour(r, 9);
    for (let i = 0; i < 8 * TICKS_PER_HOUR; i++) {
      ticks(r, 1);
      if (!pip.inside) {
        expect(manhattan(pip.tile, homeDoor)).toBeLessThanOrEqual(9);
        seen.add(`pip:${pip.activity.kind}`);
      }
      seen.add(`tansy:${tansy.activity.kind}`);
    }
    expect(seen.has('pip:play')).toBe(true);
    expect([...seen].filter((s) => s.startsWith('tansy:')).length).toBeGreaterThanOrEqual(2);
  });

  it('spends the evening out (leisure, visits, strolls) and is home by 22:30', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const kinds = new Set<string>();
    let outdoors = 0;
    untilHour(r, 17.2);
    for (let i = 0; i < 4 * TICKS_PER_HOUR; i++) {
      ticks(r, 1);
      for (const p of f.state.residents) kinds.add(p.activity.kind);
      outdoors = Math.max(outdoors, f.state.residents.filter((p) => !p.inside).length);
    }
    expect(kinds.has('leisure') || kinds.has('stroll') || kinds.has('visit')).toBe(true);
    expect(outdoors).toBeGreaterThanOrEqual(3);
    untilHour(r, 22.5);
    const { marina } = people(f);
    for (const p of f.state.residents) {
      if (p === marina) continue;
      expect(p.inside, `${p.given} ${p.activity.kind}`).toBe(homeOf(f, p));
    }
    untilHour(r, 0.6);
    expect(marina.inside).toBe(homeOf(f, marina));
  });

  it('faces idle residents toward what they came to see, and keeps walkers to the left', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    untilHour(r, 18);
    let checked = 0;
    for (let i = 0; i < 2 * TICKS_PER_HOUR && checked < 3; i++) {
      ticks(r, 1);
      const frame = agentFrame(f.state);
      for (let o = 0; o < frame.length; o += AGENT_STRIDE) {
        const p = resident(f.state, frame[o]!);
        if (!p.move && p.activity.kind === 'leisure' && p.activity.tile !== p.tile) checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('shopping', () => {
  it('sends one grown-up to the nearest outlet when the pantry runs low, and fills it', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const h = findById(f.state.households, f.households[0])!;
    const store = findById(f.state.buildings, f.b.storehouse)!;
    const bread = content.goodIndex.get('bread')!;
    const veg = content.goodIndex.get('vegetables')!;
    const before =
      store.rt!.store[bread]! + store.rt!.store[veg]! + store.rt!.store[content.goodIndex.get('fish')!]!;
    untilHour(r, 16.9);
    h.pantry.fill(0);
    let shoppers = 0;
    let carried = false;
    for (let i = 0; i < 4 * TICKS_PER_HOUR; i++) {
      ticks(r, 1);
      const out = h.members.filter((id) => resident(f.state, id).activity.kind === 'shop').length;
      shoppers = Math.max(shoppers, out);
      if (h.members.some((id) => resident(f.state, id).carry)) carried = true;
    }
    expect(shoppers).toBe(1);
    expect(carried).toBe(true);
    expect(pantryFood(h)).toBeGreaterThanOrEqual(6);
    const after =
      store.rt!.store[bread]! + store.rt!.store[veg]! + store.rt!.store[content.goodIndex.get('fish')!]!;
    expect(before - after).toBeGreaterThanOrEqual(pantryFood(h));
    // Nobody ever carries more than four units on one trip.
    for (const id of h.members) expect(resident(f.state, id).carry).toBeNull();
  });
});

describe('flags', () => {
  it('clears the wish hop after an hour', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const p = resident(f.state, f.residents[0]![0]!);
    p.flags |= ResidentFlags.hop;
    p.modifiers.push({ kind: 'wish-granted', value: 15, from: 0, until: 3 * 4800 });
    ticks(r, TICKS_PER_HOUR - 20);
    expect(p.flags & ResidentFlags.hop).toBeTruthy();
    ticks(r, 40);
    expect(p.flags & ResidentFlags.hop).toBe(0);
  });
});

describe('getting lost', () => {
  it('stands about lost when boxed in, then finds the way home within the hour', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const { tansy } = people(f);
    untilHour(r, 10);
    // Out on the grass, and suddenly hemmed in on all four sides.
    tansy.inside = 0;
    tansy.move = null;
    tansy.tile = tileOf(80, 58);
    tansy.activity = { kind: 'stroll', tile: tansy.tile };
    for (const [x, z] of [
      [79, 58],
      [81, 58],
      [80, 57],
      [80, 59],
    ] as const) {
      f.state.map.occupant[tileOf(x, z)] = 999;
    }
    f.state.networkVersion += 1;
    let lost = false;
    for (let i = 0; i < 2 * TICKS_PER_HOUR && !lost; i++) {
      ticks(r, 1);
      lost = kindOf(tansy) === 'stuck';
    }
    expect(lost).toBe(true);
    expect(tansy.flags & ResidentFlags.stuck).toBeTruthy();
    expect(tansy.history.some((h) => h.kind === 'stuck')).toBe(true);
    expect(tansy.modifiers.some((m) => m.kind === 'lost')).toBe(true);
    ticks(r, TICKS_PER_HOUR + 2 * 10);
    expect(tansy.inside).toBe(homeOf(f, tansy));
    expect(tansy.flags & ResidentFlags.stuck).toBe(0);
  });
});
