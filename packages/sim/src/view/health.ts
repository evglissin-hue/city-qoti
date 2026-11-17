// Health checks (playtest round three): things that should be true at every stage of a game, so a
// town that quietly stops working is noticed by a test, the autoplayer or a developer, not by two
// players wondering why nothing gets built. Read-only and outside the simulation: the watcher keeps
// what it has seen in its own memory, never in state, so it changes nothing and hashes nothing.
import {
  type BuildingDef,
  content,
  type DecorDef,
  type PlacementRule,
  type ProductionMethod,
} from '@qoti/content';
import {
  DAYS_PER_SEASON,
  DEMAND_KINDS,
  FESTIVAL,
  MAP_SIZE,
  RANKS,
  ResidentFlags,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  CARRIER_HOUR,
} from '../constants';
import type { Building, Gap, Place, WorldState } from '../contracts';
import { Road, TREE_MATURE, treeStage } from '../map/layers';
import { canPlaceBuilding } from '../rules/building';
import { canPlaceDecor } from '../rules/decor';
import { entranceTiles, footprintSize } from '../rules/footprint';
import { doorFront, reachesTile, townReach } from '../rules/reach';
import { gateTiles } from '../rules/wall';
import { canPlantTree } from '../rules/tree';
import { worldIndex } from '../state/worldIndex';
import { townReachesDoor } from '../state/reach';
import { placeState } from '../state/evenings';
import { rankAtLeast } from '../state/village';
import { familyIndex, methodOf } from '../state/zones';
import { isStandard } from '../state/hamlet';
import { carrierCovers, passClosed } from '../systems/carrier/api';
import { dayIndex, hourOf, isBuildTime } from '../systems/economy/time';
import { currentPlan, isFestivalDay } from '../systems/festivals/api';
import { gapAchievable } from '../systems/gaps/achievable';
import { homesHeldNow } from '../systems/growth';
import { achievable, placeableNow } from '../systems/hearth/wishes/achievable';
import { sellsTreats, treatsOnShelf } from '../systems/market/round';
import { placeIndex } from '../systems/places/index';
import { seasonNow } from '../systems/seasons/api';
import { MAX_BUILDERS_PER_SITE } from '../systems/construction';
import { available } from '../systems/logistics/tasks';
import { allowedWork } from '../systems/production/status';
import { supplyGapClosable } from '../systems/supplies/api';
import { townStock } from './hamlet';

export type HealthKind =
  /** Every material in, no progress for a long time. */
  | 'site-stalled'
  /** Nobody from the town can walk to the site's door. */
  | 'site-cut-off'
  /**
   * R2X: a built building nobody from the town can walk to, for a whole day (a garden bed walled in
   * by a lot that grew across its door, on R2E's trial merge): the class behind site-cut-off, once
   * the site is finished.
   */
  | 'building-cut-off'
  /**
   * R2X: a town whose growth waits on its evenings (homes held back past the free households) a whole
   * day with neither the Homes bar's reason (quietEvenings) nor a nowhere-to-go gap to say so.
   */
  | 'growth-waits-unseen'
  /** A site waits on a good with none free in stock and nothing to bring it (no maker, no carrier). */
  | 'site-unsupplied'
  /** Builders idle at their workplace in work hours while a site has work they could do. */
  | 'builders-idle'
  /** A resident flagged stuck for hours. */
  | 'resident-stuck'
  /** A standard valley with a site waiting and no built builder place (town hall or builder's yard). */
  | 'no-builders'
  /** A business or specialized building with hands, short of an input a whole day while the carrier may buy it. */
  | 'business-short'
  /** A demand bar lit three days running while no empty lot of its zone is offered. */
  | 'demand-unanswered'
  /** A built specialized building whose site stopped meeting its rule for a whole day. */
  | 'site-rule-broken'
  /** A voiced wish whose target cannot be met by anything the town can do, for a whole day. */
  | 'wish-dead-end'
  /** The open guide step's goal cannot be met by anything the town can do, for a whole day. */
  | 'guide-dead-end'
  /**
   * R1X: a hand-placed service (a well, a stall, a school) within half its reach of another of its
   * kind: a cluster no player builds, where one answer was given to the same need again and again.
   */
  | 'service-clustered'
  /** A waiting story step's goal cannot be met by anything the town can do, for a whole day. */
  | 'story-dead-end'
  /** A festival plan that was current on the festival day and never started. */
  | 'festival-no-show'
  /**
   * P2 (the R1 playtest): a bar said "a lot is free and waiting" three days running and no site of
   * its kind started: the pass keeps promising a start it cannot make, and gives no reason a player
   * could act on (the class behind "nothing was building and I could not see why").
   */
  | 'growth-wait-broken'
  /**
   * R2E: an open gap (a place with nothing to sell, a shop nobody passes, nowhere to go) that no
   * command could close, for a whole day: no outlet could stand within reach of the place, no seat
   * piece could go near the shop's door or the street. A kind this check has no rule for is never
   * flagged.
   */
  | 'gap-dead-end'
  /**
   * R2C: an open gap of a kind whose closing piece the town cannot build at all (gaps/achievable.ts:
   * no outlet, or no seat piece, open to it), for a whole day. R2X split it from R2E's placement rule.
   */
  | 'gap-unmeetable'
  /** R2E: a place no home's door can walk to (or to a tile beside it), for a whole day. */
  | 'place-unreachable'
  /**
   * R2E: an outlet with Treats on its shelf and a place in reach whose visitors came on every evening
   * of a whole season (a place with no visitors that evening neither counts nor resets) and bought
   * none of them there.
   */
  | 'treats-unsold'
  /**
   * R2E: a tier gated by an evenings score (`NeedsBasket.evenings`) that no town can build: the gate
   * is past the best evening content allows, or no seat piece or host is open to the town at the
   * tier's rank. Reported once per watcher, at the first look at or past that rank.
   */
  | 'tier-unreachable'
  /**
   * R2E: a garden lot (`Lot.kind` 'garden') that something grew on or tried to: a building id on it,
   * a building or site on its tiles, or a building whose `lot` is it. Flagged at once, once per lot.
   */
  | 'garden-grown';

export interface HealthIssue {
  kind: HealthKind;
  /** The building or resident concerned. */
  id: number;
  text: string;
}

