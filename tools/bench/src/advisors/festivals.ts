// The festivals advisor (C5B): the two players' festival, the dock and the commissions.
// - Planning: from day 1 of each season it plans the festival: the best pattern site standing (the
//   one with the most residents in reach), else open ground near the Town Hall; up to four menu goods
//   from what is in stock (never the town's last food: the menu takes at most a unit a resident,
//   from what is over MENU_RESERVE_DAYS of eating and, from autumn, the winter ahead); a twist
//   that is not the last one, the one whose goal is likeliest; music from a musician if there is one.
//   On day 6 morning the plan is made again from the day's stock, so a menu planned in a good week
//   never takes what a lean one needs.
// - Pieces: on the festival's eve and morning the Hearth puts up the festival's own pieces (a few,
//   each different) on the site; they come down by themselves the morning after.
// - Wants: a River Dock once the rank, renown and the river allow and the town has sixty
//   residents. It waits for timber to spare (twice its timber over the planner's reserve), so the
//   high street's homes come first. R1.0: no pie shop (pies wait for R3) and no dock orders (the
//   carrier sails the boat by its own rules).
// - Commissions: accepts an offer the town can meet now from its surplus, or a building it will put
//   up anyway (the dock); declines the rest so the list stays tidy (all of them in runs that do not
//   play the Village).
// - Market day 3 once the market opens. The wants and the market day play only in runs that play
//   the Village (`village`), like the village advisor. It never builds by itself: wants go to the
//   planner.
import { content } from '@qoti/content';
import {
  availableInTown,
  calendar,
  currentPlan,
  FESTIVAL_SITE_MIN,
  inReach,
  isFrozen,
  larder,
  MAP_SIZE,
  musicianFor,
  openGround,
  patternRect,
  rankAtLeast,
  siteRect,
  TILE_FP,
  winterDaysAhead,
  type Command,
  type FestivalSite,
  type Rect,
  type WorldState,
} from '@qoti/sim';
import { costOf, TIMBER_RESERVE, type Planner } from '../planner';
import { count, FOODS, G } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Days of food a resident the menu always leaves in store. */
export const MENU_RESERVE_DAYS = 6;
/** C5X part 2: days of eating kept back from a spring or summer menu. */
export const MENU_SPRING_DAYS = 3;
/** Pieces the Hearth puts up for a festival. */
export const PIECES = 3;
const TREATS = ['cider', 'cheese', 'candles', 'honey'];

/** Units of a good free in town now. */
function free(w: WorldState, id: string): number {
  return availableInTown(w, G(id));
}

class Festivals implements Advisor {
  /** Village wants (the pie shop, the dock, its orders, market day) only in runs that play the Village. */
  constructor(
    readonly p: Planner,
    readonly village: boolean,
  ) {}

  private get w(): WorldState {
    return this.p.w;
  }

  visit(v: Visit): void {
    const w = this.w;
    const { day } = calendar(w.tick);
    if (!v.afternoon) {
      if (!currentPlan(w) || day === 6) this.plan();
      this.commissions();
      if (this.village) this.wants();
      if (this.village && rankAtLeast(w, 'village') && !w.levers.marketDay) {
        this.p.do('market day on day 3', [{ t: 'ledger.setMarketDay', day: 3 }]);
      }
    } else if (day >= 5) {
      this.pieces();
    }
  }

