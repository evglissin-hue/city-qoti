// The together advisor (C4D, ported in C5.0): at 15:00 the two seats work together. The Hearth
// (seat 1) claims the Charter once it is ready, asks the Ledger for food at the stall with a request
// (it closes itself when the porters deliver), sketches lanterns and flowers as a plan that the
// Ledger approves on its next visit, and both keep an eye on the story characters' hints (a lantern
// by their door, a seat and flowers by the market, Pippa's sawpit by the river).
import { content } from '@qoti/content';
import {
  findById,
  MAP_SIZE,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  townStock,
  type Building,
  type Command,
  type WorldState,
} from '@qoti/sim';
import type { Planner } from '../planner';
import { FOODS, idx } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

class Together implements Advisor {
  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  visit(v: Visit): void {
    if (!v.afternoon) return;
    const w = this.w;
    if (w.charter.ready) this.p.do('claim the Charter', [{ t: 'charter.claim' }], 1);
    this.request();
    this.plans();
    this.inventor();
    this.partners();
  }

  /**
   * Odette's partnership letter: a pattern site with pieces from each of you. The seat that has not
   * yet touched a site sets a bench by it (a seat joins most of the Pattern Book's places).
   */
  private partners(): void {
    const w = this.w;
    const s = w.stories.find((x) => x.arc === 'merchant');
    const step = s && s.step >= 0 ? content.storyById.get('merchant')?.steps[s.step] : undefined;
    if (!step || !('count' in step.goal) || step.goal.count.what !== 'togetherSites') return;
    if (w.hearth.sites.some((x) => x.seats.length >= 2)) return;
    for (const site of w.hearth.sites) {
      const other: 0 | 1 = site.seats.includes(0) ? 1 : 0;
      const ax = site.anchor % MAP_SIZE;
      const az = Math.floor(site.anchor / MAP_SIZE);
      const spot = this.p.decorSpot('bench', ax, az, 2);
      if (!spot) continue;
      this.p.do(
        'a bench for the partnership',
        [{ t: 'decor.place', def: 'bench', fx: spot[0], fz: spot[1], rot: 0 }],
        other,
      );
      return;
    }
  }

  /** Pippa's river letter: a sawpit within three tiles of the water. */
  private inventor(): void {
    const w = this.w;
    const s = w.stories.find((x) => x.arc === 'inventor');
    const step = s && s.step >= 0 ? content.storyById.get('inventor')?.steps[s.step] : undefined;
    if (!step || !('count' in step.goal) || step.goal.count.what !== 'byWater') return;
    // Within three steps of the footprint, corners rounded, as the goal counts it.
    const wet = (x: number, z: number, wd: number, d: number) => {
      for (let tz = z - 3; tz < z + d + 3; tz++) {
        for (let tx = x - 3; tx < x + wd + 3; tx++) {
          const gx = Math.max(0, x - tx, tx - (x + wd - 1));
          const gz = Math.max(0, z - tz, tz - (z + d - 1));
          if (gx * gx + gz * gz <= 12 && w.map.water[idx(tx, tz)]) return true;
        }
      }
      return false;
    };
    const turned = (b: Building) => (b.rot % 2 === 0 ? [2, 3] : [3, 2]) as [number, number];
    if (w.buildings.some((b) => b.def === 'sawpit' && wet(b.x, b.z, ...turned(b)))) return;
    if (this.p.coins() < 60) return;
    this.p.build('sawpit', wet);
  }

  /** The Hearth asks for food at the first stall; withdraws a request nobody could meet in a week. */
  private request(): void {
    const w = this.w;
    const today = Math.floor((w.tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
    for (const r of w.requests) {
      if (r.status === 'open' && w.tick - r.tick > 7 * TICKS_PER_DAY) {
        this.p.do('withdraw a request', [{ t: 'request.resolve', id: r.id, status: 'withdrawn' }]);
      }
    }
    if (w.requests.some((r) => r.status === 'open')) return;
    const stall = w.buildings.find((b) => b.def === 'market-stall' && b.stage === 'built');
    if (!stall?.rt) return;
    let best = -1;
    for (const g of FOODS) if (best < 0 || townStock(w)[g]! > townStock(w)[best]!) best = g;
    if (best < 0) return;
    const qty = Math.min(20, Math.max(6, (stall.rt.store[best] ?? 0) + 2));
    const ask = {
      kind: 'goods' as const,
      good: content.goods[best]!.id,
      qty,
      byDay: today + 3,
      at: stall.id,
    };
    this.p.do(`ask for ${qty} ${ask.good}`, [{ t: 'request.add', ask }]);
  }

  /**
   * Plans: the Ledger approves what the Hearth sketched last time; the Hearth reads each story
   * character's open step and sketches what it asks for: lanterns by their door, flowers and a tree
   * when the lane wants charm, a seat and flowers by the market stall.
   */
  private plans(): void {
    const w = this.w;
    for (const p of w.plans) {
      if (p.status === 'open' && p.by === 0)
        this.p.do(`approve ${p.name}`, [{ t: 'plan.approve', id: p.id }], 1);
    }
    const items: Command[] = [];
    const add = (def: string, at: [number, number] | null) => {
      if (at) items.push({ t: 'decor.place', def, fx: at[0], fz: at[1], rot: 0 });
    };
    for (const s of w.stories) {
      const goal = s.step >= 0 ? content.storyById.get(s.arc)?.steps[s.step]?.goal : undefined;
      const r = goal && s.residentId ? findById(w.residents, s.residentId) : undefined;
      const home = r ? findById(w.buildings, findById(w.households, r.householdId)?.homeId ?? 0) : undefined;
      if (!goal || !home) continue;
      const wants = JSON.stringify(goal);
      if (wants.includes('"lantern"')) add('lantern', this.p.decorSpot('lantern', home.x, home.z, 3));
      if ('charm' in goal) {
        add('flower-bed', this.p.decorSpot('flower-bed', home.x, home.z, 3));
        add('cherry-tree', this.p.decorSpot('cherry-tree', home.x, home.z, 3));
      }
      const stall = wants.includes('nearestMarket')
        ? w.buildings.find((b) => b.def === 'market-stall' && b.stage === 'built')
        : undefined;
      if (stall) {
        add('bench', this.p.decorSpot('bench', stall.x, stall.z, 2));
        add('flower-bed', this.p.decorSpot('flower-bed', stall.x, stall.z, 2));
        add('flower-bed', this.p.decorSpot('flower-bed', stall.x, stall.z, 2));
      }
    }
    if (items.length > 0) {
      this.p.do('sketch a plan', [
        { t: 'plan.add', name: 'For our story folk', items: items.map((cmd) => ({ cmd })) },
      ]);
    }
  }
}

export const together: AdvisorDef = {
  id: 'together',
  slot: 70,
  plays: (opts) => opts.together !== false,
  create: (p) => new Together(p),
};