/** A site with all its materials may go this long without progress (a builder's queue, a night). */
export const STALL_TICKS = 2 * TICKS_PER_DAY;
/** Builders may stand idle beside waiting work this long (the matcher runs every 20 ticks). */
export const IDLE_TICKS = 2 * TICKS_PER_HOUR;
/** A resident may stay flagged stuck this long. */
export const STUCK_TICKS = 6 * TICKS_PER_HOUR;
/** No builder place beside a waiting site, an unachievable wish: a day before it counts. */
export const DAY_TICKS = TICKS_PER_DAY;
/** R2X: carrier visits a site's Materials may miss (a full cart) before site-unsupplied flags it. */
export const CARRIER_VISITS_WAITED = 2;
/** A season (6 days). */
export const SEASON_TICKS = DAYS_PER_SEASON * TICKS_PER_DAY;
/** A demand bar lit with no lot offered: three days before it counts. */
export const DEMAND_TICKS = 3 * TICKS_PER_DAY;

/** Every production method in content: specialized buildings' and trades' (R1). */
const ALL_METHODS: readonly ProductionMethod[] = [
  ...content.buildings.flatMap((d) => d.methods ?? []),
  ...content.trades.flatMap((t) => (t.method ? [t.method] : [])),
];

const quietCache = new Map<string, ReadonlySet<number>>();
const ALL_YEAR: ReadonlySet<number> = new Set();
/** Field crops come in from the first summer cutting until the last sheaf, so winter and spring wait. */
const FIELD_QUIET: ReadonlySet<number> = new Set([3, 0]);

/**
 * P1: the seasons (0 spring to 3 winter) in which a good runs short by design, so a mill waiting on
 * it then is no dead end: a field crop in winter and spring (the barn is empty until the summer
 * cutting, and the windmill's line says so), a gathered good out of season, and what is made only
 * from them. A good that some producer makes all year is never quiet.
 */
export function quietSeasons(good: string, seen: ReadonlySet<string> = new Set()): ReadonlySet<number> {
  const hit = quietCache.get(good);
  if (hit) return hit;
  if (seen.has(good)) return ALL_YEAR;
  const path = new Set(seen).add(good);
  const producers: ReadonlySet<number>[] = [];
  for (const m of ALL_METHODS) {
    if (!m.outputs.some(([g]) => g === good)) continue;
    let mine: ReadonlySet<number>;
    if (m.kind === 'farm') mine = FIELD_QUIET;
    else if (m.kind === 'gather') {
      const table = content.goodById.get(good)?.seasons;
      mine = new Set(table ? [0, 1, 2, 3].filter((i) => table[i] === 0) : []);
    } else if (m.kind === 'craft' && m.inputs.length > 0) {
      // Short whenever any input is short.
      const any = new Set<number>();
      for (const [g] of m.inputs) for (const q of quietSeasons(g, path)) any.add(q);
      mine = any;
    } else mine = ALL_YEAR;
    producers.push(mine);
  }
  // Quiet only when every producer is.
  const out: ReadonlySet<number> =
    producers.length === 0 ? ALL_YEAR : new Set([0, 1, 2, 3].filter((q) => producers.every((p) => p.has(q))));
  if (seen.size === 0) quietCache.set(good, out);
  return out;
}

/**
 * Watches a valley over time. Call `check` as often as you like (every game hour is plenty); it
 * returns the issues that hold now, judged against what it saw on earlier calls.
 */
export class HealthWatch {
  /** Site id → [workDone seen, tick it was first seen at that value]. */
  private readonly progress = new Map<number, [number, number]>();
  /** R2X: building id → tick it was first seen built with no walk to its door; and the hour of the last look. */
  private readonly cutOffSince = new Map<number, number>();
  private cutOffHour = -1;
  /** R2X: the tick growth was first seen waiting on evenings with nothing saying so, or -1. */
  private unseenSince = -1;
  /** R2X: the treasury at each day's carrier visit (the first look in CARRIER_HOUR), the last few days. */
  private readonly visitTreasury: number[] = [];
  private visitDay = -1;
  private unseenHour = -1;
  /** Site id → [workDone, tick it was first seen workable with builders free]. */
  private readonly waiting = new Map<number, [number, number]>();
  private readonly stuckSince = new Map<number, number>();
  private noBuildersSince = -1;
  /** Building id → tick it was first seen short of an input (and not once clear since). */
  private readonly shortSince = new Map<number, number>();
  /** `site:good` → tick a site was first seen waiting on a good with none in town stock. */
  private readonly siteWaitSince = new Map<string, number>();
  /** Demand bar → tick it was first seen lit with no empty lot offered. */
  private readonly demandSince = new Map<number, number>();
  /** Demand bar → tick it was first seen promising a start (lotWaiting) with no site of its kind going up. */
  private readonly waitSince = new Map<number, number>();
  /** `building:rule` → tick a specialized building's site rule was first seen broken. */
  private readonly ruleSince = new Map<string, number>();
  /** Guide step → tick first seen with an unachievable goal; likewise `arc:step` for stories. */
  private guideSince = new Map<number, number>();
  private readonly storySince = new Map<string, number>();
  /** Wish id → tick it was first seen with an unachievable target. */
  private readonly deadSince = new Map<number, number>();
  /** Day index of a festival day on which a current plan was seen, and whether it was reported. */
  private festivalDay = -1;
  private festivalReported = false;
  /** R2E: gap id → tick it was first seen with nothing that could close it; and the hour of the last look. */
  private readonly gapSince = new Map<number, number>();
  /** R2C: gap id → tick it was first seen of a kind the town cannot meet at all. */
  private readonly unmeetableSince = new Map<number, number>();
  private gapHour = -1;
  /** R2E: place id → tick it was first seen out of every home's reach; and the hour of the last look. */
  private readonly placeSince = new Map<string, number>();
  private placeHour = -1;
  /** R2E: outlet id → evenings in a row its places had visitors and sold nothing; and the day last read. */
  private readonly unsoldRun = new Map<number, number>();
  private unsoldDay = -1;
  /** R2E: tiers (and `lot:<id>` rows) already reported, so each is said once. */
  private readonly reported = new Set<string>();

