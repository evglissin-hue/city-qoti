// The hamlet advisor (I1, C3X; ported in C5.0): the Ledger's builds from the standard start, one or
// two things the town is shortest of each visit. These rules held the I1 and I2 acceptance runs;
// they keep their I1 shape (no timber reserve, a queue of three, two starts a visit).
//
// R1.0 (stand-ins until R1F rewrites the advisors): the hand-placed chains are gone. Food comes
// from fisheries and from Farmland businesses, which grow by themselves on the street the street
// advisor zones on the first day; timber from Forester's Lodges and stone from quarries. The
// advisor sites the Hamlet's specialized buildings: a windmill once Farmland grows grain (so bakers
// can set up in its reach), a granary as Food stocks grow, storehouses, a market stall, a builder's
// yard and wells, and cottages by hand only until the street exists. It sends no sale and pauses
// nothing: the carrier sells and imports by its own rules, and labor needs no lever.
import {
  BuildingStatus,
  creditLimit,
  larderWelcomes,
  loansOwed,
  rankAtLeast,
  townStock,
  type Building,
} from '@qoti/sim';
import { LODGE_TREES, matureTreesNear } from '../hamlet';
import { materialsPressing } from '../labor';
import { costOf, URGENT, type Planner } from '../planner';
import { charterOpen, count, countTrade, FOODS, G, storyWaiting, vacantHomes } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** The I1 build queue: three sites under way unless a want is urgent. */
const QUEUE = 3;
/** Food in store a resident before the Hamlet puts up a granary (R1). */
const GRANARY_FOOD_DAYS = 4;
/** Residents a granary serves (docs/spec/13-ledger.md: about one to every 150, tune). */
const GRANARY_RESIDENTS = 150;

class Hamlet implements Advisor {
  constructor(readonly p: Planner) {}

  visit(): void {
    const p = this.p;
    const w = p.w;
    const stock = townStock(w);
    const pop = w.residents.length;
    const stored = FOODS.reduce((n, g) => n + stock[g]!, 0);
    const food =
      stored + w.households.reduce((n, h) => n + FOODS.reduce((m, g) => m + (h.pantry[g] ?? 0), 0), 0);
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
    const larderLow = !rankAtLeast(w, 'village') && pop >= 25 && stored < pop * 5;
    const foodPressing = food < pop * 3 || larderLow;
    const want = (cond: boolean, def: string | null, urgent = false) => {
      if (!cond || !def) return;
      p.propose({
        def,
        priority: urgent ? URGENT : QUEUE,
        cost: costOf(def),
        // C4X: never a workplace nobody can work (another empty fishery feeds nobody).
        pressing: (foodPressing && def === 'fishery') || materialsPressing(w, def),
        essential: true,
        tally: free,
        budget,
      });
    };
    // Hungry towns come first: a fishery jumps the queue when there are under three days left
    // (the Farmland businesses grow by themselves; the carrier brings the rest).
    const foodSites = w.buildings.filter((b) => b.stage === 'construction' && b.def === 'fishery').length;
    want(food < pop * 3 && foodSites === 0, p.foodBuilding(), true);
    // Timber next: a Forester's Lodge needs only timber and stone, and everything else needs timber.
    this.lodges(want, pop);
    // C4X: urgent, as homes wait on stone (a hamlet ran out on day five and grew no homes for a week).
    // Round seven: ahead of the homes, so the last of the stone never goes into a cottage first.
    want(stock[G('stone')]! < 16 && count(w, 'quarry') === 0, 'quarry', true);
    // Food: a day's eating for everyone should come in each day, a fishery to every eight residents
    // at most (the farms are Farmland's).
    want(foodMade < pop + 4 && count(w, 'fishery') * 8 < pop + 6, p.foodBuilding());
    // I2 (C4A): the Village Charter wants five days of food in store, so a Hamlet of 25 or more
    // lays in a larder.
    const larder = !rankAtLeast(w, 'village') && pop >= 25;
    want(larder && stored < pop * 6 && foodMade < pop * 1.4, p.foodBuilding(), true);
    // A Village deep in the County Bank's books pays down before it builds more homes.
    const indebted = rankAtLeast(w, 'village') && loansOwed(w) * 2 > creditLimit(w);
    // Only once food is the last goal open: holding homes while wishes or patterns are still to come
    // froze a valley at 36 residents for thirty days (wishes need residents to make them).
    const foodLast = charterOpen(w).length === 1 && charterOpen(w)[0] === 'food';
    // Homes: one empty cottage waiting for the next family until the street is zoned (R1: from the
    // first day; Homes lots grow their own after that), and a second when a story character is
    // waiting to move in (C4D: they never take the last one).
    const waiting = storyWaiting(w) ? 1 : 0;
    const homesComing =
      vacantHomes(w) + w.buildings.filter((b) => b.def === 'cottage' && b.stage === 'construction').length;
    // C5A: and from autumn, while the larder could not see another family through the winter (the
    // sim holds them at the gate), one home ready for them and no more.
    const winterHold = homesComing > 1 && !larderWelcomes(w, 4);
    const holdHomes = (larderLow && pop >= 30 && foodLast) || indebted || winterHold;
    // C4X: with no home empty or going up, the next cottage jumps the queue (nobody moves in
    // without one; a hamlet sat at 13 residents for six days behind its other sites).
    want(!p.street && !holdHomes && homesComing < 2 + waiting, 'cottage', homesComing === 0);
    want(pop >= 10 && count(w, 'market-stall') === 0, 'market-stall');
    want(pop >= 14 && count(w, 'builders-yard') === 0, 'builders-yard');
    // R1: the windmill lets bakers set up in its reach, so it goes up once Farmland grows grain.
    want(countTrade(w, 'grain-farm', true) > 0 && count(w, 'windmill') === 0, 'windmill');
    // R1: a granary keeps Food (and spoils it half as fast) once stocks grow, one per 150 residents.
    want(
      pop >= 15 &&
        stored >= pop * GRANARY_FOOD_DAYS &&
        count(w, 'granary') < 1 + Math.floor(pop / GRANARY_RESIDENTS),
      'granary',
    );
    // C4C: urgent, or porters busy with food and inputs leave the sites waiting, and the sites
    // waiting keep the second storehouse from being started (a Village run deadlocked there).
    // C4X: and one per twenty residents after that.
    want(pop >= 20 && count(w, 'storehouse') < Math.max(2, 1 + Math.floor(pop / 20)), 'storehouse', true);
    // P1: a growing hamlet puts up a second well on its own, for its comfort and its gathering place.
    want(pop >= 12 && count(w, 'well') < 2, 'well');
    // More stone as the town grows.
    if (rankAtLeast(w, 'village'))
      want(stock[G('stone')]! < 16 && count(w, 'quarry') < 1 + Math.floor(pop / 40), 'quarry');
  }

