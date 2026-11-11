// The hamlet advisor (I1, C3X; ported in C5.0): the Ledger's builds from the standard start, one or
// two things the town is shortest of each visit. These rules held the I1 and I2 acceptance runs;
// they keep their I1 shape (no timber reserve, a queue of three, two starts a visit).
//
// R1.0: the hand-placed chains are gone. R1F: the specialized buildings (lodges, quarries, fisheries,
// the windmill, granaries and storehouses) are the land advisor's, with the zones; this advisor
// keeps the Hamlet's services and homes: cottages by hand only until the street is zoned, a market
// stall, a builder's yard and wells. It sends no sale and pauses nothing: the carrier sells and
// imports by its own rules, and labor needs no lever.
import {
  creditLimit,
  larderWelcomes,
  loansOwed,
  rankAtLeast,
  townStock,
} from '@qoti/sim';
import { costOf, URGENT, type Planner } from '../planner';
import { charterOpen, count, FOODS, storyWaiting, vacantHomes } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** The I1 build queue: three sites under way unless a want is urgent. */
const QUEUE = 3;

class Hamlet implements Advisor {
  constructor(readonly p: Planner) {}

  visit(): void {
    const p = this.p;
    const w = p.w;
    const stock = townStock(w);
    const pop = w.residents.length;
    const stored = FOODS.reduce((n, g) => n + stock[g]!, 0);
    const budget = { left: 2 };
    // Materials already promised to sites don't count as available.
    const free = [...stock];
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
    }
    const larderLow = !rankAtLeast(w, 'village') && pop >= 25 && stored < pop * 5;
    const want = (cond: boolean, def: string, urgent = false) => {
      if (!cond) return;
      p.propose({
        def,
        priority: urgent ? URGENT : QUEUE,
        cost: costOf(def),
        pressing: false,
        essential: true,
        tally: free,
        budget,
      });
    };
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
    // P1: a growing hamlet puts up a second well on its own, for its comfort and its gathering place.
    want(pop >= 12 && count(w, 'well') < 2, 'well');
  }
}

export const hamlet: AdvisorDef = {
  id: 'hamlet',
  slot: 50,
  plays: () => true,
  create: (p) => new Hamlet(p),
};
