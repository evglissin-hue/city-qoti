// Lens-filtered alerts for the left feed (docs/spec/16-coop.md, Lenses): the Ledger hears about
// shortages, idle buildings and lean times; the Hearth about new wishes, pattern hints and letters.
// Derived from the Mirror each time, so they clear themselves when the trouble does.
import { content } from '@qoti/content';
import { BuildingStatus, calendar, TICKS_PER_DAY, TIERS, type Lens, type LetterView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { buildingName, goodName, seatLabel } from './format';
import { IDLE_BITS, statusWords, TIER_WORD } from './hamlet';
import { letterKey } from './letters';
import { askText } from './panels/Requests';
import type { Letter } from './state';
import { inPlay, LIFE_ICON, priceText } from './village';

export type AlertAction =
  | { kind: 'building'; id: number }
  | { kind: 'wish'; id: number }
  | { kind: 'panel'; panel: string; page?: string }
  | { kind: 'place'; x: number; z: number }
  // I2 (C4F)
  | { kind: 'letter'; arc: string; step: number }
  | { kind: 'plan'; id: number }
  | { kind: 'request'; id: number }
  | { kind: 'market'; good: string };

/** I2 (C4F): who is reading, for requests and plans addressed to them and letters already read. */
export interface AlertContext {
  seat: number;
  lettersRead?: ReadonlySet<string>;
}

export interface Alert {
  /** Stable while the situation lasts, so a dismissal sticks. */
  key: string;
  lens: Lens;
  tone: 'warn' | 'news' | 'quiet';
  icon: string;
  text: string;
  action?: AlertAction;
}

/** Days of food in store below which the Ledger hears about it. */
const FOOD_DAYS_WARN = 2;
const MAX_IDLE = 4;

export function computeAlerts(
  m: Mirror,
  letters: readonly Letter[] = [],
  who: AlertContext = { seat: 0 },
): Alert[] {
  const out: Alert[] = [];
  const now = m.tick.value;
  const budget = m.budget.value;
  const town = m.town.value;

  // Ledger
  if (budget?.leanTimes || town?.leanTimes) {
    out.push({
      key: 'lean',
      lens: 'ledger',
      tone: 'warn',
      icon: 'coin',
      text: 'Lean times. New building waits until the treasury is back above zero.',
      action: { kind: 'panel', panel: 'reports', page: 'budget' },
    });
  }
  const stocks = m.stocks.value?.lines ?? [];
  const population = town?.population ?? m.residents.size;
  if (population > 0 && stocks.length) {
    let food = 0;
    for (const l of stocks) if (content.goodById.get(l.good)?.food) food += l.stock;
    const days = food / population;
    if (days < FOOD_DAYS_WARN) {
      out.push({
        key: 'food-low',
        lens: 'ledger',
        tone: 'warn',
        icon: 'reports',
        text:
          food === 0
            ? 'The larders are empty. Bread, vegetables or fish, quickly please.'
            : `Food for about ${days < 2 ? 'a day' : `${Math.floor(days)} days`} in store.`,
        action: { kind: 'panel', panel: 'reports', page: 'stocks' },
      });
    }
  }
  const stockOf = new Map(stocks.map((l) => [l.good, l.stock]));
  const short = new Map<string, string[]>();
  const idle: Alert[] = [];
  for (const b of m.buildings.values()) {
    const bits = b.rt?.status ?? 0;
    if (b.stage !== 'built' || !(bits & IDLE_BITS)) continue;
    const def = content.buildingById.get(b.def);
    if (bits & BuildingStatus.missingInput) {
      for (const [good] of def?.methods?.[0]?.inputs ?? []) {
        if ((stockOf.get(good) ?? 0) > 0) continue;
        const list = short.get(good) ?? [];
        list.push(buildingName(b.def).toLowerCase());
        short.set(good, list);
      }
    }
    idle.push({
      key: `idle-${b.id}-${bits & IDLE_BITS}`,
      lens: 'ledger',
      tone: 'quiet',
      icon: 'status',
      text: `${buildingName(b.def)}: ${statusWords(bits & IDLE_BITS)
        .join(', ')
        .toLowerCase()}.`,
      action: { kind: 'building', id: b.id },
    });
  }
  for (const [good, who] of short) {
    const names = [...new Set(who)];
    out.push({
      key: `short-${good}`,
      lens: 'ledger',
      tone: 'warn',
      icon: 'reports',
      text: `No ${goodName(good).toLowerCase()} in store. The ${names.join(' and the ')} ${names.length === 1 && who.length === 1 ? 'is' : 'are'} waiting.`,
      action: { kind: 'panel', panel: 'reports', page: 'stocks' },
    });
  }
  out.push(...idle.slice(0, MAX_IDLE));
  if (idle.length > MAX_IDLE) {
    out.push({
      key: `idle-more-${idle.length}`,
      lens: 'ledger',
      tone: 'quiet',
      icon: 'status',
      text: `And ${idle.length - MAX_IDLE} more buildings standing about.`,
      action: { kind: 'panel', panel: 'reports', page: 'buildings' },
    });
  }

  out.push(...villageAlerts(m, who));

  // Hearth
  const fresh = [...m.wishes.values()]
    .filter((w) => now - w.createdTick < TICKS_PER_DAY)
    .sort((a, b) => b.createdTick - a.createdTick);
  for (const w of fresh) {
    out.push({
      key: `wish-${w.id}`,
      lens: 'hearth',
      tone: 'news',
      icon: 'wishes',
      text: w.text,
      action: { kind: 'wish', id: w.id },
    });
  }
  const hints = [...m.patterns.values()].filter((p) => p.hinted && !p.discovered).map((p) => p.id);
  if (hints.length === 1) {
    const def = content.patternById.get(hints[0]!);
    out.push({
      key: `hints-${hints[0]}`,
      lens: 'hearth',
      tone: 'quiet',
      icon: 'patterns',
      text: `A hint in the Pattern Book: ${def?.hint ?? 'something to build.'}`,
      action: { kind: 'panel', panel: 'patterns', page: hints[0]! },
    });
  } else if (hints.length > 1) {
    out.push({
      key: `hints-${[...hints].sort().join('+')}`,
      lens: 'hearth',
      tone: 'quiet',
      icon: 'patterns',
      text: `${hints.length} hints in the margins of the Pattern Book.`,
      action: { kind: 'panel', panel: 'patterns' },
    });
  }
  for (const l of [...letters].reverse()) {
    if (now - l.tick > TICKS_PER_DAY) continue;
    out.push({
      key: `letter-${l.key}`,
      lens: 'hearth',
      tone: 'news',
      icon: l.kind.startsWith('life-') ? (LIFE_ICON[l.kind.slice(5)] ?? 'heart') : 'letter',
      text: l.text,
      ...(l.at ? { action: { kind: 'place' as const, x: l.at[0], z: l.at[1] } } : {}),
    });
  }
  return out;
}

export function alertsForLens(all: readonly Alert[], lens: Lens, dismissed: ReadonlySet<string>): Alert[] {
  return all.filter((a) => a.lens === lens && !dismissed.has(a.key));
}

/** Price alerts beyond this many are left for the market page. */
const MAX_PRICE_ALERTS = 2;

/**
 * I2 (C4F): the village's alerts. Ledger: steep or cheap prices, goods a tier cannot find. Both
 * lanes: story letters, requests and plans from the partner, an open Charter claim.
 */
function villageAlerts(m: Mirror, who: AlertContext): Alert[] {
  const out: Alert[] = [];
  const now = m.tick.value;
  const seats = m.seats.value;
  const both = (a: Omit<Alert, 'lens' | 'key'> & { key: string }): Alert[] => [
    { ...a, lens: 'hearth' },
    { ...a, lens: 'ledger' },
  ];

  // Prices that moved well away from the usual, dearest first.
  const market = m.market.value?.lines ?? [];
  const moved = market
    .filter((l) => inPlay(l) && l.demand > 0 && (l.price >= l.base * 1.5 || l.price <= l.base * 0.6))
    .sort((a, b) => b.price / b.base - a.price / a.base);
  for (const l of moved.slice(0, MAX_PRICE_ALERTS)) {
    const dear = l.price > l.base;
    const name = goodName(l.good);
    out.push({
      key: `price-${l.good}-${dear ? 'dear' : 'cheap'}`,
      lens: 'ledger',
      tone: dear ? 'warn' : 'quiet',
      icon: 'market',
      text: dear
        ? `${name} is dear at the stalls: ${priceText(l.price)} coins, usually ${priceText(l.base)}. More would help.`
        : `${name} is going cheap: ${priceText(l.price)} coins. A good week to sell some on.`,
      action: { kind: 'market', good: l.good },
    });
  }

  // Goods a tier wants that nobody has, group by group (Settler food has its own alert).
  const tiers = m.town.value?.tiers ?? [];
  const stock = new Map((m.stocks.value?.lines ?? []).map((l) => [l.good, l.stock]));
  const season = calendar(now).season;
  for (let t = 0; t < TIERS.length; t++) {
    if (!(tiers[t] ?? 0)) continue;
    const tier = TIERS[t]!;
    const basket = content.basketByTier.get(tier);
    for (const g of basket?.groups ?? []) {
      if (g.season !== undefined && g.season !== season) continue;
      if (tier === 'settler' && g.id === 'food') continue;
      if (g.goods.some(([good]) => (stock.get(good) ?? 0) > 0)) continue;
      const first = g.goods[0]?.[0] ?? g.id;
      out.push({
        key: `tier-short-${tier}-${g.id}`,
        lens: 'ledger',
        tone: 'warn',
        icon: 'people',
        text: `${TIER_WORD[tier] ?? tier} households can't find ${g.name.toLowerCase()} anywhere. Their baskets come home light.`,
        action: { kind: 'market', good: first },
      });
    }
  }

  // Story letters that came this visit and are still sealed, one line per correspondent.
  const sealed = new Map<string, LetterView[]>();
  for (const l of m.letters.value) {
    if (who.lettersRead?.has(letterKey(l)) || now - l.tick > 2 * TICKS_PER_DAY) continue;
    sealed.set(l.arc, [...(sealed.get(l.arc) ?? []), l]);
  }
  for (const [arc, list] of sealed) {
    const newest = list[list.length - 1]!;
    const count =
      list.length === 1 ? 'A letter' : list.length === 2 ? 'Two letters' : `${list.length} letters`;
    out.push(
      ...both({
        key: `story-${arc}-${list.length}`,
        tone: 'news',
        icon: 'letter',
        text: `${count} from ${newest.from}.`,
        action: { kind: 'letter', arc, step: newest.step },
      }),
    );
  }

  // The partner's requests from the last day: goods to the Ledger, charm to the Hearth, notes to both.
  for (const r of m.requests.values()) {
    if (r.status !== 'open' || r.from === who.seat || now - r.tick > TICKS_PER_DAY) continue;
    const text = `${seatLabel(seats, r.from, who.seat)} asks: ${askText(m, r.ask)}`;
    const a = {
      key: `request-${r.id}`,
      tone: 'news' as const,
      icon: 'requests',
      text,
      action: { kind: 'request' as const, id: r.id },
    };
    if (r.ask.kind === 'goods') out.push({ ...a, lens: 'ledger' });
    else if (r.ask.kind === 'charm') out.push({ ...a, lens: 'hearth' });
    else out.push(...both(a));
  }

  // Plans the partner drew that this seat has not opened.
  for (const p of m.plans.values()) {
    if (p.status !== 'open' || p.by === who.seat || p.seenBy.includes(who.seat as 0 | 1)) continue;
    out.push(
      ...both({
        key: `plan-${p.id}`,
        tone: 'news',
        icon: 'plan',
        text: `${seatLabel(seats, p.by, who.seat)} sketched a plan: ${p.name}.`,
        action: { kind: 'plan', id: p.id },
      }),
    );
  }

  // Every Charter goal met.
  const c = m.charter.value;
  if (c?.ready && c.next) {
    out.push(
      ...both({
        key: `charter-ready-${c.charter}`,
        tone: 'news',
        icon: 'charter',
        text: 'Every goal on the Charter is met. Claim it, ideally together.',
        action: { kind: 'panel', panel: 'charter' },
      }),
    );
  }
  return out;
}
