// I2 view builders (C4.0): market, levers, loans, lots, trade, the Charter, innovations, plans,
// requests and stories. Their output never feeds back into state.
import { content } from '@qoti/content';
import {
  CREDIT_MIN,
  CREDIT_PER_RESIDENT,
  LOAN_LIMITS,
  PENNIES_PER_COIN,
  RANKS,
  TRADE_BUY_PERCENT,
  TRADE_SELL_PERCENT,
  WAGES,
} from '../constants';
import type {
  CharterView,
  EntityId,
  InnovationView,
  LeversView,
  LetterView,
  LoansView,
  Lot,
  LotView,
  MarketView,
  Plan,
  PlanView,
  RankId,
  RequestView,
  SeatRequest,
  StoryState,
  StoryView,
  TradeView,
  WorldState,
} from '../contracts';
import { residentName } from './hamlet';
import { findById } from '../state/entities';
import { calendar } from '../systems/clock/calendar';

const goodId = (i: number): string => content.goods[i]?.id ?? '';

export function marketView(state: WorldState): MarketView {
  const m = state.market;
  const l = state.levers;
  return {
    lines: content.goods.map((g, i) => ({
      good: g.id,
      price: m.prices[i] ?? g.basePrice,
      base: g.basePrice,
      demand: m.demand[i] ?? 0,
      cover: Math.round(m.cover[i] ?? 0) / 100,
      history: m.history.map((day) => day[i] ?? g.basePrice),
      cap: l.priceCaps[i] ?? 0,
      subsidy: l.subsidies[i] ?? 0,
    })),
  };
}

/** Daily wage per job tier at the current wage level, pennies. */
export function wagesAt(level: number): number[] {
  return WAGES.map((w) => Math.round((w * level) / 100));
}

export function leversView(state: WorldState): LeversView {
  const l = state.levers;
  const bans: string[] = [];
  l.exportBans.forEach((b, i) => {
    if (b) bans.push(goodId(i));
  });
  return { wageLevel: l.wageLevel, taxRate: l.taxRate, wages: wagesAt(l.wageLevel), exportBans: bans };
}

/**
 * What the County Bank lends in all, pennies: 500, 1,500 or 4,000 coins by rank
 * (docs/spec/13-ledger.md, Budget), or CREDIT_PER_RESIDENT coins a resident when that is more.
 */
export function creditLimit(state: WorldState): number {
  const byRank = LOAN_LIMITS[Math.max(0, RANKS.indexOf(state.charter.rank))] ?? 0;
  const byTown = CREDIT_PER_RESIDENT * state.residents.length;
  return Math.max(byRank, byTown, CREDIT_MIN) * PENNIES_PER_COIN;
}

export function loansOwed(state: WorldState): number {
  let owed = 0;
  for (const loan of state.loans.loans) owed += loan.balance;
  return owed;
}

export function loansView(state: WorldState): LoansView {
  const owed = loansOwed(state);
  return {
    loans: state.loans.loans.map((l) => ({ ...l })),
    owed,
    available: Math.max(0, creditLimit(state) - owed),
  };
}

export function lotView(lot: Lot): LotView {
  return {
    id: lot.id,
    zone: content.zoneByValue.get(lot.zone)?.id ?? '',
    x: lot.x,
    z: lot.z,
    w: lot.w,
    d: lot.d,
    rot: lot.rot,
    desirability: lot.desirability,
    style: lot.style,
    buildingId: lot.buildingId,
  };
}

/** The neighbor's regional price for a good in pennies, before the post's 1.2x and 0.85x. */
export function regionalPrice(state: WorldState, neighbor: string, good: number): number | null {
  const def = content.neighborById.get(neighbor);
  const n = state.trade.neighbors.find((x) => x.id === neighbor);
  const g = content.goods[good];
  if (!def || !n || !g) return null;
  const id = g.id;
  const factor = def.sells.find(([x]) => x === id)?.[1] ?? def.buys.find(([x]) => x === id)?.[1] ?? null;
  if (factor === null) return null;
  const season = calendar(state.tick).season;
  let seasonal = 100;
  for (const [x, s, p] of def.seasonal ?? []) if (x === id && s === season) seasonal = p;
  const drift = n.drift[good] ?? 1000;
  const impact = n.impact[good] ?? 1000;
  // Integer math (exact below 2^53), so the sim can use it too: base x factor% x season% x drift‰ x impact‰.
  return Math.max(1, Math.round((g.basePrice * factor * seasonal * drift * impact) / 1e10));
}

