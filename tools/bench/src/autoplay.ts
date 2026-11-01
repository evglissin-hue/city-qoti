// A headless pair of players for tuning (C3X): from the standard start, a Ledger player builds
// what the town is short of (homes, food, timber, stone, wells, a stall, a builder's yard, the
// bread chain) and connects everything with paths, and a Hearth player answers wishes and dresses
// the lanes with benches, flowers, trees and lanterns. It plays once a day at 09:00 and 15:00,
// like two people dropping in, and logs a line per day. Used by `npm run tune` and a test that
// holds the I1 acceptance targets (docs/spec/30-roadmap.md, I1).
// I2 (C4A): the Ledger player claims the Charter when it is ready, and once the market opens at
// Village rank it minds the money: it trims wages or firms up the income tax when purses fill
// while the treasury slides (and the other way round when households go short), keeps a standing
// order book at the Trading Post when there is one, and visits the County Bank when the treasury
// runs low, paying it back once flush.
//
// C4D: at 15:00 the two also work together: the Ledger claims the Charter once it is ready, the
// Hearth asks the Ledger for food at the stall with a request (it closes itself when the porters
// deliver), the Hearth sketches lanterns and flowers as a plan that the Ledger approves on its next
// visit, and both keep an eye on the story characters' hints (a lantern by their door, a seat and
// flowers by the market, a spare home for the next one to move in).
//
// C5.0: one player now, the planner (`planner.ts`), with one build queue, one labor budget and one
// money reserve, fed by advisors (`advisors/`) that each mind an area and propose wants: the Ledger's
// side is the street, charter, money and hamlet advisors, the Hearth's the hearth advisor, the C4D
// loop the together advisor and the C4C Village half the village advisor. They play as the two
// players did, to the coin (TUNE-RESTRUCTURE.md).
import { content } from '@qoti/content';
import {
  basketScore,
  LEDGER_CATEGORIES,
  loansOwed,
  moodBand,
  PENNIES_PER_COIN,
  rankAtLeast,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  townStock,
  HealthWatch,
  type GrowthDemand,
  type HealthIssue,
  type WorldState,
} from '@qoti/sim';
import { advisors, type AutoplayOptions } from './advisors';
import { command, runTicks, startingTown, type Hamlet } from './hamlet';
import { Planner } from './planner';
import { charterLine, craftsfolk, FOODS, G, sites, storyLetters, vacantHomes } from './town';
import { grownSince, growthLine, type GrowthLine, type GrowthNight, type HighStreet } from './village';

export type { AutoplayOptions } from './advisors';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const coinsOf = (pennies: number) => Math.round(pennies / PENNIES_PER_COIN);

export interface DayLine {
  day: number;
  residents: number;
  households: number;
  vacantHomes: number;
  coins: number;
  food: number;
  foodMade: number;
  foodEaten: number;
  planks: number;
  stone: number;
  avgMood: number;
  miserable: number;
  wishes: number;
  wishesGranted: number;
  patterns: number;
  achievements: number;
  departures: number;
  leanTimes: boolean;
  built: number;
  sites: number;
  /** Village runs (C4B): lots, grown buildings by zone kind and demand. */
  growth?: GrowthLine;
  // I2 (C4A)
  rank: string;
  /** Charter goals met, of the Charter on the board. */
  charter: string;
  /** Coins in household purses. */
  savings: number;
  /** Yesterday's wages, sales, taxes and trade (exports less imports), coins. */
  wages: number;
  sales: number;
  taxes: number;
  trade: number;
  /** Coins owed to the County Bank. */
  owed: number;
  /** Average basket satisfaction (the goods need), 0 to 100. */
  basket: number;
  wageLevel: number;
  taxRate: number;
  // C4D: lives, stories and working together.
  couples: number;
  weddings: number;
  births: number;
  seaside: number;
  /** Story letters sent so far (arrivals and steps, across arcs). */
  story: number;
  requests: number;
  plans: number;
  // I2 (C4C)
  craftsfolk: number;
  innovations: number;
}

export interface AutoplayResult {
  hamlet: Hamlet;
  days: DayLine[];
  /** Everything the players tried and whether the sim took it, for reading a run. */
  actions: string[];
  /** The high street of a Village run (C4B), once laid. */
  street?: HighStreet | null;
  /** Playtest round three: every health issue seen, checked each game hour (first sighting kept). */
  health: HealthIssue[];
}