  check(state: WorldState): HealthIssue[] {
    if (!isStandard(state)) return [];
    const out: HealthIssue[] = [];
    checkClusters(state, out);
    const now = state.tick;
    const day = Math.floor(now / TICKS_PER_DAY);
    if (hourOf(now) === CARRIER_HOUR && day !== this.visitDay) {
      this.visitDay = day;
      this.visitTreasury.push(state.economy.treasury);
      if (this.visitTreasury.length > 8) this.visitTreasury.shift();
    }
    const sites = state.buildings.filter((b) => b.stage === 'construction' && b.rt?.construction);
    const seen = new Set<number>();
    for (const b of sites) {
      const c = b.rt!.construction!;
      seen.add(b.id);
      const last = this.progress.get(b.id);
      const allIn = c.needs.every((n) => n <= 0);
      // The clock runs from the last progress or the last look still waiting on materials: a site
      // that waited days for its last stone was not stalled with everything in (C5A).
      if (!last || last[0] !== c.workDone || !allIn) this.progress.set(b.id, [c.workDone, now]);
      if (allIn && last && last[0] === c.workDone && now - last[1] >= STALL_TICKS && !b.rt!.paused) {
        out.push({
          kind: 'site-stalled',
          id: b.id,
          text: `${b.def} #${b.id} has every material and has not moved in ${Math.floor((now - last[1]) / TICKS_PER_HOUR)} hours`,
        });
      }
      if (!townReachesDoor(state, b)) {
        out.push({ kind: 'site-cut-off', id: b.id, text: `${b.def} #${b.id}: nobody can walk to its door` });
      }
    }
    for (const id of [...this.progress.keys()]) if (!seen.has(id)) this.progress.delete(id);
    this.checkCutOff(state, out);
    this.checkGrowthWaits(state, out);

    // Builders idle beside work they could do: a reachable site with work allowed and room in its
    // crew that has not moved for a while, though builders stood free at every look.
    const crews = new Map<number, number>();
    for (const r of state.residents)
      if (r.activity.kind === 'task' && r.activity.taskId < 0)
        crews.set(-r.activity.taskId, (crews.get(-r.activity.taskId) ?? 0) + 1);
    const idle = isBuildTime(now) ? idleBuilders(state) : 0;
    for (const b of sites) {
      const c = b.rt!.construction!;
      const workable =
        idle > 0 &&
        !b.rt!.paused &&
        c.workDone < allowedWork(b.rt!) &&
        (crews.get(b.id) ?? 0) < MAX_BUILDERS_PER_SITE &&
        townReachesDoor(state, b);
      const was = this.waiting.get(b.id);
      if (!workable || (was && was[0] !== c.workDone)) {
        if (workable) this.waiting.set(b.id, [c.workDone, now]);
        else this.waiting.delete(b.id);
        continue;
      }
      if (!was) {
        this.waiting.set(b.id, [c.workDone, now]);
        continue;
      }
      if (now - was[1] >= IDLE_TICKS)
        out.push({
          kind: 'builders-idle',
          id: b.id,
          text: `${b.def} #${b.id} has had work ready for ${Math.floor((now - was[1]) / TICKS_PER_HOUR)} hours while ${idle} builder${idle === 1 ? '' : 's'} stood free`,
        });
    }
    for (const id of [...this.waiting.keys()]) if (!seen.has(id)) this.waiting.delete(id);

    for (const r of state.residents) {
      if (!(r.flags & ResidentFlags.stuck)) {
        this.stuckSince.delete(r.id);
        continue;
      }
      const since = this.stuckSince.get(r.id) ?? now;
      this.stuckSince.set(r.id, since);
      if (now - since >= STUCK_TICKS)
        out.push({
          kind: 'resident-stuck',
          id: r.id,
          text: `${r.given} ${r.family} has been stuck for hours`,
        });
    }
    this.checkSupply(state, sites, out);
    this.checkPlayability(state, out);
    this.checkEvenings(state, out);
    return out;
  }

  /**
   * site-unsupplied: a site waits on a good with none in town stock, and nothing will bring it:
   * no built maker (a rising maker counts only when its own site is not waiting on that same good),
   * and the carrier cannot or did not (its family is on Never or no neighbor sells it, after a day;
   * or it bought none over CARRIER_VISITS_WAITED visits the treasury could pay for).
   */
  private checkSupply(state: WorldState, sites: Building[], out: HealthIssue[]): void {
    const now = state.tick;
    const stock = townStock(state);
    const closed = passClosed(state);
    const live = new Set<string>();
    for (const site of sites) {
      const c = site.rt!.construction!;
      c.needs.forEach((need, g) => {
        if (need <= 0 || (stock[g] ?? 0) > 0) return;
        const key = `${site.id}:${g}`;
        live.add(key);
        // R1X: while the pass is closed the carrier cannot come at all; the wait counts from the thaw
        // (birch's grown farmstead asked for stone on the last day before the pass closed).
        if (closed) {
          this.siteWaitSince.set(key, now);
          return;
        }
        const since = this.siteWaitSince.get(key) ?? now;
        this.siteWaitSince.set(key, since);
        if (now - since < DAY_TICKS) return;
        const good = content.goods[g]!.id;
        const made = state.buildings.some((b) => {
          if (!methodOf(b)?.outputs.some(([o]) => o === good)) return false;
          if (b.stage === 'built') return true;
          return (b.rt?.construction?.needs[g] ?? 0) <= 0;
        });
        if (made) return;
        if (carrierMayBuy(state, g)) {
          // R1X: a site's Materials are bought with coins in hand only, so a site waiting while the
          // treasury cannot pay for them waits on coins (taxes and exports refill it), not a dead end.
          // R2X: as the treasury stood at the carrier's visits over the days waited (it refills after
          // the visit from the day's sales; R2B's birch flag was false).
          const price = state.market.prices[g] ?? content.goods[g]!.basePrice;
          const waited = Math.max(1, Math.ceil((now - since) / TICKS_PER_DAY));
          const atVisits = this.visitTreasury.slice(-waited);
          const inHand = atVisits.length > 0 ? Math.min(...atVisits) : state.economy.treasury;
          if (inHand < need * price * 2) return;
          // R2X: the cart holds so much a visit and Food and Fuel load first, so a site's Materials
          // that did not fit today come tomorrow (hazel's Village tavern waited on brick behind a full
          // cart, and the next cart brought it). Two visits with none brought is the dead end.
          if (now - since < CARRIER_VISITS_WAITED * DAY_TICKS) return;
          // The carrier may buy it, but did it? Look back over the days the site has waited.
          const days = Math.min(
            state.carrier.bought.length,
            Math.max(1, Math.ceil((now - since) / TICKS_PER_DAY)),
          );
          if (state.carrier.bought.slice(-days).some((day) => (day[g] ?? 0) > 0)) return;
        }
        out.push({
          kind: 'site-unsupplied',
          id: site.id,
          text: `${site.def} #${site.id} has waited a day on ${good}: none in town, no maker, and the carrier is not bringing it`,
        });
      });
    }
    for (const k of [...this.siteWaitSince.keys()]) if (!live.has(k)) this.siteWaitSince.delete(k);
  }

