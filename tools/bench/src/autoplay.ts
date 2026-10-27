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
import { content } from '@qoti/content';
import {
  basketScore,
  expenses,
  income,
  BuildingStatus,
  calendar,
  creditLimit,
  LEDGER_CATEGORIES,
  loansOwed,
  rankAtLeast,
  tradingPost,
  canPaintRoad,
  canPlaceDecor,
  doorTile,
  findById,
  MAP_SIZE,
  moodBand,
  PENNIES_PER_COIN,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  townStock,
  worldIndex,
  evaluate,
  fieldCap,
  fieldTileProblem,
  findRoute,
  type Building,
  type Command,
  type GrowthDemand,
  type ValleySettings,
  type WorldState,
} from '@qoti/sim';
import { command, findSpot, runTicks, startingTown, type Hamlet } from './hamlet';
import {
  grownSince,
  growthLine,
  planHighStreet,
  promoteToVillage,
  storehouseSpot,
  unreachedLots,
  zoneHighStreet,
  type GrowthLine,
  type GrowthNight,
  type HighStreet,
} from './village';
import { canStaff, materialsPressing } from './labor';
import { craftsfolk, VillagePlayer } from './villagePlayer';

const FOODS = content.goods.flatMap((g, i) => (g.food ? [i] : []));
const FOOD_DEFS = ['vegetable-plot', 'fishers-hut', 'farmhouse'];
const G = (id: string) => content.goodIndex.get(id)!;
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
}

const S = MAP_SIZE;
const idx = (x: number, z: number) => z * S + x;

function count(w: WorldState, def: string, built = false): number {
  return w.buildings.filter((b) => b.def === def && (!built || b.stage === 'built')).length;
}

function sites(w: WorldState): number {
  return w.buildings.filter((b) => b.stage === 'construction').length;
}

function vacantHomes(w: WorldState): number {
  const homes = w.buildings.filter((b) => content.buildingById.get(b.def)?.housing && b.stage === 'built');
  return homes.filter((b) => !w.households.some((h) => h.homeId === b.id)).length;
}

/** A short path from a building's door to the nearest road (breadth-first, at most 30 tiles). */
function pathToRoad(w: WorldState, from: number): [number, number][] | null {
  const reader = worldIndex(w).reader;
  if (w.map.road[from]) return [];
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let q = 0; q < queue.length && q < 4000; q++) {
    const i = queue[q]!;
    const x = i % S;
    const z = (i - x) / S;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= S - 1 || nz >= S - 1) continue;
      const n = idx(nx, nz);
      if (prev.has(n)) continue;
      if (Math.abs(w.map.height[n]! - w.map.height[i]!) >= 2) continue;
      prev.set(n, i);
      if (w.map.road[n]) {
        const out: [number, number][] = [];
        for (let k = i; k !== -1; k = prev.get(k)!) out.push([k % S, Math.floor(k / S)]);
        return out.length > 30 ? null : out.reverse();
      }
      if (!canPaintRoad(reader, 'path', [[nx, nz]]).ok || w.map.water[n]) continue;
      queue.push(n);
    }
  }
  return null;
}

class Players {
  readonly actions: string[] = [];
  /** The high street laid and zoned at the Village rank (C4B), once there is one. */
  street: HighStreet | null = null;

  /** The Village chapter: the Ledger lays a high street off the lanes and zones it. */
  village(): void {
    promoteToVillage(this.w);
    const street = planHighStreet(this.w);
    if (!street) {
      this.actions.push('no room for a high street');
      return;
    }
    if (!this.do('lay the high street', [{ t: 'road.paint', kind: 'lane', tiles: street.tiles }])) return;
    this.street = street;
    this.do('zone the high street', zoneHighStreet(this.w, street));
  }

  /** The Ledger's Village chores: a storehouse at the far end once porters cannot reach the lots there. */
  private villageChores(): void {
    const w = this.w;
    if (!this.street || unreachedLots(w) < 2 || count(w, 'storehouse') >= 3 || sites(w) >= 3) return;
    const def = content.buildingById.get('storehouse')!;
    if (this.coins() < (def.cost?.coins ?? 0) + 40) return;
    const stock = townStock(w);
    for (const [g, q] of def.cost?.goods ?? []) if (stock[G(g)]! < q + 8) return;
    const at = storehouseSpot(w, this.street);
    if (at)
      this.do('storehouse for the high street', [
        { t: 'build.place', def: 'storehouse', x: at[0], z: at[1], rot: at[2] },
      ]);
  }
  /** Days of food kept back from the peddler (C4C: the Village run keeps six, for the Charter). */
  foodReserveDays = 2;
  /**
   * C4X: defs that found no spot, and the day they last failed. A valley with no free river edge
   * left kept asking for a fishers' hut (154 times in a willow run) and never built the vegetable
   * plot it could have; for the rest of that day the other food building is chosen instead.
   */
  readonly noSpot = new Map<string, number>();

  /** No spot for `def` today. */
  blocked(def: string): boolean {
    return this.noSpot.get(def) === calendar(this.w.tick).day;
  }

  /** The next food building: a fishers' hut for every two plots, while the river has room. */
  /** Buildings the larder rest paused (so only those reopen; the Village player rests its own). */
  private readonly rested = new Set<number>();

