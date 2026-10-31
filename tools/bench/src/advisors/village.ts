// The village advisor (C4C, ported in C5.0): claims the Charter when it is ready, then plays the I2
// chains, services and homes toward Craftsfolk: a tavern and a herbalist near the homes, firewood,
// cloth, bricks (once the kiln is invented), cider and cheese, a school, carts, more storehouses,
// and flowers by the doors so the streets reach the Craftsfolk's charm. A clay pit goes in while
// still a Hamlet so the Brick Kiln is ready when the Village is.
//
// C4X: the stand-ins this half carried while the wave ran (wages paid from outside, the Village
// rank granted on day 24, a loan taken on day one) are gone: C4A's wages and loans and the real
// Charter claim drive it now.
//
// C5.0: its wants go to the planner, priced `VILLAGE_MARGIN` over the def (I2 kept 30 coins back);
// a want's priority is the build queue it will join (I2's `maxSites`).
import { content } from '@qoti/content';
import {
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
import { materialsPressing } from '../labor';
import { costOf, MONEY_RESERVE, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { count, craftsfolk, G } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Timber and food buildings may dip into the reserve. */
function essential(def: string): boolean {
  return [
    'woodcutter',
    'sawpit',
    'vegetable-plot',
    'fishers-hut',
    'farmhouse',
    'market-stall',
    'cottage',
  ].includes(def);
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
   * reach) is cancelled, so it stops holding a place in the queue. A player would notice.
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
    this.feed();
    const pit = w.buildings.find((b) => b.def === 'clay-pit' && b.stage === 'built');
    if (!rankAtLeast(w, 'village')) {
      // Dig for two days to invent the kiln, then rest the pit until bricks are wanted.
      if (w.residents.length >= 28 && count(w, 'clay-pit') === 0) this.want('clay-pit', 2);
      if (pit && hasInnovation(w, 'brick-kiln') && !pit.rt!.paused)
        this.p.do('rest the clay pit', [{ t: 'build.setPaused', id: pit.id, paused: true }]);
      return;
    }
    if (pit?.rt!.paused)
      this.p.do('reopen the clay pit', [{ t: 'build.setPaused', id: pit.id, paused: false }]);
    // Homes before anything else: a Village grows by the families that move in.
    const vacant = w.buildings.filter(
      (b) =>
        content.buildingById.get(b.def)?.housing &&
        (b.stage === 'construction' || !w.households.some((h) => h.homeId === b.id)),
    ).length;
    if (vacant < 2) this.want('cottage', 6);
    // Builders: a yard per forty residents, or the sites queue up behind two town hall builders
    // (C4X: per thirty, six yards kept sixteen builders from the bakeries).
    // Pressing while sites wait their turn for a builder (C4X: they used to be cancelled as stuck).
    const queued = w.buildings.some(
      (b) => b.stage === 'construction' && ((b.rt?.status ?? 0) & BuildingStatus.waitingBuilders) !== 0,
    );
    if (count(w, 'builders-yard') < Math.floor(w.residents.length / 40))
      this.want('builders-yard', 8, queued);
    // More porters next: a storehouse per 20 residents, raised to the front, and another whenever
    // three workplaces sit with their output full (C4X: bread, cloth and cider waited at the
    // bakeries and the weaver while the shelves stood empty, so nobody became Craftsfolk).
    const backed = w.buildings.filter((b) => (b.rt?.status ?? 0) & BuildingStatus.outputFull).length;
    const building = w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction');
    if (
      (count(w, 'storehouse') < 1 + Math.floor(w.residents.length / 20) || (backed >= 3 && !building)) &&
      this.want('storehouse', 8, backed >= 3)
    ) {
      const site = w.buildings[w.buildings.length - 1]!;
      this.p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
    }
    this.timber();
    this.buildVillage();
    if (afternoon) this.dress();
  }

  /**
   * Proposes `def` to the planner, joining a build queue of at most `priority` sites. C4X: only
   * workplaces someone can work (see labor.ts); past half the County Bank's line only what is
   * pressing or keeps the town going is started (the Village borrowed its way to the edge of lean
   * times on new workshops); and a reserve of timber stays so the woodcutters and sawpits can always
   * be rebuilt (a village that spends its last logs on a tavern has no way back).
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

  private buildVillage(): void {
    const w = this.w;
    const pop = w.residents.length;
    const crafts = craftsfolk(w);
    const budget: Budget = { left: 3 };
    const go = (cond: boolean, def: string, pressing = false) => {
      if (cond) this.want(def, 5, pressing, budget);
    };
    // C4X: bread is pressing while the shelves hold under a third of a loaf a head (Craftsfolk eat
    // it daily), so the farm, mill and bakery may draw hands from spare porters.
    const breadShort = townStock(w)[G('bread')]! < pop / 2;
    // Bread: a farm, the mill and the bakery (Craftsfolk eat it every day; C4X: a Village whose
    // food came from plots and huts never built the farm, so never baked).
    // Services: Craftsfolk want a tavern and a herbalist in reach (C4X: first, and outside the
    // turn's budget, one site of each at a time; behind the chains they came too late).
    this.serve('tavern', 'social');
    this.serve('herbalist', 'health');
    // C4X: a pile of wool, yarn or apples gets its spinner, weaver or press before anything else (466 yarn and
    // 160 apples waited while the Village kept starting other things, and nobody had cloth or
    // cider).
    // Nothing else is started until they are, so the coins are there for them.
    const piles = townStock(w);
    const spinner = piles[G('wool')]! >= 20 && count(w, 'spinner') < count(w, 'sheep-pasture', true);
    const weaver = piles[G('yarn')]! >= 20 && count(w, 'weaver') < count(w, 'spinner', true);
    const press = piles[G('apples')]! >= 40 && count(w, 'cider-press') < count(w, 'orchard', true);
    // Wool as well (C4X: 256 wool waited with no spinner, so no Settler household ever had cloth).
    if (spinner && !this.want('spinner', 8, true)) return;
    if (weaver && !this.want('weaver', 8, true)) return;
    if (press && !this.want('cider-press', 8, true)) return;
    go(count(w, 'farmhouse') === 0, 'farmhouse');
    // A mill per farm and a bakery per mill while bread is short; another farm only once every
    // farm's wheat is being milled (C4X: six farms stood with full barns behind two mills).
    const backedUp = (def: string) =>
      w.buildings.some((b) => b.def === def && ((b.rt?.status ?? 0) & BuildingStatus.outputFull) !== 0);
    go(
      count(w, 'farmhouse', true) > 0 &&
        count(w, 'windmill') <
          Math.max(1 + Math.floor(pop / 60), breadShort ? count(w, 'farmhouse', true) : 0),
      'windmill',
      breadShort,
    );
    go(
      count(w, 'windmill', true) > 0 &&
        count(w, 'bakery') < Math.max(1 + Math.floor(pop / 50), breadShort ? count(w, 'windmill', true) : 0),
      'bakery',
      breadShort,
    );
    go(
      breadShort &&
        !backedUp('farmhouse') &&
        !backedUp('windmill') &&
        count(w, 'farmhouse') < 1 + Math.floor(pop / 50),
      'farmhouse',
      true,
    );
    const stock = townStock(w);
    // Bricks first (taverns and townhouses are made of them): a clay pit (two days of digging
    // invent the kiln), firewood for the kiln, then the kiln.
    if (budget.left > 0 && count(w, 'clay-pit') === 0 && !this.want('clay-pit') && this.p.blocked('clay-pit'))
      this.outpost('clay-pit');
    go(count(w, 'chopping-shed') < 1 + Math.floor(crafts / 24), 'chopping-shed');
    // C4X: bricks and cloth by the size of the town, not its Craftsfolk: what the Village sells
    // beyond the valley pays for its sites and loans (and there were no Craftsfolk to count yet).
    // Pressing while there are too few bricks for the next tavern or townhouse.
    const bricksShort = stock[G('bricks')]! < 20;
    go(
      hasInnovation(w, 'brick-kiln') && count(w, 'brick-kiln') < 1 + Math.floor(pop / 80),
      'brick-kiln',
      bricksShort,
    );
    go(
      hasInnovation(w, 'brick-kiln') && count(w, 'clay-pit') < count(w, 'brick-kiln', true),
      'clay-pit',
      bricksShort,
    );
    // Cloth and treats for the basket, by the size of the town, not its Craftsfolk (there were
    // none to count while the shelves had no cloth or cider), and pressing, like bread, while the
    // shelves hold too little of them (C4X: every Settler household waited on cloth and cider).
    const clothShort = stock[G('cloth')]! < w.households.length / 2;
    const ciderShort = stock[G('cider')]! < pop / 8;
    go(count(w, 'sheep-pasture') < 1 + Math.floor(pop / 60), 'sheep-pasture', clothShort);
    go(count(w, 'spinner') < count(w, 'sheep-pasture', true), 'spinner', clothShort);
    go(count(w, 'weaver') < count(w, 'spinner', true), 'weaver', clothShort);
    go(
      count(w, 'orchard') < 2 + Math.floor(pop / 40) + Math.floor(count(w, 'tavern') / 2),
      'orchard',
      ciderShort,
    );
    go(
      count(w, 'orchard', true) > 0 && count(w, 'cider-press') < count(w, 'orchard', true),
      'cider-press',
      ciderShort,
    );
    go(count(w, 'herb-garden') < count(w, 'herbalist', true), 'herb-garden');
    // Skilled work, once there are Craftsfolk to do it.
    go(crafts >= 8 && count(w, 'dairy') === 0, 'dairy');
    go(crafts >= 8 && count(w, 'dairy', true) > 0 && count(w, 'cheesemaker') === 0, 'cheesemaker');
    go(crafts >= 8 && count(w, 'school') === 0, 'school');
    go(
      hasInnovation(w, 'carts') && count(w, 'cart-shed') === 0 && townStock(w)[G('tools')]! >= 2,
      'cart-shed',
    );
    go(crafts >= 12 && count(w, 'smithy') === 0, 'smithy');
    // A bigger town needs more hands moving goods, more timber and more bread.
    go(pop >= 50 && count(w, 'sawpit') < 3, 'sawpit');
    go(pop >= 50 && count(w, 'woodcutter') < 3, 'woodcutter');
    go(pop >= 50 && count(w, 'farmhouse') < 2, 'farmhouse');
  }

  /**
   * Food for the Charter's five days in stock and for a bigger town: more plots, huts and farms
   * while there are fewer than five days in hand, and a market stall per thirty residents so the
   * shopping trips are short.
   */
  private feed(): void {
    const w = this.w;
    const pop = w.residents.length;
    const foods = content.goods.flatMap((g, i) => (g.food ? [i] : []));
    const stock = townStock(w);
    const food = foods.reduce((n, g) => n + stock[g]!, 0);
    const made = foods.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    // C4X: a little over a day's eating made a day is enough (at 1.4 a Village of 200 kept a third
    // of its hands on plots and huts while the Craftsfolk chains stood empty).
    if (pop >= 30 && food < pop * 4 && made < pop * 1.15) {
      // C4X: plots and huts (wheat is not food; the farms come with the bread chain).
      const def = this.p.foodBuilding();
      this.want(def, 5, true);
    }
    if (pop >= 30 && count(w, 'market-stall') < 1 + Math.floor(pop / 40)) this.want('market-stall', 5);
  }

  /**
   * Logs go straight from the woodcutters to the sawpits, so none pile up to build another
   * woodcutter or a chopping shed. While logs are short and wanted, rest a sawpit; open it again
   * once there are logs in hand.
   */
  private timber(): void {
    const w = this.w;
    const pop = w.residents.length;
    const stock = townStock(w);
    const logs = stock[G('logs')]!;
    const planks = stock[G('planks')]!;
    const cutters = count(w, 'woodcutter');
    const wantLogs = cutters < 2 + Math.floor(pop / 50) || count(w, 'chopping-shed') < 1;
    const pits = w.buildings.filter((b) => b.def === 'sawpit' && b.stage === 'built');
    // Plenty of planks, or logs wanted for building: keep one sawpit going (none with 120 planks).
    // C4X: none while the next woodcutter waits for its twelve logs (one woodcutter's logs all went
    // to the sawpits, so a Village of 130 never built a second and ran out of planks for good).
    const keep = planks >= 120 || (wantLogs && logs < 16) ? 0 : pits.length;
    pits.forEach((b, i) => {
      const rest = i >= keep;
      if (b.rt!.paused !== rest)
        this.p.do(rest ? 'rest a sawpit' : 'reopen a sawpit', [
          { t: 'build.setPaused', id: b.id, paused: rest },
        ]);
    });
    // An outpost only when there was no spot for it (C4X: not when it was refused for want of
    // hands, which built a storehouse toward the forest every turn: eighteen of them by day 70).
    if (
      cutters < 2 + Math.floor(pop / 50) &&
      !this.want('woodcutter', 6, materialsPressing(w, 'woodcutter')) &&
      this.p.blocked('woodcutter')
    )
      this.outpost('woodcutter');
    // Replant around a woodcutter running short of grown trees, so its patch comes back (a valley
    // with no logs cannot build another one: it would be stuck for good).
    for (const b of w.buildings) {
      if (b.def !== 'woodcutter' || b.stage !== 'built' || treesNear(w, b.x, b.z, 8) >= 16) continue;
      let planted = 0;
      for (let k = 0; k < 120 && planted < 6; k++) {
        const x = b.x - 8 + ((k * 7 + b.id) % 18);
        const z = b.z - 8 + ((k * 11 + b.id * 3) % 18);
        if (x < 1 || z < 1 || x > 190 || z > 190) continue;
        const i = z * 192 + x;
        if (w.map.tree[i] || w.map.road[i] || w.map.occupant[i] || w.map.water[i] || w.map.fieldOwner[i])
          continue;
        if (this.p.do('plant a sapling for the woodcutter', [{ t: 'tree.plant', species: 'oak', x, z }]))
          planted++;
      }
    }
    // C4X: the chopping sheds rest once there is firewood for days (one turned every log into 280
    // firewood while the sawpits stood idle), and reopen when it runs low.
    const firewood = stock[G('firewood')]!;
    const homes = w.households.length;
    for (const b of w.buildings) {
      if (b.def !== 'chopping-shed' || b.stage !== 'built' || !b.rt) continue;
      // C5A: from autumn the woodpile has a winter to see through (pantries hold four days each).
      const winter = calendar(w.tick).season >= 2 ? 2 : 1;
      const rest = b.rt.paused
        ? firewood >= homes * 2 * winter
        : firewood >= Math.max(40, homes * 5 * winter);
      if (b.rt.paused !== rest)
        this.p.do(rest ? 'rest the chopping shed' : 'reopen the chopping shed', [
          { t: 'build.setPaused', id: b.id, paused: rest },
        ]);
    }
    // C4X: a forester per sixty residents while logs run short (five stood by 400 logs).
    if (logs < 100 && count(w, 'foresters-lodge') < 1 + Math.floor(pop / 60)) this.want('foresters-lodge', 6);
    if (
      stock[G('stone')]! < 60 &&
      count(w, 'quarry') < 1 + Math.floor(pop / 40) &&
      !this.want('quarry', 6, materialsPressing(w, 'quarry')) &&
      this.p.blocked('quarry')
    )
      this.outpost('quarry');
    if (planks < 60 && pits.length < 2 + Math.floor(pop / 60))
      this.want('sawpit', 6, materialsPressing(w, 'sawpit'));
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
      return def !== 'woodcutter' || treesNear(w, x, z, 8) >= 30;
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
  // The Village chains, services and tiers, once the content has them (I2) and the run plays them.
  plays: (opts) => !!opts.village && content.buildingById.has('tavern'),
  create: (p) => {
    // C4C: the Village run keeps six days of food from the peddler, for the Charter.
    p.foodReserveDays = 6;
    return new Village(p);
  },
};
