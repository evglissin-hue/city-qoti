// The hamlet advisor (I1, C3X; ported in C5.0): the Ledger's builds from the standard start, one or
// two things the town is shortest of each visit: homes, food, timber, stone, wells, a stall, a
// builder's yard and the bread chain. It also lays in the Village Charter's five days of food, sets
// what the peddler may take, rests the sawpits and quarry while the larder fills, replaces a
// thinning woodcutter and paints fields for the farms. These rules held the I1 and I2 acceptance
// runs; they keep their I1 shape (no timber reserve, a queue of three, two starts a visit).
import { content } from '@qoti/content';
import {
  BuildingStatus,
  creditLimit,
  expenses,
  fieldCap,
  fieldTileProblem,
  income,
  loansOwed,
  rankAtLeast,
  townStock,
} from '@qoti/sim';
import { matureTreesNear } from '../hamlet';
import { materialsPressing } from '../labor';
import { costOf, URGENT, type Planner } from '../planner';
import { charterOpen, count, FOODS, G, idx, sites, storyWaiting, vacantHomes } from '../town';
import type { Advisor, AdvisorDef } from './types';

const FOOD_DEFS = ['vegetable-plot', 'fishers-hut', 'farmhouse'];
/** The I1 build queue: three sites under way unless a want is urgent. */
const QUEUE = 3;

class Hamlet implements Advisor {
  /** Buildings the larder rest paused (so only those reopen; the Village advisor rests its own). */
  private readonly rested = new Set<number>();
  /** Sawpits rested so the logs go to the next woodcutter. */
  private readonly keptLogs = new Set<number>();

  constructor(readonly p: Planner) {}

