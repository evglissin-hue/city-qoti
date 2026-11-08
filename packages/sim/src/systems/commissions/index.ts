// Commissions (C5B; docs/spec/13-ledger.md, Commissions). Optional asks from the neighbors and from
// notable visitors, for goods delivered or a thing built, with coins, decor, unlocks and renown as
// rewards. From Village rank:
// - Offers: on days 1 and 4 at 09:00 a neighbor may ask (up to NEIGHBOR_OPEN open at once); notable
//   visitors arrive with the renown system's 00:06 pass (offerVisitor, up to the level's `visitors`
//   effect). Only asks the town can meet are offered: a goods ask once the town has made every good
//   it names, a building ask once that building can be built and is not already standing.
// - Accepting starts the deadline (commission.accept); declining closes it. An offer left
//   unanswered for OFFER_DAYS days lapses.
// - Hourly at offset 180 accepted commissions track progress; met goods asks take the goods from
//   town stock (they leave with the asker), met condition asks simply close. The reward is paid
//   (coins cross the valley's edge with book('commissions')), renown is added, and a Chronicle line
//   and a letter go to both seats. A missed deadline only closes the offer, nothing else.
// The pick among eligible asks hashes the valley seed and the day (no RNG stream), so commissions
// never shift other systems' dice.
import { content, type CommissionDef } from '@qoti/content';
import { PENNIES_PER_COIN, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Commission, System, TickCtx, WorldState } from '../../contracts';
import { evaluate } from '../../conditions';
import { cyrb128 } from '../../rng/cyrb128';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { commissionView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { book } from '../economy/api';
import { emitMoney } from '../economy/emit';
import { dayIndex, hourOf } from '../economy/time';
import { availableInTown, takeFromTown } from '../festivals/api';
import { meetsRequires } from '../innovations/api';
import { addRenown, renownEffect } from '../renown/api';
import { seasonNow } from '../seasons/api';

/** Neighbor commissions open (offered or accepted) at once. */
export const NEIGHBOR_OPEN = 2;
/** Days an offer waits for an answer. */
export const OFFER_DAYS = 3;
/** Closed commissions kept for the panel. */
export const CLOSED_KEEP = 8;
/** Days of the season neighbors write, and the hour. */
export const OFFER_DAYS_OF_SEASON = [1, 4] as const;
export const OFFER_HOUR = 9;

const open = (c: Commission): boolean => c.status === 'offered' || c.status === 'accepted';

/** Who asks, as shown: the neighbor's name or the visitor's. */
export function askerName(def: CommissionDef): string {
  if (def.from === 'visitor') return def.visitor ?? 'a visitor';
  return content.neighborById.get(def.from)?.name ?? def.from;
}

/** The town can meet this ask: it has made every good named, or can build what is asked for. */
export function canMeet(state: WorldState, def: CommissionDef): boolean {
  if ('goods' in def.ask) {
    for (const [g] of def.ask.goods) {
      const i = content.goodIndex.get(g);
      if (i === undefined || (state.economy.everProduced[i] ?? 0) <= 0) return false;
    }
    return true;
  }
  if (def.builds) {
    const b = content.buildingById.get(def.builds);
    if (!b || !meetsRequires(state, b.requires, b.id)) return false;
  }
  return !evaluate(state, def.ask.condition);
}

/** Commissions that could be offered now from `kind` ('neighbor' or 'visitor'). */
export function eligible(state: WorldState, kind: 'neighbor' | 'visitor'): CommissionDef[] {
  const level = state.renown.level;
  return content.commissions.filter(
    (d) =>
      (kind === 'visitor') === (d.from === 'visitor') &&
      (d.renown ?? 0) <= level &&
      !state.commissions.list.some((c) => c.def === d.id && open(c)) &&
      canMeet(state, d),
  );
}

function pickFor(state: WorldState, list: readonly CommissionDef[], salt: number): CommissionDef | undefined {
  if (list.length === 0) return undefined;
  const h = cyrb128(`${state.seed}:commission:${dayIndex(state.tick)}:${salt}`)[0];
  return list[(h >>> 0) % list.length];
}

function offer(state: WorldState, ctx: TickCtx, def: CommissionDef): Commission {
  const c: Commission = {
    id: state.nextId++,
    def: def.id,
    from: askerName(def),
    status: 'offered',
    offeredTick: state.tick,
    deadlineTick: 0,
    progress: 0,
  };
  state.commissions.list.push(c);
  ctx.events.push({ e: 'commission.added', c: commissionView(c) });
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    text: `${c.from} writes with a commission: ${def.name}. ${def.blurb ?? ''}`.trim(),
  });
  return c;
}

/** A neighbor asks, if one may (days 1 and 4 at 09:00). */
export function offerNeighbor(state: WorldState, ctx: TickCtx): Commission | null {
  const count = state.commissions.list.filter(
    (c) => open(c) && content.commissionById.get(c.def)?.from !== 'visitor',
  ).length;
  if (count >= NEIGHBOR_OPEN) return null;
  const def = pickFor(state, eligible(state, 'neighbor'), 1);
  return def ? offer(state, ctx, def) : null;
}

