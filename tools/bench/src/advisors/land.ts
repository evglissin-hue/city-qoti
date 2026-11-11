// The land advisor (R1F): the Ledger's ground, the way a sensible player plays the zones-first
// Ledger (docs/spec/13-ledger.md, Land and specialized buildings; Zoning and growth). It lays the
// first street on founding day and another ahead of growth, paints the zone whose demand bar is lit
// along open frontage, and sites the specialized buildings: a Forester's Lodge by the woods, a quarry
// on stone, a fishery on the river (with a storehouse out toward it when every spot lies beyond the
// porters), a windmill on open high ground once Farmland grows grain, a granary and storehouses as
// the town grows, and at Village rank the Trading Post and the Market Square, the Sawmill and the
// Brickworks when their innovations open, the Cart Shed with Carts. Everything else grows by itself
// on the zoned land: the advisor builds no business and places no decor (the Hearth dresses the
// streets). It replaces the street advisor and the specialized wants the hamlet and village
// advisors made in R1.0.
import { content } from '@qoti/content';
import {
  BuildingStatus,
  calendar,
  canPlaceBuilding,
  doorTile,
  familyIndex,
  hasInnovation,
  isFrozen,
  meetsRequires,
  rankAtLeast,
  TICKS_PER_DAY,
  townStock,
  worldIndex,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { LODGE_TREES, matureTreesNear } from '../hamlet';
import { materialsPressing } from '../labor';
import { costOf, MONEY_RESERVE, URGENT, VILLAGE_MARGIN, type Budget, type Planner } from '../planner';
import { count, countTrade, FOODS, G, S } from '../town';
import {
  BAR_ZONES,
  frontageFor,
  planHighStreet,
  promoteToVillage,
  storehouseSpot,
  unreachedLots,
  zoneHighStreet,
  zoneStreetFor,
} from '../village';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Streets the Ledger lays at most, the high street included. */
const MAX_STREETS = 6;
/** Coins in hand before another street: its 22 tiles of lane and the planner's reserve. */
const STREET_COINS = 22 * (content.roadById.get('lane')?.cost?.coins ?? 2) + MONEY_RESERVE;
/** The Hamlet's build queue for specialized buildings (I1's three). */
const QUEUE = 3;
/** Food in store a resident before a granary goes up. */
const GRANARY_FOOD_DAYS = 4;
/** Residents a granary or two storehouses serve (13-ledger.md: one granary and one storehouse to every 150, tune). */
const GRANARY_RESIDENTS = 150;
/** Levels above the ground around it at which a windmill serves four bakers, not two (`raisedCapacity`). */
const HIGH_GROUND = content.buildingById.get('windmill')?.raisedCapacity?.[0] ?? 4;

/** Buildings tied to a resource on the ground, looked for further out than the rest. */
const GROUND = new Set(['foresters-lodge', 'quarry', 'fishery', 'brickworks', 'sawmill']);

const day = (w: WorldState) => Math.floor(w.tick / TICKS_PER_DAY) + 1;

/** Whether a def exists and the valley may place it now (its rank and innovation). */
function open(w: WorldState, def: string): boolean {
  const d = content.buildingById.get(def);
  return !!d && meetsRequires(w, d.requires, d.id);
}

/** Average height of a footprint less the average of the ring two tiles round it. */
function raisedBy(w: WorldState, x: number, z: number, wd: number, dp: number): number {
  let inner = 0;
  let n = 0;
  for (let tz = z; tz < z + dp; tz++)
    for (let tx = x; tx < x + wd; tx++) {
      inner += w.map.height[tz * S + tx]!;
      n++;
    }
  let outer = 0;
  let m = 0;
  for (let tz = z - 3; tz < z + dp + 3; tz++)
    for (let tx = x - 3; tx < x + wd + 3; tx++) {
      if (tx >= x && tx < x + wd && tz >= z && tz < z + dp) continue;
      if (tx < 0 || tz < 0 || tx >= S || tz >= S) continue;
      outer += w.map.height[tz * S + tx]!;
      m++;
    }
  return n && m ? inner / n - outer / m : 0;
}

class Land implements Advisor {
  /** Streets laid and zoned so far (the high street first). */
  private streets = 0;
  /** The Village's street (shops and townhouses) is laid. */
  private villageStreet = false;
  /** Day each zone was last painted for its bar: its lots are cut within the hour, and the bar is read again at 01:00. */
  private readonly painted = new Map<string, number>();

  constructor(readonly p: Planner) {}

  get w(): WorldState {
    return this.p.w;
  }

  // --- Streets and zones -----------------------------------------------------------------------

  /** Lays a street off the lanes and zones it (the first becomes the high street). */
  private lay(label: string, zones?: readonly string[]): boolean {
    const p = this.p;
    const village = rankAtLeast(p.w, 'village');
    const street = planHighStreet(p.w);
    if (!street) {
      p.actions.push(`no room for ${label}`);
      return false;
    }
    if (!p.do(`lay ${label}`, [{ t: 'road.paint', kind: 'lane', tiles: street.tiles }])) return false;
    p.street ??= street;
    this.streets++;
    if (village && !zones) this.villageStreet = true;
    p.do(`zone ${label}`, zones ? zoneStreetFor(p.w, street, zones) : zoneHighStreet(p.w, street, village));
    for (const z of zones ?? []) this.painted.set(z, day(p.w));
    return true;
  }

  /** The Village chapter: another street, with shops and townhouses now they are open. */
  rankUp(): void {
    promoteToVillage(this.p.w);
    if (this.streets < MAX_STREETS) this.lay('the village street');
  }

  /**
   * A lit demand bar asks for land: paint its zone along open frontage by a lane or street, or lay
   * a new street for the bars no frontage can answer. Each zone at most once in two days, since its
   * lots are cut within the hour but the bar is only read again at 01:00.
   */
  private answerBars(): void {
    const p = this.p;
    const w = this.w;
    const today = day(w);
    const want: string[] = [];
    BAR_ZONES.forEach((zone, i) => {
      if (!w.demand.lit[i]) return;
      const def = content.zoneById.get(zone);
      if (!def || !meetsRequires(w, def.requires)) return;
      if ((this.painted.get(zone) ?? -9) >= today - 1) return;
      want.push(zone);
    });
    const left: string[] = [];
    for (const zone of want) {
      const tiles = frontageFor(w, zone);
      if (tiles && p.do(`zone ${zone} for its bar`, [{ t: 'zone.paint', zone, tiles }]))
        this.painted.set(zone, today);
      else left.push(zone);
    }
    if (left.length > 0 && this.streets < MAX_STREETS && p.coins() >= STREET_COINS) this.lay('another street', left);
  }

  /** A storehouse toward lots no porter reaches, raised to the front (one site at a time). */
  private reachLots(): void {
    const p = this.p;
    const w = this.w;
    if (!p.street || unreachedLots(w) < 2) return;
    if (w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction')) return;
    const def = content.buildingById.get('storehouse')!;
    if (p.coins() < (def.cost?.coins ?? 0) + MONEY_RESERVE) return;
    const stock = townStock(w);
    for (const [g, q] of def.cost?.goods ?? []) if (stock[G(g)]! < q) return;
    const at = storehouseSpot(w, p.street);
    const site = at && p.buildAt('storehouse for the far lots', 'storehouse', at[0], at[1], at[2]);
    if (site) p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
  }

  // --- Specialized buildings --------------------------------------------------------------------

  /**
   * Proposes a specialized building. A Hamlet's wants join a queue of three and count against the
   * turn's two starts (`budget`); a Village's are priced with the Village margin and join a queue
   * of five, as the R1.0 hamlet and village advisors did.
   */
  private want(
    def: string,
    o: {
      urgent?: boolean;
      pressing?: boolean;
      priority?: number;
      budget?: Budget;
      tally?: number[];
      only?: (x: number, z: number, wd: number, dp: number) => boolean;
    } = {},
  ): Building | null {
    if (!open(this.w, def)) return null;
    const village = rankAtLeast(this.w, 'village');
    return this.p.propose({
      def,
      priority: o.urgent ? URGENT : (o.priority ?? (village ? 5 : QUEUE)),
      cost: costOf(def, village ? VILLAGE_MARGIN : 0),
      pressing: !!o.pressing || materialsPressing(this.w, def),
      essential: ['foresters-lodge', 'quarry', 'fishery', 'storehouse'].includes(def),
      tally: o.tally,
      budget: o.budget,
      only: o.only,
      // Ground buildings go where their ground is: a valley's stone or river may lie far out.
      radius: GROUND.has(def) ? 60 : undefined,
    });
  }

  private sites(): void {
    const p = this.p;
    const w = this.w;
    const stock = townStock(w);
    const pop = w.residents.length;
    const village = rankAtLeast(w, 'village');
    const stored = FOODS.reduce((n, g) => n + stock[g]!, 0);
    const pantries = w.households.reduce((n, h) => n + FOODS.reduce((m, g) => m + (h.pantry[g] ?? 0), 0), 0);
    const made = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    // Materials already promised to sites are not free.
    const free = [...stock];
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
    }
    const budget: Budget = { left: 2 };
    const turn = { budget, tally: free };

    // Timber first: a lodge needs only timber and stone, and everything else needs timber.
    this.lodges(pop, turn);
    // Stone next, urgent while the town has almost none (homes and lodges wait on it).
    if (count(w, 'quarry') === 0 && stock[G('stone')]! < 16) this.withOutpost('quarry', { urgent: true, ...turn });
    else if (stock[G('stone')]! < 60 && count(w, 'quarry') < 1 + Math.floor(pop / 40))
      this.withOutpost('quarry', turn);

    // Food: the fishery is the one hand-placed food building; the rest grows on Farmland.
    this.fisheries(pop, stored + pantries, stored, made, turn);

    // The windmill once Farmland grows grain, on open high ground where it can serve four bakers.
    if (countTrade(w, 'grain-farm') > 0 && count(w, 'windmill') === 0)
      this.want('windmill', { ...turn, only: (x, z, wd, dp) => raisedBy(w, x, z, wd, dp) >= HIGH_GROUND }) ??
        this.want('windmill', turn);
    // A granary once Food stocks grow, one to every 150 residents.
    if (
      pop >= 15 &&
      stored >= pop * GRANARY_FOOD_DAYS &&
      count(w, 'granary') < 1 + Math.floor(pop / GRANARY_RESIDENTS)
    )
      this.want('granary', turn);
    this.storehouses(pop);
    this.materialsRule();
    if (!village) return;

    // The Village's buildings, three starts a turn.
    const vb: Budget = { left: 3 };
    if (count(w, 'trading-post') === 0 && p.coins() > 150) this.want('trading-post', { budget: vb });
    if (count(w, 'market-square') === 0 && pop >= 40) this.want('market-square', { budget: vb });
    if (hasInnovation(w, 'water-wheel') && count(w, 'sawmill') === 0) this.want('sawmill', { budget: vb });
    if (hasInnovation(w, 'brick-kiln') && count(w, 'brickworks') < 1 + Math.floor(pop / 80))
      this.withOutpost('brickworks', { budget: vb, pressing: stock[G('brick')]! < 20 });
    if (hasInnovation(w, 'carts') && count(w, 'cart-shed') === 0) this.want('cart-shed', { budget: vb });
  }

  /**
   * The carrier's Materials rule: Essentials (the default) brings only what an open site waits for,
   * so a valley with no spot for a quarry (birch's deposits lie out of reach) or a lodge has no
   * stone or timber for the town's own growth to start a site with. Then the Ledger sets Materials
   * to Always, and back to Essentials once the valley makes both again: one lever, not a chore.
   */
  private materialsRule(): void {
    const w = this.w;
    const f = w.carrier.families[familyIndex('materials')];
    if (!f) return;
    const makes = (def: string) => count(w, def, true) > 0;
    const stock = townStock(w);
    const short =
      (!makes('quarry') && stock[G('stone')]! < 16 && this.p.blocked('quarry')) ||
      (!makes('foresters-lodge') && stock[G('timber')]! < 16 && this.p.blocked('foresters-lodge'));
    const rule = short ? 'always' : makes('quarry') && makes('foresters-lodge') ? 'essentials' : f.rule;
    if (rule !== f.rule)
      this.p.do(`Materials to ${rule}`, [{ t: 'carrier.setRule', family: 'materials', rule, sell: f.sell }]);
  }

  /** `def`, or a storehouse out toward a spot for it when none lies within the porters' reach. */
  private withOutpost(def: string, o: Parameters<Land['want']>[1] = {}): void {
    if (!this.want(def, o) && this.p.blocked(def)) this.outpost(def);
  }

  /**
   * Forester's Lodges: the first at once, a new one when the last working lodge's wood thins, and
   * more while timber runs short as the town grows (R1 stand-in (R1B): the lodge does not replant
   * its own wood yet, so a felled one is retired once another works).
   */
  private lodges(pop: number, turn: { budget: Budget; tally: number[] }): void {
    const w = this.w;
    const timberIn = (b: Building) => {
      const c = b.rt?.construction;
      return !c || (c.needs[G('timber')] ?? 0) === 0;
    };
    const felled = (b: Building) => b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) !== 0;
    const lodges = w.buildings.filter((b) => b.def === 'foresters-lodge');
    const healthy = lodges.filter((b) =>
      b.stage !== 'built' ? timberIn(b) : !felled(b) && matureTreesNear(w, b.x, b.z, 8) >= LODGE_TREES,
    ).length;
    const rising = lodges.some((b) => b.stage === 'construction');
    if (lodges.length === 0) this.want('foresters-lodge', turn);
    else if (lodges.some((b) => b.stage === 'built') && healthy === 0 && !rising)
      this.want('foresters-lodge', { urgent: true, ...turn });
    else if (
      pop >= 12 &&
      townStock(w)[G('timber')]! < (rankAtLeast(w, 'village') ? 100 : 40) &&
      lodges.length < 1 + Math.floor(pop / 30)
    )
      this.withOutpost('foresters-lodge', turn);
    if (lodges.some((b) => b.stage === 'built' && !felled(b)))
      for (const b of lodges.filter(felled)) this.p.do('retire a felled lodge', [{ t: 'build.remove', ids: [b.id] }]);
    // The next lodge's site is raised, so the porters bring it its timber first.
    for (const b of lodges)
      if (b.stage === 'construction' && !timberIn(b) && !b.rt?.construction?.priority)
        this.p.do('raise the lodge', [{ t: 'build.setPriority', id: b.id, priority: true }]);
  }

  /**
   * Fisheries: one jumps the queue when the town has under three days of food; then one to every
   * eight residents while a day's eating does not come in each day; before winter, while the
   * larder is short of the season plan's mark (`larderShort`, the plan advisor's). Never while
   * the river is frozen, and with a storehouse out by the river when every spot is out of reach.
   */
  private fisheries(pop: number, food: number, stored: number, made: number, turn: { budget: Budget; tally: number[] }): void {
    const p = this.p;
    const w = this.w;
    if (isFrozen(w)) return;
    const fisheries = count(w, 'fishery');
    const rising = w.buildings.some((b) => b.def === 'fishery' && b.stage === 'construction');
    const { season, day: d } = calendar(w.tick);
    const short = food < pop * 3;
    const larder = !rankAtLeast(w, 'village') && pop >= 25 && stored < pop * 6 && made < pop * 1.4;
    // The last two days of autumn are too late for a new fishery to pay for its timber.
    const beforeWinter = p.larderShort && !(season === 2 && d >= 5) && made < pop * 1.15;
    const want =
      (short && !rising) ||
      (made < pop + 4 && fisheries * 8 < pop + 6) ||
      larder ||
      (beforeWinter && fisheries < 1 + Math.floor(pop / 8));
    if (!want) return;
    if (!this.want('fishery', { urgent: short || larder, pressing: short || larder || beforeWinter, ...turn }))
      if (p.blocked('fishery')) this.outpost('fishery');
  }

  /**
   * Storehouses: two as soon as the town has twenty residents, then one per twenty (their porters
   * carry the town), and another raised to the front whenever three workplaces sit with their
   * output full.
   */
  private storehouses(pop: number): void {
    const w = this.w;
    const backed = w.buildings.filter((b) => (b.rt?.status ?? 0) & BuildingStatus.outputFull).length;
    const rising = w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction');
    const few = pop >= 20 && count(w, 'storehouse') < Math.max(2, 1 + Math.floor(pop / 20));
    if (!few && !(backed >= 3 && !rising)) return;
    const site = this.want('storehouse', { urgent: !rankAtLeast(w, 'village'), pressing: backed >= 3 });
    if (site) this.p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
  }

  /**
   * No spot for `def` within the porters' reach: a storehouse between the nearest storehouse and a
   * spot that fits, so the next turn finds `def` a place (one outpost under way at a time).
   */
  private outpost(def: string): void {
    const w = this.w;
    if (w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction')) return;
    if (count(w, 'storehouse') >= 2 + Math.floor(w.residents.length / 20)) return;
    const reader = worldIndex(w).reader;
    const d = content.buildingById.get(def)!;
    const store = content.buildingById.get('storehouse')!;
    const doors = w.buildings.filter((b) => b.def === 'storehouse' && b.stage === 'built').map((b) => doorTile(b));
    const man = (a: number, b: number) =>
      Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));
    const fits = (x: number, z: number) => {
      for (let rot = 0; rot < 4; rot++) {
        const r = rot as 0 | 1 | 2 | 3;
        if (!canPlaceBuilding(reader, d, x, z, r).ok) continue;
        if (w.map.water[doorTile({ def, x, z, rot: r } as Building, d)]) continue;
        if (def === 'foresters-lodge' && matureTreesNear(w, x, z, 8) < LODGE_TREES) continue;
        return true;
      }
      return false;
    };
    for (const from of doors) {
      const fx = from % S;
      const fz = Math.floor(from / S);
      for (let r = 12; r <= 44; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = fx + dx;
            const z = fz + dz;
            if (x < 2 || z < 2 || x > S - 4 || z > S - 4 || !fits(x, z)) continue;
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
                  if (man(door, from) > 22 || man(door, z * S + x) > 20) continue;
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

  visit(v: Visit): void {
    const p = this.p;
    const w = this.w;
    // Founding day: the first street, laid and zoned with Homes, Workshops and Farmland (a street
    // refused, for want of coins or room, is tried each morning).
    if (!p.street) {
      if (!v.afternoon && w.settings.mode === 'standard') this.lay('the high street');
    } else if (!v.afternoon) {
      // A Village whose rank-up morning found no room for its street tries again.
      if (rankAtLeast(w, 'village') && !this.villageStreet && this.streets < MAX_STREETS)
        this.lay('the village street');
      this.answerBars();
    }
    this.reachLots();
    this.sites();
  }
}

export const land: AdvisorDef = {
  id: 'land',
  lane: 'ledger',
  // Where the street advisor was: after the Village's services (10), before the charter (30).
  slot: 20,
  plays: () => true,
  create: (p) => new Land(p),
};
