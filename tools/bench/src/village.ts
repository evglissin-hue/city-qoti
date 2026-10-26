// The autoplayer's Village half (C4C): claims the Charter when it is ready, then plays the I2
// chains, services and homes toward Craftsfolk: a tavern and a herbalist near the homes, firewood,
// cloth, bricks (once the kiln is invented), cider and cheese, a school, carts, more storehouses,
// and flowers by the doors so the streets reach the Craftsfolk's charm. A clay pit goes in while
// still a Hamlet so the Brick Kiln is ready when the Village is.
//
// STAND-IN (until C4A merges): Craftsfolk need savings, and savings come from C4A's wages. While a
// valley at Village rank books no wages, the harness pays each household a basic wage per working
// member at the 15:00 turn, from outside the valley (pay('outside', ...), so the money invariant
// holds). Once C4A's wages run it stops by itself. Purchases need no stand-in: the tiers system
// reads shelves when C4A's basket satisfaction is absent.
import { content } from '@qoti/content';
import {
  LEDGER_CATEGORIES,
  PENNIES_PER_COIN,
  TILE_FP,
  WAGES,
  canPlaceBuilding,
  canPlaceDecor,
  doorTile,
  hasInnovation,
  pay,
  rankAtLeast,
  townStock,
  worldIndex,
  type Building,
  type Command,
  type Rot4,
  type WorldState,
} from '@qoti/sim';
import { serviceCoverage } from '../../../packages/sim/src/systems/services/coverage';

const G = (id: string) => content.goodIndex.get(id)!;
const WAGES_INDEX = LEDGER_CATEGORIES.findIndex((c) => c.id === 'wages');

export interface VillageHost {
  readonly w: WorldState;
  do(label: string, cmds: Command[]): boolean;
  build(def: string): Building | null;
  connect(b: Building): void;
}

function count(w: WorldState, def: string, built = false): number {
  return w.buildings.filter((b) => b.def === def && (!built || b.stage === 'built')).length;
}

function sites(w: WorldState): number {
  return w.buildings.filter((b) => b.stage === 'construction').length;
}

/** Timber and food buildings may dip into the reserve. */
function essential(def: string): boolean {
  return ['woodcutter', 'sawpit', 'vegetable-plot', 'fishers-hut', 'farmhouse', 'market-stall'].includes(def);
}

export function craftsfolk(w: WorldState): number {
  return w.residents.filter((r) => r.tier === 'craftsfolk').length;
}

export class VillagePlayer {
  /** True once the stand-in has paid anything (reported in the tune output). */
  standInWages = false;
  constructor(readonly p: VillageHost) {}

  get w(): WorldState {
    return this.p.w;
  }

