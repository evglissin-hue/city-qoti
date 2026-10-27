// A headless pair of players for tuning (C3X): from the standard start, a Ledger player builds
// what the town is short of (homes, food, timber, stone, wells, a stall, a builder's yard, the
// bread chain) and connects everything with paths, and a Hearth player answers wishes and dresses
// the lanes with benches, flowers, trees and lanterns. It plays once a day at 09:00 and 15:00,
// like two people dropping in, and logs a line per day. Used by `npm run tune` and a test that
// holds the I1 acceptance targets (docs/spec/30-roadmap.md, I1).
import { content } from '@qoti/content';
import {
  BuildingStatus,
  calendar,
  canPaintRoad,
  canPlaceDecor,
  doorTile,
  findById,
  MAP_SIZE,
  moodBand,
  PENNIES_PER_COIN,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  townStock,
  worldIndex,
  type Building,
  type Command,
  type ValleySettings,
  type WorldState,
} from '@qoti/sim';
import { command, findSpot, runTicks, startingTown, type Hamlet } from './hamlet';
import { craftsfolk, VillagePlayer } from './village';

const FOODS = content.goods.flatMap((g, i) => (g.food ? [i] : []));
const G = (id: string) => content.goodIndex.get(id)!;

export interface DayLine {
  day: number;
  residents: number;
  households: number;
  vacantHomes: number;
  coins: number;
  food: number;
  foodMade: number;
  foodEaten: number;
  planks: number;
  stone: number;
  avgMood: number;
  miserable: number;
  wishes: number;
  wishesGranted: number;
  patterns: number;
  achievements: number;
  departures: number;
  leanTimes: boolean;
  built: number;
  sites: number;
  // I2 (C4C)
  rank: string;
  craftsfolk: number;
  innovations: number;
}

export interface AutoplayResult {
  hamlet: Hamlet;
  days: DayLine[];
  /** Everything the players tried and whether the sim took it, for reading a run. */
  actions: string[];
  /** C4C: the Village run paid stand-in wages (C4A's wages were not running). */
  standInWages: boolean;
  /** C4C: the Village run was granted the rank on VILLAGE_DAY (the Charter was not met). */
  standInRank: boolean;
}

const S = MAP_SIZE;
const idx = (x: number, z: number) => z * S + x;

function count(w: WorldState, def: string, built = false): number {
  return w.buildings.filter((b) => b.def === def && (!built || b.stage === 'built')).length;
}

function sites(w: WorldState): number {
  return w.buildings.filter((b) => b.stage === 'construction').length;
}

function vacantHomes(w: WorldState): number {
  const homes = w.buildings.filter((b) => content.buildingById.get(b.def)?.housing && b.stage === 'built');
  return homes.filter((b) => !w.households.some((h) => h.homeId === b.id)).length;
}

/** A short path from a building's door to the nearest road (breadth-first, at most 30 tiles). */
function pathToRoad(w: WorldState, from: number): [number, number][] | null {
  const reader = worldIndex(w).reader;
  if (w.map.road[from]) return [];
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let q = 0; q < queue.length && q < 4000; q++) {
    const i = queue[q]!;
    const x = i % S;
    const z = (i - x) / S;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= S - 1 || nz >= S - 1) continue;
      const n = idx(nx, nz);
      if (prev.has(n)) continue;
      if (Math.abs(w.map.height[n]! - w.map.height[i]!) >= 2) continue;
      prev.set(n, i);
      if (w.map.road[n]) {
        const out: [number, number][] = [];
        for (let k = i; k !== -1; k = prev.get(k)!) out.push([k % S, Math.floor(k / S)]);
        return out.length > 30 ? null : out.reverse();
      }
      if (!canPaintRoad(reader, 'path', [[nx, nz]]).ok || w.map.water[n]) continue;
      queue.push(n);
    }
  }
  return null;
}

class Players {
  readonly actions: string[] = [];
  /** Days of food kept back from the peddler (C4C: the Village run keeps six, for the Charter). */
  foodReserveDays = 2;
  constructor(readonly h: Hamlet) {}

