// `npm run newcomer -w @qoti/bench [days] [seeds...]` (P3A): plays each seed as a newcomer pair
// (`newcomer.ts`) and, with NEWCOMER_TUNED=1, as the tuned autoplayer, and prints a line a day of
// hands, jobs, food and hunger, then a row a seed: the Village day, residents at 20, 40 and 70, the
// hours the first two homes and the first farmstead took from site to roof, the days some household
// missed a meal, and the days food jobs stood open while the town was short of food.
// NEWCOMER_DAYS=1 prints the day lines.
import { rankAtLeast, TICKS_PER_DAY, townStock, type WorldState } from '@qoti/sim';
import { autoplay } from './autoplay';
import { DEFAULT_SEEDS } from './audit';
import { charterOpen, FOODS } from './town';
import { handsNow, hourAt, hungerNow, isHomeDef, SiteClock, type HandsNow, type Hunger } from './newcomer';

export interface NewcomerDay {
  day: number;
  residents: number;
  households: number;
  hands: HandsNow;
  /** Days of Food in hand (stock and pantries a resident). */
  foodDays: number;
  /** Residents and households who missed this morning's meal (read at 08:00). */
  hungry: Hunger;
  sites: number;
  rank: string;
  /** The Homes bar's reasons, codes joined. */
  homes: string;
  /** Businesses, and those at level 2 and 3. */
  businesses: number;
  level2: number;
  level3: number;
  /** The Charter's goals met, and every goal still open. */
  charter: string;
}

export interface NewcomerRow {
  seed: string;
  profile: string;
  villageDay: number;
  residents20: number;
  residents40: number;
  residents70: number;
  firstHomes: [number, number][];
  firstFarmstead: [number, number][];
  /** Days some household missed breakfast; the worst day's households. */
  hungryDays: number;
  worstHungry: number;
  /** Days some household missed a meal for another reason than an empty purse (food short, or out of reach). */
  hungryUnpaidDays: number;
  /** Days with food jobs open while Food was under three days in hand. */
  foodShortOpenDays: number;
  /** The first day a business stood at level 2 (0: none). */
  firstLevel2: number;
  /** The health watch's issues of the run, by kind and text. */
  health: string[];
  days: NewcomerDay[];
}

function dayOf(w: WorldState): number {
  return Math.floor(w.tick / TICKS_PER_DAY) + 1;
}

/** Days of Food in hand: town stock and pantries over the residents. */
function foodDaysInHand(w: WorldState): number {
  const stock = townStock(w);
  let food = FOODS.reduce((n, g) => n + stock[g]!, 0);
  for (const h of w.households) food += FOODS.reduce((n, g) => n + (h.pantry[g] ?? 0), 0);
  return w.residents.length > 0 ? food / w.residents.length : 0;
}

export function newcomerRow(seed: string, days: number, newcomer = true): NewcomerRow {
  const clock = new SiteClock();
  let hungry: Hunger = { residents: 0, households: 0, noOutlet: 0, broke: 0 };
  const out: NewcomerDay[] = [];
  const run = autoplay(seed, days, {
    village: true,
    threat: 'standard',
    newcomer,
    onHour: (w) => {
      clock.look(w);
      if (hourAt(w.tick) === 8) hungry = hungerNow(w);
    },
    onDay: (w) => {
      out.push({
        day: dayOf(w),
        residents: w.residents.length,
        households: w.households.length,
        hands: handsNow(w),
        foodDays: Math.round(foodDaysInHand(w) * 10) / 10,
        hungry,
        sites: w.buildings.filter((b) => b.stage === 'construction').length,
        rank: rankAtLeast(w, 'village') ? 'village' : 'hamlet',
        homes: (w.demand.reasons[0] ?? []).map((r) => r.code).join(','),
        businesses: w.buildings.filter((b) => b.trade && b.stage === 'built').length,
        level2: w.buildings.filter((b) => b.trade && (b.level ?? 1) === 2).length,
        level3: w.buildings.filter((b) => b.trade && (b.level ?? 1) >= 3).length,
        charter: rankAtLeast(w, 'village') ? '' : charterOpen(w).join(','),
      });
    },
  });
  const at = (d: number) => out.find((l) => l.day === d)?.residents ?? 0;
  return {
    seed,
    profile: newcomer ? 'newcomer' : 'tuned',
    villageDay: out.find((l) => l.rank === 'village')?.day ?? 0,
    residents20: at(20),
    residents40: at(40),
    residents70: at(70),
    firstHomes: clock.first((d) => isHomeDef(d), 2),
    firstFarmstead: clock.first((d) => d === 'farmstead', 1),
    hungryDays: out.filter((l) => l.hungry.households > 0).length,
    worstHungry: Math.max(0, ...out.map((l) => l.hungry.households)),
    hungryUnpaidDays: out.filter((l) => l.hungry.households - l.hungry.broke > 0).length,
    foodShortOpenDays: out.filter((l) => l.hands.foodOpen > 0 && l.foodDays < 3).length,
    firstLevel2: out.find((l) => l.level2 + l.level3 > 0)?.day ?? 0,
    health: run.health.map((i) => `${i.kind}: ${i.text}`),
    days: out,
  };
}