  foodBuilding(): string {
    const w = this.w;
    const fish = count(w, 'fishers-hut') <= count(w, 'vegetable-plot') / 2 && !this.blocked('fishers-hut');
    return fish || this.blocked('vegetable-plot') ? 'fishers-hut' : 'vegetable-plot';
  }

  constructor(readonly h: Hamlet) {}

  get w(): WorldState {
    return this.h.world;
  }

  do(label: string, cmds: Command[], seat: 0 | 1 = 0): boolean {
    const ok = command(this.h, cmds, seat).every(Boolean);
    this.actions.push(`${calendar(this.w.tick).day}:${label}${ok ? '' : ' (refused)'}`);
    return ok;
  }

  build(def: string, only?: (x: number, z: number, w: number, d: number) => boolean): Building | null {
    const spot = findSpot(this.w, def, only ? 60 : 40, only);
    if (!spot) {
      this.actions.push(`no spot for ${def}`);
      if (!only) this.noSpot.set(def, calendar(this.w.tick).day);
      return null;
    }
    if (!this.do(`build ${def}`, [{ t: 'build.place', def, x: spot[0], z: spot[1], rot: spot[2] }]))
      return null;
    const b = this.w.buildings[this.w.buildings.length - 1]!;
    this.connect(b);
    return b;
  }

  /** Paints a path from the door to the road network (the Ledger likes tidy frontage). */
  connect(b: Building): void {
    const path = pathToRoad(this.w, doorTile(b));
    if (path && path.length > 0)
      this.do(`path for ${b.def}`, [{ t: 'road.paint', kind: 'path', tiles: path }]);
  }

  coins(): number {
    return this.w.economy.treasury / PENNIES_PER_COIN;
  }