  get w(): WorldState {
    return this.h.world;
  }

  do(label: string, cmds: Command[]): boolean {
    const ok = command(this.h, cmds).every(Boolean);
    this.actions.push(`${calendar(this.w.tick).day}:${label}${ok ? '' : ' (refused)'}`);
    return ok;
  }

  build(def: string): Building | null {
    const spot = findSpot(this.w, def);
    if (!spot) {
      this.actions.push(`no spot for ${def}`);
      return null;
    }
    if (!this.do(`build ${def}`, [{ t: 'build.place', def, x: spot[0], z: spot[1], rot: spot[2] }]))
      return null;
    const b = this.w.buildings[this.w.buildings.length - 1]!;
    this.connect(b);
    return b;
  }

  /** Paints a path from the door to the road network (the Ledger likes tidy frontage). */
  connect(b: Building): void {
    const path = pathToRoad(this.w, doorTile(b));
    if (path && path.length > 0)
      this.do(`path for ${b.def}`, [{ t: 'road.paint', kind: 'path', tiles: path }]);
  }

  private coins(): number {
    return this.w.economy.treasury / PENNIES_PER_COIN;
  }

  /** The Ledger player's turn: one or two things the town is shortest of. */
  ledger(): void {
    const w = this.w;
    const stock = townStock(w);
    const pop = w.residents.length;
    const food =
      FOODS.reduce((n, g) => n + stock[g]!, 0) +
      w.households.reduce((n, h) => n + FOODS.reduce((m, g) => m + (h.pantry[g] ?? 0), 0), 0);
    const foodMade = FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0);
    let budget = 2;
    // Materials already promised to sites don't count as available.
    const free = [...stock];
    for (const b of w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
    }
    const want = (cond: boolean, def: string, urgent = false) => {
      if (!cond || budget <= 0 || (sites(w) >= 3 && !urgent)) return;
      const d = content.buildingById.get(def)!;
      if (this.coins() < (d.cost?.coins ?? 0) + 20) return;
      for (const [g, q] of d.cost?.goods ?? []) if (free[G(g)]! < q) return;
      if (this.build(def)) {
        budget--;
        for (const [g, q] of d.cost?.goods ?? []) free[G(g)]! -= q;
      }
    };
    // Hungry towns come first: a food building jumps the queue when there are under three days left.
    const foodSites = w.buildings.filter(
      (b) => b.stage === 'construction' && (b.def === 'vegetable-plot' || b.def === 'fishers-hut'),
    ).length;
    want(
      food < pop * 3 && foodSites === 0,
      count(w, 'fishers-hut') <= count(w, 'vegetable-plot') / 2 ? 'fishers-hut' : 'vegetable-plot',
      true,
    );
    want(food < pop * 3 && foodSites === 0, 'vegetable-plot', true);
    // Timber next: woodcutter and sawpit need only logs and stone, and everything else needs planks.
    want(count(w, 'woodcutter') === 0, 'woodcutter');
    want(count(w, 'sawpit') === 0, 'sawpit');
    // Food first: a day's eating for everyone should come in each day, with a few days in hand.
    const foodPlaces = count(w, 'vegetable-plot') + count(w, 'fishers-hut') * 2 + count(w, 'farmhouse') * 3;
    want(
      foodMade < pop + 4 && foodPlaces * 3 < pop + 6,
      count(w, 'fishers-hut') <= count(w, 'vegetable-plot') / 2 ? 'fishers-hut' : 'vegetable-plot',
    );
    want(food < pop * 2 && sites(w) === 0, 'vegetable-plot');
    // Homes: always one empty cottage waiting for the next family.
    want(
      vacantHomes(w) + w.buildings.filter((b) => b.def === 'cottage' && b.stage === 'construction').length <
        2,
      'cottage',
    );
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
    want(felled.length > 0 && count(w, 'woodcutter') - felled.length < 2, 'woodcutter');
    // C4C: retire it only once a working one stands, or a valley with no logs left can never
    // build another (a Village run found that deadlock).
    const working = w.buildings.some(
      (b) => b.def === 'woodcutter' && b.stage === 'built' && (b.rt!.status & BuildingStatus.noTrees) === 0,
    );
    if (working) for (const b of felled) this.do('retire a woodcutter', [{ t: 'build.remove', ids: [b.id] }]);
    want(stock[G('stone')]! < 16 && count(w, 'quarry') === 0, 'quarry');
    want(
      count(w, 'foresters-lodge') === 0 && count(w, 'woodcutter', true) > 0 && pop >= 12,
      'foresters-lodge',
    );
    want(pop >= 10 && count(w, 'market-stall') === 0, 'market-stall');
    want(pop >= 14 && count(w, 'builders-yard') === 0, 'builders-yard');
    want(pop >= 22 && count(w, 'farmhouse') === 0, 'farmhouse');
    want(count(w, 'farmhouse', true) > 0 && count(w, 'windmill') === 0, 'windmill');
    want(count(w, 'windmill', true) > 0 && count(w, 'bakery') === 0, 'bakery');
    // C4C: urgent, or porters busy with food and inputs leave the sites waiting, and the sites
    // waiting keep the second storehouse from being started (a Village run deadlocked there).
    want(pop >= 20 && count(w, 'storehouse') < 2, 'storehouse', true);
    want(pop >= 20 && count(w, 'well') < 2, 'well');
    // The peddler takes surplus at 10:00: food beyond five days of eating, logs beyond 60.
    for (const g of content.goods) {
      const i = G(g.id);
      const surplus = g.food
        ? stock[i]! > pop * this.foodReserveDays + 8
        : g.id === 'logs'
          ? stock[i]! > 40
          : g.id === 'stone'
            ? stock[i]! > 50
            : false;
      if (surplus !== w.economy.forSale[i]) {
        this.do(`${surplus ? 'sell' : 'keep'} ${g.id}`, [
          { t: 'ledger.setForSale', good: g.id, forSale: surplus },
        ]);
      }
    }
    // Fields for a finished farmhouse.
    for (const farm of w.buildings.filter((b) => b.def === 'farmhouse' && b.stage === 'built')) {
      let owned = 0;
      for (let i = 0; i < w.map.fieldOwner.length; i++) if (w.map.fieldOwner[i] === farm.id) owned++;
      if (owned >= 12) continue;
      const tiles: [number, number][] = [];
      for (let dz = -6; dz <= 7 && tiles.length < 12 - owned; dz++) {
        for (let dx = -6; dx <= 7 && tiles.length < 12 - owned; dx++) {
          const x = farm.x + dx;
          const z = farm.z + dz;
          const i = idx(x, z);
          if (w.map.occupant[i] || w.map.road[i] || w.map.water[i] || w.map.fieldOwner[i]) continue;
          if (w.map.fertility[i]! < 40 || w.map.tree[i]) continue;
          tiles.push([x, z]);
        }
      }
      if (tiles.length) this.do(`fields x${tiles.length}`, [{ t: 'field.paint', farm: farm.id, tiles }]);
    }
  }

  /** A free spot for a decor piece within `r` tiles of a tile center, or null. */
  private decorSpot(
    def: string,
    x: number,
    z: number,
    r: number,
    near?: (fx: number, fz: number) => boolean,
  ): [number, number] | null {
    const d = content.decorById.get(def)!;
    const reader = worldIndex(this.w).reader;
    for (let k = 1; k <= r * 2; k++) {
      for (let a = 0; a < 8 * k; a++) {
        // A deterministic ring walk in half-tile steps.
        const t = a / (8 * k);
        const side = Math.floor(t * 4);
        const u = t * 4 - side;
        const half = k / 2;
        const ox = side === 0 ? -half + u * k : side === 1 ? half : side === 2 ? half - u * k : -half;
        const oz = side === 0 ? -half : side === 1 ? -half + u * k : side === 2 ? half : half - u * k;
        const fx = Math.round((x + 0.5 + ox) * TILE_FP);
        const fz = Math.round((z + 0.5 + oz) * TILE_FP);
        if (near && !near(fx, fz)) continue;
        if (canPlaceDecor(reader, d, fx, fz, (a * 7) % 64).ok) return [fx, fz];
      }
    }
    return null;
  }

  private place(def: string, at: [number, number] | null, why: string): boolean {
    if (!at) return false;
    return this.do(`${def} ${why}`, [
      { t: 'decor.place', def, fx: at[0], fz: at[1], rot: (at[0] * 31 + at[1]) % 64 },
    ]);
  }

  /** The Hearth player's turn: answer up to three wishes, then dress one lane. */
  hearth(): void {
    const w = this.w;
    let answered = 0;
    for (const wish of [...w.wishes]) {
      if (answered >= 3) break;
      const home = findById(w.buildings, wish.home);
      if (!home) continue;
      const door = doorTile(home);
      const hx = door % S;
      const hz = Math.floor(door / S);
      const nearWater = (fx: number, fz: number) => {
        const x = Math.floor(fx / TILE_FP);
        const z = Math.floor(fz / TILE_FP);
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) if (w.map.water[idx(x + dx, z + dz)]) return true;
        return false;
      };
      let ok = false;
      switch (wish.template) {
        case 'somewhere-to-sit':
          ok = this.place('bench', this.decorSpot('bench', hx, hz, 2), 'for a wish');
          break;
        case 'tree-by-my-window':
          ok = this.place('cherry-tree', this.decorSpot('cherry-tree', hx, hz, 2), 'for a wish');
          break;
        case 'flowers-on-the-lane':
          for (let k = 0; k < 3; k++)
            ok = this.place('flower-bed', this.decorSpot('flower-bed', hx, hz, 3), 'for a wish') || ok;
          break;
        case 'river-bench':
          ok = this.place('bench', this.decorSpot('bench', hx, hz, 8, nearWater), 'by the river');
          break;
        case 'a-garden-plot':
          ok = w.hearth.unlocked.includes('herb-planter')
            ? this.place('herb-planter', this.decorSpot('herb-planter', hx, hz, 2), 'for a wish')
            : false;
          break;
        case 'a-well-closer':
          // C4C: one well per ten residents is plenty (a Village run built forty).
          if (
            this.coins() > 60 &&
            townStock(w)[G('stone')]! >= 12 &&
            sites(w) < 3 &&
            count(w, 'well') <= w.residents.length / 10
          )
            ok = !!this.build('well');
          break;
        default:
          break;
      }
      if (ok) answered++;
    }
    // Then a lane: lanterns every few tiles along roads near homes, a bench and flowers by the
    // well, and the odd fruit tree, so charm grows and patterns can be found.
    const homes = w.buildings.filter((b) => b.def === 'cottage');
    const pick = homes[(calendar(w.tick).day + w.residents.length) % Math.max(1, homes.length)];
    if (pick) {
      const door = doorTile(pick);
      const [x, z] = [door % S, Math.floor(door / S)];
      this.place('lantern', this.decorSpot('lantern', x, z, 2), 'on the lane');
      this.place(
        w.decor.length % 2 ? 'flower-bed' : 'planter',
        this.decorSpot('planter', x, z, 2),
        'by a door',
      );
    }
    const well = w.buildings.find((b) => b.def === 'well' && b.stage === 'built');
    if (well && w.decor.filter((d) => d.def === 'bench').length < 3) {
      this.place('bench', this.decorSpot('bench', well.x, well.z, 2), 'by the well');
      this.place('apple-tree', this.decorSpot('apple-tree', well.x, well.z, 3), 'by the well');
    }
  }
}