function dayLine(w: WorldState, day: number): DayLine {
  const stock = townStock(w);
  const moods = w.residents.map((r) => r.mood);
  const y = w.economy.yesterday.money;
  const hh = Math.max(1, w.households.length);
  return {
    day,
    residents: w.residents.length,
    households: w.households.length,
    vacantHomes: vacantHomes(w),
    coins: Math.round(w.economy.treasury / PENNIES_PER_COIN),
    food: FOODS.reduce((n, g) => n + stock[g]!, 0),
    foodMade: FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0),
    foodEaten: FOODS.reduce((n, g) => n + (w.economy.yesterday.consumed[g] ?? 0), 0),
    planks: stock[G('planks')]!,
    stone: stock[G('stone')]!,
    avgMood: moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : 0,
    miserable: w.residents.filter((r) => moodBand(r.mood) <= 1).length,
    wishes: w.wishes.length,
    wishesGranted: w.stats.wishesGranted,
    patterns: w.hearth.discovered.length,
    achievements: w.achievements.length,
    departures: w.stats.departures,
    leanTimes: w.economy.leanTimes,
    built: w.buildings.filter((b) => b.stage === 'built').length,
    sites: sites(w),
    rank: w.charter.rank,
    charter: charterLine(w),
    savings: coinsOf(w.households.reduce((n, h) => n + h.savings, 0)),
    wages: coinsOf(y[cat('wages')]!),
    sales: coinsOf(y[cat('sales')]!),
    taxes: coinsOf(y[cat('taxes')]!),
    trade: coinsOf(y[cat('exports')]! - y[cat('imports')]! + y[cat('peddler')]!),
    owed: coinsOf(loansOwed(w)),
    basket: Math.round(w.households.reduce((n, h) => n + basketScore(h), 0) / hh),
    wageLevel: w.levers.wageLevel,
    taxRate: w.levers.taxRate,
    couples: w.village.couples,
    weddings: w.village.weddings,
    births: w.village.births,
    seaside: w.village.seaside,
    story: storyLetters(w),
    requests: w.village.requestsFulfilled,
    plans: w.village.plansApproved,
    craftsfolk: craftsfolk(w),
    innovations: w.innovations.filter((i) => i.unlockedTick >= 0).length,
  };
}