  /** The Ledger player's turn: one or two things the town is shortest of. */
  ledger(): void {
    this.villageChores();
    const w = this.w;
    if (w.charter.ready) this.do('claim the Charter', [{ t: 'charter.claim' }]);
    this.money();
    const stock = townStock(w);
    const pop = w.residents.length;
    const food =
      FOODS.reduce((n, g) => n + stock[g]!, 0) +
      w.households.reduce((n, h) => n + FOODS.reduce((m, g) => m + (h.pantry[g] ?? 0), 0), 0);
    const foodMade = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    let budget = 2;
    // Materials already promised to sites don't count as available.
    const free = [...stock];
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
    }
    // Food is pressing while the town has under three days of it, or while a Hamlet lays in the
    // Charter's five days.
    const larderLow =
      !rankAtLeast(w, 'village') && pop >= 25 && FOODS.reduce((n, g) => n + stock[g]!, 0) < pop * 5;
    const foodPressing = food < pop * 3 || larderLow;
    const want = (cond: boolean, def: string, urgent = false) => {
      if (!cond || budget <= 0 || (sites(w) >= 3 && !urgent)) return;
      // C4X: never a workplace nobody can work (another empty fishers' hut feeds nobody).
      if (!canStaff(w, def, (foodPressing && FOOD_DEFS.includes(def)) || materialsPressing(w, def))) return;
      const d = content.buildingById.get(def)!;
      if (this.coins() < (d.cost?.coins ?? 0) + 20) return;
      for (const [g, q] of d.cost?.goods ?? []) if (free[G(g)]! < q) return;
      if (this.build(def)) {
        budget--;
        for (const [g, q] of d.cost?.goods ?? []) free[G(g)]! -= q;
      }
    };
    // Hungry towns come first: a food building jumps the queue when there are under three days left.
    const foodSites = w.buildings.filter(
      (b) => b.stage === 'construction' && (b.def === 'vegetable-plot' || b.def === 'fishers-hut'),
    ).length;
    want(food < pop * 3 && foodSites === 0, this.foodBuilding(), true);
    want(food < pop * 3 && foodSites === 0, 'vegetable-plot', true);
    // Timber next: woodcutter and sawpit need only logs and stone, and everything else needs planks.
    want(count(w, 'woodcutter') === 0, 'woodcutter');
    want(count(w, 'sawpit') === 0, 'sawpit');
    // Food first: a day's eating for everyone should come in each day, with a few days in hand.
    const foodPlaces = count(w, 'vegetable-plot') + count(w, 'fishers-hut') * 2 + count(w, 'farmhouse') * 3;
    want(foodMade < pop + 4 && foodPlaces * 3 < pop + 6, this.foodBuilding());
    want(food < pop * 2 && sites(w) === 0, 'vegetable-plot');
    // I2 (C4A): the Village Charter wants five days of food in store, so a Hamlet of 25 or more
    // lays in a larder before the peddler gets any, and past 30 residents it holds new homes until
    // the larder is full (C4X: food buildings may now always draw hands while it does, so the hold
    // no longer starves the fields of workers; a town that keeps growing never gets ahead of its
    // own suppers).
    const larder = !rankAtLeast(w, 'village') && pop >= 25;
    const stored = FOODS.reduce((n, g) => n + stock[g]!, 0);
    want(larder && stored < pop * 6 && foodMade < pop * 1.4, this.foodBuilding(), true);
    // A Village deep in the County Bank's books pays down before it builds more homes.
    const indebted = rankAtLeast(w, 'village') && loansOwed(w) * 2 > creditLimit(w);
    // Only once food is the last goal open: holding homes while wishes or patterns are still to come
    // froze a valley at 36 residents for thirty days (wishes need residents to make them).
    const foodLast = charterOpen(w).length === 1 && charterOpen(w)[0] === 'food';
    const holdHomes = (larderLow && pop >= 30 && foodLast) || indebted;
    // Homes: always one empty cottage waiting for the next family (a Village with homes zoned
    // grows its own), and a second when a story character is waiting to move in (C4D: they never
    // take the last one).
    const waiting = storyWaiting(w) ? 1 : 0;
    want(
      !this.street &&
        !holdHomes &&
        vacantHomes(w) + w.buildings.filter((b) => b.def === 'cottage' && b.stage === 'construction').length <
          2 + waiting,
      'cottage',
    );
    // Stone, then more timber as the town grows.
    want(
      pop >= 10 && stock[G('planks')]! < 20 && count(w, 'sawpit') < 2 && count(w, 'sawpit', true) > 0,
      'sawpit',
    );
    want(pop >= 12 && count(w, 'woodcutter') < 2 && count(w, 'sawpit') > 1, 'woodcutter');
    // A woodcutter that has felled its patch is replaced by one at the forest edge.
    const felled = w.buildings.filter(
      (b) => b.def === 'woodcutter' && b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) !== 0,
    );
    want(felled.length > 0 && count(w, 'woodcutter') - felled.length < 2, 'woodcutter');
    // C4C: retire it only once a working one stands, or a valley with no logs left can never
    // build another (a Village run found that deadlock).
    const working = w.buildings.some(
      (b) => b.def === 'woodcutter' && b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) === 0,
    );
    if (working) for (const b of felled) this.do('retire a woodcutter', [{ t: 'build.remove', ids: [b.id] }]);
    want(stock[G('stone')]! < 16 && count(w, 'quarry') === 0, 'quarry');
    want(
      count(w, 'foresters-lodge') === 0 && count(w, 'woodcutter', true) > 0 && pop >= 12,
      'foresters-lodge',
    );
    want(pop >= 10 && count(w, 'market-stall') === 0, 'market-stall');
    want(pop >= 14 && count(w, 'builders-yard') === 0, 'builders-yard');
    // C4X: the bread chain takes six hands (farm, mill, bakery) for a few loaves; a Hamlet short of
    // hands left its bakery empty while wheat and flour piled up, so it waits for the Village.
    want(pop >= 22 && rankAtLeast(w, 'village') && count(w, 'farmhouse') === 0, 'farmhouse');
    want(count(w, 'farmhouse', true) > 0 && count(w, 'windmill') === 0, 'windmill');
    want(count(w, 'windmill', true) > 0 && count(w, 'bakery') === 0, 'bakery');
    // C4C: urgent, or porters busy with food and inputs leave the sites waiting, and the sites
    // waiting keep the second storehouse from being started (a Village run deadlocked there).
    // C4X: and one per twenty residents after that (one storehouse for fifty-six left the plots'
    // baskets full and the sawpits without logs).
    want(pop >= 20 && count(w, 'storehouse') < Math.max(2, 1 + Math.floor(pop / 20)), 'storehouse', true);
    want(pop >= 20 && count(w, 'well') < 2, 'well');
    // I2 (C4A): a Village pays its upkeep with what it sells beyond the valley, so when the books
    // run short the Ledger sets up a trade: another sawpit for every thirty residents, and a
    // woodcutter to feed each pair.
    if (rankAtLeast(w, 'village')) {
      const y = w.economy.yesterday;
      const short = income(y) < expenses(y);
      const trade = 2 + Math.floor(pop / 30);
      want(short && count(w, 'sawpit') < trade, 'sawpit', true);
      want(short && count(w, 'woodcutter') < Math.ceil(count(w, 'sawpit') / 2) + 1, 'woodcutter', true);
      want(stock[G('stone')]! < 16 && count(w, 'quarry') < 1 + Math.floor(pop / 40), 'quarry');
    }
    // The peddler takes surplus at 10:00: food beyond five days of eating, logs beyond 60.
    for (const g of content.goods) {
      const i = G(g.id);
      const surplus = g.food
        ? stock[i]! > pop * (larder ? 7 : this.foodReserveDays) + 8
        : g.id === 'logs'
          ? stock[i]! > 40
          : g.id === 'stone'
            ? stock[i]! > 50
            : // I2 (C4A): a Village lives on its trade, so spare planks go to the peddler too.
              g.id === 'planks'
              ? rankAtLeast(w, 'village') && stock[i]! > 60
              : false;
      if (surplus !== w.economy.forSale[i]) {
        this.do(`${surplus ? 'sell' : 'keep'} ${g.id}`, [
          { t: 'ledger.setForSale', good: g.id, forSale: surplus },
        ]);
      }
    }
    // C4X: a Hamlet laying in the Charter's five days of food rests its sawpits and quarry while
    // planks and stone are plentiful, so their hands go to the fields (the sim only calls food
    // short under three days); they reopen once the larder is full or the stocks run low.
    const resting = larderLow && pop >= 30;
    for (const b of w.buildings) {
      if (b.stage !== 'built' || !b.rt) continue;
      // Rest from 60 planks, 40 stone or 30 logs, reopen under 30, 20 or 15 (a gap, so it does not
      // flip daily).
      const [have, high, low] =
        b.def === 'sawpit'
          ? [stock[G('planks')]!, 60, 30]
          : b.def === 'quarry'
            ? [stock[G('stone')]!, 40, 20]
            : b.def === 'woodcutter'
              ? [stock[G('logs')]!, 30, 15]
              : [0, -1, -1];
      if (high < 0) continue;
      // From Village rank everything rested for the larder reopens (the Village player decides).
      const rest = resting && !rankAtLeast(w, 'village') && (b.rt.paused ? have >= low : have >= high);
      if (rest ? b.rt.paused : !this.rested.has(b.id)) continue;
      if (rest) this.rested.add(b.id);
      else this.rested.delete(b.id);
      this.do(`${rest ? 'rest' : 'reopen'} the ${b.def} for the larder`, [
        { t: 'build.setPaused', id: b.id, paused: rest },
      ]);
    }
    // Fields for a finished farmhouse: a field per worker's share (C4X: all three workers', not
    // one; and only tiles the farm can take, or the painting was refused every turn and the farm
    // stood stuck with no fields while the bakeries waited for flour).
    for (const farm of w.buildings.filter((b) => b.def === 'farmhouse' && b.stage === 'built')) {
      const def = content.buildingById.get(farm.def)!;
      const cap = fieldCap(def);
      let owned = 0;
      for (let i = 0; i < w.map.fieldOwner.length; i++) if (w.map.fieldOwner[i] === farm.id) owned++;
      if (owned >= cap || this.coins() < cap) continue;
      const tiles: [number, number][] = [];
      for (let dz = -6; dz <= 7 && tiles.length < cap - owned; dz++) {
        for (let dx = -6; dx <= 7 && tiles.length < cap - owned; dx++) {
          const x = farm.x + dx;
          const z = farm.z + dz;
          const i = idx(x, z);
          if (w.map.fieldOwner[i] || w.map.zone[i] || fieldTileProblem(w, farm, def, x, z)) continue;
          tiles.push([x, z]);
        }
      }
      if (tiles.length) this.do(`fields x${tiles.length}`, [{ t: 'field.paint', farm: farm.id, tiles }]);
    }
  }

  /**
   * I2 (C4A): the Ledger's money levers once the market is open. Wages and tax steer where the
   * coins pile up; the Trading Post sells what the town has plenty of and buys food when it runs
   * short; the County Bank tides a short treasury over.
   */
  private money(): void {
    const w = this.w;
    if (!rankAtLeast(w, 'village')) return;
    const l = w.levers;
    const hh = Math.max(1, w.households.length);
    const basket = w.households.reduce((n, h) => n + basketScore(h), 0) / hh;
    const coins = this.coins();
    const y = w.economy.yesterday;
    const net = income(y) - expenses(y);
    const setWage = (percent: number, why: string) =>
      percent !== l.wageLevel && this.do(why, [{ t: 'ledger.setWageLevel', percent }]);
    const setTax = (percent: number, why: string) =>
      percent !== l.taxRate && this.do(why, [{ t: 'ledger.setTaxRate', percent }]);
    if (net < 0 && coins < 300 && basket >= 65) {
      // The treasury slides while households get by: trim wages a little, then firm up the tax.
      if (l.wageLevel > 85) setWage(l.wageLevel - 5, 'trim wages');
      else if (l.taxRate < 20) setTax(l.taxRate + 2, 'raise the income tax');
    } else if (basket < 65 && coins > 150) {
      // Households going short while the treasury can spare it: ease off.
      if (l.taxRate > 6) setTax(l.taxRate - 2, 'ease the income tax');
      else if (l.wageLevel < 110) setWage(l.wageLevel + 5, 'raise wages');
    } else if (net > 0 && coins > 500) {
      // Flush: drift back toward the usual levels.
      if (l.wageLevel < 100) setWage(l.wageLevel + 5, 'restore wages');
      else if (l.taxRate > 10) setTax(l.taxRate - 2, 'ease the income tax');
    }
    // The County Bank: borrow when the treasury runs thin, repay when flush.
    const owed = loansOwed(w);
    const room = Math.floor((creditLimit(w) - owed) / PENNIES_PER_COIN);
    if (coins < 60 && room >= 100) {
      this.do('take a loan', [{ t: 'loan.take', coins: Math.min(room, 300) }]);
    } else if (owed > 0 && coins > 350) {
      const loan = w.loans.loans[0]!;
      const pay = Math.min(Math.ceil(loan.balance / PENNIES_PER_COIN), Math.floor(coins - 250));
      if (pay > 0) this.do('repay a loan', [{ t: 'loan.repay', id: loan.id, coins: pay }]);
    }
    // The Trading Post, when the content has one: build it, then keep a standing order book.
    if (content.buildingById.has('trading-post') && count(w, 'trading-post') === 0 && coins > 150) {
      this.build('trading-post');
    }
    if (!tradingPost(w)) return;
    const pop = w.residents.length;
    // Sell what the town has plenty of; buy food only when the larder runs low.
    const book: [good: string, min: number, max: number][] = [
      // C4X: 60 planks in hand, not 30, so a tavern (24) or a townhouse can still be started.
      ['planks', 0, 60],
      ['logs', 0, 40],
      ['bread', 0, pop + 10],
      ['fish', 0, pop + 10],
      ['vegetables', 0, pop + 10],
      ['apples', Math.ceil(pop / 4), 1000],
      // C4X: what the Village makes past its own needs pays for its upkeep, sites and loans:
      // cloth and cider beyond a few days' shelves, bricks beyond the next few buildings.
      ['bricks', 0, 60],
      ['cider', 0, Math.max(20, Math.ceil(pop / 4))],
      ['cloth', 0, Math.max(20, Math.ceil(pop / 5))],
    ];
    for (const [good, min, max] of book) {
      const g = G(good);
      const o = w.trade.orders.find((x) => x.good === g);
      if (o && o.min === min && o.max === max) continue;
      if (o && Math.abs(o.min - min) + Math.abs(o.max - max) < 6) continue;
      this.do(`order ${good}`, [
        {
          t: 'trade.setStandingOrder',
          good,
          order: { min, max, floor: 0, ceiling: Math.round(content.goods[g]!.basePrice * 1.6), neighbor: '' },
        },
      ]);
    }
  }

  /** A free spot for a decor piece within `r` tiles of a tile center, or null. */
  private decorSpot(
    def: string,
    x: number,
    z: number,
    r: number,
    near?: (fx: number, fz: number) => boolean,
  ): [number, number] | null {
    const d = content.decorById.get(def)!;
    const reader = worldIndex(this.w).reader;
    for (let k = 1; k <= r * 2; k++) {
      for (let a = 0; a < 8 * k; a++) {
        // A deterministic ring walk in half-tile steps.
        const t = a / (8 * k);
        const side = Math.floor(t * 4);
        const u = t * 4 - side;
        const half = k / 2;
        const ox = side === 0 ? -half + u * k : side === 1 ? half : side === 2 ? half - u * k : -half;
        const oz = side === 0 ? -half : side === 1 ? -half + u * k : side === 2 ? half : half - u * k;
        const fx = Math.round((x + 0.5 + ox) * TILE_FP);
        const fz = Math.round((z + 0.5 + oz) * TILE_FP);
        if (near && !near(fx, fz)) continue;
        // A thoughtful Hearth leaves zoned plots to grow (C4B): decor on a lot would stop it.
        const ti = Math.floor(fz / TILE_FP) * S + Math.floor(fx / TILE_FP);
        if (this.w.map.zone[ti] && !this.w.map.occupant[ti]) continue;
        if (canPlaceDecor(reader, d, fx, fz, (a * 7) % 64).ok) return [fx, fz];
      }
    }
    return null;
  }

  /** The walk from work to home, door to door, as the wishes check it (null when unreachable). */
  private commute(home: number, work: number): number[] | null {
    const w = this.w;
    const h = findById(w.buildings, home);
    const b = findById(w.buildings, work);
    if (!h || !b) return null;
    return findRoute(w, doorTile(b), doorTile(h), false);
  }

  /** C4X: "a proper path" wishes: path on every grass tile of the walk to work. */
  private commutePath(home: number, work: number): boolean {
    const route = this.commute(home, work);
    if (!route) return false;
    const reader = worldIndex(this.w).reader;
    const tiles: [number, number][] = [];
    for (const i of route) {
      if (this.w.map.road[i]) continue;
      const t: [number, number] = [i % S, Math.floor(i / S)];
      if (canPaintRoad(reader, 'path', [t]).ok) tiles.push(t);
    }
    if (tiles.length === 0 || tiles.length > 120 || this.coins() < 40) return false;
    return this.do('path to work for a wish', [{ t: 'road.paint', kind: 'path', tiles }]);
  }

  /** C4X: "lanterns on my way home" wishes: a lantern every third step of the walk. */
  private commuteLanterns(home: number, work: number): boolean {
    const route = this.commute(home, work);
    if (!route || route.length > 90 || this.coins() < 60) return false;
    let ok = false;
    for (let k = 1; k < route.length; k += 3) {
      const i = route[k]!;
      ok =
        this.place('lantern', this.decorSpot('lantern', i % S, Math.floor(i / S), 1), 'on the way home') ||
        ok;
    }
    return ok;
  }

  /** For Together: run commands as a seat, find a decor spot. */
  act(label: string, cmds: Command[], seat: 0 | 1 = 0): boolean {
    return this.do(label, cmds, seat);
  }

  spot(def: string, x: number, z: number, r: number): [number, number] | null {
    return this.decorSpot(def, x, z, r);
  }

  private place(def: string, at: [number, number] | null, why: string): boolean {
    if (!at) return false;
    return this.do(`${def} ${why}`, [
      { t: 'decor.place', def, fx: at[0], fz: at[1], rot: (at[0] * 31 + at[1]) % 64 },
    ]);
  }

  /** The Hearth player's turn: answer up to three wishes, then dress one lane. */
  hearth(): void {
    const w = this.w;
    let answered = 0;
    for (const wish of [...w.wishes]) {
      if (answered >= 3) break;
      const home = findById(w.buildings, wish.home);
      if (!home) continue;
      const door = doorTile(home);
      const hx = door % S;
      const hz = Math.floor(door / S);
      const nearWater = (fx: number, fz: number) => {
        const x = Math.floor(fx / TILE_FP);
        const z = Math.floor(fz / TILE_FP);
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) if (w.map.water[idx(x + dx, z + dz)]) return true;
        return false;
      };
      let ok = false;
      switch (wish.template) {
        case 'somewhere-to-sit':
          ok = this.place('bench', this.decorSpot('bench', hx, hz, 2), 'for a wish');
          break;
        case 'tree-by-my-window':
          ok = this.place('cherry-tree', this.decorSpot('cherry-tree', hx, hz, 2), 'for a wish');
          break;
        case 'flowers-on-the-lane':
          for (let k = 0; k < 3; k++)
            ok = this.place('flower-bed', this.decorSpot('flower-bed', hx, hz, 3), 'for a wish') || ok;
          break;
        case 'river-bench':
          ok = this.place('bench', this.decorSpot('bench', hx, hz, 8, nearWater), 'by the river');
          break;
        case 'a-garden-plot':
          ok = w.hearth.unlocked.includes('herb-planter')
            ? this.place('herb-planter', this.decorSpot('herb-planter', hx, hz, 2), 'for a wish')
            : false;
          break;
        case 'a-proper-path':
          ok = this.commutePath(wish.home, wish.work);
          break;
        case 'lantern-on-my-way-home':
          ok = this.commuteLanterns(wish.home, wish.work);
          break;
        case 'a-well-closer':
          // C4C: one well per ten residents is plenty (a Village run built forty).
          if (
            this.coins() > 60 &&
            townStock(w)[G('stone')]! >= 12 &&
            sites(w) < 3 &&
            count(w, 'well') <= w.residents.length / 10
          )
            ok = !!this.build('well');
          break;
        default:
          break;
      }
      if (ok) answered++;
    }
    // Then a lane: lanterns every few tiles along roads near homes, a bench and flowers by the
    // well, and the odd fruit tree, so charm grows and patterns can be found.
    const homes = w.buildings.filter((b) => b.def === 'cottage');
    const pick = homes[(calendar(w.tick).day + w.residents.length) % Math.max(1, homes.length)];
    if (pick) {
      const door = doorTile(pick);
      const [x, z] = [door % S, Math.floor(door / S)];
      this.place('lantern', this.decorSpot('lantern', x, z, 2), 'on the lane');
      this.place(
        w.decor.length % 2 ? 'flower-bed' : 'planter',
        this.decorSpot('planter', x, z, 2),
        'by a door',
      );
    }
    this.treePlace();
    // Seats and shade by the well with the most homes around it (the Well Gathering Place wants
    // three within eight tiles), counted at that well, not across town (C4X: the tree place's
    // benches used to stop it, and the first well was often off on its own).
    const homesNear = (b: Building) =>
      w.buildings.filter(
        (h) =>
          h.stage === 'built' &&
          content.buildingById.get(h.def)?.housing &&
          Math.abs(h.x - b.x) <= 9 &&
          Math.abs(h.z - b.z) <= 9,
      ).length;
    const wells = w.buildings.filter((b) => b.def === 'well' && b.stage === 'built');
    const well = wells.reduce<Building | undefined>(
      (best, b) => (!best || homesNear(b) > homesNear(best) ? b : best),
      undefined,
    );
    if (well) {
      const near = (def: string, r: number) =>
        w.decor.filter(
          (d) =>
            d.def === def &&
            Math.abs(d.fx / TILE_FP - (well.x + 0.5)) <= r + 1 &&
            Math.abs(d.fz / TILE_FP - (well.z + 0.5)) <= r + 1,
        ).length;
      if (near('bench', 2) < 2)
        this.place('bench', this.decorSpot('bench', well.x, well.z, 2), 'by the well');
      if (near('apple-tree', 3) < 1)
        this.place('apple-tree', this.decorSpot('apple-tree', well.x, well.z, 3), 'by the well');
    }
  }

  /**
   * C4X: the Pattern Book's Tree Place, as a human reads its hint once it shows ("a grown tree where
   * paths meet, with a couple of seats in its shade"): a garden tree just off a straight lane near
   * the town hall, a bench on either side of it. Without it the harness found only two patterns on
   * some valleys and never met the Village Charter.
   */
  private treePlace(): void {
    const w = this.w;
    if (!w.hearth.hints.includes('tree-place') || this.coins() < 60) return;
    if (w.hearth.discovered.some((p) => p.pattern === 'tree-place')) return;
    const reader = worldIndex(w).reader;
    const tree = content.decorById.get('cherry-tree')!;
    const bench = content.decorById.get('bench')!;
    const hall = w.buildings.find((b) => b.def === 'town-hall');
    const cx = hall?.x ?? S >> 1;
    const cz = hall?.z ?? S >> 1;
    const road = (x: number, z: number) =>
      x > 0 && z > 0 && x < S - 1 && z < S - 1 && !!w.map.road[idx(x, z)];
    const free = (x: number, z: number) =>
      !road(x, z) && !w.map.zone[idx(x, z)] && !w.map.occupant[idx(x, z)];
    const at = (x: number, z: number): [number, number] => [
      x * TILE_FP + TILE_FP / 2,
      z * TILE_FP + TILE_FP / 2,
    ];
    for (let r = 2; r <= 30; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!road(x, z)) continue;
          // Along an east-west run the tree stands north or south of it, and the other way round.
          const runs: [ax: number, az: number][] = [];
          if (road(x - 1, z) && road(x + 1, z)) runs.push([1, 0]);
          if (road(x, z - 1) && road(x, z + 1)) runs.push([0, 1]);
          for (const [ax, az] of runs) {
            for (const side of [1, -1]) {
              const tx = x + az * side;
              const tz = z + ax * side;
              const b1: [number, number] = [tx - ax, tz - az];
              const b2: [number, number] = [tx + ax, tz + az];
              if (!free(tx, tz) || !free(...b1) || !free(...b2)) continue;
              const t = at(tx, tz);
              const p1 = at(...b1);
              const p2 = at(...b2);
              const rot = ax ? 0 : 16;
              if (!canPlaceDecor(reader, tree, t[0], t[1], 0).ok) continue;
              if (!canPlaceDecor(reader, bench, p1[0], p1[1], rot).ok) continue;
              if (!canPlaceDecor(reader, bench, p2[0], p2[1], rot).ok) continue;
              this.do('a tree place by the lane', [
                { t: 'decor.place', def: 'cherry-tree', fx: t[0], fz: t[1], rot: 0 },
                { t: 'decor.place', def: 'bench', fx: p1[0], fz: p1[1], rot },
                { t: 'decor.place', def: 'bench', fx: p2[0], fz: p2[1], rot },
              ]);
              return;
            }
          }
        }
      }
    }
  }
}

