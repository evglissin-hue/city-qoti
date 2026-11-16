// Lens-filtered alerts for the left feed (docs/spec/16-coop.md, Lenses): the Ledger hears about
// shortages, idle buildings and lean times; the Hearth about new wishes, pattern hints and letters.
// Derived from the Mirror each time, so they clear themselves when the trouble does.
import { content } from '@qoti/content';
import {
  BuildingStatus,
  calendar,
  type DemandBarView,
  type DemandKind,
  methodOf,
  TICKS_PER_DAY,
  TIERS,
  type Lens,
  type LetterView,
} from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { goodName, placeName, pluralName, seatLabel } from './format';
import { editionFeedAlerts } from './eveningFeed';
import { gapAlerts } from './gaps';
import { loadSettings } from './settings';
import { readHands } from './hands';
import { readSites } from './sites';
import { coverDays, DEMAND_BAR } from './topbar/strip';
import { IDLE_BITS, statusWords, TIER_WORD } from './hamlet';
import { letterKey } from './letters';
import { askText } from './panels/Requests';
import type { Letter } from './state';
import { FAMILY_WORD, inPlay, LIFE_ICON, priceText } from './village';
import { seasonAlerts } from './seasonAlerts';

export type AlertAction =
  | { kind: 'building'; id: number }
  | { kind: 'wish'; id: number }
  | { kind: 'panel'; panel: string; page?: string }
  | { kind: 'place'; x: number; z: number }
  // I2 (C4F)
  | { kind: 'letter'; arc: string; step: number }
  | { kind: 'plan'; id: number }
  | { kind: 'request'; id: number }
  | { kind: 'market'; good: string }
  // P2-D: a zone brush or another tool, as the top bar's demand bars open them.
  | { kind: 'tool'; tool: string; variant?: string };

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
  /** The full words for the hover, when the line says it in fewer. */
  title?: string;
  /** A second, muted line under the text (a gap says what would close it). */
  note?: string;
  action?: AlertAction;
}

