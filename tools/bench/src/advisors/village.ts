// The village advisor (C4C, ported in C5.0): claims the Charter when it is ready, then plays the
// Village's services and homes toward Craftsfolk: a tavern and a herbalist near the homes, a school,
// more storehouses and builders, timber and stone for a bigger town, and flowers by the doors so
// the streets reach the Craftsfolk's charm.
//
// C4X: the stand-ins this half carried while the wave ran (wages paid from outside, the Village
// rank granted on day 24, a loan taken on day one) are gone: C4A's wages and loans and the real
// Charter claim drive it now.
//
// C5.0: its wants go to the planner, priced `VILLAGE_MARGIN` over the def (I2 kept 30 coins back);
// a want's priority is the build queue it will join (I2's `maxSites`).
//
// R1.0: no chain buildings and no calling; bread, cloth, cider, cheese and the rest are made by
// businesses that grow on the zoned streets. R1F: the specialized buildings (the Trading Post, the
// Market Square, the Sawmill, the Brickworks, the Cart Shed, lodges, quarries, fisheries and
// storehouses) are the land advisor's, and the flowers by the doors are the Hearth's. This advisor
// keeps the Village's services and homes: a tavern and a herbalist near the homes that lack them, a
// school, a Bath House, market stalls and builders for a bigger town. It pauses nothing: labor
// needs no lever.
import { content } from '@qoti/content';
import {
  BuildingStatus,
  creditLimit,
  loansOwed,
  rankAtLeast,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { costOf, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { count, craftsfolk } from '../town';
import { serveService } from './siting';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Timber, stone and food buildings may dip into the reserve. */
function essential(def: string): boolean {
  return ['foresters-lodge', 'quarry', 'fishery', 'market-stall', 'cottage'].includes(def);
}

class Village implements Advisor {
  constructor(readonly p: Planner) {}

  get w(): WorldState {
    return this.p.w;
  }

  /** Construction progress last seen per site, and the day it last moved. */
  private readonly progress = new Map<number, [done: number, day: number]>();

  /**
   * A site that has not moved for three days (cut off by the river, or out of every porter's
   * reach) is canceled, so it stops holding a place in the queue. A player would notice.
   */
  private tidySites(): void {
    const w = this.w;
    const day = Math.floor(w.tick / 4800);
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (b.stage !== 'construction' || !c) continue;
      const done = c.workDone + c.delivered.reduce((a, n) => a + n, 0);
      const seen = this.progress.get(b.id);
      if (!seen || seen[0] !== done) this.progress.set(b.id, [done, day]);
      // A site only waiting its turn for a builder is not stuck (C4X), nor one waiting on materials
      // the carrier brings once the treasury can pay (R1X: oak canceled and re-placed 26 such sites).
      else if (
        day - seen[1] >= 3 &&
        !((b.rt?.status ?? 0) & (BuildingStatus.waitingBuilders | BuildingStatus.waitingMaterials))
      )
        this.p.do(`cancel a stuck ${b.def}`, [{ t: 'build.remove', ids: [b.id] }]);
    }
  }

  /** One turn; the 15:00 visit also tidies sites and decorates. */
  visit({ afternoon }: Visit): void {
    const w = this.w;
    if (afternoon) this.tidySites();
    if (w.charter.ready && w.charter.charter) this.p.do('claim the Charter', [{ t: 'charter.claim' }]);
    if (!rankAtLeast(w, 'village')) return;
    this.feed();
    // Homes before anything else: a Village grows by the families that move in. R1: by hand only
    // while no street is zoned; Homes lots grow their own after that.
    const vacant = w.buildings.filter(
      (b) =>
        content.buildingById.get(b.def)?.housing &&
        (b.stage === 'construction' || !w.households.some((h) => h.homeId === b.id)),
    ).length;
    // C5X: past half the County Bank's line, one home waiting for the next family rather than two
    // (with festivals and renown pulling families in, the Village borrowed for every second home).
    const indebted = loansOwed(w) * 2 > creditLimit(w);
    if (!this.p.street && vacant < (indebted ? 1 : 2)) this.want('cottage', 6);
    // Builders: a yard per forty residents, or the sites queue up behind two town hall builders
    // (C4X: per thirty, six yards kept sixteen builders from the workshops).
    // Pressing while sites wait their turn for a builder (C4X: they used to be canceled as stuck).
    const queued = w.buildings.some(
      (b) => b.stage === 'construction' && ((b.rt?.status ?? 0) & BuildingStatus.waitingBuilders) !== 0,
    );
    if (count(w, 'builders-yard') < Math.floor(w.residents.length / 40))
      this.want('builders-yard', 8, queued);
    this.buildVillage();
    this.waresMakers();
  }

  /**
   * Proposes `def` to the planner, joining a build queue of at most `priority` sites. C4X: only
   * workplaces someone can work (see labor.ts); past half the County Bank's line only what is
   * pressing or keeps the town going is started; and a reserve of timber stays so a Forester's
   * Lodge can always be rebuilt (a village that spends its last timber on a tavern has no way back).
   */
  private want(def: string, priority = 5, pressing = false, budget?: Budget): boolean {
    return !!this.p.propose({
      def,
      priority,
      cost: costOf(def, VILLAGE_MARGIN),
      pressing,
      essential: essential(def),
      budget,
    });
  }

  /** Pins made so far, by trade: a pin the sim retools away (the site fails) is tried on another business, three times at most. */
  private readonly pinned = new Map<string, number[]>();

  /**
   * R2X: Wares. Cloth is the one Wares good whose makers the town can always have (candles take
   * honey from a few hives; furniture wants a sawmill's reach), and growth never picks the weaver
   * while a few candles sit on one shelf (the flavor count is met), so the shelves stay bare and
   * "wares (0 of 1 kinds)" held back a third of the Craftsfolk homes on two seeds. The Ledger pins
   * a spare farm to a sheep run, then a spare workshop to a weaver, once there are homes to sell to.
   */
  private waresMakers(): void {
    const w = this.w;
    if (w.households.length < 14) return;
    const built = (trade: string) =>
      w.buildings.some((b) => b.trade === trade && (b.stage === 'built' || b.stage === 'construction'));
    const spare = (zone: 'farms' | 'crafts', keep: string): Building | null => {
      const of = w.buildings.filter(
        (b) => b.stage === 'built' && b.trade && !b.pinned && content.tradeById.get(b.trade)?.zone === zone,
      );
      const counts = new Map<string, number>();
      for (const b of of) counts.set(b.trade!, (counts.get(b.trade!) ?? 0) + 1);
      let best: Building | null = null;
      let bestN = 1;
      for (const b of of) {
        const n = counts.get(b.trade!)!;
        if (b.trade === keep || n <= bestN) continue;
        best = b;
        bestN = n;
      }
      return best;
    };
    const pin = (zone: 'farms' | 'crafts', trade: string): void => {
      const tried = this.pinned.get(trade) ?? [];
      if (tried.length >= 3) return;
      const b = spare(zone, trade);
      if (!b || tried.includes(b.id)) return;
      tried.push(b.id);
      this.pinned.set(trade, tried);
      this.p.do(`pin a ${trade} at business ${b.id}`, [{ t: 'build.pinRecipe', id: b.id, trade }]);
    };
    if (!built('sheep-run')) pin('farms', 'sheep-run');
    else if (!built('weaver')) pin('crafts', 'weaver');
  }

  /** Services and a school (R1F: the specialized buildings are the land advisor's). */
  private buildVillage(): void {
    const w = this.w;
    // Services: Craftsfolk want a herbalist in reach (C4X: first, and outside the turn's budget,
    // one site at a time).
    // R2E: the tavern is the Hearth's now (the places advisor sites it where folk live).
    serveService(this.p, 'herbalist', 'health');
    // Skilled work, once there are Craftsfolk to do it.
    if (craftsfolk(w) >= 8 && count(w, 'school') === 0) this.want('school', 5);
    // C5A (the seasons advisor's until R1F): a Village with a dozen homes asks for a Bath House.
    const homes = w.households.length;
    if (homes >= 12 && count(w, 'bath-house') < 1 + Math.floor(homes / 30))
      this.p.propose({
        def: 'bath-house',
        priority: 2,
        cost: costOf('bath-house', 10),
        pressing: false,
        essential: false,
      });
  }

  /** A market stall per forty residents, so the shopping trips are short (R1F: fisheries are the land advisor's). */
  private feed(): void {
    const w = this.w;
    const pop = w.residents.length;
    if (pop >= 30 && count(w, 'market-stall') < 1 + Math.floor(pop / 40)) this.want('market-stall', 5);
  }
}

export const village: AdvisorDef = {
  id: 'village',
  lane: 'ledger',
  slot: 10,
  // The Village's services, specialized buildings and tiers, once the content has them (I2) and the run plays them.
  plays: (opts) => !!opts.village && content.buildingById.has('tavern'),
  create: (p) => {
    // C4C: the Village run keeps six days of food a resident from the festival menu, for the Charter.
    p.foodReserveDays = 6;
    return new Village(p);
  },
};
