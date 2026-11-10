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
// R1.0 (stand-ins until R1F rewrites the advisors): no chain buildings and no calling. Bread, cloth,
// cider, cheese and the rest are made by businesses that grow on the zoned streets; this advisor
// places the Village's specialized buildings once they open (the Trading Post, the Market Square,
// the Sawmill with the Water Wheel, the Brickworks with the Brick Kiln, the Cart Shed with Carts),
// fisheries and stalls for a bigger town, and services as before. It pauses nothing: labor needs
// no lever.
import { content } from '@qoti/content';
import {
  creditLimit,
  loansOwed,
  BuildingStatus,
  calendar,
  TILE_FP,
  canPlaceBuilding,
  canPlaceDecor,
  doorTile,
  hasInnovation,
  rankAtLeast,
  serviceCoverage,
  townStock,
  worldIndex,
  type Building,
  type Rot4,
  type WorldState,
} from '@qoti/sim';
import { LODGE_TREES } from '../hamlet';
import { materialsPressing } from '../labor';
import { costOf, MONEY_RESERVE, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { count, craftsfolk, FOODS, G } from '../town';
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
    // More porters next: a storehouse per 20 residents, raised to the front, and another whenever
    // three workplaces sit with their output full (C4X: bread, cloth and cider waited at the
    // workshops while the shelves stood empty, so nobody became Craftsfolk).
    const backed = w.buildings.filter((b) => (b.rt?.status ?? 0) & BuildingStatus.outputFull).length;
    const building = w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction');
    if (
      (count(w, 'storehouse') < 1 + Math.floor(w.residents.length / 20) || (backed >= 3 && !building)) &&
      this.want('storehouse', 8, backed >= 3)
    ) {
      const site = w.buildings[w.buildings.length - 1]!;
      this.p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
    }
    this.materials();
    this.buildVillage();
    if (afternoon) this.dress();
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

  /** The Village's specialized buildings as they open, services and a school. */
  private buildVillage(): void {
    const w = this.w;
    const pop = w.residents.length;
    const crafts = craftsfolk(w);
    const budget: Budget = { left: 3 };
    const go = (cond: boolean, def: string, pressing = false) => {
      if (cond && content.buildingById.has(def)) this.want(def, 5, pressing, budget);
    };
    // Services: Craftsfolk want a tavern and a herbalist in reach (C4X: first, and outside the
    // turn's budget, one site of each at a time).
    this.serve('tavern', 'social');
    this.serve('herbalist', 'health');
    const stock = townStock(w);
    // R1: the carrier's depot, for more carried a day and better terms, and the town's main outlet.
    go(count(w, 'trading-post') === 0 && this.coins() > 150, 'trading-post');
    go(count(w, 'market-square') === 0 && pop >= 40, 'market-square');
    // R1: the Sawmill lets carpenters set up in its reach; the Brickworks fires brick on its clay
    // (pressing while there is too little brick for the next tavern or townhouse).
    go(hasInnovation(w, 'water-wheel') && count(w, 'sawmill') === 0, 'sawmill');
    const brickShort = stock[G('brick')]! < 20;
    if (
      budget.left > 0 &&
      hasInnovation(w, 'brick-kiln') &&
      count(w, 'brickworks') < 1 + Math.floor(pop / 80) &&
      !this.want('brickworks', 5, brickShort, budget) &&
      this.p.blocked('brickworks')
    )
      this.outpost('brickworks');
    go(hasInnovation(w, 'carts') && count(w, 'cart-shed') === 0, 'cart-shed');
    // Skilled work, once there are Craftsfolk to do it.
    go(crafts >= 8 && count(w, 'school') === 0, 'school');
  }

  /**
   * Food for the Charter's five days in stock and for a bigger town: a fishery while there are
   * fewer than four days in hand (the Farmland businesses grow by themselves), and a market stall
   * per forty residents so the shopping trips are short.
   */
  private feed(): void {
    const w = this.w;
    const pop = w.residents.length;
    const stock = townStock(w);
    const food = FOODS.reduce((n, g) => n + stock[g]!, 0);
    const made = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    // C4X: a little over a day's eating made a day is enough. C5A: not in winter.
    const def = this.p.foodBuilding();
    if (def && pop >= 30 && food < pop * 4 && made < pop * 1.15 && calendar(w.tick).season !== 3)
      this.want(def, 5, true);
    if (pop >= 30 && count(w, 'market-stall') < 1 + Math.floor(pop / 40)) this.want('market-stall', 5);
  }

  /**
   * Timber and stone for a bigger town: a Forester's Lodge per fifty residents while timber runs
   * short and a quarry per forty while stone does (with a storehouse out toward them when none
   * finds a spot near the town), and saplings round a lodge whose wood is thinning.
   */
  private materials(): void {
    const w = this.w;
    const pop = w.residents.length;
    const stock = townStock(w);
    // An outpost only when there was no spot for it (C4X: not when it was refused for want of
    // hands, which built a storehouse toward the forest every turn: eighteen of them by day 70).
    if (
      stock[G('timber')]! < 100 &&
      count(w, 'foresters-lodge') < 2 + Math.floor(pop / 50) &&
      !this.want('foresters-lodge', 6, materialsPressing(w, 'foresters-lodge')) &&
      this.p.blocked('foresters-lodge')
    )
      this.outpost('foresters-lodge');
    // Replant round a lodge running short of grown trees, so its wood comes back (R1 stand-in
    // (R1B): the lodge does not replant its own wood yet).
    for (const b of w.buildings) {
      if (b.def !== 'foresters-lodge' || b.stage !== 'built' || treesNear(w, b.x, b.z, 8) >= 16) continue;
      let planted = 0;
      for (let k = 0; k < 120 && planted < 6; k++) {
        const x = b.x - 8 + ((k * 7 + b.id) % 18);
        const z = b.z - 8 + ((k * 11 + b.id * 3) % 18);
        if (x < 1 || z < 1 || x > 190 || z > 190) continue;
        const i = z * 192 + x;
        if (w.map.tree[i] || w.map.road[i] || w.map.occupant[i] || w.map.water[i] || w.map.fieldOwner[i])
          continue;
        if (w.map.zone[i]) continue;
        if (this.p.do('plant a sapling for the lodge', [{ t: 'tree.plant', species: 'oak', x, z }]))
          planted++;
      }
    }
    if (
      stock[G('stone')]! < 60 &&
      count(w, 'quarry') < 1 + Math.floor(pop / 40) &&
      !this.want('quarry', 6, materialsPressing(w, 'quarry')) &&
      this.p.blocked('quarry')
    )
      this.outpost('quarry');
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

  /**
   * No spot for a quarry near a storehouse: put a storehouse by the nearest stone deposit instead,
   * so the next turn finds the quarry a place (one outpost under way at a time).
   */
  private outpost(def: string): void {
    const w = this.w;
    if (w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction')) return;
    // C4X: a storehouse per twenty residents is plenty (their porters are hands too).
    if (count(w, 'storehouse') >= 2 + Math.floor(w.residents.length / 20)) return;
    const reader = worldIndex(w).reader;
    const d = content.buildingById.get(def)!;
    const store = content.buildingById.get('storehouse')!;
    const doors = w.buildings
      .filter((b) => b.def === 'storehouse' && b.stage === 'built')
      .map((b) => doorTile(b));
    const man = (a: number, b: number) =>
      Math.abs((a % 192) - (b % 192)) + Math.abs(Math.floor(a / 192) - Math.floor(b / 192));
    const fits = (x: number, z: number) => {
      if (!canPlaceBuilding(reader, d, x, z, 0).ok) return false;
      return def !== 'foresters-lodge' || treesNear(w, x, z, 8) >= LODGE_TREES;
    };
    // A spot for the building between 22 and 40 tiles from a storehouse, then a new storehouse
    // between the two, so porters from the old one can stock the new one.
    for (const from of doors) {
      const fx = from % 192;
      const fz = Math.floor(from / 192);
      for (let r = 12; r <= 44; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = fx + dx;
            const z = fz + dz;
            if (x < 2 || z < 2 || x > 188 || z > 188 || !fits(x, z)) continue;
            const mx = (fx + x) >> 1;
            const mz = (fz + z) >> 1;
            for (let k = 0; k <= 6; k++) {
              for (let oz = -k; oz <= k; oz++) {
                for (let ox = -k; ox <= k; ox++) {
                  if (Math.max(Math.abs(ox), Math.abs(oz)) !== k) continue;
                  const sx = mx + ox;
                  const sz = mz + oz;
                  if (!canPlaceBuilding(reader, store, sx, sz, 0).ok) continue;
                  const door = doorTile({ def: 'storehouse', x: sx, z: sz, rot: 0 } as Building, store);
                  if (man(door, from) > 22 || man(door, z * 192 + x) > 20) continue;
                  this.p.buildAt(`storehouse toward the ${def}`, 'storehouse', sx, sz, 0, true);
                  return;
                }
              }
            }
          }
        }
      }
    }
  }

  /** Flowers and a tree by the homes with the plainest streets, so they reach Craftsfolk charm. */
  private dress(): void {
    const w = this.w;
    const homes = w.buildings
      .filter((b) => b.stage === 'built' && content.buildingById.get(b.def)?.housing)
      .map((b) => ({ b, charm: charmAt(w, b) }))
      .filter((x) => x.charm < 32)
      .sort((a, b) => a.charm - b.charm || a.b.id - b.b.id)
      .slice(0, 10);
    for (const { b } of homes) {
      const door = doorTile(b);
      const x = door % 192;
      const z = Math.floor(door / 192);
      for (const def of ['flower-bed', 'planter', 'cherry-tree']) {
        const spot = decorSpot(w, def, x, z);
        if (spot)
          this.p.do(`${def} for the street`, [{ t: 'decor.place', def, fx: spot[0], fz: spot[1], rot: 0 }]);
      }
    }
  }
}