  /** business-short: built, with hands, short of an input a whole day while the carrier may buy it. */
  private checkBusinesses(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const season = seasonNow(state).season;
    const closed = passClosed(state);
    const live = new Set<number>();
    for (const b of state.buildings) {
      const rt = b.rt;
      if (b.stage !== 'built' || !rt || rt.workers.length === 0) continue;
      const method = methodOf(b);
      if (!method || method.inputs.length === 0) continue;
      const short = method.inputs.filter(([g, q]) => (rt.input[content.goodIndex.get(g) ?? -1] ?? 0) < q);
      // Out of season for every maker is the year's shape, not a dead end; so is a closed pass
      // (nothing comes over it, by design). The rule that counts is the family of what it makes.
      const gap = closed
        ? undefined
        : short.find(([g]) => {
            const gi = content.goodIndex.get(g);
            return gi !== undefined && !quietSeasons(g).has(season) && carrierCovers(state, b, gi);
          });
      if (!gap) continue;
      live.add(b.id);
      const since = this.shortSince.get(b.id) ?? now;
      this.shortSince.set(b.id, since);
      if (now - since < DAY_TICKS) continue;
      out.push({
        kind: 'business-short',
        id: b.id,
        text: `${b.trade ?? b.def} #${b.id} has had no ${gap[0]} for a whole day while the carrier may buy it`,
      });
    }
    for (const id of [...this.shortSince.keys()]) if (!live.has(id)) this.shortSince.delete(id);
  }

  /** demand-unanswered: a bar lit three days running and no empty lot of its zone offered. */
  private checkDemand(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const live = new Set<number>();
    DEMAND_KINDS.forEach((kind, k) => {
      if (!state.demand.lit[k]) return;
      const zones = content.zones.filter((z) => ZONES_OF_BAR[kind].includes(z.id));
      const paintable = zones.filter((z) => !z.requires?.rank || rankAtLeast(state, z.requires.rank));
      if (paintable.length === 0) return;
      const values = paintable.map((z) => z.layerValue);
      // R2F: a garden lot (zone 0) is never offered; skipped by name, not only by its zone.
      if (state.lots.some((l) => l.kind !== 'garden' && !l.buildingId && values.includes(l.zone))) return;
      live.add(k);
      const since = this.demandSince.get(k) ?? now;
      this.demandSince.set(k, since);
      if (now - since >= DEMAND_TICKS)
        out.push({
          kind: 'demand-unanswered',
          id: k,
          text: `the ${kind} bar has been lit for three days and no empty ${paintable.map((z) => z.id).join(' or ')} lot is offered (treasury ${Math.floor(state.economy.treasury / 100)} coins)`,
        });
    });
    for (const k of [...this.demandSince.keys()]) if (!live.has(k)) this.demandSince.delete(k);
  }

  /**
   * growth-wait-broken: a wanted bar whose last reason is lotWaiting (a start at the next pass) for
   * three days running, with no grown site of its kind going up in that time.
   */
  private checkGrowthWait(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const live = new Set<number>();
    DEMAND_KINDS.forEach((kind, k) => {
      const reasons = state.demand.reasons[k] ?? [];
      const last = reasons[reasons.length - 1];
      if ((state.demand.bars[k] ?? 0) <= 0 || state.demand.lit[k] || last?.code !== 'lotWaiting') return;
      const values = content.zones.filter((z) => ZONES_OF_BAR[kind].includes(z.id)).map((z) => z.layerValue);
      // A site of the kind going up is the promise kept.
      for (const b of state.buildings) {
        if (!b.lot || b.stage !== 'construction') continue;
        const lot = state.lots.find((l) => l.id === b.lot);
        if (lot && values.includes(lot.zone)) return;
      }
      live.add(k);
      const since = this.waitSince.get(k) ?? now;
      this.waitSince.set(k, since);
      if (now - since >= DEMAND_TICKS)
        out.push({
          kind: 'growth-wait-broken',
          id: k,
          text: `the ${kind} bar has said a lot is free and waiting for three days and nothing has started on one`,
        });
    });
    for (const k of [...this.waitSince.keys()]) if (!live.has(k)) this.waitSince.delete(k);
  }

  /** site-rule-broken: a built specialized building whose site no longer meets a rule that can change. */
  private checkSiteRules(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const live = new Set<string>();
    for (const b of state.buildings) {
      if (b.stage !== 'built') continue;
      const def = content.buildingById.get(b.def);
      if (!def?.specialized) continue;
      (def.placement ?? []).forEach((rule, i) => {
        const broken = ruleBroken(state, b, def, rule);
        if (!broken) return;
        const key = `${b.id}:${i}`;
        live.add(key);
        const since = this.ruleSince.get(key) ?? now;
        this.ruleSince.set(key, since);
        if (now - since >= DAY_TICKS)
          out.push({
            kind: 'site-rule-broken',
            id: b.id,
            text: `${def.id} #${b.id} no longer has ${broken}`,
          });
      });
    }
    for (const k of [...this.ruleSince.keys()]) if (!live.has(k)) this.ruleSince.delete(k);
  }

