// R1B keepers (docs/spec/13-ledger.md, A business): the first hand hired keeps the business; when the
// keeper goes the longest-serving hand takes the keys; a keeper the growth pass named is seated first
// once the business is built.
import { describe, expect, it } from 'vitest';
import type { Building, EntityId, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { hire, release, seatKeeper } from '../../src/systems/residents/jobs';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { newResident, resident } from '../ledger/helpers';
import { place } from '../village/helpers';

/** A new weaver's workshop (a business with no keeper and no hands) in the hamlet fixture. */
function weaver(): { state: WorldState; b: Building } {
  const { state } = hamletFixture();
  return { state, b: place(state, 'workshop', 60, 30, 0, 'weaver') };
}

function hands(state: WorldState, b: Building, n: number): EntityId[] {
  const ids: EntityId[] = [];
  for (let i = 0; i < n; i++) {
    const r = newResident(state);
    hire(state, r, b);
    ids.push(r.id);
  }
  return ids;
}

describe('keepers', () => {
  it('the first hand hired keeps the business, and later hands do not take it', () => {
    const { state, b } = weaver();
    b.level = 3;
    expect(b.keeperId ?? 0).toBe(0);
    const [first, second] = hands(state, b, 2);
    expect(b.keeperId).toBe(first);
    expect(second).not.toBe(first);
  });

  it('a keeper who no longer exists is replaced by the next hand hired', () => {
    const { state, b } = weaver();
    b.keeperId = 987654;
    const [first] = hands(state, b, 1);
    expect(b.keeperId).toBe(first);
  });

  it('when the keeper goes, the longest-serving remaining hand takes the keys', () => {
    const { state, b } = weaver();
    b.level = 3;
    const [keeper, a, c] = hands(state, b, 3);
    // c has served longest at this business (hired on an earlier day), a more recently.
    for (const [id, day] of [
      [a!, 9],
      [c!, 3],
    ] as const) {
      const r = resident(state, id);
      r.history = r.history.filter((h) => h.kind !== 'job');
      r.history.push({ day, kind: 'job', ref: b.id });
    }
    release(state, resident(state, keeper!));
    expect(b.keeperId).toBe(c);
    // A tie goes to the lower id.
    for (const id of [a!, c!]) resident(state, id).history = [{ day: 5, kind: 'job', ref: b.id }];
    release(state, resident(state, c!));
    expect(b.keeperId).toBe(a);
  });

  it('with no hands left the keeper stays while they live, and is struck off when they work elsewhere', () => {
    const { state, b } = weaver();
    const [keeper] = hands(state, b, 1);
    release(state, resident(state, keeper!));
    expect(b.keeperId).toBe(keeper);
    const other = place(state, 'workshop', 66, 30, 0, 'carpenter');
    hire(state, resident(state, keeper!), other);
    expect(b.keeperId).toBe(0);
    expect(other.keeperId).toBe(keeper);
  });

  it('a keeper named before the business was built is hired there first, leaving their job', () => {
    const { state, b } = weaver();
    const r = newResident(state);
    const stall = findById(state.buildings, state.buildings.find((x) => x.def === 'storehouse')!.id)!;
    hire(state, r, stall);
    b.keeperId = r.id;
    expect(seatKeeper(state, createTickCtx(state), b)).toBe(true);
    expect(r.jobId).toBe(b.id);
    expect(stall.rt!.workers).not.toContain(r.id);
    expect(b.keeperId).toBe(r.id);
    // Once: moved on later, they are not pulled back.
    release(state, r);
    expect(seatKeeper(state, createTickCtx(state), b)).toBe(false);
  });

  it('an apprentice still serving waits; a keeper who is gone is struck off', () => {
    const { state, b } = weaver();
    const r = newResident(state);
    r.apprentice = { at: 1, trade: 'weaver', untilDay: 9999 };
    b.keeperId = r.id;
    expect(seatKeeper(state, createTickCtx(state), b)).toBe(false);
    expect(r.jobId).toBe(0);
    expect(b.keeperId).toBe(r.id);
    b.keeperId = 424242;
    seatKeeper(state, createTickCtx(state), b);
    expect(b.keeperId).toBe(0);
  });
});