function dayLine(w: WorldState, day: number): DayLine {
  const stock = townStock(w);
  const moods = w.residents.map((r) => r.mood);
  return {
    day,
    residents: w.residents.length,
    households: w.households.length,
    vacantHomes: vacantHomes(w),
    coins: Math.round(w.economy.treasury / PENNIES_PER_COIN),
    food: FOODS.reduce((n, g) => n + stock[g]!, 0),
    foodMade: FOODS.reduce((n, g) => n + (w.economy.yesterday.produced[g] ?? 0), 0),
    foodEaten: FOODS.reduce((n, g) => n + (w.economy.yesterday.consumed[g] ?? 0), 0),
    planks: stock[G('planks')]!,
    stone: stock[G('stone')]!,
    avgMood: moods.length ? Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) : 0,
    miserable: w.residents.filter((r) => moodBand(r.mood) <= 1).length,
    wishes: w.wishes.length,
    wishesGranted: w.stats.wishesGranted,
    patterns: w.hearth.discovered.length,
    achievements: w.achievements.length,
    departures: w.stats.departures,
    leanTimes: w.economy.leanTimes,
    built: w.buildings.filter((b) => b.stage === 'built').length,
    sites: sites(w),
    rank: w.charter.rank,
    craftsfolk: craftsfolk(w),
    innovations: w.innovations.filter((i) => i.unlockedTick >= 0).length,
  };
}