  /** growth-waits-unseen: homes held back by quiet evenings a whole day, with no reason shown and no gap open (looked at hourly). */
  private checkGrowthWaits(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const hour = Math.floor(now / TICKS_PER_HOUR);
    if (hour === this.unseenHour) return;
    this.unseenHour = hour;
    const held = homesHeldNow(state) > 0;
    const shown = (state.demand.reasons[0] ?? []).some((r) => r.code === 'quietEvenings');
    const gap = state.gaps.open.some((g) => g.kind === 'nowhereToGo');
    if (!held || shown || gap) {
      this.unseenSince = -1;
      return;
    }
    if (this.unseenSince < 0) this.unseenSince = now;
    if (now - this.unseenSince >= DAY_TICKS)
      out.push({
        kind: 'growth-waits-unseen',
        id: 0,
        text: 'homes wait on good evenings, and neither the Homes bar nor a gap says so',
      });
  }

  /** building-cut-off: a built building whose door the town cannot walk to for a whole day (looked at hourly). */
  private checkCutOff(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const hour = Math.floor(now / TICKS_PER_HOUR);
    if (hour === this.cutOffHour) return;
    this.cutOffHour = hour;
    const live = new Set<number>();
    for (const b of state.buildings) {
      if (b.stage !== 'built' || townReachesDoor(state, b)) continue;
      live.add(b.id);
      const since = this.cutOffSince.get(b.id) ?? now;
      this.cutOffSince.set(b.id, since);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'building-cut-off',
          id: b.id,
          text: `${b.def} #${b.id}: nobody can walk to its door`,
        });
    }
    for (const id of [...this.cutOffSince.keys()]) if (!live.has(id)) this.cutOffSince.delete(id);
  }

  /** R2E: the evening round's checks. Each reads live state through the sim's own APIs and is quiet on stand-ins. */
  private checkEvenings(state: WorldState, out: HealthIssue[]): void {
    this.checkGaps(state, out);
    this.checkPlaces(state, out);
    this.checkTreatsUnsold(state, out);
    this.checkTiers(state, out);
    this.checkGardens(state, out);
  }

  /** gap-dead-end and gap-unmeetable: an open gap with nothing that could close it for a whole day (read once an hour). */
  private checkGaps(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const hour = Math.floor(now / TICKS_PER_HOUR);
    if (hour === this.gapHour) return;
    this.gapHour = hour;
    const live = new Set<number>();
    const unmeetable = new Set<number>();
    for (const gap of state.gaps.open) {
      // R2C's rule: a kind whose closing piece the town cannot build at all (gaps/achievable.ts).
      if (!gapAchievable(state, gap.kind)) {
        unmeetable.add(gap.id);
        const since = this.unmeetableSince.get(gap.id) ?? now;
        this.unmeetableSince.set(gap.id, since);
        if (now - since >= DAY_TICKS)
          out.push({
            kind: 'gap-unmeetable',
            id: gap.id,
            text: `gap ${gap.kind} (${gap.subject}) asks for something no one can do`,
          });
        continue;
      }
      // R2E's: closable is true when something could close it, and also when the kind is one this
      // check has no rule for (any later kind): never flag what is not understood. R3's shortOfSupplies
      // asks R3A's supplyGapClosable.
      if (gapClosable(state, gap)) continue;
      live.add(gap.id);
      const since = this.gapSince.get(gap.id) ?? now;
      this.gapSince.set(gap.id, since);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'gap-dead-end',
          id: gap.id,
          text: `the ${gap.kind} gap about ${gap.subject} has been open a day and no command could close it`,
        });
    }
    for (const id of [...this.gapSince.keys()]) if (!live.has(id)) this.gapSince.delete(id);
    for (const id of [...this.unmeetableSince.keys()])
      if (!unmeetable.has(id)) this.unmeetableSince.delete(id);
  }

  /** place-unreachable: a place no home's door can walk to, for a whole day (looked at once an hour). */
  private checkPlaces(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const hour = Math.floor(now / TICKS_PER_HOUR);
    if (hour === this.placeHour) return;
    this.placeHour = hour;
    const places = placeIndex(state).places;
    const live = new Set<string>();
    if (places.length > 0) {
      const sources: number[] = [];
      for (const b of state.buildings) {
        if (b.stage === 'built' && content.buildingById.get(b.def)?.tags?.includes('home'))
          sources.push(doorFront(b));
      }
      // No homes, or none that can stand anywhere: nobody walks, so nothing is cut off from them.
      const reader = worldIndex(state).reader;
      const reach = sources.length > 0 ? townReach(reader, sources, gateTiles(state.buildings)) : null;
      if (reach && reach.some((v) => v === 1)) {
        for (const p of places) {
          // Only places made of pieces someone built: the skating ice is found at bank tiles all along
          // the river (R2A, seasons' skatingSpots), many on a far bank no home reaches, and nobody built
          // it there or can move it (R2A's branch flagged it on four seeds).
          if (p.members.length === 0) continue;
          if (p.tiles.some((t) => reachesTile(reach, reader, t))) continue;
          live.add(p.id);
          const since = this.placeSince.get(p.id) ?? now;
          this.placeSince.set(p.id, since);
          if (now - since >= DAY_TICKS)
            out.push({
              kind: 'place-unreachable',
              id: 0,
              text: `the place ${p.id} cannot be walked to from any home's door`,
            });
        }
      }
    }
    for (const id of [...this.placeSince.keys()]) if (!live.has(id)) this.placeSince.delete(id);
  }

  /**
   * treats-unsold: read once a day after the evening closes. An outlet that sells Treats, has them
   * on the shelf and is listed by a place; the evening counts when those places had visitors, and
   * counts against it when they sold none. No visitors: neither counts nor resets, so a town where
   * nobody goes out stays quiet. A season of such evenings in a row flags it.
   */
  private checkTreatsUnsold(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;
    const day = dayIndex(now);
    if (hourOf(now) < content.places.homeHour || day === this.unsoldDay) return;
    this.unsoldDay = day;
    const byOutlet = new Map<number, Place[]>();
    for (const p of placeIndex(state).places)
      for (const id of p.outlets) {
        const list = byOutlet.get(id);
        if (list) list.push(p);
        else byOutlet.set(id, [p]);
      }
    const live = new Set<number>();
    for (const b of state.buildings) {
      const mine = byOutlet.get(b.id);
      if (!mine || !sellsTreats(state, b) || !treatsOnShelf(state, b)) continue;
      live.add(b.id);
      let visitors = 0;
      let sold = 0;
      for (const p of mine) {
        const row = placeState(state, p.id);
        if (!row) continue;
        visitors += row.visitors[row.visitors.length - 1] ?? 0;
        sold += row.sold[row.sold.length - 1] ?? 0;
      }
      if (visitors <= 0) continue;
      const run = sold > 0 ? 0 : (this.unsoldRun.get(b.id) ?? 0) + 1;
      this.unsoldRun.set(b.id, run);
      if (run >= DAYS_PER_SEASON)
        out.push({
          kind: 'treats-unsold',
          id: b.id,
          text: `${b.trade ?? b.def} #${b.id} has had Treats on the shelf and visitors at ${mine.length} place${mine.length === 1 ? '' : 's'} in reach for ${run} evenings and sold none`,
        });
    }
    // An outlet that lost its Treats or its places starts again.
    for (const id of [...this.unsoldRun.keys()]) if (!live.has(id)) this.unsoldRun.delete(id);
  }

  /** tier-unreachable: see the kind; checked once, at the first look at or past each gated tier's rank. */
  private checkTiers(state: WorldState, out: HealthIssue[]): void {
    for (const basket of content.baskets) {
      const gate = basket.evenings;
      const rank = TIER_RANK[basket.tier];
      if (gate === undefined || !rank || !rankAtLeast(state, rank)) continue;
      const key = `tier:${basket.tier}`;
      if (this.reported.has(key)) continue;
      const why = tierUnreachable(state, gate, rank);
      if (!why) continue;
      this.reported.add(key);
      out.push({
        kind: 'tier-unreachable',
        id: 0,
        text: `${basket.tier} wants evenings of ${gate} and ${why}`,
      });
    }
  }

  /** garden-grown: a garden lot with a building id, a building or site on its tiles, or a building grown on it. */
  private checkGardens(state: WorldState, out: HealthIssue[]): void {
    for (const lot of state.lots) {
      if (lot.kind !== 'garden') continue;
      const key = `lot:${lot.id}`;
      if (this.reported.has(key)) continue;
      let grown = lot.buildingId !== 0 || state.buildings.some((b) => b.lot === lot.id);
      for (let z = lot.z; !grown && z < lot.z + lot.d; z++)
        for (let x = lot.x; x < lot.x + lot.w; x++)
          if (state.map.occupant[z * MAP_SIZE + x]) {
            grown = true;
            break;
          }
      if (!grown) continue;
      this.reported.add(key);
      out.push({
        kind: 'garden-grown',
        id: lot.id,
        text: `garden lot #${lot.id} has a building or a site on it: gardens are never built on`,
      });
    }
  }

  /** The playability audit's checks: soft locks and dead ends that wait on time, not on one look. */
  private checkPlayability(state: WorldState, out: HealthIssue[]): void {
    const now = state.tick;

    // A site waits and nothing built can raise it.
    const waiting = state.buildings.some((b) => b.stage === 'construction');
    const hasBuilders = state.buildings.some(
      (b) => b.stage === 'built' && content.buildingById.get(b.def)?.jobs?.role === 'builder',
    );
    if (!waiting || hasBuilders) this.noBuildersSince = -1;
    else {
      if (this.noBuildersSince < 0) this.noBuildersSince = now;
      if (now - this.noBuildersSince >= DAY_TICKS)
        out.push({
          kind: 'no-builders',
          id: 0,
          text: "a site is waiting and the valley has no town hall or builder's yard to raise it",
        });
    }

    this.checkBusinesses(state, out);
    this.checkDemand(state, out);
    this.checkGrowthWait(state, out);
    this.checkSiteRules(state, out);

    // Voiced wishes the town could not meet by building anything.
    const wishes = new Set<number>();
    for (const w of state.wishes) {
      const t = content.wishById.get(w.template);
      if (!t || achievable(state, t.target)) continue;
      wishes.add(w.id);
      const since = this.deadSince.get(w.id) ?? now;
      this.deadSince.set(w.id, since);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'wish-dead-end',
          id: w.id,
          text: `wish ${t.id} (#${w.id}) asks for something no one can do`,
        });
    }
    for (const id of [...this.deadSince.keys()]) if (!wishes.has(id)) this.deadSince.delete(id);

    // The open guide step and any waiting story step: the same walk as a wish's target.
    const gStep = state.guide.over ? undefined : content.guide.steps[state.guide.step];
    if (gStep && !achievable(state, gStep.goal)) {
      const since = this.guideSince.get(state.guide.step) ?? now;
      this.guideSince = new Map([[state.guide.step, since]]);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'guide-dead-end',
          id: state.guide.step,
          text: `the guide's step "${gStep.id}" asks for something no one can do`,
        });
    } else this.guideSince.clear();
    const stories = new Set<string>();
    for (const st of state.stories) {
      const step = st.step < 0 ? undefined : content.storyById.get(st.arc)?.steps[st.step];
      if (!step || achievable(state, step.goal)) continue;
      const key = `${st.arc}:${st.step}`;
      stories.add(key);
      const since = this.storySince.get(key) ?? now;
      this.storySince.set(key, since);
      if (now - since >= DAY_TICKS)
        out.push({
          kind: 'story-dead-end',
          id: st.residentId,
          text: `${st.arc}'s step ${st.step + 1} asks for something no one can do`,
        });
    }
    for (const k of [...this.storySince.keys()]) if (!stories.has(k)) this.storySince.delete(k);

    // A festival plan that was current on the day but had not started by 19:00.
    if (isFestivalDay(state)) {
      const day = Math.floor(now / TICKS_PER_DAY);
      const hour = hourOf(now);
      if (this.festivalDay !== day) {
        this.festivalDay = day;
        this.festivalReported = false;
      }
      const plan = currentPlan(state);
      const started = state.festival.live || state.festival.outcome !== null;
      if (plan && hour > FESTIVAL.from && hour < FESTIVAL.to && !started && !this.festivalReported) {
        this.festivalReported = true;
        out.push({
          kind: 'festival-no-show',
          id: 0,
          text: `the ${plan.festival} plan was current but the festival never started by ${FESTIVAL.from}:01`,
        });
      }
    }
  }
}

