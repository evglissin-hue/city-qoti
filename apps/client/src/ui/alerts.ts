// Lens-filtered alerts for the left feed (docs/spec/16-coop.md, Lenses): the Ledger hears about
// shortages, idle buildings and lean times; the Hearth about new wishes, pattern hints and letters.
// Derived from the Mirror each time, so they clear themselves when the trouble does.
import { content } from '@qoti/content';
import { BuildingStatus, TICKS_PER_DAY, type Lens } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { buildingName, goodName } from './format';
import { IDLE_BITS, statusWords } from './hamlet';
import type { Letter } from './state';

export type AlertAction =
  | { kind: 'building'; id: number }
  | { kind: 'wish'; id: number }
  | { kind: 'panel'; panel: string; page?: string }
  | { kind: 'place'; x: number; z: number };

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

export function computeAlerts(m: Mirror, letters: readonly Letter[] = []): Alert[] {
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
            : `Food for about ${days < 1 ? 'a day' : `${Math.floor(days)} days`} in store.`,
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
      icon: 'letter',
      text: l.text,
      ...(l.at ? { action: { kind: 'place' as const, x: l.at[0], z: l.at[1] } } : {}),
    });
  }
  return out;
}

export function alertsForLens(all: readonly Alert[], lens: Lens, dismissed: ReadonlySet<string>): Alert[] {
  return all.filter((a) => a.lens === lens && !dismissed.has(a.key));
}