/** Ticks until the clock next shows `hour`:00. */
function untilHour(h: Hamlet, hour: number): void {
  const now = (h.world.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
  let n = (hour * TICKS_PER_HOUR - now + TICKS_PER_DAY) % TICKS_PER_DAY;
  if (n === 0) n = TICKS_PER_DAY;
  runTicks(h, n);
}

/** Plays `days` in-game days from the standard start and returns a line per day. */
export function autoplay(
  seed: string,
  days: number,
  opts: { economy?: ValleySettings['economy']; hearth?: boolean; village?: boolean } = {},
): AutoplayResult {
  const h = startingTown(seed, { economy: opts.economy ?? 'standard' });
  const players = new Players(h);
  // I2 (C4C): the Village run claims the Charter and plays the chains, services and tiers.
  const village = opts.village ? new VillagePlayer(players) : null;
  if (village) players.foodReserveDays = 6;
  const out: DayLine[] = [];
  for (let d = 1; d <= days; d++) {
    untilHour(h, 9);
    village?.turn(false);
    players.ledger();
    if (opts.hearth !== false) players.hearth();
    untilHour(h, 15);
    village?.turn(true);
    players.ledger();
    if (opts.hearth !== false) players.hearth();
    untilHour(h, 23);
    out.push(dayLine(h.world, d));
  }
  return {
    hamlet: h,
    days: out,
    actions: players.actions,
    standInWages: village?.standInWages ?? false,
    standInRank: village?.standInRank ?? false,
  };
}

/** The table `npm run tune` prints. */
export function formatDays(days: readonly DayLine[]): string {
  const head =
    'day  pop hh vac coins food made eaten plank stone mood mis wish grant pat ach left lean built sites rank    crafts inv';
  const rows = days.map((d) =>
    [
      String(d.day).padStart(3),
      String(d.residents).padStart(4),
      String(d.households).padStart(2),
      String(d.vacantHomes).padStart(3),
      String(d.coins).padStart(5),
      String(d.food).padStart(4),
      String(d.foodMade).padStart(4),
      String(d.foodEaten).padStart(5),
      String(d.planks).padStart(5),
      String(d.stone).padStart(5),
      String(d.avgMood).padStart(4),
      String(d.miserable).padStart(3),
      String(d.wishes).padStart(4),
      String(d.wishesGranted).padStart(5),
      String(d.patterns).padStart(3),
      String(d.achievements).padStart(3),
      String(d.departures).padStart(4),
      (d.leanTimes ? 'yes' : 'no').padStart(4),
      String(d.built).padStart(5),
      String(d.sites).padStart(5),
      d.rank.padEnd(7),
      String(d.craftsfolk).padStart(6),
      String(d.innovations).padStart(3),
    ].join(' '),
  );
  return [head, ...rows].join('\n');
}