function idleBuilders(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || content.buildingById.get(b.def)?.jobs?.role !== 'builder') continue;
    for (const id of b.rt.workers) {
      const r = state.residents.find((x) => x.id === id);
      if (r && available(r, b)) n++;
    }
  }
  return n;
}

/** Zone ids behind each demand bar (Homes counts both densities). */
const ZONES_OF_BAR: Record<(typeof DEMAND_KINDS)[number], readonly string[]> = {
  homes: ['homes-low', 'homes-medium'],
  shops: ['shops'],
  workshops: ['crafts'],
  farmland: ['farms'],
};

/** True when the carrier's rule for the good's family lets it buy and a neighbor sells the good. */
function carrierMayBuy(state: WorldState, good: number): boolean {
  const def = content.goods[good];
  if (!def) return false;
  const family = state.carrier.families[familyIndex(def.family)];
  return (
    !!family && family.rule !== 'never' && content.neighbors.some((n) => n.sells.some(([x]) => x === def.id))
  );
}

/**
 * What a specialized building's site lacks now, or null. Only the rules that can change after
 * placement are read (woods, open ground, road); deposits never deplete and the rest are set when
 * it is placed.
 */
function ruleBroken(state: WorldState, b: Building, def: BuildingDef, rule: PlacementRule): string | null {
  const [w, d] = footprintSize(def, b.rot);
  if (rule.kind === 'woods') {
    // R1X: a wood the Lodge has felled and replanted is regrowing, not gone (R1B's foresters plant
    // saplings in its range): only a wood with too few trees of any age is broken.
    // R1X: and a wood the town has grown into is planted back by its Lodge (production/forestry,
    // woodsThin): it is broken only when too few trees could ever stand there again.
    const reader = worldIndex(state).reader;
    let n = 0;
    let mature = 0;
    let room = 0;
    for (let z = b.z - rule.within; z < b.z + d + rule.within; z++)
      for (let x = b.x - rule.within; x < b.x + w + rule.within; x++) {
        if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
        const v = state.map.tree[z * MAP_SIZE + x]!;
        if (!v) {
          if (n + room < rule.trees && canPlantTree(reader, x, z).ok) room++;
          continue;
        }
        n++;
        if (treeStage(v) >= TREE_MATURE) mature++;
      }
    return n + room < rule.trees
      ? `${rule.trees} trees within ${rule.within} tiles, young or grown, and no room to plant them (${n} left, ${mature} grown)`
      : null;
  }
  if (rule.kind === 'openGround') {
    for (let z = b.z - rule.clear; z < b.z + d + rule.clear; z++)
      for (let x = b.x - rule.clear; x < b.x + w + rule.clear; x++) {
        if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
        const o = state.map.occupant[z * MAP_SIZE + x]!;
        if (o && o !== b.id) return `open ground (another building within ${rule.clear} tiles)`;
      }
    return null;
  }
  if (rule.kind === 'road') {
    const { front } = entranceTiles(def, b.x, b.z, b.rot);
    const r = state.map.road[front[1] * MAP_SIZE + front[0]]!;
    const kinds: number[] | undefined = rule.roads?.map((k) => Road[k]);
    return r && (!kinds || kinds.includes(r)) ? null : 'a road at its door';
  }
  return null;
}