/** Days of food in store below which the Ledger hears about it. */
const FOOD_DAYS_WARN = 2;
const MAX_IDLE = 4;
/** Stone in store below which a waiting site raises the quarry alert. */
const STONE_LOW = 10;

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
      action: { kind: 'panel', panel: 'purse' },
    });
  }
  const stocks = m.stocks.value?.lines ?? [];
  const population = town?.population ?? m.residents.size;
  if (population > 0 && stocks.length) {
    let food = 0;
    for (const l of stocks) if (content.goodById.get(l.good)?.family === 'food') food += l.stock;
    // P2: the top bar's Food chip reads the Balances line (its stock and its days of cover). Read
    // the same line here, so the feed never says "about a day" beside a chip that says three.
    const line = m.balances.value?.lines.find((l) => l.family === 'food');
    if (line) food = line.stock;
    const days = line ? coverDays(line) : food / population;
    if (days < FOOD_DAYS_WARN) {
      out.push({
        key: 'food-low',
        lens: 'ledger',
        tone: 'warn',
        icon: 'good:bread',
        text:
          food === 0
            ? 'The larders are empty. Bread, vegetables or fish, quickly please.'
            : `Food for about ${days < 2 ? 'a day' : `${Math.floor(days)} days`} in store.`,
        action: { kind: 'panel', panel: 'balances', page: 'families' },
      });
    }
  }
  const stockOf = new Map(stocks.map((l) => [l.good, l.stock]));
  const short = new Map<string, string[]>();
  const hands = readHands(m);
  const handsEmpty = new Set(hands.empty);
  const idle: { id: number; own: number; name: string; words: string; count: number }[] = [];
  for (const b of m.buildings.values()) {
    const bits = b.rt?.status ?? 0;
    if (b.stage !== 'built' || !(bits & IDLE_BITS)) continue;
    // R1X: a business resting (out of season, or nothing to do) is not standing about: a winter
    // Village's cider makers, hives and orchards all called for fruit and hands till spring.
    if (bits & BuildingStatus.resting) continue;
    if (bits & BuildingStatus.missingInput) {
      for (const [good] of methodOf(b)?.inputs ?? []) {
        if ((stockOf.get(good) ?? 0) > 0) continue;
        const list = short.get(good) ?? [];
        list.push(placeName(b).toLowerCase());
        short.set(good, list);
      }
    }
    // P2-D: "nobody works here yet" is one line for the town (below), not one per building.
    const own = bits & IDLE_BITS & ~(handsEmpty.has(b.id) ? BuildingStatus.noWorkers : 0);
    if (!own) continue;
    const words = `${statusWords(own).join(', ').toLowerCase()}.`;
    const name = placeName(b);
    // Identical lines fold into one counted line ("2 Forester's lodges: no mature trees in reach.").
    const twin = idle.find((g) => g.name === name && g.words === words);
    if (twin) {
      twin.count++;
      continue;
    }
    idle.push({ id: b.id, own, name, words, count: 1 });
  }
  const idleAlerts: Alert[] = idle.map((g) => ({
    key: g.count > 1 ? `idle-${g.id}-${g.own}-x${g.count}` : `idle-${g.id}-${g.own}`,
    lens: 'ledger',
    tone: 'quiet',
    icon: 'status',
    text: `${g.count > 1 ? `${g.count} ${pluralName(g.name)}` : g.name}: ${g.words}`,
    action: g.count > 1 ? { kind: 'panel', panel: 'businesses' } : { kind: 'building', id: g.id },
  }));

  const sites = readSites(m);
  const materials = sitesMaterialsAlert(m, sites);
  if (materials) out.push(materials);
  out.push(...zoneAlerts(m, 'wanted'));
  const builders = sitesBuildersAlert(m, sites);
  if (builders) out.push(builders);
  const handsAlert = handsLine(m, hands);
  if (handsAlert) out.push(handsAlert);

  for (const [good, who] of short) {
    // R1X: "the cider makers", not "the cider maker are", when several of a kind wait.
    const names = [...new Set(who)].map((n) => (who.filter((x) => x === n).length > 1 ? `${n}s` : n));
    out.push({
      key: `short-${good}`,
      lens: 'ledger',
      tone: 'warn',
      icon: `good:${good}`,
      text: `No ${goodName(good).toLowerCase()} in store. The ${names.join(' and the ')} ${who.length === 1 ? 'is' : 'are'} waiting.`,
      action: { kind: 'panel', panel: 'balances', page: 'families' },
    });
  }
  // Playtest round six: a site waiting on stone, with the stone nearly gone, wants a quarry. P2-D:
  // the sites line says so itself when it names stone.
  if (stocks.length && (stockOf.get('stone') ?? 0) < STONE_LOW && !materials?.key.includes('stone')) {
    for (const b of m.buildings.values()) {
      if (b.stage !== 'construction') continue;
      if (!content.buildingById.get(b.def)?.cost?.goods?.some(([g]) => g === 'stone')) continue;
      out.push({
        key: 'stone-low',
        lens: 'ledger',
        tone: 'warn',
        icon: 'reports',
        text: 'Stone is running low. A quarry on a grey outcrop keeps it coming.',
        action: { kind: 'panel', panel: 'balances', page: 'families' },
      });
      break;
    }
  }
  // Gaps first (the town's own asks), the ledger's copies here and the hearth's with its news.
  const gaps = gapAlerts(m, who);
  // R2D: the evening edition as a feed line, for a player who chose it over the card.
  const edition = editionFeedAlerts(m, loadSettings().editionInFeed);
  out.push(...edition.filter((a) => a.lens === 'ledger'));
  out.push(...gaps.filter((a) => a.lens === 'ledger'));
  out.push(...idleAlerts.slice(0, MAX_IDLE));
  const hidden = idle.slice(MAX_IDLE).reduce((n, g) => n + g.count, 0);
  if (hidden > 0) {
    out.push({
      key: `idle-more-${idle.length}-${hidden}`,
      lens: 'ledger',
      tone: 'quiet',
      icon: 'status',
      text: `And ${hidden} more building${hidden === 1 ? '' : 's'} standing about.`,
      action: { kind: 'panel', panel: 'businesses' },
    });
  }
  out.push(...zoneAlerts(m, 'growth'));

  out.push(...villageAlerts(m, who));
  out.push(...seasonAlerts(m));

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
  out.push(...edition.filter((a) => a.lens === 'hearth'));
  out.push(...gaps.filter((a) => a.lens === 'hearth'));
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
      icon: l.kind.startsWith('life-')
        ? (LIFE_ICON[l.kind.slice(5)] ?? 'heart')
        : l.kind === 'festival'
          ? 'festival'
          : 'letter',
      text: l.text,
      ...(l.at ? { action: { kind: 'place' as const, x: l.at[0], z: l.at[1] } } : {}),
    });
  }
  return foldSame(out);
}

