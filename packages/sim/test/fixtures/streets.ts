// R2F: a Village with a small street grid, grown for real with the full sim (docs/build/cycle-r2f-street-lots.md,
// acceptance). The village fixture's street B (z=70) gets three streets that close a block of Townhouses
// south of it (x 66 to 84, z 70 to 80), a parade of Shops north of it (x 70 to 83, z 60 to 69), the storehouses
// are stocked and the treasury is full, so builders have what they need. `growStreets` runs the clock.
import { content } from '@qoti/content';
import { growLot } from '../../src/systems/growth/api';
import { growable, tradesOf } from '../../src/systems/growth';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Lot, WorldState } from '../../src/contracts';
import { advanceTo, createTickCtx } from '../../src/turn';
import { paintZone, zoneNow } from '../growth/helpers';
import { closedBlockRoads } from '../r2f/helpers';
import { villageFixture, type VillageFixture } from './village';

/** The town, its street zones painted and cut, its stores stocked. */
export function streetsFixture(): VillageFixture {
  const f = villageFixture();
  const s = f.state;
  closedBlockRoads(s);
  paintZone(s, 'homes-medium', [67, 71, 83, 79]);
  paintZone(s, 'shops', [70, 60, 83, 69]);
  stockStores(s);
  zoneNow(s);
  return f;
}

/** Plenty of every good in every storehouse, so building never waits on materials. */
export function stockStores(s: WorldState): void {
  for (const b of s.buildings) {
    if (b.def !== 'storehouse' || !b.rt) continue;
    for (let g = 0; g < content.goods.length; g++) b.rt.store[g] = Math.max(b.rt.store[g] ?? 0, 400);
  }
}

/** Runs the full sim `days` days (restocking each morning); returns the world's tick. */
export function growStreets(f: VillageFixture, days: number): number {
  const s = f.state;
  const ctx = createTickCtx(s);
  const end = s.tick + days * TICKS_PER_DAY;
  let nextStock = s.tick;
  while (s.tick < end) {
    if (s.tick >= nextStock) {
      stockStores(s);
      nextStock += TICKS_PER_DAY;
    }
    advanceTo(s, s.lastTurn + 1, ctx);
  }
  return s.tick;
}

/**
 * The row lots that wait their turn, as growth sees them (systems/growth rowWaits): in a row with no
 * building, all but its corner lot (else its first); in a row going up, every lot touching no built one.
 */
function waiting(s: WorldState): Set<number> {
  const waits = new Set<number>();
  const rows = new Map<number, Lot[]>();
  for (const l of s.lots) {
    if (l.kind !== 'plot' || !l.row) continue;
    let list = rows.get(l.row);
    if (!list) rows.set(l.row, (list = []));
    list.push(l);
  }
  const at = (l: Lot): number => (l.rot % 2 === 0 ? l.x : l.z);
  const len = (l: Lot): number => (l.rot % 2 === 0 ? l.w : l.d);
  for (const list of rows.values()) {
    list.sort((p, q) => at(p) - at(q) || p.id - q.id);
    const built = list.some((l) => l.buildingId);
    const start = list.find((l) => l.corner) ?? list[0]!;
    list.forEach((l, k) => {
      if (l.buildingId) return;
      if (!built) {
        if (l !== start) waits.add(l.id);
        return;
      }
      const prev = list[k - 1];
      const next = list[k + 1];
      const joins =
        (prev?.buildingId && at(prev) + len(prev) === at(l)) ||
        (next?.buildingId && at(l) + len(l) === at(next));
      if (!joins) waits.add(l.id);
    });
  }
  return waits;
}

/** Grows one building on the empty lot growth would offer first (rows fill from an end); false when none takes one. */
export function growNext(s: WorldState): boolean {
  const waits = waiting(s);
  const lots = s.lots
    .filter((l) => l.kind !== 'garden' && !l.buildingId && s.map.road[l.frontage])
    .sort(
      (p, q) =>
        Number(waits.has(p.id)) - Number(waits.has(q.id)) || q.desirability - p.desirability || p.id - q.id,
    );
  for (const lot of lots) {
    const zone = content.zoneByValue.get(lot.zone)?.id;
    if (!zone) continue;
    for (const def of growable(s, zone)) if (growLot(s, null, lot.id, def.id)) return true;
    for (const trade of tradesOf(s, zone))
      if (growLot(s, null, lot.id, trade.building, undefined, trade.id)) return true;
  }
  return false;
}

/**
 * Real growth fills these streets slowly (a Village's demand asks for a building every few days), so after
 * the sim has run `days` days on its own, `fill` more days run with `perDay` lots grown each morning in the
 * order growth would offer them. Returns how many were grown by hand.
 */
export function growStreetsFilled(f: VillageFixture, days: number, fill: number, perDay: number): number {
  growStreets(f, days);
  let by = 0;
  for (let d = 0; d < fill; d++) {
    for (let k = 0; k < perDay; k++) if (growNext(f.state)) by++;
    growStreets(f, 1);
  }
  return by;
}