/**
 * service-clustered (R1X): a service placed by hand (not grown on a lot) within half its reach of an
 * older one of its kind. A second service of a kind belongs where the first does not reach, or (for
 * a full well) beside it, never on top of it: the grown village's autoplayer stood seven wells on one
 * green, answering every far household's wish with a well at the town's middle. Storage reach
 * (porters) is left out: storehouses stand together for room.
 */
function checkClusters(state: WorldState, out: HealthIssue[]): void {
  const byDef = new Map<string, Building[]>();
  for (const b of state.buildings) {
    if (b.lot) continue;
    const reach = serviceReach(b.def);
    if (reach <= 0) continue;
    const list = byDef.get(b.def);
    if (list) list.push(b);
    else byDef.set(b.def, [b]);
  }
  for (const [def, list] of byDef) {
    const half = serviceReach(def) / 2;
    for (let i = 1; i < list.length; i++) {
      const b = list[i]!;
      for (let j = 0; j < i; j++) {
        const o = list[j]!;
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        if (dx * dx + dz * dz >= half * half) continue;
        out.push({
          kind: 'service-clustered',
          id: b.id,
          text: `${def} #${b.id} stands within ${Math.ceil(half)} tiles of ${def} #${o.id}, half its reach`,
        });
        break;
      }
    }
  }
}

/** The widest household service a def gives (water, food, health, school, social), or 0. */
function serviceReach(defId: string): number {
  let r = 0;
  for (const c of content.buildingById.get(defId)?.coverage ?? [])
    if (c.kind !== 'logistics' && c.radius > r) r = c.radius;
  return r;
}

// --- R2E: the evening round's reads ----------------------------------------------------------------

type RankName = (typeof RANKS)[number];

/** The rank at which each gated tier can first be reached (the Charter that unlocks it). */
const TIER_RANK: Partial<Record<string, RankName>> = {
  craftsfolk: 'village',
  merchant: 'town',
  patron: 'marketTown',
};

/** The best evening content allows: the best stop's draw at its cap, plus a friend, a treat and a second kind. */
function bestEvening(): number {
  const p = content.places;
  const draw = Math.min(
    100,
    p.charmCap + p.siteBonus + p.pieceKindMax + p.waterBonus + p.litBonus + p.treatsBonus,
  );
  return Math.min(100, draw + p.friendScore + p.treatScore + p.secondKindScore);
}

/**
 * Why no town can build a tier's evenings gate, or null. Two reasons: the gate is above the best
 * evening content allows, or no seat is open to a town of that rank: a seat piece that is not
 * locked (or that a Charter or pattern of that rank or lower unlocks, or the town has unlocked), or
 * a host with seats whose own rank is not above it. Kept simple on purpose.
 */
function tierUnreachable(state: WorldState, gate: number, rank: RankName): string | null {
  if (gate > bestEvening()) return `no evening can score that high (the best is ${bestEvening()})`;
  const at = RANKS.indexOf(rank);
  const unlockable = new Set<string>(state.hearth.unlocked);
  for (const c of content.charters)
    if (RANKS.indexOf(c.rank) <= at) for (const u of c.unlocks) unlockable.add(u);
  for (const pat of content.patterns)
    if (RANKS.indexOf(pat.rank) <= at) for (const u of pat.unlocks) unlockable.add(u);
  if (content.decor.some((d) => isSeatPiece(d) && (!d.locked || unlockable.has(d.id)))) return null;
  const host = content.buildings.some(
    (b) => (b.host?.seats ?? 0) > 0 && (!b.requires?.rank || RANKS.indexOf(b.requires.rank) <= at),
  );
  return host ? null : `no seat piece or host is open to a ${rank} town`;
}