  private coins(): number {
    return this.w.economy.treasury / PENNIES_PER_COIN;
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
      else if (day - seen[1] >= 3) this.p.do(`cancel a stuck ${b.def}`, [{ t: 'build.remove', ids: [b.id] }]);
    }
  }

  /** One turn; `afternoon` is the 15:00 visit (wages stand-in, decorating). */
  turn(afternoon: boolean): void {
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
    if (afternoon) this.standIn();
    if (w.loans.loans.length === 0)
      this.p.do('borrow from the County Bank', [{ t: 'loan.take', coins: 600 }]);
    // More porters before anything else: a storehouse per 25 residents, raised to the front.
    if (count(w, 'storehouse') < 1 + Math.floor(w.residents.length / 25) && this.want('storehouse', 8)) {
      const site = w.buildings[w.buildings.length - 1]!;
      this.p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
    }
    this.timber();
    this.buildVillage();
    if (afternoon) this.dress();
  }

  /** Builds `def` when the coins and free materials allow and fewer than `maxSites` sites wait. */
  private want(def: string, maxSites = 3): boolean {
    const w = this.w;
    if (sites(w) >= maxSites) return false;
    const d = content.buildingById.get(def)!;
    if (this.coins() < (d.cost?.coins ?? 0) + 30) return false;
    const free = townStock(w);
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
      const u = b.rt?.upgrade;
      if (u) for (let g = 0; g < free.length; g++) free[g]! -= u[g] ?? 0;
    }
    // Keep a reserve of timber so the woodcutters and sawpits can always be rebuilt: a village that
    // spends its last logs on a tavern has no way back.
    const reserve = (g: string) => (g === 'logs' ? 16 : g === 'planks' ? 24 : 0);
    for (const [g, q] of d.cost?.goods ?? [])
      if (free[G(g)]! < q + (essential(def) ? 0 : reserve(g))) return false;
    return !!this.p.build(def);
  }

  private buildVillage(): void {
    const w = this.w;
    const pop = w.residents.length;
    const crafts = craftsfolk(w);
    let budget = 2;
    const go = (cond: boolean, def: string) => {
      if (budget > 0 && cond && this.want(def)) budget--;
    };
    // Bread: the mill and the bakery (Craftsfolk eat it every day).
    go(count(w, 'farmhouse', true) > 0 && count(w, 'windmill') === 0, 'windmill');
    go(count(w, 'windmill', true) > 0 && count(w, 'bakery') < 1 + Math.floor(pop / 50), 'bakery');
    // Bricks first (taverns and townhouses are made of them): a clay pit (two days of digging
    // invent the kiln), firewood for the kiln, then the kiln.
    go(count(w, 'clay-pit') === 0, 'clay-pit');
    go(count(w, 'chopping-shed') < 1 + Math.floor(crafts / 24), 'chopping-shed');
    go(hasInnovation(w, 'brick-kiln') && count(w, 'brick-kiln') < 1 + Math.floor(crafts / 16), 'brick-kiln');
    go(hasInnovation(w, 'brick-kiln') && count(w, 'clay-pit') < count(w, 'brick-kiln', true), 'clay-pit');
    // Services: Craftsfolk want a tavern and a herbalist in reach.
    if (budget > 0 && this.serve('tavern', 'social')) budget--;
    if (budget > 0 && this.serve('herbalist', 'health')) budget--;
    go(count(w, 'herb-garden') < count(w, 'herbalist', true), 'herb-garden');
    // Cloth and treats for the basket.
    go(count(w, 'sheep-pasture') < 1 + Math.floor(crafts / 30), 'sheep-pasture');
    go(count(w, 'spinner') < count(w, 'sheep-pasture', true), 'spinner');
    go(count(w, 'weaver') < Math.min(count(w, 'spinner', true), 1 + Math.floor(crafts / 30)), 'weaver');
    go(count(w, 'orchard') < 2 + Math.floor(crafts / 24), 'orchard');
    // Skilled work, once there are Craftsfolk to do it.
    go(count(w, 'orchard', true) > 0 && count(w, 'cider-press') < count(w, 'orchard', true), 'cider-press');
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
    if (pop >= 30 && food < pop * 5 && made < pop * 1.4) {
      const def =
        count(w, 'farmhouse') < Math.floor(pop / 30)
          ? 'farmhouse'
          : count(w, 'fishers-hut') <= count(w, 'vegetable-plot') / 2
            ? 'fishers-hut'
            : 'vegetable-plot';
      this.want(def, 5);
    }
    if (pop >= 30 && count(w, 'market-stall') < 1 + Math.floor(pop / 30)) this.want('market-stall', 5);
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
    const wantLogs = cutters < 2 + Math.floor(pop / 30) || count(w, 'chopping-shed') < 1;
    const pits = w.buildings.filter((b) => b.def === 'sawpit' && b.stage === 'built');
    // Plenty of planks, or logs wanted for building: keep one sawpit going (none with 120 planks).
    const keep = planks >= 120 ? 0 : wantLogs && logs < 12 && cutters < 2 ? 1 : pits.length;
    pits.forEach((b, i) => {
      const rest = i >= keep;
      if (b.rt!.paused !== rest)
        this.p.do(rest ? 'rest a sawpit' : 'reopen a sawpit', [
          { t: 'build.setPaused', id: b.id, paused: rest },
        ]);
    });
    if (cutters < 2 + Math.floor(pop / 30)) this.want('woodcutter', 6);
    if (stock[G('stone')]! < 60 && count(w, 'quarry') < 1 + Math.floor(pop / 40) && !this.want('quarry', 6))
      this.outpost('quarry');
    if (planks < 60 && pits.length < 2 + Math.floor(pop / 40)) this.want('sawpit', 6);
  }

  /**
   * A service where it is missed: next to the home of the first household (by id) that the tavern
   * or herbalist does not reach yet. At most one under way of each kind.
   */
  private serve(def: string, kind: 'social' | 'health'): boolean {
    const w = this.w;
    if (w.buildings.some((b) => b.def === def && b.stage === 'construction')) return false;
    if (count(w, def) >= 1 + Math.floor(w.residents.length / 40)) return false;
    const covered = serviceCoverage(w, kind).quality;
    const h = w.households.find((x) => x.homeId && !covered.has(x.id));
    if (!h) return false;
    const home = w.buildings.find((b) => b.id === h.homeId);
    if (!home) return false;
    const d = content.buildingById.get(def)!;
    if (this.coins() < (d.cost?.coins ?? 0) + 30) return false;
    const stock = townStock(w);
    for (const [g, q] of d.cost?.goods ?? []) if (stock[G(g)]! < q) return false;
    const reader = worldIndex(w).reader;
    for (let r = 2; r <= 7; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
            const x = home.x + dx;
            const z = home.z + dz;
            if (!canPlaceBuilding(reader, d, x, z, rot).ok) continue;
            if (w.map.water[doorTile({ def, x, z, rot } as Building, d)]) continue;
            if (!this.p.do(`build ${def} by the ${h.family}s`, [{ t: 'build.place', def, x, z, rot }]))
              return false;
            this.p.connect(w.buildings[w.buildings.length - 1]!);
            return true;
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
    const reader = worldIndex(w).reader;
    const d = content.buildingById.get(def)!;
    const home = w.buildings.find((b) => b.def === 'town-hall')!;
    for (let r = 4; r <= 80; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = home.x + dx;
          const z = home.z + dz;
          if (!canPlaceBuilding(reader, d, x, z, 0).ok) continue;
          const store = content.buildingById.get('storehouse')!;
          for (let k = 4; k <= 10; k++) {
            for (const [sx, sz] of [
              [x - k, z],
              [x + k, z],
              [x, z - k],
              [x, z + k],
            ] as const) {
              if (!canPlaceBuilding(reader, store, sx, sz, 0).ok) continue;
              if (
                !this.p.do(`storehouse by the ${def}`, [
                  { t: 'build.place', def: 'storehouse', x: sx, z: sz, rot: 0 },
                ])
              )
                return;
              this.p.connect(w.buildings[w.buildings.length - 1]!);
              return;
            }
          }
        }
      }
    }
  }

  /** STAND-IN for C4A's wages (see the file header). */
  private standIn(): void {
    const w = this.w;
    if ((w.economy.yesterday.money[WAGES_INDEX] ?? 0) > 0 || (w.economy.today.money[WAGES_INDEX] ?? 0) > 0)
      return;
    for (const h of w.households) {
      let workers = 0;
      for (const id of h.members) if (w.residents.find((r) => r.id === id)?.jobId) workers++;
      if (workers > 0) {
        pay(w, 'outside', { household: h.id }, workers * WAGES[0], null);
        this.standInWages = true;
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
      .slice(0, 3);
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
