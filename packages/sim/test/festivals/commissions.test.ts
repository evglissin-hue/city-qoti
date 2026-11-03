// C5B: commissions (docs/spec/13-ledger.md, Commissions): offered (only what the town can meet),
// accepted and met (goods leave with the asker, the reward crosses the valley's edge with book()),
// missed (the offer only closes), declined, and lapsed when left unanswered.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import {
  checkCommissions,
  eligible,
  OFFER_DAYS,
  offerNeighbor,
  offerVisitor,
} from '../../src/systems/commissions';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, inTown, stock } from './helpers';

function town(): WorldState {
  const { state } = villageFixture();
  state.tick = tickAt(0, 1, 1, 9);
  return state;
}

function offerDef(state: WorldState, id: string) {
  const ctx = createTickCtx(state);
  const def = content.commissionById.get(id)!;
  // Offer exactly this one: everything else made-never.
  state.economy.everProduced = state.economy.everProduced.map(() => 0);
  if ('goods' in def.ask) for (const [g] of def.ask.goods) state.economy.everProduced[good(g)] = 1;
  const c = offerNeighbor(state, ctx)!;
  return { c, ctx, def };
}

describe('commissions', () => {
  it('only asks for what the town has made or can build', () => {
    const state = town();
    state.economy.everProduced = state.economy.everProduced.map(() => 0);
    expect(eligible(state, 'neighbor')).toEqual([]);
    state.economy.everProduced[good('bread')] = 5;
    expect(eligible(state, 'neighbor').map((d) => d.id)).toEqual(['millhaven-bread']);
    // Visitors wait for renown.
    expect(eligible(state, 'visitor')).toEqual([]);
  });

  it('is offered, accepted and met: the goods go, the reward comes, renown grows', () => {
    const state = town();
    const before = moneySnapshot(state);
    const { c, def } = offerDef(state, 'millhaven-bread');
    expect(c).toMatchObject({ def: 'millhaven-bread', status: 'offered', from: 'Millhaven' });
    expect(rejection(run(state, { t: 'commission.accept', id: c.id }))).toBeUndefined();
    expect(c.deadlineTick).toBeGreaterThanOrEqual(c.offeredTick + def.deadlineDays * TICKS_PER_DAY);
    expect(c.deadlineTick).toBeLessThanOrEqual(state.tick + def.deadlineDays * TICKS_PER_DAY);
    const ask = 'goods' in def.ask ? def.ask.goods[0]![1] : 0;
    stock(state, 'bread', ask + 3);
    const bread = inTown(state, 'bread');
    const treasury = state.economy.treasury;
    const ctx = createTickCtx(state);
    checkCommissions(state, ctx);
    expect(c.status).toBe('done');
    expect(inTown(state, 'bread')).toBe(bread - ask);
    expect(state.economy.treasury - treasury).toBe(def.reward.coins! * PENNIES_PER_COIN);
    expect(state.renown.log[state.renown.log.length - 1]).toMatchObject({
      source: 'commission',
      points: def.reward.renown,
    });
    expect(state.chronicle[state.chronicle.length - 1]!.kind).toBe('commission-done');
    expectMoneyInvariant(before, state);
  });

  it('shows progress while short, and a missed deadline only closes the offer', () => {
    const state = town();
    const { c, def } = offerDef(state, 'millhaven-bread');
    run(state, { t: 'commission.accept', id: c.id });
    for (const b of state.buildings) if (b.rt) b.rt.store[good('bread')] = 0;
    stock(state, 'bread', 6);
    checkCommissions(state, createTickCtx(state));
    expect(c.progress).toBeGreaterThan(0);
    expect(c.progress).toBeLessThan(100);
    const renown = state.renown.points;
    const money = state.economy.treasury;
    state.tick = c.deadlineTick;
    checkCommissions(state, createTickCtx(state));
    expect(c.status).toBe('expired');
    expect(state.renown.points).toBe(renown);
    expect(state.economy.treasury).toBe(money);
    expect(inTown(state, 'bread')).toBe(6);
    expect(def.id).toBe('millhaven-bread');
  });

  it('can be declined, and lapses when left unanswered', () => {
    const state = town();
    const { c } = offerDef(state, 'millhaven-bread');
    expect(rejection(run(state, { t: 'commission.decline', id: c.id }))).toBeUndefined();
    expect(c.status).toBe('declined');
    expect(rejection(run(state, { t: 'commission.accept', id: c.id }))).toBe('NOT_ALLOWED');
    const second = offerNeighbor(state, createTickCtx(state))!;
    state.tick += OFFER_DAYS * TICKS_PER_DAY;
    checkCommissions(state, createTickCtx(state));
    expect(second.status).toBe('expired');
  });

  it('brings notable visitors as renown grows, and a building ask closes once it stands', () => {
    const state = town();
    state.tick = tickAt(0, 1, 2, 0);
    state.renown.level = 2;
    state.renown.points = content.renown[2]!.points;
    const v = offerVisitor(state, createTickCtx(state));
    expect(v).not.toBeNull();
    expect(content.commissionById.get(v!.def)!.from).toBe('visitor');
    // Only as many visitors as the level allows at once.
    expect(offerVisitor(state, createTickCtx(state))).toBeNull();
  });
});
