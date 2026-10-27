// Plans, requests and the Charter (C4D) on the village fixture: tweaking and approving plans with
// the skipped count reported, tidying closed plans, goods and charm requests closing themselves,
// the County's letter when the Charter is met and the rank-up moment.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags, TICKS_PER_DAY, TILE_FP } from '../../src/constants';
import type { Command, PlanItem, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { refreshCharter } from '../../src/systems/charter';
import { PLAN_KEEP_CLOSED, PLAN_KEEP_DAYS, tidyPlans } from '../../src/systems/plans';
import { checkRequests, requests } from '../../src/systems/requests';
import { createTickCtx } from '../../src/turn';
import { requestView } from '../../src/view/village';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { eventsOf, exec, skip } from './helpers';

const bench = (x: number, z: number): PlanItem => ({
  cmd: { t: 'decor.place', def: 'bench', fx: x * TILE_FP + 128, fz: z * TILE_FP + 128, rot: 0 } as Command,
});

function charmAround(s: WorldState, x: number, z: number, r: number, v: number): void {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) s.map.charm[(z + dz) * 192 + x + dx] = v;
}

describe('plans', () => {
  it('a tweak replaces the items and asks the partner to look again', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    expect(exec(s, { t: 'plan.seen', id: f.plan }, 0, ctx)).toBe(true);
    expect(findById(s.plans, f.plan)!.seenBy).toEqual([0, 1]);
    expect(
      exec(
        s,
        { t: 'plan.edit', id: f.plan, items: [bench(61, 54), bench(59, 54)], name: 'Two benches' },
        0,
        ctx,
      ),
    ).toBe(true);
    const p = findById(s.plans, f.plan)!;
    expect(p.items).toHaveLength(2);
    expect(p.name).toBe('Two benches');
    expect(p.seenBy).toEqual([0]);
    expect(eventsOf(ctx.events, 'plan.updated').at(-1)!.p.seenBy).toEqual([0]);
    // Only plannable commands, only open plans.
    expect(exec(s, { t: 'plan.edit', id: f.plan, items: [{ cmd: { t: 'loan.take', coins: 10 } }] })).toBe(
      false,
    );
    expect(exec(s, { t: 'plan.edit', id: 12345, items: [bench(61, 54)] })).toBe(false);
  });

  it('approving builds what still fits, skips the rest and says so', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const ctx = createTickCtx(s);
    const decor = s.decor.length;
    // The second bench lands on the town hall, which was there all along.
    const hall = findById(s.buildings, f.b.townHall)!;
    exec(s, { t: 'plan.edit', id: f.plan, items: [bench(61, 54), bench(hall.x + 1, hall.z + 1)] }, 1, ctx);
    expect(exec(s, { t: 'plan.approve', id: f.plan }, 0, ctx)).toBe(true);
    const p = findById(s.plans, f.plan)!;
    expect(p).toMatchObject({ status: 'approved', applied: 1, skipped: 1, seenBy: [0, 1] });
    expect(s.decor.length).toBe(decor + 1);
    expect(s.village.plansApproved).toBe(1);
    const note = eventsOf(ctx.events, 'notify').at(-1)!;
    expect(note.kind).toBe('letter');
    expect(note.text).toContain('A bench by the well');
    expect(note.text).toContain('1 done, 1 skipped');
    expect(exec(s, { t: 'plan.approve', id: f.plan })).toBe(false);
    expectMoneyInvariant(before, s);
  });

  it('tidies closed plans after a while, and never open ones', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    for (let i = 0; i < PLAN_KEEP_CLOSED + 3; i++) {
      exec(s, { t: 'plan.add', name: `Plan ${i}`, items: [bench(40 + i, 56)] }, 0, ctx);
      const id = s.plans.at(-1)!.id;
      exec(s, { t: 'plan.remove', id }, 0, ctx);
      s.plans.push({
        id,
        name: `Plan ${i}`,
        by: 0,
        tick: s.tick,
        items: [],
        comments: [],
        seenBy: [0],
        status: 'discarded',
      });
    }
    expect(tidyPlans(s, ctx)).toHaveLength(3);
    expect(s.plans.filter((p) => p.status !== 'open')).toHaveLength(PLAN_KEEP_CLOSED);
    skip(s, PLAN_KEEP_DAYS * TICKS_PER_DAY);
    tidyPlans(s, ctx);
    expect(s.plans.map((p) => p.id)).toEqual([f.plan]);
  });
});