  /** The site: the pattern site with the most residents in reach, else open ground by the Town Hall. */
  private site(): FestivalSite | null {
    const w = this.w;
    let best: FestivalSite | null = null;
    let bestN = -1;
    for (const s of w.hearth.sites) {
      const r = patternRect(w, s);
      const n = inReach(w, r).length;
      if (n > bestN) {
        best = { pattern: s.pattern, anchor: s.anchor };
        bestN = n;
      }
    }
    if (best) return best;
    const hall = w.buildings.find((b) => b.def === 'town-hall');
    const cx = hall ? hall.x + 2 : MAP_SIZE >> 1;
    const cz = hall ? hall.z + 2 : MAP_SIZE >> 1;
    const n = FESTIVAL_SITE_MIN;
    for (let k = 4; k <= 30; k++) {
      for (let dz = -k; dz <= k; dz++) {
        for (let dx = -k; dx <= k; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== k) continue;
          const x0 = cx + dx;
          const z0 = cz + dz;
          const r: Rect = [x0, z0, x0 + n - 1, z0 + n - 1];
          if (x0 < 1 || z0 < 1 || r[2] >= MAP_SIZE - 1 || r[3] >= MAP_SIZE - 1) continue;
          if (openGround(w, r) !== null || zoned(w, r)) continue;
          return { rect: r };
        }
      }
    }
    return null;
  }

  /** Up to four goods from stock above the reserve, a unit a resident at most, foods first. */
  private menu(): [string, number][] {
    const w = this.w;
    const pop = w.residents.length;
    let food = 0;
    for (const g of FOODS) food += availableInTown(w, g);
    // Never the town's last food: MENU_RESERVE_DAYS of eating and a little more stay in store, and
    // from autumn to the thaw the days left of winter too.
    // Before winter the larder must also see the town through to the thaw.
    const winter = winterDaysAhead(w);
    // C5X part 2: out of winter three days a head are enough to keep back (a growing Village never
    // held six in its storehouses, so willow's spring and summer tables stayed empty).
    const keep = winter > 0 ? MENU_RESERVE_DAYS + winter : MENU_SPRING_DAYS;
    let spare = Math.max(0, food - pop * keep - 8);
    if (winter > 0) spare = Math.min(spare, Math.max(0, larder(w) - pop * (MENU_RESERVE_DAYS + winter) - 8));
    const out: [string, number][] = [];
    let units = 0;
    const want = pop;
    const offer = (id: string, isFood: boolean) => {
      if (out.length >= 4 || units >= want || out.some(([g]) => g === id)) return;
      const have = free(w, id);
      const q = Math.min(have, want - units, isFood ? spare : have, Math.max(4, Math.ceil(want / 3)));
      if (q < 2) return;
      out.push([id, q]);
      units += q;
      if (isFood) spare -= q;
    };
    for (const id of TREATS) offer(id, content.goodById.get(id)?.family === 'food');
    const foods = FOODS.map((g) => content.goods[g]!.id).sort((a, b) => free(w, b) - free(w, a));
    for (const id of foods) offer(id, true);
    return out;
  }

  private twist(menu: readonly [string, number][]): string {
    const w = this.w;
    const { season } = calendar(w.tick);
    const last = w.festival.history[w.festival.history.length - 1]?.twist ?? '';
    const ok = content.twists.filter((t) => t.id !== last && (!t.seasons || t.seasons.includes(season)));
    // R1: no Pie Contest (pies wait for a master baker, R3; the twist is offered in no season).
    const veg = menu.find(([g]) => g === 'vegetables')?.[1] ?? 0;
    const pick =
      ok.find((t) => t.id === 'harvest-display' && veg >= 12) ??
      ok.find((t) => t.id === 'snow-sculptures') ??
      ok.find((t) => t.id === 'costume-parade' && free(w, 'cloth') >= 8) ??
      ok[0];
    return pick?.id ?? '';
  }

  private plan(): void {
    const w = this.w;
    const site = this.site();
    if (!site) return;
    const menu = this.menu();
    const cmd: Command = {
      t: 'festival.plan',
      site,
      menu,
      twist: this.twist(menu),
      music: musicianFor(w) ? 'resident' : 'none',
    };
    this.p.do(`plan the festival (${menu.map(([g, q]) => `${q} ${g}`).join(', ') || 'no menu'})`, [cmd], 1);
  }

  /** The festival's own pieces on the site, each different. */
  private pieces(): void {
    const w = this.w;
    const plan = currentPlan(w);
    const rect = plan ? siteRect(w, plan.site) : null;
    if (!plan || !rect) return;
    const def = content.festivalById.get(plan.festival);
    const { season } = calendar(w.tick);
    const want = (def?.pieces ?? []).filter((id) => id !== 'bonfire' || season >= 2);
    const have = new Set(w.decor.filter((d) => w.festival.pieces.includes(d.id)).map((d) => d.def));
    if (have.size >= PIECES) return;
    const cx = (rect[0] + rect[2]) >> 1;
    const cz = (rect[1] + rect[3]) >> 1;
    const inside = (fx: number, fz: number) => {
      const x = Math.floor(fx / TILE_FP);
      const z = Math.floor(fz / TILE_FP);
      return x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3];
    };
    for (const id of want) {
      if (have.size >= PIECES || have.has(id)) continue;
      const d = content.decorById.get(id);
      if (!d || d.linear) continue;
      const at = this.p.decorSpot(id, cx, cz, 4, inside);
      if (!at) continue;
      if (
        this.p.do(`${id} for the festival`, [{ t: 'decor.place', def: id, fx: at[0], fz: at[1], rot: 0 }], 1)
      ) {
        have.add(id);
      }
    }
  }

  private commissions(): void {
    const w = this.w;
    const pop = w.residents.length;
    for (const c of w.commissions.list) {
      if (c.status !== 'offered') continue;
      const def = content.commissionById.get(c.def);
      if (!def) continue;
      let meet: boolean;
      if (!this.village) {
        meet = false;
      } else if ('goods' in def.ask) {
        // Only from a real surplus: food over the reserve, timber twice over and the timber reserve,
        // anything else twice over (the town keeps using what it makes).
        meet = def.ask.goods.every(([g, q]) => {
          if (content.goodById.get(g)?.family === 'food')
            return free(w, g) >= q + pop * (this.p.foodReserveDays + 1);
          return free(w, g) >= 2 * q + (TIMBER_RESERVE.get(g) ?? 0);
        });
      } else {
        meet = def.builds === 'river-dock' && this.wantsDock();
      }
      this.p.do(`${meet ? 'accept' : 'decline'} ${def.id}`, [
        { t: meet ? 'commission.accept' : 'commission.decline', id: c.id },
      ]);
    }
  }

  /** Timber for `def` twice over and the planner's timber reserve to spare. */
  private timberFor(def: string): boolean {
    const timber = content.buildingById.get(def)?.cost?.goods?.find(([g]) => g === 'timber')?.[1] ?? 0;
    return free(this.w, 'timber') >= 2 * timber + (TIMBER_RESERVE.get('timber') ?? 0);
  }

  /** The players would build a River Dock now. */
  private wantsDock(): boolean {
    const w = this.w;
    return (
      count(w, 'river-dock') === 0 &&
      this.dockAllowed() &&
      this.timberFor('river-dock') &&
      w.residents.length >= 60
    );
  }

  private dockAllowed(): boolean {
    const w = this.w;
    const def = content.buildingById.get('river-dock')!;
    return rankAtLeast(w, 'village') && w.renown.level >= (def.requires?.renown ?? 0) && !isFrozen(w);
  }

  private wants(): void {
    const p = this.p;
    const w = this.w;
    if (!rankAtLeast(w, 'village')) return;
    // The River Dock, when the river and renown allow (R1: the carrier sails the boat by its own
    // rules; there are no dock orders to set). It waits for comfortable timber: homes come first.
    if (this.wantsDock()) {
      p.propose({
        def: 'river-dock',
        priority: 2,
        cost: costOf('river-dock', 10),
        pressing: false,
        essential: false,
      });
    }
  }
}

/** True when any tile of the rect is zoned (a thoughtful Hearth leaves lots to grow). */
function zoned(w: WorldState, r: Rect): boolean {
  for (let z = r[1]; z <= r[3]; z++)
    for (let x = r[0]; x <= r[2]; x++) if (w.map.zone[z * MAP_SIZE + x]) return true;
  return false;
}

export const festivals: AdvisorDef = {
  id: 'festivals',
  lane: 'both',
  // After the seasons (55), with the Hearth's decor (60).
  slot: 58,
  plays: (_opts, w) => w.settings.mode === 'standard' && content.festivals.length > 0,
  create: (p, opts) => new Festivals(p, !!opts?.village),
};