/**
 * The safety net for the whole class: two lines of one lens that read the same are one line (a
 * feed that says a thing twice reads like a bug). Counted lines are made at the source; this keeps
 * the first.
 */
export function foldSame(all: readonly Alert[]): Alert[] {
  const seen = new Set<string>();
  const out: Alert[] = [];
  for (const a of all) {
    const k = `${a.lens}|${a.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
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

  // Families a tier wants that nobody has any of (Settler food has its own alert). R1X: only once
  // households have purses (from the Village charter: a Hamlet's baskets are free, as in I1), and
  // only for wants of some amount (Settlers want no Wares), or day one in a new valley said Settler
  // households could not find wares.
  const rank = m.charter.value?.rank ?? m.town.value?.rank;
  const tiers = rank === 'hamlet' ? [] : (m.town.value?.tiers ?? []);
  const stock = new Map((m.stocks.value?.lines ?? []).map((l) => [l.good, l.stock]));
  const season = calendar(now).season;
  for (let t = 0; t < TIERS.length; t++) {
    if (!(tiers[t] ?? 0)) continue;
    const tier = TIERS[t]!;
    const basket = content.basketByTier.get(tier);
    for (const w of basket?.wants ?? []) {
      if (w.season !== undefined && w.season !== season) continue;
      if (w.amount <= 0) continue;
      if (tier === 'settler' && w.family === 'food') continue;
      const goods = content.goods.filter((g) => g.family === w.family);
      if (goods.some((g) => (stock.get(g.id) ?? 0) > 0)) continue;
      out.push({
        key: `tier-short-${tier}-${w.family}`,
        lens: 'ledger',
        tone: 'warn',
        icon: 'people',
        text: `${TIER_WORD[tier] ?? tier} households can't find ${FAMILY_WORD[w.family].toLowerCase()} anywhere. Their baskets come home light.`,
        action: { kind: 'market', good: goods[0]?.id ?? w.family },
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

// --- P2-D: what the town is waiting for ---------------------------------------------------------

const lower = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);
const aOrAn = (word: string): string => (/^[aeiou]/i.test(word) ? `An ${word}` : `A ${word}`);

/** "timber", "timber and stone", "timber, stone and clay". */
function list(words: readonly string[]): string {
  return words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** What a maker's verb is for a good ("cuts timber"), else "makes". */
const MAKER_VERB: Record<string, string> = { stone: 'digs', timber: 'cuts' };

/** The plainest building that makes a good here, as the inspector names it, or null. */
function makerOf(m: Mirror, good: string): string | null {
  const mode = m.settings.value.mode;
  const cost = (d: { cost?: { goods?: readonly (readonly [string, number])[] } }) =>
    (d.cost?.goods ?? []).reduce((n, [, q]) => n + q, 0);
  const maker = content.buildings
    .filter(
      (d) =>
        d.methods?.some((x) => x.outputs.some(([o]) => o === good)) &&
        (!d.modes || d.modes.includes(mode)) &&
        (!d.grows || d.grows.handPlaced),
    )
    .sort((a, b) => Number(!!a.requires) - Number(!!b.requires) || cost(a) - cost(b))[0];
  return maker?.name ?? null;
}

/**
 * The feed's text clamps at three lines of a 270px panel, about this many characters. A line is
 * told in its richest wording that fits, and falls back to a shorter one (the full text is also the
 * tooltip), so nothing is ever cut mid-sentence.
 */
export const FEED_FIT = 88;
const fits = (...options: string[]): string =>
  options.find((t) => t.length <= FEED_FIT) ?? options[options.length - 1]!;

/** Ledger: open sites that wait on goods the stores cannot cover, and what to do about it. */
function sitesMaterialsAlert(m: Mirror, sites: ReturnType<typeof readSites>): Alert | null {
  const first = sites.waitingMaterials[0];
  const short = sites.goods.filter((g) => g.need > g.stock);
  if (first === undefined || !short.length) return null;
  const n = sites.waitingMaterials.length;
  const names = short.map((g) => goodName(g.good).toLowerCase());
  const hold = list(short.map((g) => String(g.stock)));
  const worst = short[0]!.good;
  const one = short.length === 1;
  const needs = one ? `${short[0]!.need} more` : `${list(short.map((g, i) => `${g.need} ${names[i]}`))} more`;
  const sites1 = n === 1;
  const heads = one
    ? [
        `${sites1 ? 'A site is' : `${n} sites are`} waiting for ${names[0]}: ${sites1 ? 'it needs' : 'they need'} ${needs} and the stores hold ${hold}.`,
        `${sites1 ? 'A site needs' : `${n} sites need`} ${short[0]!.need} more ${names[0]}; the stores hold ${hold}.`,
        `${sites1 ? 'A site needs' : `${n} sites need`} ${short[0]!.need} more ${names[0]}; ${hold} in store.`,
      ]
    : [
        `${sites1 ? 'A site is' : `${n} sites are`} waiting for ${list(names)}: ${sites1 ? 'it needs' : 'they need'} ${needs}, and the stores hold ${hold}.`,
        `${sites1 ? 'A site needs' : `${n} sites need`} ${list(short.map((g, i) => `${g.need} ${names[i]}`))}; the stores hold ${hold}.`,
        `${sites1 ? 'A site needs' : `${n} sites need`} ${short.map((g, i) => `${g.need} ${names[i]}`).join(', ')}; ${hold} in store.`,
      ];
  const treasury = m.town.value?.treasury ?? 1;
  const rule = m.balances.value?.lines.find((l) => l.family === 'materials')?.rule;
  const maker = makerOf(m, worst);
  const makes = maker ? `${aOrAn(maker)} ${MAKER_VERB[worst] ?? 'makes'} ${names[0]}` : '';
  // What can be done about it, richest first: a blocked carrier is the news; else who makes it.
  const remedies: string[] =
    treasury <= 0
      ? [
          'The carrier buys none while the treasury is empty.',
          'The carrier buys none: the purse is empty.',
          'The carrier has no coin to buy.',
        ]
      : rule === 'never'
        ? ['The carrier is told never to buy materials.', 'The carrier is told to buy none.']
        : maker
          ? [`${makes} here; the carrier brings some at ten.`, `${makes}.`, 'The carrier brings some at ten.']
          : ['The carrier brings some at ten.'];
  let text = '';
  for (const r of remedies) {
    text = heads.map((h) => `${h} ${r}`).find((t) => t.length <= FEED_FIT) ?? '';
    if (text) break;
  }
  if (!text) text = fits(...heads);
  return {
    key: `sites-materials-${short
      .map((g) => g.good)
      .sort()
      .join('+')}`,
    lens: 'ledger',
    tone: 'warn',
    icon: `good:${worst}`,
    text,
    action: { kind: 'building', id: first },
  };
}

/** Ledger, by day: sites with their materials but no builder at work. */
function sitesBuildersAlert(m: Mirror, sites: ReturnType<typeof readSites>): Alert | null {
  const first = sites.waitingBuilders[0];
  const hour = m.clock.value.hour;
  if (first === undefined || hour < 8 || hour >= 19) return null;
  const n = sites.waitingBuilders.length;
  return {
    key: 'sites-builders',
    lens: 'ledger',
    tone: 'quiet',
    icon: 'apprentice',
    text: `${n === 1 ? 'A site is' : `${n} sites are`} waiting for a builder. A Builder's Yard adds more of them.`,
    action: { kind: 'building', id: first },
  };
}

/** Ledger: built workplaces with nobody at all, as one line. */
function handsLine(m: Mirror, hands: ReturnType<typeof readHands>): Alert | null {
  const first = hands.empty[0];
  if (first === undefined) return null;
  const names = hands.empty.map((id) => {
    const b = m.buildings.get(id);
    return b ? placeName(b) : 'workplace';
  });
  // R2D (the player's chair): "nobody works here yet. 0 jobs are open" read as a contradiction.
  const open = hands.openJobs === 1 ? '1 job is open' : `${hands.openJobs} jobs are open`;
  const jobs = hands.openJobs > 0 ? `${open}; more Homes bring more folk.` : 'More Homes bring more folk.';
  const text =
    names.length === 1
      ? `${names[0]}: nobody works here yet. ${jobs}`
      : `${names.length} workplaces have nobody yet. ${jobs}`;
  const shown = names.slice(0, 3).map((n) => `the ${n}`);
  const rest = names.length - shown.length;
  const title =
    names.length === 1
      ? undefined
      : `Nobody works at ${list(rest > 0 ? [...shown, `${rest} more`] : shown)} yet. ${hands.openJobs > 0 ? `${open} in town; more Homes bring more folk.` : 'More Homes bring more folk.'}`;
  return {
    key: 'hands-empty',
    lens: 'ledger',
    tone: 'quiet',
    icon: 'people',
    text,
    ...(title ? { title } : {}),
    action: { kind: 'building', id: first },
  };
}

/** The icon of each demand bar's zone. */
const ZONE_ICON: Record<DemandKind, string> = {
  farmland: 'field',
  homes: 'home',
  shops: 'market',
  workshops: 'building',
};

/** Shorter wordings for the sim's longest reasons, when one will not fit the feed. */
const SHORT_WHY: Record<string, (zone: string) => string[]> = {
  noRoad: (z) => [`${z}: zoned, but no street runs along it. Lots are cut along streets.`],
  outOfReach: (z) => [
    `${z}: free lots lie beyond the porters' reach. Zone nearer, or add a storehouse.`,
    `${z}: free lots lie beyond the porters' reach. Zone nearer.`,
  ],
  materials: (z) => [`${z}: a lot waits, but the stores are too short to start on it.`],
};

const WANTED_CODES = new Set(['needsLand', 'noRoad', 'outOfReach', 'unsuitable', 'marketStall']);
const GROWTH_CODES = new Set(['lotWaiting', 'materials', 'sitesBusy']);

/** The reason that says where a bar stands: the last one, when it is one of the standing codes. */
function standing(bar: DemandBarView, codes: Set<string>): { code: string; why: string } | null {
  const i = bar.reasons.length - 1;
  const r = bar.reasons[i];
  if (!r || !codes.has(r.code)) return null;
  if (r.code === 'lotWaiting' && r.value === undefined) return null;
  return { code: r.code, why: bar.why[i] ?? '' };
}

/**
 * Ledger: one line per lit bar ('wanted': zone more land, a street, a storehouse), or per quiet bar
 * with growth on its way or held ('growth'). The words are the sim's own, led by the zone's name.
 */
function zoneAlerts(m: Mirror, which: 'wanted' | 'growth'): Alert[] {
  const out: Alert[] = [];
  for (const bar of m.demand.value?.bars ?? []) {
    const info = DEMAND_BAR[bar.kind];
    const zone = info.label;
    const icon = ZONE_ICON[bar.kind];
    if (which === 'wanted') {
      if (!bar.lit) continue;
      const s = standing(bar, WANTED_CODES) ?? { code: 'needsLand', why: '' };
      let text: string;
      let action: AlertAction = { kind: 'tool', tool: 'zone', variant: info.zone };
      if (s.code === 'needsLand') {
        text = fits(
          `The town wants more ${zone} zoned. ${bar.why[0] ?? ''}`.trim(),
          `Zone more ${zone}. ${bar.why[0] ?? ''}`.trim(),
        );
      } else if (s.code === 'marketStall') {
        // The sim's sentence opens with the zone's own name, so it needs no second one.
        text = `Shops wait for the Village charter. Until then, a Market Stall does the job.`;
        action = { kind: 'tool', tool: 'zone' };
      } else {
        text = fits(`${zone}: ${lower(s.why)}`, ...(SHORT_WHY[s.code]?.(zone) ?? []));
        if (s.code === 'noRoad') action = { kind: 'tool', tool: 'street' };
      }
      out.push({ key: `zone-${bar.kind}-${s.code}`, lens: 'ledger', tone: 'warn', icon, text, action });
    } else {
      if (bar.lit || !(bar.value > 0)) continue;
      const s = standing(bar, GROWTH_CODES);
      if (!s) continue;
      out.push({
        key: `growth-${bar.kind}-${s.code}`,
        lens: 'ledger',
        tone: s.code === 'materials' ? 'warn' : 'quiet',
        icon,
        text: fits(`${zone}: ${lower(s.why)}`, ...(SHORT_WHY[s.code]?.(zone) ?? [])),
        action: { kind: 'tool', tool: 'zone', variant: info.zone },
      });
    }
  }
  return out;
}