export const NEWCOMER_HEAD =
  'seed     profile   village  pop20 pop40 pop70  homes h (day)        farmstead h (day)  hungry (worst) not purse  food open+short days  1st L2';

export function formatNewcomer(r: NewcomerRow): string {
  const t = (xs: [number, number][]) => xs.map(([h, d]) => `${h}h (d${d})`).join(', ') || 'none';
  return [
    r.seed.padEnd(8),
    r.profile.padEnd(9),
    String(r.villageDay || '-').padStart(7),
    String(r.residents20).padStart(6),
    String(r.residents40).padStart(5),
    String(r.residents70).padStart(5),
    ' ',
    t(r.firstHomes).padEnd(20),
    t(r.firstFarmstead).padEnd(18),
    `${r.hungryDays} (${r.worstHungry}) ${r.hungryUnpaidDays}`.padStart(19),
    String(r.foodShortOpenDays).padStart(21),
    String(r.firstLevel2 || '-').padStart(6),
  ].join(' ');
}

export const DAY_HEAD =
  'day  pop hh idle food haul othr fOpen oOpen fEmpty foodD    hungry sites biz/L2/L3 rank    homes';

export function formatDay(l: NewcomerDay): string {
  const h = l.hands;
  return [
    String(l.day).padStart(3),
    String(l.residents).padStart(4),
    String(l.households).padStart(2),
    String(h.idle).padStart(4),
    String(h.food).padStart(4),
    String(h.haul).padStart(4),
    String(h.other).padStart(4),
    String(h.foodOpen).padStart(5),
    String(h.otherOpen).padStart(5),
    String(h.foodEmpty).padStart(6),
    String(l.foodDays).padStart(5),
    `${l.hungry.households}/${l.hungry.residents}${l.hungry.noOutlet ? `o${l.hungry.noOutlet}` : ''}${l.hungry.broke ? `b${l.hungry.broke}` : ''}`.padStart(
      9,
    ),
    String(l.sites).padStart(5),
    `${l.businesses}/${l.level2}/${l.level3}`.padStart(9),
    l.rank.padEnd(7),
    l.homes.padEnd(28),
    l.charter,
  ].join(' ');
}

if (process.argv[1]?.endsWith('newcomerRun.ts')) {
  const days = Number(process.argv[2] ?? 70);
  const seeds = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_SEEDS;
  const rows: NewcomerRow[] = [];
  for (const seed of seeds) {
    for (const nc of process.env.NEWCOMER_TUNED ? [true, false] : [true]) {
      const t0 = Date.now();
      const r = newcomerRow(seed, days, nc);
      rows.push(r);
      if (process.env.NEWCOMER_DAYS) {
        console.log(`\n${seed} ${r.profile}\n${DAY_HEAD}`);
        for (const l of r.days) console.log(formatDay(l));
      }
      console.log(`${seed} ${r.profile}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      for (const h of r.health) console.log(`  ${h}`);
    }
  }
  console.log(`\n${NEWCOMER_HEAD}`);
  for (const r of rows) console.log(formatNewcomer(r));
}
