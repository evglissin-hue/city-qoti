// The autoplayer's planner (C5.0): one player with one build queue, one labor budget and one money
// reserve, fed by advisors (`advisors/`). An advisor reads the town and proposes wants, each with a
// priority and a cost; the planner judges every want against the shared budgets and places what it
// takes. I2 ran two players that each kept their own queue, staffing check and reserve, and
// overbuilt between them; the I3 advisors (seasons, festivals, nature, threats) plug in here
// instead of growing a third player.
//
// The rules the I1 and I2 players used are kept exactly (the tune output for willow and hazel is
// byte-identical before and after, see TUNE-RESTRUCTURE.md):
// - The build queue: a want joins it only while fewer sites than its priority are under way (an
//   urgent want joins any queue). Every placement, wanted or bespoke, goes through `build` or
//   `buildAt`, which remember a def that found no spot today.
// - The labor budget: a new workplace only while free hands exceed core jobs by the reserve
//   (`LABOR_RESERVE` in labor.ts), unless its want is pressing (see `canStaff`).
// - The money reserve: `MONEY_RESERVE` coins stay in the treasury after a want's cost, except for an
//   urgent essential want (C5A). The Village advisor prices its wants `VILLAGE_MARGIN` dearer (I2's
//   Village player kept 30 back).
// - Materials: a want needs its goods free of what sites have been promised. An advisor that tallies
//   its own turn passes the tally and the planner takes each start out of it; otherwise free stock
//   is read fresh (upgrades count as promised), and the timber kept for rebuilding a Forester's
//   Lodge (`TIMBER_RESERVE`) is off limits unless the want is essential.
// R1.0: the hand-placed chains are gone. Food comes from fisheries and from Farmland businesses,
// materials from Forester's Lodges and quarries; Homes, Workshops and Farmland are zoned from the
// first day (the street advisor) and grow by themselves.
// - Credit: past half the County Bank's line only pressing or essential wants are started.
import { content } from '@qoti/content';
import {
  calendar,
  canPaintRoad,
  DAYS_PER_SEASON,
  canPlaceDecor,
  creditLimit,
  doorTile,
  familyIndex,
  expenses,
  income,
  isFrozen,
  loansOwed,
  onFloodplain,
  PENNIES_PER_COIN,
  TILE_FP,
  townStock,
  worldIndex,
  type Building,
  type Command,
  type Rot4,
  type WorldState,
} from '@qoti/sim';
import { command, findSpot, type Hamlet } from './hamlet';
import type { Lane, PlayLane } from './advisors/types';
import type { DecisionRecord } from './decisions';
import { canStaff } from './labor';
import { G, idx, S, sites } from './town';
import type { HighStreet } from './village';

/** Coins kept in the treasury after a want's cost. */
export const MONEY_RESERVE = 20;
/** What the Village advisor adds to its costs (I2's Village player kept 30 coins back, not 20). */
export const VILLAGE_MARGIN = 10;
/** Timber kept so a Forester's Lodge can always be rebuilt (R1: timber is what logs and planks were). */
export const TIMBER_RESERVE: ReadonlyMap<string, number> = new Map([['timber', 16]]);
/** C5X part 2: coins a want that can wait leaves in the treasury while the town owes the bank (the money advisor repays above it). */
export const REPAY_RESERVE = 350;
/** A want with this priority joins any build queue. */
export const URGENT = Infinity;
/** C5X: coins a new building's path may cost, kept back while the Charter wants a season in surplus. */
const PATH_ALLOWANCE = 10;

export interface Cost {
  coins: number;
  goods: readonly (readonly [good: string, qty: number])[];
}

/** A turn's allowance of starts that an advisor shares among some of its wants. */
export interface Budget {
  left: number;
}

