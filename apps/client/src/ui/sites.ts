// P2 (the R1 playtest): what the town's open construction sites still wait for, read from the
// Mirror. The owner could not see from the screen that building waited on timber; the top bar's
// Materials chip and the Ledger's feed both read this one count.
import { BuildingStatus, type EntityId } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

export interface SiteGood {
  good: string;
  /** Units open sites still need delivered. */
  need: number;
  /** Units in the town's stores (0 until the first stocks report). */
  stock: number;
}

export interface SitesReading {
  /** Construction sites standing, paused ones included. */
  open: number;
  /** Sites whose status says they wait for materials, lowest id first. */
  waitingMaterials: EntityId[];
  /** Sites whose status says they wait for a builder, lowest id first. */
  waitingBuilders: EntityId[];
  /** Goods the sites still need, the largest shortfall (need beyond stock) first, then by good id. */
  goods: SiteGood[];
  /** Units still needed over every good, and how much of that the stores could cover today. */
  need: number;
  covered: number;
}

export function readSites(m: Mirror): SitesReading {
  const stockOf = new Map((m.stocks.value?.lines ?? []).map((l) => [l.good, l.stock]));
  const needOf = new Map<string, number>();
  const waitingMaterials: EntityId[] = [];
  const waitingBuilders: EntityId[] = [];
  let open = 0;
  for (const b of m.buildings.values()) {
    if (b.stage !== 'construction') continue;
    open++;
    const bits = b.rt?.status ?? 0;
    if (bits & BuildingStatus.paused) continue;
    if (bits & BuildingStatus.waitingMaterials) waitingMaterials.push(b.id);
    if (bits & BuildingStatus.waitingBuilders) waitingBuilders.push(b.id);
    const c = b.rt?.construction;
    if (!c) continue;
    // A site's `needs` are what is still to come: deliveries are taken off them as they land.
    for (const [good, left] of c.needs) {
      if (left > 0) needOf.set(good, (needOf.get(good) ?? 0) + left);
    }
  }
  const goods: SiteGood[] = [...needOf].map(([good, need]) => ({
    good,
    need,
    stock: stockOf.get(good) ?? 0,
  }));
  const shortfall = (g: SiteGood) => Math.max(0, g.need - g.stock);
  goods.sort((a, b) => shortfall(b) - shortfall(a) || (a.good < b.good ? -1 : a.good > b.good ? 1 : 0));
  waitingMaterials.sort((a, b) => a - b);
  waitingBuilders.sort((a, b) => a - b);
  let need = 0;
  let covered = 0;
  for (const g of goods) {
    need += g.need;
    covered += Math.min(g.need, g.stock);
  }
  return { open, waitingMaterials, waitingBuilders, goods, need, covered };
}
