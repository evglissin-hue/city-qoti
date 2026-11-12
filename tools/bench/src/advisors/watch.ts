// The Watch advisor (C5D): minds threats and the Watch for the Ledger. It never builds by itself;
// it proposes wants to the planner and pulls the Watch's levers.
// - At Village rank, a Watch House (a modest want that waits its turn in the build queue).
// - A modest Watch: up to four volunteers, and never more than the labor budget allows (a member
//   is away from work one day in four, so each spare hand covers four members), except two once a
//   raid is real (a pressing want may use the labor reserve, as the planner's do); a small stipend
//   (two coins a day) while the season pays its way.
// - Posture: the most valuable store's door (two members to a point, so they can hold it and
//   catch a raider), the next store's too with four members.
// - When a raid is telegraphed: a bell tower (it rings itself at dusk, so everyone goes indoors and
//   the gates shut), and a palisade ring with gates round the richest store, if the timber and coins
//   are there. During a raid (if a visit ever falls in one) it rings the bell and lights the lanterns.
// - Captured bandits are offered a home while one stands empty, else sent off.
import { content } from '@qoti/content';
import {
  canPaintWall,
  DUTY_EVERY,
  frontOf,
  heldValue,
  raidsPossible,
  rankAtLeast,
  threatView,
  vacantHomes,
  valuables,
  worldIndex,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { spareHands } from '../labor';
import { costOf, URGENT, type Planner } from '../planner';
import { G, S, sites } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** The most members the advisor asks for. */
export const WATCH_TARGET = 4;
/** The fewest members once a raid has been telegraphed (pressing: may use the labor reserve). */
export const WATCH_MIN = 2;
/** Coins a day for the stipend (half a coin each for four: a point of training a day). */
export const WATCH_BUDGET = 2;
/** Timber kept back when building a palisade ring (a Forester's Lodge must be rebuildable). */
const TIMBER_KEPT = 16;

function richest(w: WorldState): Building[] {
  return valuables(w)
    .map((b) => ({ b, v: heldValue(b) }))
    .sort((a, b) => b.v - a.v || a.b.id - b.b.id)
    .map((x) => x.b);
}

/** Tiles round a building's footprint at `r` tiles out (its door front inside the ring). */
function ringRound(b: Building, r: number): [number, number][] {
  const def = content.buildingById.get(b.def)!;
  const [w0, d0] = def.size;
  const w = b.rot % 2 === 0 ? w0 : d0;
  const d = b.rot % 2 === 0 ? d0 : w0;
  const x0 = b.x - r;
  const z0 = b.z - r;
  const x1 = b.x + w - 1 + r;
  const z1 = b.z + d - 1 + r;
  const out: [number, number][] = [];
  for (let x = x0; x <= x1; x++) out.push([x, z0], [x, z1]);
  for (let z = z0 + 1; z < z1; z++) out.push([x0, z], [x1, z]);
  return out.filter(([x, z]) => x > 0 && z > 0 && x < S - 1 && z < S - 1);
}

class Watch implements Advisor {
  /** The raid (its start tick) the advisor has already walled for. */
  private walledFor = -1;

  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  visit(_v: Visit): void {
    const w = this.w;
    if (!rankAtLeast(w, 'village') || !raidsPossible(w)) return;
    this.house();
    this.roster();
    this.posture();
    this.telegraphed();
    this.live();
    this.captives();
  }

  /** A raid has been telegraphed or has come: the threat is real, and the Watch is pressing. */
  private threatened(): boolean {
    const w = this.w;
    return w.threats.history.length > 0 || threatView(w).band !== null;
  }

  private house(): void {
    if (this.w.buildings.some((b) => b.def === 'watch-house')) return;
    const pressing = this.threatened();
    this.p.propose({
      def: 'watch-house',
      priority: pressing ? URGENT : 4,
      cost: costOf('watch-house'),
      pressing,
      // Once raids are real the Watch keeps the town going: it may spend the timber reserve.
      essential: pressing,
    });
  }

  private roster(): void {
    const w = this.w;
    if (!w.buildings.some((b) => b.def === 'watch-house' && b.stage === 'built')) return;
    // Each spare hand covers DUTY_EVERY members' duty days; keep the planner's reserve of one.
    // Once raids are real, two at least: two members cost the work of half a hand.
    const allowed = Math.max(0, spareHands(w) - 1) * DUTY_EVERY;
    const want = Math.min(WATCH_TARGET, Math.max(allowed, this.threatened() ? WATCH_MIN : 0));
    if (want !== w.watch.target) this.p.do(`watch target ${want}`, [{ t: 'watch.setTarget', size: want }]);
    // R1F: with some slack either way, so the budget is not switched with every day's balance (a
    // lever turned thirteen times in seventy days is a chore).
    const on = w.watch.budget > 0;
    const coins = (on ? this.p.coins() > 50 : this.p.seasonBalance() > 0 && this.p.coins() > 150)
      ? WATCH_BUDGET
      : 0;
    if (coins * 100 !== w.watch.budget) this.p.do(`watch budget ${coins}`, [{ t: 'watch.setBudget', coins }]);
  }

  private posture(): void {
    const w = this.w;
    // Two to a guard point: one store with up to three members, the second with four.
    const stores = richest(w).slice(0, w.watch.members.length >= 4 ? 2 : 1);
    const guards = stores.map((b) => {
      const t = frontOf(b);
      return [t % S, Math.floor(t / S)] as [number, number];
    });
    const now = w.watch.posture;
    // R1F: a posture stands until the guard count changes or a guard point no longer fronts a
    // store (it followed the richest store before, and moved with every day's stock).
    const fronts = new Set(richest(w).map((b) => frontOf(b)));
    if (guards.length === 0 || (now.length === guards.length && now.every((t) => fronts.has(t)))) return;
    this.p.do('watch posture', [{ t: 'watch.setPosture', guards }]);
  }

  private telegraphed(): void {
    const w = this.w;
    const view = threatView(w);
    const r = w.threats.scheduled;
    if (!r || view.band === null) return;
    // A bell tower rings itself when the raid comes.
    if (!w.buildings.some((b) => b.def === 'bell-tower'))
      this.p.propose({
        def: 'bell-tower',
        priority: Infinity,
        cost: costOf('bell-tower'),
        pressing: true,
        essential: false,
      });
    const start = r.telegraphTick;
    if (this.walledFor === start) return;
    const store = richest(w)[0];
    if (!store) return;
    const reader = worldIndex(w).reader;
    const gate = w.meta.valleyGate;
    for (const radius of [2, 3]) {
      const tiles = ringRound(store, radius).filter(
        ([x, z]) => canPaintWall(reader, 'palisade', [[x, z]], w.buildings, gate).ok,
      );
      const plan = canPaintWall(reader, 'palisade', tiles, w.buildings, gate);
      if (!plan.ok) continue;
      let coins = 0;
      let timber = 0;
      for (const [, , d] of plan.pieces) {
        const c = costOf(d);
        coins += c.coins;
        for (const [g, q] of c.goods) if (g === 'timber') timber += q;
      }
      const stockTimber = w.buildings.reduce((n, b) => n + (b.rt?.store[G('timber')] ?? 0), 0);
      if (this.p.coins() < coins + 40 || stockTimber < timber + TIMBER_KEPT || sites(w) > 6) return;
      if (this.p.do(`palisade round ${store.def}`, [{ t: 'wall.paint', def: 'palisade', tiles }]))
        this.walledFor = start;
      return;
    }
    this.walledFor = start;
  }

  private live(): void {
    const raid = this.w.raid;
    if (!raid) return;
    if (!raid.bell) this.p.do('ring the bell', [{ t: 'watch.ringBell' }]);
    if (!raid.lanterns) this.p.do('light the lanterns', [{ t: 'watch.lightLanterns' }]);
  }

  private captives(): void {
    const w = this.w;
    for (const id of [...w.threats.captives]) {
      const choice = vacantHomes(w).length > 0 ? 'home' : 'send';
      this.p.do(`bandit ${choice}`, [{ t: 'bandit.decide', id, choice }]);
    }
  }
}

export const watch: AdvisorDef = {
  id: 'watch',
  lane: 'ledger',
  slot: 45,
  // Threats and the Watch, once the content has a Watch House and the run turns the threat dial on.
  plays: (opts) =>
    !!opts.village && (opts.threat ?? 'peaceful') !== 'peaceful' && content.buildingById.has('watch-house'),
  create: (p) => new Watch(p),
};