/** Ticks until the clock next shows `hour`:00, with `hourly` after each game hour. */
function untilHour(h: Hamlet, hour: number, hourly?: () => void): void {
  const now = (h.world.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
  let n = (hour * TICKS_PER_HOUR - now + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (n === 0) n = TICKS_PER_DAY;
  // By the clock, not by turns: a night turn runs NIGHT_HURRY ticks (playtest round five), so
  // counting turns overshot every night, the day's last stop landed at 01:00 instead of 23:00, and
  // a Village day (which waits for 01:00 next) ran about three days between advisor visits.
  const target = h.world.tick + n;
  let nextHour = h.world.tick + TICKS_PER_HOUR;
  while (h.world.tick < target) {
    runTicks(h, 1);
    if (h.world.tick >= nextHour) {
      hourly?.();
      nextHour += TICKS_PER_HOUR;
    }
  }
}

/**
 * Plays `days` in-game days from the standard start and returns a line per day. With `village`,
 * the valley becomes a Village on that morning and the Ledger lays and zones a high street (C4B);
 * the day lines then carry the growth numbers and the result the street. From `handsOff` on both
 * players leave the valley alone, so what happens next is the village's own doing.
 */
export function autoplay(seed: string, days: number, opts: AutoplayOptions = {}): AutoplayResult {
  const h = startingTown(seed, { economy: opts.economy ?? 'standard' });
  const planner = new Planner(h);
  // Every advisor that plays this run, in visit order.
  const team = advisors
    .filter((a) => a.plays(opts, h.world))
    .sort((a, b) => a.slot - b.slot)
    .map((a) => a.create(planner));
  const out: DayLine[] = [];
  const store = content.buildingById.get('storehouse') as { tags: string[] };
  const tags = store.tags;
  const lend = opts.standInPost && !content.buildingById.has('trading-post');
  /** First day that began at Village rank (claimed or granted); 0 while a Hamlet. */
  let villageFrom = 0;
  const watch = new HealthWatch();
  const health = new Map<string, HealthIssue>();
  const look = () => {
    for (const i of watch.check(h.world)) if (!health.has(i.kind + i.id)) health.set(i.kind + i.id, i);
  };
  try {
    for (let d = 1; d <= days; d++) {
      const playing = opts.handsOff === undefined || d < opts.handsOff;
      // Village runs watch the night's growth pass (01:00): what it wanted, and what it started.
      let night: GrowthNight | undefined;
      if (villageFrom > 0 && d > villageFrom) {
        untilHour(h, 1, look);
        const before = growthLine(h.world);
        runTicks(h, 1);
        night = { demand: before.demand, started: grownSince(before, growthLine(h.world)) };
      }
      untilHour(h, 9, look);
      if (d === opts.villageDay && !rankAtLeast(h.world, 'village')) {
        // Through the real claim, as if every goal had just been met.
        h.world.charter.ready = true;
        command(h, [{ t: 'charter.claim' }]);
        planner.actions.push(`${d}:granted Village`);
      }
      // The first morning at Village rank, however it came, the Ledger lays and zones a high street.
      if (villageFrom === 0 && rankAtLeast(h.world, 'village')) {
        villageFrom = d;
        if (playing) for (const a of team) a.rankUp?.();
      }
      if (lend && rankAtLeast(h.world, 'village') && store.tags === tags)
        store.tags = [...tags, 'trading-post'];
      if (playing) for (const a of team) a.visit({ afternoon: false });
      untilHour(h, 15, look);
      if (playing) for (const a of team) a.visit({ afternoon: true });
      untilHour(h, 23, look);
      const line = dayLine(h.world, d);
      if (villageFrom > 0) line.growth = { ...growthLine(h.world), night };
      out.push(line);
      opts.onDay?.(h.world, line);
    }
  } finally {
    store.tags = tags;
  }
  return {
    hamlet: h,
    days: out,
    actions: planner.actions,
    street: planner.street,
    health: [...health.values()],
  };
}

/** Homes, shops, crafts and farms as four digits ("2010"), or "-" for no night watched. */
function kinds(k: GrowthDemand | undefined): string {
  return k ? `${k.homes}${k.shops}${k.crafts}${k.farms}` : '-';
}

/** The table `npm run tune` prints (Village runs add the night's growth: wanted and started). */
export function formatDays(days: readonly DayLine[]): string {
  const head =
    'day  pop hh vac coins food made eaten plank stone mood mis wish grant pat ach left lean built sites' +
    '  cpl wed born sea story req plan | rank    charter        sav wage sale  tax trade owed bask wl tx crafts inv' +
    (days.some((d) => d.growth) ? ' lots hom sh cr fa grw want+ grew+' : '');
  const rows = days.map((d) =>
    [
      String(d.day).padStart(3),
      String(d.residents).padStart(4),
      String(d.households).padStart(2),
      String(d.vacantHomes).padStart(3),
      String(d.coins).padStart(5),
      String(d.food).padStart(4),
      String(d.foodMade).padStart(4),
      String(d.foodEaten).padStart(5),
      String(d.planks).padStart(5),
      String(d.stone).padStart(5),
      String(d.avgMood).padStart(4),
      String(d.miserable).padStart(3),
      String(d.wishes).padStart(4),
      String(d.wishesGranted).padStart(5),
      String(d.patterns).padStart(3),
      String(d.achievements).padStart(3),
      String(d.departures).padStart(4),
      (d.leanTimes ? 'yes' : 'no').padStart(4),
      String(d.built).padStart(5),
      String(d.sites).padStart(5),
      String(d.couples).padStart(4),
      String(d.weddings).padStart(3),
      String(d.births).padStart(4),
      String(d.seaside).padStart(3),
      String(d.story).padStart(5),
      String(d.requests).padStart(3),
      String(d.plans).padStart(4),
      '|',
      d.rank.slice(0, 7).padEnd(7),
      d.charter.padEnd(14),
      String(d.savings).padStart(4),
      String(d.wages).padStart(4),
      String(d.sales).padStart(4),
      String(d.taxes).padStart(4),
      String(d.trade).padStart(5),
      String(d.owed).padStart(4),
      String(d.basket).padStart(4),
      String(d.wageLevel).padStart(3),
      String(d.taxRate).padStart(2),
      String(d.craftsfolk).padStart(6),
      String(d.innovations).padStart(3),
      ...(d.growth
        ? [
            String(d.growth.lots).padStart(4),
            String(d.growth.homes).padStart(3),
            String(d.growth.shops).padStart(2),
            String(d.growth.crafts).padStart(2),
            String(d.growth.farms).padStart(2),
            String(d.growth.sites).padStart(3),
            kinds(d.growth.night?.demand).padStart(5),
            kinds(d.growth.night?.started).padStart(5),
          ]
        : []),
    ].join(' '),
  );
  return [head, ...rows].join('\n');
}