export function tradeView(state: WorldState): TradeView {
  const post = state.buildings.find((b) => content.buildingById.get(b.def)?.tags?.includes('trading-post'));
  return {
    neighbors: content.neighbors
      .filter((n) => !n.rank || RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(n.rank))
      .map((n) => {
        const goods = new Set([...n.sells.map(([g]) => g), ...n.buys.map(([g]) => g)]);
        return {
          id: n.id,
          name: n.name,
          blurb: n.blurb,
          prices: [...goods].sort().map((good) => {
            const i = content.goodIndex.get(good)!;
            const p = regionalPrice(state, n.id, i);
            const sells = n.sells.some(([x]) => x === good);
            const buys = n.buys.some(([x]) => x === good);
            return {
              good,
              buy: p !== null && sells ? Math.round((p * TRADE_BUY_PERCENT) / 100) : null,
              sell: p !== null && buys ? Math.round((p * TRADE_SELL_PERCENT) / 100) : null,
            };
          }),
        };
      }),
    orders: state.trade.orders.map((o) => ({
      good: goodId(o.good),
      min: o.min,
      max: o.max,
      floor: o.floor,
      ceiling: o.ceiling,
      neighbor: o.neighbor,
    })),
    caravans: state.trade.caravans.map((c) => ({
      id: c.id,
      neighbor: c.neighbor,
      selling: c.selling.map(([g, q]) => [goodId(g), q]),
      buying: c.buying.map(([g, q]) => [goodId(g), q]),
      departTick: c.departTick,
      returnTick: c.returnTick,
    })),
    log: state.trade.log.map((e) => ({ ...e, good: goodId(e.good) })),
    postId: post?.id ?? 0,
  };
}

export function nextRank(rank: RankId): RankId | null {
  const i = RANKS.indexOf(rank);
  return i >= 0 && i + 1 < RANKS.length ? RANKS[i + 1]! : null;
}

export function charterView(state: WorldState): CharterView {
  const c = state.charter;
  const def = content.charterById.get(c.charter);
  return {
    rank: c.rank,
    next: def?.rank ?? null,
    charter: c.charter,
    goals: (def?.goals ?? []).map((g, i) => {
      const value = c.progress[i] ?? 0;
      return { id: g.id, text: g.text, lane: g.lane, value, target: g.target, done: value >= g.target };
    }),
    ready: c.ready,
    history: c.history.map((h) => ({ ...h, seats: [...h.seats] })),
  };
}

export function innovationView(state: WorldState, id: string): InnovationView {
  const def = content.innovationById.get(id);
  const s = state.innovations.find((i) => i.id === id);
  const view: InnovationView = {
    id,
    name: def?.name ?? id,
    blurb: def?.blurb ?? '',
    progress: s ? (s.unlockedTick >= 0 ? 100 : s.progress) : 0,
    unlocked: (s?.unlockedTick ?? -1) >= 0,
  };
  if (s && s.unlockedTick >= 0) view.tick = s.unlockedTick;
  return view;
}

export function planView(p: Plan): PlanView {
  const view: PlanView = {
    id: p.id,
    name: p.name,
    by: p.by,
    tick: p.tick,
    items: p.items.map((i) => ({ cmd: i.cmd })),
    comments: p.comments.map((c) => ({ ...c })),
    seenBy: [...p.seenBy],
    status: p.status,
  };
  if (p.applied !== undefined) view.applied = p.applied;
  if (p.skipped !== undefined) view.skipped = p.skipped;
  return view;
}

/** Readable text for a request ("12 bread at the market by Summer day 3"). */
export function requestText(state: WorldState, r: SeatRequest): string {
  const a = r.ask;
  if (a.kind === 'text') return a.text;
  if (a.kind === 'charm') return `Charm ${a.target} around (${a.x}, ${a.z})`;
  const g = content.goodById.get(a.good);
  const at = a.at ? findById(state.buildings, a.at) : undefined;
  const place = at ? ` at the ${content.buildingById.get(at.def)?.name.toLowerCase() ?? 'building'}` : '';
  return `${a.qty} ${g?.label ?? a.good}${place} by day ${a.byDay + 1}`;
}

export function requestView(state: WorldState, r: SeatRequest): RequestView {
  return {
    id: r.id,
    from: r.from,
    ask: { ...r.ask },
    text: requestText(state, r),
    tick: r.tick,
    status: r.status,
    closedTick: r.closedTick,
  };
}

export function storyView(_state: WorldState, s: StoryState): StoryView {
  const arc = content.storyById.get(s.arc);
  const c = arc?.character;
  const view: StoryView = {
    arc: s.arc,
    name: c ? `${c.given} ${c.family}` : s.arc,
    species: c?.species ?? '',
    residentId: s.residentId,
    step: s.step,
    steps: arc?.steps.length ?? 0,
  };
  const step = arc && s.step >= 0 ? arc.steps[s.step] : undefined;
  if (step) view.hint = step.hint;
  return view;
}

/** The letter for a story's current step: the hello before step 0, each step's letter, the finale. */
export function storyLetter(state: WorldState, s: StoryState, step: number): LetterView {
  const arc = content.storyById.get(s.arc);
  const r = s.residentId ? findById(state.residents, s.residentId) : undefined;
  const from = r ? residentName(r) : arc ? `${arc.character.given} ${arc.character.family}` : '';
  const steps = arc?.steps.length ?? 0;
  const raw = !arc
    ? ''
    : step < 0
      ? arc.hello
      : step >= steps
        ? arc.finale.letter
        : (arc.steps[step]?.letter ?? '');
  return {
    arc: s.arc,
    from,
    residentId: s.residentId,
    text: raw.split('{town}').join(state.settings.townName),
    tick: state.tick,
    step,
  };
}

export function lotById(state: WorldState, id: EntityId): Lot | undefined {
  return findById(state.lots, id);
}