/** Ids of the Charter goals still open. */
function charterOpen(w: WorldState): string[] {
  const goals = content.charterById.get(w.charter.charter)?.goals ?? [];
  return goals.filter((g, i) => (w.charter.progress[i] ?? 0) < g.target).map((g) => g.id);
}

/** "3/5 food": goals met, and the first one still open. */
function charterLine(w: WorldState): string {
  const goals = content.charterById.get(w.charter.charter)?.goals ?? [];
  const open = charterOpen(w);
  return `${goals.length - open.length}/${goals.length}${open[0] ? ` ${open[0]}` : ''}`;
}

/** A story character whose arrival condition holds is waiting for a home. */
function storyWaiting(w: WorldState): boolean {
  return w.stories.some((s) => {
    const arc = content.storyById.get(s.arc);
    return !!arc && s.residentId === 0 && evaluate(w, arc.arrival, {});
  });
}

/** C4D: the two players working together (see the header). */
class Together {
  constructor(readonly p: Players) {}

  get w(): WorldState {
    return this.p.w;
  }

  turn(): void {
    const w = this.w;
    if (w.charter.ready) this.p.act('claim the Charter', [{ t: 'charter.claim' }], 1);
    this.request();
    this.plans();
    this.inventor();
  }

  /** Pippa's river letter: a sawpit within three tiles of the water. */
  private inventor(): void {
    const w = this.w;
    const s = w.stories.find((x) => x.arc === 'inventor');
    const step = s && s.step >= 0 ? content.storyById.get('inventor')?.steps[s.step] : undefined;
    if (!step || !('count' in step.goal) || step.goal.count.what !== 'byWater') return;
    // Within three steps of the footprint, corners rounded, as the goal counts it.
    const wet = (x: number, z: number, wd: number, d: number) => {
      for (let tz = z - 3; tz < z + d + 3; tz++) {
        for (let tx = x - 3; tx < x + wd + 3; tx++) {
          const gx = Math.max(0, x - tx, tx - (x + wd - 1));
          const gz = Math.max(0, z - tz, tz - (z + d - 1));
          if (gx * gx + gz * gz <= 12 && w.map.water[idx(tx, tz)]) return true;
        }
      }
      return false;
    };
    const turned = (b: Building) => (b.rot % 2 === 0 ? [2, 3] : [3, 2]) as [number, number];
    if (w.buildings.some((b) => b.def === 'sawpit' && wet(b.x, b.z, ...turned(b)))) return;
    if (this.p.coins() < 60) return;
    this.p.build('sawpit', wet);
  }