describe('requests', () => {
  it('a goods request closes itself once the stall holds enough, and tells the asker', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    const r = findById(s.requests, f.request)!;
    const stall = findById(s.buildings, f.b.stalls[1])!;
    const cheese = content.goodIndex.get('cheese')!;
    expect(requestView(s, r).text).toBe('12 cheese at the market stall by Spring day 4');
    expect(requestView(s, r).progress).toEqual({ value: 4, target: 12 });
    checkRequests(s, ctx);
    expect(eventsOf(ctx.events, 'request.updated')).toHaveLength(0);
    stall.rt!.store[cheese] = 8;
    checkRequests(s, ctx);
    expect(eventsOf(ctx.events, 'request.updated').at(-1)!.r.progress).toEqual({ value: 8, target: 12 });
    stall.rt!.store[cheese] = 12;
    s.tick += 5;
    requests.tick(s, ctx);
    expect(r).toMatchObject({ status: 'done', closedTick: s.tick });
    expect(s.village.requestsFulfilled).toBe(1);
    const note = eventsOf(ctx.events, 'notify').at(-1)!;
    expect(note.seat).toBe(0);
    expect(note.text).toContain('12 cheese');
    expect(requestView(s, r).progress).toBeUndefined();
  });

  it('a charm request closes when the area is lovely enough; free text waits for a person', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    exec(s, { t: 'request.add', ask: { kind: 'charm', x: 60, z: 55, radius: 2, target: 30 } }, 1, ctx);
    exec(s, { t: 'request.add', ask: { kind: 'text', text: 'Could the bakery face the lane?' } }, 0, ctx);
    const [charm, text] = s.requests.slice(-2);
    expect(requestView(s, charm!).text).toBe('Charm 30 around the well');
    checkRequests(s, ctx);
    expect(charm!.status).toBe('open');
    charmAround(s, 60, 55, 2, 35);
    checkRequests(s, ctx);
    expect(charm!.status).toBe('done');
    expect(text!.status).toBe('open');
    expect(exec(s, { t: 'request.resolve', id: text!.id, status: 'done' })).toBe(true);
    expect(s.village.requestsFulfilled).toBe(2);
  });
});

describe('the Charter', () => {
  function readyHamlet() {
    const f = villageFixture();
    const s = f.state;
    s.charter = { rank: 'hamlet', charter: 'village', progress: [], ready: false, history: [] };
    for (const p of content.patterns.slice(0, 3)) {
      s.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
    }
    s.stats.wishesGranted = 5;
    s.economy.seasonsInSurplus = 1;
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[content.goodIndex.get('bread')!] = 400;
    return { f, s };
  }

  it('the County writes once when the last goal is met', () => {
    const { s } = readyHamlet();
    const ctx = createTickCtx(s);
    refreshCharter(s, ctx);
    expect(s.charter.ready).toBe(true);
    const letters = eventsOf(ctx.events, 'notify').filter((e) => e.kind === 'letter');
    expect(letters).toHaveLength(1);
    expect(letters[0]!.text).toContain('village');
    refreshCharter(s, ctx);
    expect(eventsOf(ctx.events, 'notify')).toHaveLength(1);
  });

  it('claiming it is a moment: the proclamation in the Chronicle and a spring in every step', () => {
    const { s } = readyHamlet();
    const ctx = createTickCtx(s);
    refreshCharter(s, ctx);
    expect(exec(s, { t: 'charter.claim' }, 1, ctx)).toBe(true);
    expect(s.charter.rank).toBe('village');
    const entry = s.chronicle.find((c) => c.kind === 'rank-up')!;
    expect(entry.text).toContain('Thistlecombe is a village');
    expect(entry.text).toMatch(/Credit to .*Ada.*Bo|Credit to .*Bo.*Ada/);
    expect(entry.seats).toEqual([0, 1]);
    for (const r of s.residents) {
      expect(
        r.modifiers.some((m) => m.kind === 'rank-up'),
        r.given,
      ).toBe(true);
      expect(r.flags & ResidentFlags.hop).toBeTruthy();
    }
    expect(eventsOf(ctx.events, 'rank.up')[0]!.text).toContain('bunting');
    for (const u of content.charterById.get('village')!.unlocks) expect(s.hearth.unlocked).toContain(u);
  });
});
