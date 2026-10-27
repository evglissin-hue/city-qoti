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
  serviceCoverage,
  townStock,
  worldIndex,
  type Building,
  type Command,
  type Rot4,
  type WorldState,
} from '@qoti/sim';

const G = (id: string) => content.goodIndex.get(id)!;
/** Day the stand-in grants the Village rank if the Charter has not (the hamlet's tuned span). */
export const VILLAGE_DAY = 24;
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

export function craftsfolk(w: WorldState): number {
  return w.residents.filter((r) => r.tier === 'craftsfolk').length;
}

export class VillagePlayer {
  /** True once the stand-in has paid anything (reported in the tune output). */
  standInWages = false;
  /** True once the stand-in granted the Village rank (the Charter was not met by VILLAGE_DAY). */
  standInRank = false;
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
    // STAND-IN (until C4D and C4X chase the Charter): a valley still a Hamlet on VILLAGE_DAY is
    // granted the rank, so the Village half always gets its evenings. Reported as standInRank.
    if (!rankAtLeast(w, 'village') && Math.floor(w.tick / 4800) >= VILLAGE_DAY && w.charter.charter) {
      w.charter.ready = true;
      this.standInRank = true;
    }
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
    // Homes before anything else: a Village grows by the families that move in.
    const vacant = w.buildings.filter(
      (b) =>
        content.buildingById.get(b.def)?.housing &&
        (b.stage === 'construction' || !w.households.some((h) => h.homeId === b.id)),
    ).length;
    if (vacant < 2) this.want('cottage', 6);
    // Builders: a yard per thirty residents, or the sites queue up behind two town hall builders.
    if (count(w, 'builders-yard') < Math.floor(w.residents.length / 30)) this.want('builders-yard', 8);
    // More porters next: a storehouse per 25 residents, raised to the front.
    if (count(w, 'storehouse') < 1 + Math.floor(w.residents.length / 25) && this.want('storehouse', 8)) {
      const site = w.buildings[w.buildings.length - 1]!;
      this.p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
    }
    this.timber();
    this.buildVillage();
    if (afternoon) this.dress();
  }

  /** Builds `def` when the coins and free materials allow and fewer than `maxSites` sites wait. */
  private want(def: string, maxSites = 5): boolean {
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
    go(count(w, 'farmhouse', true) > 0 && count(w, 'windmill') < 1 + Math.floor(pop / 60), 'windmill');
    go(count(w, 'windmill', true) > 0 && count(w, 'bakery') < 1 + Math.floor(pop / 50), 'bakery');
    // Bricks first (taverns and townhouses are made of them): a clay pit (two days of digging
    // invent the kiln), firewood for the kiln, then the kiln.
    if (budget > 0 && count(w, 'clay-pit') === 0 && !this.want('clay-pit')) this.outpost('clay-pit');
    go(count(w, 'chopping-shed') < 1 + Math.floor(crafts / 24), 'chopping-shed');
    go(hasInnovation(w, 'brick-kiln') && count(w, 'brick-kiln') < 1 + Math.floor(crafts / 16), 'brick-kiln');
    go(hasInnovation(w, 'brick-kiln') && count(w, 'clay-pit') < count(w, 'brick-kiln', true), 'clay-pit');
    // Services: Craftsfolk want a tavern and a herbalist in reach.
    if (budget > 0 && this.serve('tavern', 'social')) budget--;
    if (budget > 0 && this.serve('herbalist', 'health')) budget--;
    go(count(w, 'herb-garden') < count(w, 'herbalist', true), 'herb-garden');
    // Treats: apples pressed into cider (the tavern pours some of it).
    go(count(w, 'orchard') < 2 + Math.floor(crafts / 24) + Math.floor(count(w, 'tavern') / 2), 'orchard');
    go(count(w, 'orchard', true) > 0 && count(w, 'cider-press') < count(w, 'orchard', true), 'cider-press');
    // Cloth for the basket.
    go(count(w, 'sheep-pasture') < 1 + Math.floor(crafts / 30), 'sheep-pasture');
    go(count(w, 'spinner') < count(w, 'sheep-pasture', true), 'spinner');
    go(count(w, 'weaver') < Math.min(count(w, 'spinner', true), 1 + Math.floor(crafts / 30)), 'weaver');
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
    if (cutters < 2 + Math.floor(pop / 30) && !this.want('woodcutter', 6)) this.outpost('woodcutter');
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
    if (count(w, 'foresters-lodge') < 1 + Math.floor(pop / 40)) this.want('foresters-lodge', 6);
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
    const d = content.buildingById.get(def)!;
    if (this.coins() < (d.cost?.coins ?? 0) + 30) return false;
    const stock = townStock(w);
    for (const [g, q] of d.cost?.goods ?? []) if (stock[G(g)]! < q) return false;
    const reader = worldIndex(w).reader;
    let tried = 0;
    for (const h of w.households) {
      if (!h.homeId || covered.has(h.id) || tried++ >= 12) continue;
      const home = w.buildings.find((b) => b.id === h.homeId);
      if (!home) continue;
      for (let r = 2; r <= 8; r++) {
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
                  if (
                    this.p.do(`storehouse toward the ${def}`, [
                      { t: 'build.place', def: 'storehouse', x: sx, z: sz, rot: 0 },
                    ])
                  )
                    this.p.connect(w.buildings[w.buildings.length - 1]!);
                  return;
                }
              }
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
      .slice(0, 5);
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
