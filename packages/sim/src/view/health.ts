// Health checks (playtest round three): things that should be true at every stage of a game, so a
// town that quietly stops working is noticed by a test, the autoplayer or a developer, not by two
// players wondering why nothing gets built. Read-only and outside the simulation: the watcher keeps
// what it has seen in its own memory, never in state, so it changes nothing and hashes nothing.
import { type BuildingDef, content, type PlacementRule, type ProductionMethod } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  DEMAND_KINDS,
  FESTIVAL,
  MAP_SIZE,
  ResidentFlags,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../constants';
import type { Building, WorldState } from '../contracts';
import { Road, TREE_MATURE, treeStage } from '../map/layers';
import { entranceTiles, footprintSize } from '../rules/footprint';
import { canPlantTree } from '../rules/tree';
import { worldIndex } from '../state/worldIndex';
import { townReachesDoor } from '../state/reach';
import { rankAtLeast } from '../state/village';
import { familyIndex, methodOf } from '../state/zones';
import { isStandard } from '../state/hamlet';
import { carrierCovers, passClosed } from '../systems/carrier/api';
import { hourOf, isBuildTime } from '../systems/economy/time';
import { currentPlan, isFestivalDay } from '../systems/festivals/api';
import { achievable } from '../systems/hearth/wishes/achievable';
import { seasonNow } from '../systems/seasons/api';
import { MAX_BUILDERS_PER_SITE } from '../systems/construction';
import { available } from '../systems/logistics/tasks';
import { allowedWork } from '../systems/production/status';
import { townStock } from './hamlet';

export type HealthKind =
  /** Every material in, no progress for a long time. */
  | 'site-stalled'
  /** Nobody from the town can walk to the site's door. */
  | 'site-cut-off'
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
  /** A waiting story step's goal cannot be met by anything the town can do, for a whole day. */
  | 'story-dead-end'
  /** A festival plan that was current on the festival day and never started. */
  | 'festival-no-show';

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
  /** Good index → tick a standing order was first seen below its min. */

  check(state: WorldState): HealthIssue[] {
    if (!isStandard(state)) return [];
    const out: HealthIssue[] = [];
    const now = state.tick;
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
    return out;
  }

  /**
   * site-unsupplied: a site waits on a good with none in town stock, and nothing will bring it:
   * no built maker (a rising maker counts only when its own site is not waiting on that same good),
   * and the carrier cannot or did not (its family is on Never, no neighbor sells it, or it bought
   * none over the days the site has waited).
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
          const price = state.market.prices[g] ?? content.goods[g]!.basePrice;
          if (state.economy.treasury < need * price * 2) return;
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
      if (state.lots.some((l) => !l.buildingId && values.includes(l.zone))) return;
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
