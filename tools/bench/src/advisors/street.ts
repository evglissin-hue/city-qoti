// The street advisor (C4B, ported in C5.0): the first morning at Village rank the Ledger lays a high
// street off the lanes and zones it; after that, another street once the zoned homes are all taken
// and families still want to come, and a storehouse at the far end once porters cannot reach the
// lots there.
import { content } from '@qoti/content';
import { growthDemand, townStock, Zone } from '@qoti/sim';
import { MONEY_RESERVE, type Planner } from '../planner';
import { G } from '../town';
import { planHighStreet, promoteToVillage, storehouseSpot, unreachedLots, zoneHighStreet } from '../village';
import type { Advisor, AdvisorDef } from './types';

class Street implements Advisor {
  /** Streets laid and zoned so far (the high street first). */
  private streets = 0;

  constructor(readonly p: Planner) {}

  /** The Village chapter: the Ledger lays a high street off the lanes and zones it. */
  rankUp(): void {
    const p = this.p;
    promoteToVillage(p.w);
    const street = planHighStreet(p.w);
    if (!street) {
      p.actions.push('no room for a high street');
      return;
    }
    if (!p.do('lay the high street', [{ t: 'road.paint', kind: 'lane', tiles: street.tiles }])) return;
    p.street = street;
    this.streets = 1;
    p.do('zone the high street', zoneHighStreet(p.w, street));
  }

  /**
   * C4X: another street once the zoned homes are all taken and families still want to come (a
   * Village with one street stopped growing homes on day 46 with demand for five every night).
   */
  private nextStreet(): void {
    const p = this.p;
    const w = p.w;
    if (!p.street || this.streets >= 4 || p.coins() < 80) return;
    const homes: number[] = [Zone.homesLow, Zone.homesMedium];
    if (w.lots.some((l) => !l.buildingId && homes.includes(l.zone))) return;
    if (growthDemand(w).homes <= 0) return;
    const street = planHighStreet(w);
    if (!street || !p.do('lay another street', [{ t: 'road.paint', kind: 'lane', tiles: street.tiles }]))
      return;
    this.streets++;
    p.do('zone the street', zoneHighStreet(w, street));
  }

  /** The Ledger's Village chores: a storehouse at the far end once porters cannot reach the lots there. */
  visit(): void {
    const p = this.p;
    const w = p.w;
    this.nextStreet();
    // C4X: whatever the storehouses elsewhere (it used to stop at three, and a town with more
    // storehouses never reached its own high street), one site at a time.
    const building = w.buildings.some((b) => b.def === 'storehouse' && b.stage === 'construction');
    if (!p.street || unreachedLots(w) < 2 || building) return;
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
  slot: 20,
  plays: () => true,
  create: (p) => new Street(p),
};