/** A piece grown-ups can sit on and that is not a festival's temporary. */
function isSeatPiece(d: DecorDef): boolean {
  return (d.seats ?? 0) > 0 && !d.childSeats && !d.festival;
}

/** Seat pieces this town may place now. */
function seatPieces(state: WorldState): DecorDef[] {
  return content.decor.filter(
    (d) => isSeatPiece(d) && (!d.locked || !isStandard(state) || state.hearth.unlocked.includes(d.id)),
  );
}

const manhattan = (a: number, b: number): number =>
  Math.abs((a % MAP_SIZE) - (b % MAP_SIZE)) + Math.abs(Math.floor(a / MAP_SIZE) - Math.floor(b / MAP_SIZE));

/** Tiles within `radius` (Manhattan, as places measure) of `tile`. */
function tilesWithin(tile: number, radius: number): number[] {
  const cx = tile % MAP_SIZE;
  const cz = Math.floor(tile / MAP_SIZE);
  const out: number[] = [];
  for (let z = Math.max(0, cz - radius); z <= Math.min(MAP_SIZE - 1, cz + radius); z++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(MAP_SIZE - 1, cx + radius); x++)
      if (Math.abs(x - cx) + Math.abs(z - cz) <= radius) out.push(z * MAP_SIZE + x);
  return out;
}

/** True when some seat piece the town has could be placed on a tile within `radius` of `tile`. */
function seatFitsNear(state: WorldState, tile: number, radius: number): boolean {
  const reader = worldIndex(state).reader;
  const tiles = tilesWithin(tile, radius);
  for (const def of seatPieces(state))
    for (const t of tiles) {
      const x = t % MAP_SIZE;
      const z = (t - x) / MAP_SIZE;
      if (canPlaceDecor(reader, def, x * TILE_FP + TILE_FP / 2, z * TILE_FP + TILE_FP / 2, 0).ok) return true;
    }
  return false;
}

/** True when a Treats outlet could come to stand within `radius` of the tile (see gapClosable). */
function outletCouldStandNear(state: WorldState, tile: number, radius: number): boolean {
  const reader = worldIndex(state).reader;
  const tiles = tilesWithin(tile, radius);
  const shops = content.zoneById.get('shops');
  const shopsOpen = !!shops && (!shops.requires?.rank || rankAtLeast(state, shops.requires.rank));
  // A shops lot already cut and still empty near the place.
  if (shops && shopsOpen) {
    for (const l of state.lots) {
      if (l.kind === 'garden' || l.buildingId || l.zone !== shops.layerValue) continue;
      if (manhattan(l.z * MAP_SIZE + l.x, tile) <= radius) return true;
    }
  }
  // A stall (any hand-placed outlet host) that could stand within reach.
  for (const def of content.buildings) {
    if (!def.tags?.includes('outlet') || !def.host || !placeableNow(state, def)) continue;
    for (const t of tiles)
      for (const rot of [0, 1, 2, 3] as const)
        if (canPlaceBuilding(reader, def, t % MAP_SIZE, Math.floor(t / MAP_SIZE), rot).ok) return true;
  }
  // A tile where the shops zone could be painted: free ground beside a road, with the zone open.
  if (shopsOpen) {
    for (const t of tiles) {
      const x = t % MAP_SIZE;
      const z = (t - x) / MAP_SIZE;
      if (state.map.road[t] || state.map.occupant[t] || reader.water(x, z) || !reader.parcelUnlocked(x, z))
        continue;
      const beside = [t - 1, t + 1, t - MAP_SIZE, t + MAP_SIZE];
      if (beside.some((n) => n >= 0 && n < MAP_SIZE * MAP_SIZE && state.map.road[n])) return true;
    }
  }
  return false;
}

/**
 * Whether some command could close an open gap. Per kind (the R2 table in 19-evenings.md, Gaps):
 * - nothingToSell (subject a PlaceId): an outlet already within reach of the place (its shelf can be
 *   stocked), or one that could stand within `serveRadius`: an empty shops lot, a stall that fits, a
 *   free tile by a road where the zone could be painted. A place that is gone is no dead end.
 * - nobodyPasses (subject `building:<id>`): a place already within `placeNearShopRadius` of the door
 *   (it can be improved), or an unlocked seat piece that fits within that radius of the door.
 * - nowhereToGo (subject `street:<id>`): a place already within `PLACES.radius` of the street, or a
 *   seat piece that fits within that radius of its anchor.
 * - shortOfSupplies: R3A's rule (supplies' supplyGapClosable).
 * Any later kind is never flagged: true.
 */
export function gapClosable(state: WorldState, gap: Gap): boolean {
  const p = content.places;
  if (gap.kind === 'nothingToSell') {
    const place = placeIndex(state).byId.get(gap.subject);
    if (!place) return true;
    return place.outlets.length > 0 || outletCouldStandNear(state, place.tile, p.serveRadius);
  }
  if (gap.kind === 'nobodyPasses') {
    const id = Number(gap.subject.replace(/^building:/, ''));
    const shop = state.buildings.find((b) => b.id === id);
    if (!shop) return true;
    const door = doorFront(shop);
    if (placeIndex(state).places.some((pl) => manhattan(pl.tile, door) <= p.placeNearShopRadius)) return true;
    return seatFitsNear(state, door, p.placeNearShopRadius);
  }
  // R3.0: the fourth gap's own rule (R3A).
  if (gap.kind === 'shortOfSupplies') return supplyGapClosable(state, gap);
  if (gap.kind === 'nowhereToGo') {
    const id = Number(gap.subject.replace(/^street:/, ''));
    const street = state.streets.find((s) => s.id === id);
    if (!street) return true;
    if (placeIndex(state).places.some((pl) => manhattan(pl.tile, street.anchor) <= p.radius)) return true;
    return seatFitsNear(state, street.anchor, p.radius);
  }
  return true;
}