  visit(): void {
    const p = this.p;
    const w = p.w;
    const stock = townStock(w);
    const pop = w.residents.length;
    const food =
      FOODS.reduce((n, g) => n + stock[g]!, 0) +
      w.households.reduce((n, h) => n + FOODS.reduce((m, g) => m + (h.pantry[g] ?? 0), 0), 0);
    const foodMade = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    const budget = { left: 2 };
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
      if (!cond) return;
      p.propose({
        def,
        priority: urgent ? URGENT : QUEUE,
        cost: costOf(def),
        // C4X: never a workplace nobody can work (another empty fishers' hut feeds nobody).
        pressing: (foodPressing && FOOD_DEFS.includes(def)) || materialsPressing(w, def),
        essential: true,
        tally: free,
        budget,
      });
    };
    // Hungry towns come first: a food building jumps the queue when there are under three days left.
    const foodSites = w.buildings.filter(
      (b) => b.stage === 'construction' && (b.def === 'vegetable-plot' || b.def === 'fishers-hut'),
    ).length;
    want(food < pop * 3 && foodSites === 0, p.foodBuilding(), true);
    want(food < pop * 3 && foodSites === 0, 'vegetable-plot', true);
    // Timber next: woodcutter and sawpit need only logs and stone, and everything else needs planks.
    want(count(w, 'woodcutter') === 0, 'woodcutter');
    want(count(w, 'sawpit') === 0, 'sawpit');
    // Food first: a day's eating for everyone should come in each day, with a few days in hand.
    const foodPlaces = count(w, 'vegetable-plot') + count(w, 'fishers-hut') * 2 + count(w, 'farmhouse') * 3;
    want(foodMade < pop + 4 && foodPlaces * 3 < pop + 6, p.foodBuilding());
    want(food < pop * 2 && sites(w) === 0, 'vegetable-plot');
    // I2 (C4A): the Village Charter wants five days of food in store, so a Hamlet of 25 or more
    // lays in a larder before the peddler gets any, and past 30 residents it holds new homes until
    // the larder is full (C4X: food buildings may now always draw hands while it does, so the hold
    // no longer starves the fields of workers; a town that keeps growing never gets ahead of its
    // own suppers).
    const larder = !rankAtLeast(w, 'village') && pop >= 25;
    const stored = FOODS.reduce((n, g) => n + stock[g]!, 0);
    want(larder && stored < pop * 6 && foodMade < pop * 1.4, p.foodBuilding(), true);
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
    const homesComing =
      vacantHomes(w) + w.buildings.filter((b) => b.def === 'cottage' && b.stage === 'construction').length;
    // C4X: with no home empty or going up, the next cottage jumps the queue (nobody moves in
    // without one; a hamlet sat at 13 residents for six days behind its other sites).
    want(!p.street && !holdHomes && homesComing < 2 + waiting, 'cottage', homesComing === 0);
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
    // C4X: and one goes up while the last good patch is thinning, with logs kept back for it (the
    // sawpits used to saw the last log the day the patch ran out, and with no logs no woodcutter
    // could ever be built again: a hamlet sat at 40 residents for fifty days).
    const healthy = w.buildings.filter(
      (b) =>
        b.def === 'woodcutter' &&
        (b.stage !== 'built' ||
          ((b.rt!.status & BuildingStatus.noTrees) === 0 && matureTreesNear(w, b.x, b.z, 8) >= 15)),
    ).length;
    const thinning = count(w, 'woodcutter', true) > 0 && healthy === 0;
    want(
      (felled.length > 0 && count(w, 'woodcutter') - felled.length < 2) || thinning,
      'woodcutter',
      thinning,
    );
    // C4C: retire it only once a working one stands, or a valley with no logs left can never
    // build another (a Village run found that deadlock).
    const working = w.buildings.some(
      (b) => b.def === 'woodcutter' && b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) === 0,
    );
    if (working) for (const b of felled) p.do('retire a woodcutter', [{ t: 'build.remove', ids: [b.id] }]);
    // C4X: urgent, as homes wait on stone (a hamlet ran out on day five and grew no homes for a week).
    want(stock[G('stone')]! < 16 && count(w, 'quarry') === 0, 'quarry', true);
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
    this.peddler(stock, pop, larder);
    this.rest(stock, larderLow && pop >= 30, thinning && stock[G('logs')]! < 16);
    this.fields();
  }

  /** The peddler takes surplus at 10:00: food beyond five days of eating, logs beyond 60. */
  private peddler(stock: number[], pop: number, larder: boolean): void {
    const p = this.p;
    const w = p.w;
    for (const g of content.goods) {
      const i = G(g.id);
      const surplus = g.food
        ? stock[i]! > pop * (larder ? 7 : p.foodReserveDays) + 8
        : g.id === 'logs'
          ? stock[i]! > 40
          : g.id === 'stone'
            ? stock[i]! > 50
            : // I2 (C4A): a Village lives on its trade, so spare planks go to the peddler too.
              g.id === 'planks'
              ? rankAtLeast(w, 'village') && stock[i]! > 60
              : false;
      if (surplus !== w.economy.forSale[i]) {
        p.do(`${surplus ? 'sell' : 'keep'} ${g.id}`, [
          { t: 'ledger.setForSale', good: g.id, forSale: surplus },
        ]);
      }
    }
  }

  /**
   * C4X: a Hamlet laying in the Charter's five days of food rests its sawpits and quarry while
   * planks and stone are plentiful, so their hands go to the fields (the sim only calls food
   * short under three days); they reopen once the larder is full or the stocks run low. With
   * `keepLogs` the sawpits rest so logs are kept back for the next woodcutter while the patch thins.
   */
  private rest(stock: number[], resting: boolean, keepLogs: boolean): void {
    const p = this.p;
    const w = p.w;
    for (const b of w.buildings) {
      if (b.stage !== 'built' || !b.rt) continue;
      if (b.def === 'sawpit' && (keepLogs || this.keptLogs.has(b.id))) {
        if (keepLogs === b.rt.paused) continue;
        if (keepLogs) this.keptLogs.add(b.id);
        else this.keptLogs.delete(b.id);
        p.do(`${keepLogs ? 'rest' : 'reopen'} the sawpit for the woodcutter's logs`, [
          { t: 'build.setPaused', id: b.id, paused: keepLogs },
        ]);
        continue;
      }
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
      // From Village rank everything rested for the larder reopens (the Village advisor decides).
      const rest = resting && !rankAtLeast(w, 'village') && (b.rt.paused ? have >= low : have >= high);
      if (rest ? b.rt.paused : !this.rested.has(b.id)) continue;
      if (rest) this.rested.add(b.id);
      else this.rested.delete(b.id);
      p.do(`${rest ? 'rest' : 'reopen'} the ${b.def} for the larder`, [
        { t: 'build.setPaused', id: b.id, paused: rest },
      ]);
    }
  }

  /**
   * Fields for a finished farmhouse: a field per worker's share (C4X: all three workers', not one;
   * and only tiles the farm can take, or the painting was refused every turn and the farm stood
   * stuck with no fields while the bakeries waited for flour).
   */
  private fields(): void {
    const p = this.p;
    const w = p.w;
    for (const farm of w.buildings.filter((b) => b.def === 'farmhouse' && b.stage === 'built')) {
      const def = content.buildingById.get(farm.def)!;
      const cap = fieldCap(def);
      let owned = 0;
      for (let i = 0; i < w.map.fieldOwner.length; i++) if (w.map.fieldOwner[i] === farm.id) owned++;
      if (owned >= cap || p.coins() < cap) continue;
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
      if (tiles.length) p.do(`fields x${tiles.length}`, [{ t: 'field.paint', farm: farm.id, tiles }]);
    }
  }
}

export const hamlet: AdvisorDef = {
  id: 'hamlet',
  slot: 50,
  plays: () => true,
  create: (p) => new Hamlet(p),
};
