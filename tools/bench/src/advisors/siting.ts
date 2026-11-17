// Siting helpers the village and places advisors share (R2E): where a service goes (near the homes
// it does not reach yet) and where a well goes (in reach of a door, clear of other wells).
import { content } from '@qoti/content';
import {
  calendar,
  canPlaceBuilding,
  doorTile,
  overdraftLimit,
  PENNIES_PER_COIN,
  serviceCoverage,
  townReachesDoor,
  townStock,
  worldIndex,
  type Building,
  type Rot4,
  type WorldState,
} from '@qoti/sim';
import { carrierBrings, costOf, importPrice, MONEY_RESERVE, VILLAGE_MARGIN, type Planner } from '../planner';
import { clearOfKind } from '../hamlet';
import { count, G } from '../town';

/**
 * R1X: a well within reach of the door that asked, and half a reach clear of every other well (the
 * sim's service-clustered check). It used to go wherever a well first fit from the town's middle,
 * so the far household's wish stayed open and the next one stood beside it: seven on one green.
 */
export function wellFor(p: Planner, hx: number, hz: number): Building | null {
  const r = content.buildingById.get('well')?.coverage?.find((c) => c.kind === 'water')?.radius ?? 8;
  const wells = p.w.buildings.filter((b) => b.def === 'well');
  const only = (x: number, z: number): boolean => {
    // The sim measures a well's reach from its corner tile to the door (residents/needs).
    if ((x - hx) * (x - hx) + (z - hz) * (z - hz) > (r - 1) * (r - 1)) return false;
    for (const o of wells) if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < (r * r) / 4) return false;
    return true;
  };
  return p.build('well', only);
}

/**
 * A service where it is missed: next to the home of the first household (by id) that the service
 * does not reach yet. At most one under way of each kind, and about one per thirty residents. (R1X:
 * the services are what Craftsfolk wait on, so a Village builds them on the County Bank's credit
 * when the treasury is short.)
 */
export function serveService(p: Planner, def: string, kind: 'social' | 'health'): boolean {
  const w: WorldState = p.w;
  if (w.buildings.some((b) => b.def === def && b.stage === 'construction')) return false;
  if (count(w, def) >= 1 + Math.floor(w.residents.length / 30)) return false;
  if (!p.staffs(def, true)) return false;
  const covered = serviceCoverage(w, kind).quality;
  const d = content.buildingById.get(def)!;
  const credit = overdraftLimit(w) / PENNIES_PER_COIN;
  // What the store lacks the carrier brings to the open site (a tavern's brick before any
  // Brickworks), at its markup.
  const stock = townStock(w);
  let imports = 0;
  for (const [g, q] of d.cost?.goods ?? []) {
    const short = q - stock[G(g)]!;
    if (short <= 0) continue;
    if (!carrierBrings(w, G(g))) return false;
    imports += short * importPrice(w, G(g));
  }
  if (p.coins() + credit < costOf(def, VILLAGE_MARGIN).coins + imports + MONEY_RESERVE) return false;
  // R2E: the carrier buys a site's Materials from coins in hand only, never on the bank's credit
  // (carrier/index.ts, settle), so the imports wait for coins in hand: elm's second tavern went up on
  // credit with 130 coins left, and its brick never came while the treasury paid for everything else.
  if (imports > 0 && p.coins() < 2 * imports + MONEY_RESERVE) return false;
  // R2E: nor from autumn's fourth day to the thaw, when the carrier buys toward the winter mark and
  // snow closes the pass: elm's second tavern started in winter, and when the cart came back it spent
  // the treasury on Food and Fuel first, so its brick waited (the audit's site-unsupplied).
  const c = calendar(w.tick);
  if (imports > 0 && (c.season === 3 || (c.season === 2 && c.day >= 4))) return false;
  const reader = worldIndex(w).reader;
  let tried = 0;
  for (const h of w.households) {
    if (!h.homeId || covered.has(h.id) || tried++ >= 24) continue;
    const home = w.buildings.find((b) => b.id === h.homeId);
    if (!home) continue;
    for (let r = 2; r <= 9; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
            const x = home.x + dx;
            const z = home.z + dz;
            if (!canPlaceBuilding(reader, d, x, z, rot).ok) continue;
            if (w.map.water[doorTile({ def, x, z, rot } as Building, d)]) continue;
            // R2E: build.place refuses a site nobody can walk to (CUT_OFF); trying the first spot
            // that fits and stopping there left willow's tavern refused at one spot every visit
            // from day 30, so no Craftsfolk came.
            if (!townReachesDoor(w, { def, x, z, rot })) continue;
            if (!clearOfKind(w, def, x, z)) continue;
            return !!p.buildAt(`build ${def} by the ${h.family}s`, def, x, z, rot, true);
          }
        }
      }
    }
  }
  return false;
}