export interface Want {
  def: string;
  /** How long a build queue it is worth joining: it starts only while fewer sites are under way. */
  priority: number;
  cost: Cost;
  /** A shortage the town feels now: it may draw on the labor reserve. */
  pressing: boolean;
  /** Keeps the town going: it may spend the timber reserve and start past half the credit line. */
  essential: boolean;
  /** The advisor's own tally of free goods this turn (taken from as wants start). */
  tally?: number[];
  /** The allowance it counts against, if any. */
  budget?: Budget;
  /** R1F: only spots this accepts (footprint min corner and turned size), as `build` takes. */
  only?: (x: number, z: number, w: number, d: number) => boolean;
  /** R1F: how far from the town center to look (40 tiles unless given; 60 with `only`). */
  radius?: number;
}

/** A def's own price, plus `margin` coins. */
export function costOf(def: string, margin = 0): Cost {
  const d = content.buildingById.get(def)!;
  return { coins: (d.cost?.coins ?? 0) + margin, goods: d.cost?.goods ?? [] };
}

/** A short path from a building's door to the nearest road (breadth-first, at most 30 tiles). */
export function pathToRoad(w: WorldState, from: number): [number, number][] | null {
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

/** Whether the carrier may bring a good: its family's rule is not Never and a neighbor sells it. */
export function carrierBrings(w: WorldState, g: number): boolean {
  const good = content.goods[g]!;
  const rule = w.carrier.families[familyIndex(good.family)]?.rule ?? 'never';
  return rule !== 'never' && content.neighbors.some((n) => n.sells.some(([x]) => x === good.id));
}

/** Coins a unit costs by carrier, at the peddler's 140% of today's price (R1F: a planning estimate). */
export function importPrice(w: WorldState, g: number): number {
  return ((w.market.prices[g] ?? content.goods[g]!.basePrice ?? 100) * 1.4) / PENNIES_PER_COIN;
}

export class Planner {
  /** Everything the player tried and whether the sim took it, for reading a run. */
  readonly actions: string[] = [];
  /** The high street, laid and zoned on the first visit (R1: from the first day; C4B laid it at Village rank). */
  street: HighStreet | null = null;
  /**
   * Days of food a resident the festival menu and commissions leave in store (C4C: a Village run
   * keeps six, for the Charter; the seasons advisor raises it before winter). R1: the carrier buys
   * and sells by its own reserves, so this no longer steers what leaves the valley.
   */
  foodReserveDays = 2;
  /** C5A: set by the seasons advisor while a flood is forecast or running: new buildings keep off the floodplain. */
  keepOffFloodplain = false;
  /** C5A: set by the seasons advisor in summer and autumn while the larder is short of a winter. */
  larderShort = false;
  /** C5A: set by the charter advisor late in a season while the Charter waits on one ended in surplus. */
  keepSurplus = false;
  /**
   * C4X: defs that found no spot, and the day they last failed. A valley with no free river edge
   * left kept asking for a fishers' hut (154 times in a willow run); for the rest of that day it is
   * not asked for again.
   */
  /** R1F: the advisor visiting now (set by autoplay around its `visit` and `rankUp`); null for the harness and the planner's own calls. */
  advisor: { id: string; lane: Lane } | null = null;
  /** R1F: the run's absolute day (1 on the first day), set by autoplay each morning; what `DecisionRecord.day` holds. */
  runDay = 1;
  /** R1F lanes test: lanes that send nothing (autoplay updates it each day). */
  offLanes = new Set<PlayLane>();
  /** R1F: every command the players sent, by lane and kind (the decisions count). */
  readonly decisions: DecisionRecord[] = [];
  private readonly noSpot = new Map<string, number>();

  constructor(readonly h: Hamlet) {}

  get w(): WorldState {
    return this.h.world;
  }

  coins(): number {
    return this.w.economy.treasury / PENNIES_PER_COIN;
  }

  /** This season's income less its expenses so far, coins. */
  /** C5X: coins still to go out this season whatever is built: the remaining days' upkeep and a path. */
  seasonCommitted(): number {
    let upkeep = 0;
    for (const b of this.w.buildings) {
      if (b.stage === 'built') upkeep += content.buildingById.get(b.def)?.upkeep ?? 0;
    }
    const days = DAYS_PER_SEASON - calendar(this.w.tick).day + 1;
    return days * upkeep + PATH_ALLOWANCE;
  }

  seasonBalance(): number {
    const s = this.w.economy.season;
    return (income(s) - expenses(s)) / PENNIES_PER_COIN;
  }

  /** Runs commands as a seat and logs them (R1F: and counts them by lane; a lane that is off sends nothing). */
  do(label: string, cmds: Command[], seat: 0 | 1 = 0): boolean {
    const day = this.runDay;
    const advisor = this.advisor?.id ?? 'planner';
    const adv = this.advisor?.lane ?? 'ledger';
    const lane: PlayLane = adv === 'both' ? (seat === 0 ? 'ledger' : 'hearth') : adv;
    if (this.offLanes.has(lane)) {
      this.actions.push(`${calendar(this.w.tick).day}:${label} (lane off)`);
      return false;
    }
    const oks = command(this.h, cmds, seat);
    const ok = oks.every(Boolean);
    cmds.forEach((cmd, i) =>
      this.decisions.push({ day, advisor, lane, kind: cmd.t, ok: oks[i]!, label, cmd }),
    );
    this.actions.push(`${calendar(this.w.tick).day}:${label}${ok ? '' : ' (refused)'}`);
    return ok;
  }

  /** No spot for `def` today. */
  blocked(def: string): boolean {
    return this.noSpot.get(def) === calendar(this.w.tick).day;
  }

  /**
   * The next hand-placed food building, or null: R1 leaves one, the fishery, while the river has
   * room and is not frozen. The rest of the town's food grows on Farmland by itself.
   */
  foodBuilding(): string | null {
    if (this.blocked('fishery') || isFrozen(this.w)) return null;
    return 'fishery';
  }

  /** The labor budget: whether a new `def` can be staffed (pressing wants may use the reserve). */
  staffs(def: string, pressing: boolean): boolean {
    return canStaff(this.w, def, pressing);
  }

  /** Goods free of what sites (and upgrades) have been promised. */
  private freeStock(): number[] {
    const free = townStock(this.w);
    for (const b of this.w.buildings) {
      const c = b.rt?.construction;
      if (c) for (let g = 0; g < free.length; g++) free[g]! -= c.needs[g] ?? 0;
      const u = b.rt?.upgrade;
      if (u) for (let g = 0; g < free.length; g++) free[g]! -= u[g] ?? 0;
    }
    return free;
  }

  /** Whether the planner would take `want` now (the build queue, labor, money, credit, goods). */
  allows(want: Want): boolean {
    const w = this.w;
    if (want.budget && want.budget.left <= 0) return false;
    if (sites(w) >= want.priority) return false;
    if (!this.staffs(want.def, want.pressing)) return false;
    // C5A: an urgent want that keeps the town going may spend the reserve, which is there for it (a
    // Hamlet down to 37 coins could never replace its last woodcutter, and with no logs, nothing else).
    const reserve = want.essential && want.priority === URGENT ? 0 : MONEY_RESERVE;
    if (this.coins() < want.cost.coins + reserve) return false;
    // C5A: late in a season the Charter's surplus wants, nothing that can wait may tip it into deficit.
    // C5X: counting the upkeep still to pay this season and a path, and only food or materials
    // short today may break it (a cottage built on the season's last day for an empty home, paid
    // from a balance two days' upkeep would eat, kept hazel's Hamlet from its rank for a season).
    if (this.keepSurplus && !want.pressing && want.cost.coins + this.seasonCommitted() > this.seasonBalance())
      return false;
    if (!want.pressing && !want.essential && loansOwed(w) * 2 > creditLimit(w)) return false;
    // C5X part 2: while the town owes the bank, what can wait keeps the repayment reserve back (the
    // Village spent every coin over 60 on taverns and wells and never had the 350 to repay; willow's
    // loans sat at the line, paying a fifth a year in interest).
    if (
      !want.pressing &&
      !want.essential &&
      loansOwed(w) > 0 &&
      this.coins() < want.cost.coins + REPAY_RESERVE
    )
      return false;
    const free = want.tally ?? this.freeStock();
    let imports = 0;
    for (const [g, q] of want.cost.goods) {
      const keep = want.essential ? 0 : (TIMBER_RESERVE.get(g) ?? 0);
      const short = q + keep - free[G(g)]!;
      if (short <= 0) continue;
      // R1F: nothing stalls (13-ledger.md, rule 3). The carrier brings what an open site waits for,
      // so a want that keeps the town going is placed short of its goods when the carrier may bring
      // them and the treasury can pay its markup: a Hamlet whose lodge had felled its wood had no
      // timber for the next lodge and waited forever.
      if (!want.essential || !carrierBrings(w, G(g))) return false;
      imports += Math.min(short, q) * importPrice(w, G(g));
    }
    return imports === 0 || this.coins() >= want.cost.coins + imports + MONEY_RESERVE;
  }

  /** An advisor proposes a want; the planner starts it when the budgets allow. */
  propose(want: Want): Building | null {
    if (!this.allows(want)) return null;
    const b = this.build(want.def, want.only, want.radius);
    if (!b) return null;
    if (want.budget) want.budget.left--;
    if (want.tally) for (const [g, q] of want.cost.goods) want.tally[G(g)]! -= q;
    return b;
  }

  /** The build queue: `def` at the first spot that fits (within `only`), with a path to the road. */
  build(
    def: string,
    only?: (x: number, z: number, w: number, d: number) => boolean,
    radius = only ? 60 : 40,
  ): Building | null {
    const ok = this.keepOffFloodplain
      ? (x: number, z: number, w: number, d: number) =>
          !onFloodplain(this.w, x, z, w, d) && (!only || only(x, z, w, d))
      : only;
    const spot = findSpot(this.w, def, radius, ok);
    if (!spot) {
      this.actions.push(`no spot for ${def}`);
      if (!only) this.noSpot.set(def, calendar(this.w.tick).day);
      return null;
    }
    return this.buildAt(`build ${def}`, def, spot[0], spot[1], spot[2], true);
  }

  /** The build queue at a chosen spot; `connect` paints a path from the door to the road. */
  buildAt(label: string, def: string, x: number, z: number, rot: Rot4, connect = false): Building | null {
    if (!this.do(label, [{ t: 'build.place', def, x, z, rot }])) return null;
    const b = this.w.buildings[this.w.buildings.length - 1]!;
    if (connect) this.connect(b);
    return b;
  }

  /** Paints a path from the door to the road network (the Ledger likes tidy frontage). */
  connect(b: Building): void {
    const path = pathToRoad(this.w, doorTile(b));
    // R1F: a door a step or two from the road needs no path of its own (a chore the Ledger counted),
    // unless its site rule wants a road at the door (a storehouse, a granary, a stall).
    const roadRule = content.buildingById.get(b.def)?.placement?.some((r) => r.kind === 'road') ?? false;
    if (path && path.length > (roadRule ? 0 : 2))
      this.do(`path for ${b.def}`, [{ t: 'road.paint', kind: 'path', tiles: path }]);
  }

  /** A free spot for a decor piece within `r` tiles of a tile center, or null. */
  decorSpot(
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
        // A thoughtful Hearth leaves zoned plots to grow (C4B): decor on a lot would stop it.
        const ti = Math.floor(fz / TILE_FP) * S + Math.floor(fx / TILE_FP);
        if (this.w.map.zone[ti] && !this.w.map.occupant[ti]) continue;
        if (canPlaceDecor(reader, d, fx, fz, (a * 7) % 64).ok) return [fx, fz];
      }
    }
    return null;
  }
}
