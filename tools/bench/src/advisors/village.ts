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
  creditLimit,
  loansOwed,
  BuildingStatus,
  canPlaceBuilding,
  doorTile,
  rankAtLeast,
  serviceCoverage,
  townStock,
  worldIndex,
  type Building,
  type Rot4,
  type WorldState,
} from '@qoti/sim';
import { costOf, MONEY_RESERVE, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { count, craftsfolk, G } from '../town';
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

  private coins(): number {
    return this.p.coins();
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
      // A site only waiting its turn for a builder is not stuck (C4X).
      else if (day - seen[1] >= 3 && !((b.rt?.status ?? 0) & BuildingStatus.waitingBuilders))
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

  /** Services and a school (R1F: the specialized buildings are the land advisor's). */
  private buildVillage(): void {
    const w = this.w;
    // Services: Craftsfolk want a tavern and a herbalist in reach (C4X: first, and outside the
    // turn's budget, one site of each at a time).
    this.serve('tavern', 'social');
    this.serve('herbalist', 'health');
    // Skilled work, once there are Craftsfolk to do it.
    if (craftsfolk(w) >= 8 && count(w, 'school') === 0) this.want('school', 5);
    // C5A (the seasons advisor's until R1F): a Village with a dozen homes asks for a Bath House.
    const homes = w.households.length;
    if (homes >= 12 && count(w, 'bath-house') < 1 + Math.floor(homes / 30))
      this.p.propose({ def: 'bath-house', priority: 2, cost: costOf('bath-house', 10), pressing: false, essential: false });
  }

  /** A market stall per forty residents, so the shopping trips are short (R1F: fisheries are the land advisor's). */
  private feed(): void {
    const w = this.w;
    const pop = w.residents.length;
    if (pop >= 30 && count(w, 'market-stall') < 1 + Math.floor(pop / 40)) this.want('market-stall', 5);
  }

  /**
   * A service where it is missed: next to the home of the first household (by id) that the tavern
   * or herbalist does not reach yet. At most one under way of each kind.
   */
  private serve(def: string, kind: 'social' | 'health'): boolean {
    const w = this.w;
    if (w.buildings.some((b) => b.def === def && b.stage === 'construction')) return false;
    if (count(w, def) >= 1 + Math.floor(w.residents.length / 30)) return false;
    if (!this.p.staffs(def, true)) return false;
    const covered = serviceCoverage(w, kind).quality;
    const d = content.buildingById.get(def)!;
    if (this.coins() < costOf(def, VILLAGE_MARGIN).coins + MONEY_RESERVE) return false;
    const stock = townStock(w);
    for (const [g, q] of d.cost?.goods ?? []) if (stock[G(g)]! < q) return false;
    const reader = worldIndex(w).reader;
    let tried = 0;
    for (const h of w.households) {
      if (!h.homeId || covered.has(h.id) || tried++ >= 24) continue;
      const home = w.buildings.find((b) => b.id === h.homeId);
      if (!home) continue;
      for (let r = 2; r <= 9; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
              const x = home.x + dx;
              const z = home.z + dz;
              if (!canPlaceBuilding(reader, d, x, z, rot).ok) continue;
              if (w.map.water[doorTile({ def, x, z, rot } as Building, d)]) continue;
              return !!this.p.buildAt(`build ${def} by the ${h.family}s`, def, x, z, rot, true);
            }
          }
        }
      }
    }
    return false;
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
