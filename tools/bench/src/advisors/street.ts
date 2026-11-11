// The street advisor (C4B, ported in C5.0): the Ledger lays a high street off the lanes and zones
// it; after that, another street once the zoned homes are all taken and families still want to
// come, and a storehouse at the far end once porters cannot reach the lots there.
// R1.0: Homes, Workshops and Farmland are open from founding, so the first street is laid and
// zoned on the first visit of a standard valley with those three; the first morning at Village
// rank another street adds shops and townhouses, as the high street did at Village rank before.
import { content } from '@qoti/content';
import { growthDemand, rankAtLeast, townStock, Zone } from '@qoti/sim';
import { MONEY_RESERVE, type Planner } from '../planner';
import { G } from '../town';
import { planHighStreet, promoteToVillage, storehouseSpot, unreachedLots, zoneHighStreet } from '../village';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Streets the Ledger lays at most, the high street included. */
const MAX_STREETS = 6;

class Street implements Advisor {
  /** Streets laid and zoned so far (the high street first). */
  private streets = 0;
  /** The Village's street (shops and townhouses) is laid. */
  private villageStreet = false;

  constructor(readonly p: Planner) {}

  /** Lays and zones a street off the lanes; the first becomes the high street. */
  private lay(label: string): boolean {
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
    if (village) this.villageStreet = true;
    p.do(`zone ${label}`, zoneHighStreet(p.w, street, village));
    return true;
  }

  /** The Village chapter: another street, with shops and townhouses now they are open. */
  rankUp(): void {
    promoteToVillage(this.p.w);
    if (this.streets < MAX_STREETS) this.lay('the village street');
  }

  /**
   * C4X: another street once the zoned homes are all taken and families still want to come (a
   * Village with one street stopped growing homes on day 46 with demand for five every night).
   * Playtest round five: up to six streets (four were all a town took before families came every
   * two hours; the faster town filled them by day 55 and stopped there).
   */
  private nextStreet(): void {
    const p = this.p;
    const w = p.w;
    if (!p.street || this.streets >= MAX_STREETS || p.coins() < 80) return;
    // Playtest round six: townhouse lots count as open only while there is brick to build them
    // (a street whose right side waited for bricks nobody made held back the next street for days).
    const homes: number[] = [Zone.homesLow];
    if (townStock(w)[G('brick')]! >= 10) homes.push(Zone.homesMedium);
    if (w.lots.some((l) => !l.buildingId && homes.includes(l.zone))) return;
    if (growthDemand(w).homes <= 0) return;
    this.lay('another street');
  }

  /** The Ledger's street chores: the first street, more streets, a storehouse for the far lots. */
  visit(v: Visit): void {
    const p = this.p;
    const w = p.w;
    // R1: zoned from the first day; a street refused (no coins yet, no room) is tried each morning.
    if (!p.street) {
      if (!v.afternoon && w.settings.mode === 'standard') this.lay('the high street');
      return;
    }
    // A Village whose rank-up morning found no room for its street tries again.
    if (!v.afternoon && rankAtLeast(w, 'village') && !this.villageStreet && this.streets < MAX_STREETS)
      this.lay('the village street');
    this.nextStreet();
    // C4X: whatever the storehouses elsewhere (it used to stop at three, and a town with more
    // storehouses never reached its own high street), one site at a time.
    const building = w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction');
    if (unreachedLots(w) < 2 || building) return;
    const def = content.buildingById.get('storehouse')!;
    if (p.coins() < (def.cost?.coins ?? 0) + MONEY_RESERVE) return;
    const stock = townStock(w);
    for (const [g, q] of def.cost?.goods ?? []) if (stock[G(g)]! < q) return;
    const at = storehouseSpot(w, p.street);
    // Raised to the front: the lots out there grow nothing until porters reach them.
    const site = at && p.buildAt('storehouse for the high street', 'storehouse', at[0], at[1], at[2]);
    if (site) p.do('raise the storehouse', [{ t: 'build.setPriority', id: site.id, priority: true }]);
  }
}

export const street: AdvisorDef = {
  id: 'street',
  lane: 'ledger',
  slot: 20,
  plays: () => true,
  create: (p) => new Street(p),
};