function treesNear(w: WorldState, x: number, z: number, r: number): number {
  let n = 0;
  for (let tz = z - r; tz <= z + r; tz++)
    for (let tx = x - r; tx <= x + r; tx++) {
      if (tx < 0 || tz < 0 || tx >= 192 || tz >= 192) continue;
      const v = w.map.tree[tz * 192 + tx]!;
      if (v && (v & 7) >= 3) n++;
    }
  return n;
}

function charmAt(w: WorldState, b: Building): number {
  const door = doorTile(b);
  const x = door % 192;
  const z = Math.floor(door / 192);
  let sum = 0;
  let n = 0;
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++) {
      const i = (z + dz) * 192 + x + dx;
      if (i >= 0 && i < w.map.charm.length) {
        sum += w.map.charm[i]!;
        n++;
      }
    }
  return n ? sum / n : 0;
}

/** A free spot for decor within three tiles of a door, or null. */
function decorSpot(w: WorldState, def: string, x: number, z: number): [number, number] | null {
  const d = content.decorById.get(def)!;
  const reader = worldIndex(w).reader;
  for (let r = 1; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const fx = (x + dx) * TILE_FP + TILE_FP / 2;
        const fz = (z + dz) * TILE_FP + TILE_FP / 2;
        if (canPlaceDecor(reader, d, fx, fz, 0).ok) return [fx, fz];
      }
    }
  }
  return null;
}

export const village: AdvisorDef = {
  id: 'village',
  slot: 10,
  // The Village's services, specialized buildings and tiers, once the content has them (I2) and the run plays them.
  plays: (opts) => !!opts.village && content.buildingById.has('tavern'),
  create: (p) => {
    // C4C: the Village run keeps six days of food a resident from the festival menu, for the Charter.
    p.foodReserveDays = 6;
    return new Village(p);
  },
};