/** A notable visitor calls with a commission, if renown brings one (the renown system's pass). */
export function offerVisitor(state: WorldState, ctx: TickCtx): Commission | null {
  if (!isStandard(state) || !rankAtLeast(state, 'village')) return null;
  if (seasonNow(state).day !== 2) return null;
  const cap = renownEffect(state, 'visitors');
  const count = state.commissions.list.filter(
    (c) => open(c) && content.commissionById.get(c.def)?.from === 'visitor',
  ).length;
  if (count >= cap) return null;
  const def = pickFor(state, eligible(state, 'visitor'), 2);
  return def ? offer(state, ctx, def) : null;
}

/** 0 to 100: how much of the ask the town could hand over now. */
export function progressOf(state: WorldState, def: CommissionDef): number {
  if ('goods' in def.ask) {
    let p = 100;
    for (const [g, q] of def.ask.goods) {
      const i = content.goodIndex.get(g);
      const have = i === undefined ? 0 : availableInTown(state, i);
      p = Math.min(p, Math.floor((Math.min(have, q) * 100) / Math.max(1, q)));
    }
    return p;
  }
  return evaluate(state, def.ask.condition) ? 100 : 0;
}

function complete(state: WorldState, ctx: TickCtx, c: Commission, def: CommissionDef): void {
  if ('goods' in def.ask) {
    for (const [g, q] of def.ask.goods) {
      const i = content.goodIndex.get(g)!;
      takeFromTown(state, i, q);
      state.economy.today.consumed[i]! += q;
    }
  }
  c.status = 'done';
  c.progress = 100;
  const r = def.reward;
  if (r.coins) {
    book(state, 'commissions', r.coins * PENNIES_PER_COIN);
    emitMoney(state, ctx);
  }
  for (const u of r.unlock ?? []) if (!state.hearth.unlocked.includes(u)) state.hearth.unlocked.push(u);
  addRenown(state, ctx, r.renown ?? 0, 'commission');
  chronicle(state, ctx, 'commission-done', {
    text: [
      ['commission', def.name.charAt(0).toLowerCase() + def.name.slice(1)],
      ['from', c.from],
    ],
    seats: [...state.time.connected],
  });
  ctx.events.push({
    e: 'notify',
    kind: 'letter',
    text: `${c.from} sends thanks for ${def.name.charAt(0).toLowerCase()}${def.name.slice(1)}${r.coins ? `, and ${r.coins} coins` : ''}.`,
  });
}

/** The hourly pass: progress, completion, lapses and deadlines. */
export function checkCommissions(state: WorldState, ctx: TickCtx): void {
  const list = state.commissions.list;
  let changed = false;
  for (const c of list) {
    const def = content.commissionById.get(c.def);
    if (!def) continue;
    if (c.status === 'offered' && state.tick >= c.offeredTick + OFFER_DAYS * TICKS_PER_DAY) {
      c.status = 'expired';
      ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
      changed = true;
      continue;
    }
    if (c.status !== 'accepted') continue;
    const p = progressOf(state, def);
    if (p >= 100) {
      complete(state, ctx, c, def);
      ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
      changed = true;
      continue;
    }
    if (state.tick >= c.deadlineTick) {
      c.status = 'expired';
      ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
      ctx.events.push({
        e: 'notify',
        kind: 'letter',
        text: `${c.from} writes that the time for ${def.name.charAt(0).toLowerCase()}${def.name.slice(1)} has passed. No hard feelings; there will be other asks.`,
      });
      changed = true;
      continue;
    }
    if (p !== c.progress) {
      c.progress = p;
      ctx.events.push({ e: 'commission.updated', c: commissionView(c) });
    }
  }
  if (changed) prune(state, ctx);
}

/** Keeps the open commissions and the last CLOSED_KEEP closed ones. */
function prune(state: WorldState, ctx: TickCtx): void {
  const list = state.commissions.list;
  const closed = list.filter((c) => !open(c));
  if (closed.length <= CLOSED_KEEP) return;
  const drop = new Set(closed.slice(0, closed.length - CLOSED_KEEP).map((c) => c.id));
  state.commissions.list = list.filter((c) => !drop.has(c.id));
  for (const id of drop) ctx.events.push({ e: 'commission.removed', id });
}

export const commissions: System = {
  id: 'commissions',
  order: 93,
  every: TICKS_PER_HOUR,
  offset: 180,
  tick(state, ctx) {
    if (!isStandard(state) || !rankAtLeast(state, 'village')) return;
    checkCommissions(state, ctx);
    const { day } = seasonNow(state);
    if (hourOf(state.tick) === OFFER_HOUR && (OFFER_DAYS_OF_SEASON as readonly number[]).includes(day)) {
      offerNeighbor(state, ctx);
    }
  },
};