  /**
   * Forester's Lodges: the first at once, another as the town grows while timber runs short, and a
   * new one when the last working lodge's wood thins (R1: the woodcutter's rules, kept; a valley
   * with no timber could never build another).
   */
  private lodges(want: (cond: boolean, def: string | null, urgent?: boolean) => void, pop: number): void {
    const w = this.p.w;
    // A site counts once its timber is in (C5X: a site counted from the moment it was placed, and
    // the town spent the timber it waited for).
    const timberIn = (b: Building) => {
      const c = b.rt?.construction;
      return !c || (c.needs[G('timber')] ?? 0) === 0;
    };
    const felled = (b: Building) => b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) !== 0;
    const lodges = w.buildings.filter((b) => b.def === 'foresters-lodge');
    const healthy = lodges.filter((b) =>
      b.stage !== 'built' ? timberIn(b) : !felled(b) && matureTreesNear(w, b.x, b.z, 8) >= LODGE_TREES,
    ).length;
    const thinning = lodges.some((b) => b.stage === 'built') && healthy === 0;
    want(lodges.length === 0, 'foresters-lodge');
    want(thinning && !lodges.some((b) => b.stage === 'construction'), 'foresters-lodge', true);
    want(
      pop >= 12 && townStock(w)[G('timber')]! < 40 && lodges.length < 1 + Math.floor(pop / 30),
      'foresters-lodge',
    );
    // C4C: retire a felled one only once a working one stands, or a valley with no timber left can
    // never build another (a Village run found that deadlock).
    if (lodges.some((b) => b.stage === 'built' && !felled(b)))
      for (const b of lodges.filter(felled))
        this.p.do('retire a felled lodge', [{ t: 'build.remove', ids: [b.id] }]);
    // C5X: the next lodge's site is raised, so the porters bring it its timber first.
    for (const b of lodges) {
      if (b.stage === 'construction' && !timberIn(b) && !b.rt?.construction?.priority)
        this.p.do('raise the lodge', [{ t: 'build.setPriority', id: b.id, priority: true }]);
    }
  }
}

export const hamlet: AdvisorDef = {
  id: 'hamlet',
  slot: 50,
  plays: () => true,
  create: (p) => new Hamlet(p),
};