  /** The Hearth asks for food at the first stall; withdraws a request nobody could meet in a week. */
  private request(): void {
    const w = this.w;
    const today = Math.floor((w.tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
    for (const r of w.requests) {
      if (r.status === 'open' && w.tick - r.tick > 7 * TICKS_PER_DAY) {
        this.p.act('withdraw a request', [{ t: 'request.resolve', id: r.id, status: 'withdrawn' }]);
      }
    }
    if (w.requests.some((r) => r.status === 'open')) return;
    const stall = w.buildings.find((b) => b.def === 'market-stall' && b.stage === 'built');
    if (!stall?.rt) return;
    let best = -1;
    for (const g of FOODS) if (best < 0 || townStock(w)[g]! > townStock(w)[best]!) best = g;
    if (best < 0) return;
    const qty = Math.min(20, Math.max(6, (stall.rt.store[best] ?? 0) + 2));
    const ask = {
      kind: 'goods' as const,
      good: content.goods[best]!.id,
      qty,
      byDay: today + 3,
      at: stall.id,
    };
    this.p.act(`ask for ${qty} ${ask.good}`, [{ t: 'request.add', ask }]);
  }

  /**
   * Plans: the Ledger approves what the Hearth sketched last time; the Hearth reads each story
   * character's open step and sketches what it asks for: lanterns by their door, flowers and a tree
   * when the lane wants charm, a seat and flowers by the market stall.
   */
  private plans(): void {
    const w = this.w;
    for (const p of w.plans) {
      if (p.status === 'open' && p.by === 0)
        this.p.act(`approve ${p.name}`, [{ t: 'plan.approve', id: p.id }], 1);
    }
    const items: Command[] = [];
    const add = (def: string, at: [number, number] | null) => {
      if (at) items.push({ t: 'decor.place', def, fx: at[0], fz: at[1], rot: 0 });
    };
    for (const s of w.stories) {
      const goal = s.step >= 0 ? content.storyById.get(s.arc)?.steps[s.step]?.goal : undefined;
      const r = goal && s.residentId ? findById(w.residents, s.residentId) : undefined;
      const home = r ? findById(w.buildings, findById(w.households, r.householdId)?.homeId ?? 0) : undefined;
      if (!goal || !home) continue;
      const wants = JSON.stringify(goal);
      if (wants.includes('"lantern"')) add('lantern', this.p.spot('lantern', home.x, home.z, 3));
      if ('charm' in goal) {
        add('flower-bed', this.p.spot('flower-bed', home.x, home.z, 3));
        add('cherry-tree', this.p.spot('cherry-tree', home.x, home.z, 3));
      }
      const stall = wants.includes('nearestMarket')
        ? w.buildings.find((b) => b.def === 'market-stall' && b.stage === 'built')
        : undefined;
      if (stall) {
        add('bench', this.p.spot('bench', stall.x, stall.z, 2));
        add('flower-bed', this.p.spot('flower-bed', stall.x, stall.z, 2));
        add('flower-bed', this.p.spot('flower-bed', stall.x, stall.z, 2));
      }
    }
    if (items.length > 0) {
      this.p.act('sketch a plan', [
        { t: 'plan.add', name: 'For our story folk', items: items.map((cmd) => ({ cmd })) },
      ]);
    }
  }
}

function storyLetters(w: WorldState): number {
  let n = 0;
  for (const s of w.stories) if (s.residentId) n += s.step + 2;
  return n;
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

/** Ticks until the clock next shows `hour`:00. */
function untilHour(h: Hamlet, hour: number): void {
  const now = (h.world.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
  let n = (hour * TICKS_PER_HOUR - now + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (n === 0) n = TICKS_PER_DAY;
  runTicks(h, n);
}

/**
 * Plays `days` in-game days from the standard start and returns a line per day. With `village`,
 * the valley becomes a Village on that morning and the Ledger lays and zones a high street (C4B);
 * the day lines then carry the growth numbers and the result the street. From `handsOff` on both
 * players leave the valley alone, so what happens next is the village's own doing.
 */
export function autoplay(
  seed: string,
  days: number,
  opts: {
    economy?: ValleySettings['economy'];
    hearth?: boolean;
    /** Tuning: on this morning the County grants Village rank whether or not the Charter is done. */
    villageDay?: number;
    /** From this day on the players only watch (C4B: does growth stop when demand does?). */
    handsOff?: number;
    /**
     * Until C4C's Trading Post is in content: from Village rank the storehouses double as one
     * (the 'trading-post' tag is lent to their def for the run), so caravans can be tuned.
     */
    standInPost?: boolean;
    /** C4D: the two players also work together at 15:00 (requests, plans, the Charter). */
    together?: boolean;
    /** C4C: play the Village chains, services and tiers (and claim the Charter when ready). */
    village?: boolean;
    /** Called after each day's line is recorded (tuning scripts read the books here). */
    onDay?: (w: WorldState, line: DayLine) => void;
  } = {},
): AutoplayResult {
  const h = startingTown(seed, { economy: opts.economy ?? 'standard' });
  const players = new Players(h);
  const together = new Together(players);
  // I2 (C4C): the Village run claims the Charter and plays the chains, services and tiers.
  const village = opts.village ? new VillagePlayer(players) : null;
  if (village) players.foodReserveDays = 6;
  const out: DayLine[] = [];
  const store = content.buildingById.get('storehouse') as { tags: string[] };
  const tags = store.tags;
  const lend = opts.standInPost && !content.buildingById.has('trading-post');
  /** First day that began at Village rank (claimed or granted); 0 while a Hamlet. */
  let villageFrom = 0;
  try {
    for (let d = 1; d <= days; d++) {
      const playing = opts.handsOff === undefined || d < opts.handsOff;
      // Village runs watch the night's growth pass (01:00): what it wanted, and what it started.
      let night: GrowthNight | undefined;
      if (villageFrom > 0 && d > villageFrom) {
        untilHour(h, 1);
        const before = growthLine(h.world);
        runTicks(h, 1);
        night = { demand: before.demand, started: grownSince(before, growthLine(h.world)) };
      }
      untilHour(h, 9);
      if (d === opts.villageDay && !rankAtLeast(h.world, 'village')) {
        // Through the real claim, as if every goal had just been met.
        h.world.charter.ready = true;
        command(h, [{ t: 'charter.claim' }]);
        players.actions.push(`${d}:granted Village`);
      }
      // The first morning at Village rank, however it came, the Ledger lays and zones a high street.
      if (villageFrom === 0 && rankAtLeast(h.world, 'village')) {
        villageFrom = d;
        if (playing) players.village();
      }
      if (lend && rankAtLeast(h.world, 'village') && store.tags === tags)
        store.tags = [...tags, 'trading-post'];
      if (playing) village?.turn(false);
      if (playing) players.ledger();
      if (playing && opts.hearth !== false) players.hearth();
      untilHour(h, 15);
      if (playing) village?.turn(true);
      if (playing) players.ledger();
      if (playing && opts.hearth !== false) players.hearth();
      if (playing && opts.together !== false) together.turn();
      untilHour(h, 23);
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
    actions: players.actions,
    street: players.street,
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
