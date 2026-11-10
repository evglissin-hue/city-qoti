// What a lot is worth and how it should look (docs/spec/13-ledger.md, Zoning and growth). The
// growth pass scores empty lots each night: charm around the lot, services in reach (water, a
// food outlet, a storehouse), the tastes of the folk who live in the valley, and noise. Each zone
// reads them its own way: homes mind noise, shops want neighbors to sell to, crafts want a
// storehouse close by and farms want good soil. The district style follows the street (new lots
// take their neighbors' style) or the land (timber by the water, stone up the hill, brick on the
// streets, plaster among the gardens). Floats inside, integers out.
import { content, type SpeciesDef } from '@qoti/content';
import { MAP_SIZE, Zone } from '../../constants';
import type { Lot, TickCtx, WorldState } from '../../contracts';
import { Road } from '../../map/layers';
import { lotView } from '../../view/village';
import { storehouseReach, within } from '../logistics/range';
import { doorTile } from '../movement/api';
import { averageAround, homeCount, tasteScore, treeCount, waterWithin } from '../residents/desirability';

const S = MAP_SIZE;

/** Small deterministic integer hash for picks that must not draw from an RNG stream. */
export function mix(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** The lot's middle tile (rounded toward the road side's min corner). */
export function lotMiddle(lot: Lot): [number, number] {
  return [lot.x + ((lot.w - 1) >> 1), lot.z + ((lot.d - 1) >> 1)];
}

/** Species whose tastes count, the two most common in the valley (content order on ties). */
export function townSpecies(state: WorldState): SpeciesDef[] {
  const counts = content.species.map(() => 0);
  for (const r of state.residents) {
    const k = content.species.findIndex((s) => s.id === r.species);
    if (k >= 0) counts[k]! += 1;
  }
  const order = content.species.map((_, k) => k).filter((k) => counts[k]! > 0);
  order.sort((a, b) => counts[b]! - counts[a]! || a - b);
  return order.slice(0, 2).map((k) => content.species[k]!);
}

interface Services {
  wells: [x: number, z: number, r: number][];
  outlets: [x: number, z: number, r: number][];
  reach: ReturnType<typeof storehouseReach>;
}

/** Wells and food outlets (built or going up) by door, and storehouse reach; once per pass. */
export function servicesOf(state: WorldState): Services {
  const wells: Services['wells'] = [];
  const outlets: Services['outlets'] = [];
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    if (!def?.coverage) continue;
    const door = doorTile(b, def);
    for (const c of def.coverage) {
      if (c.kind === 'water') wells.push([door % S, Math.floor(door / S), c.radius]);
      if (c.kind === 'food') outlets.push([door % S, Math.floor(door / S), c.radius]);
    }
  }
  return { wells, outlets, reach: storehouseReach(state) };
}

function covered(list: Services['wells'], x: number, z: number): boolean {
  for (const [cx, cz, r] of list) if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= r * r) return true;
  return false;
}

/** True when a tile lies in reach of a food outlet. */
export function outletCovers(services: Services, x: number, z: number): boolean {
  return covered(services.outlets, x, z);
}

/** Average fertility over a lot. */
export function lotFertility(state: WorldState, lot: Lot): number {
  let sum = 0;
  for (let z = lot.z; z < lot.z + lot.d; z++)
    for (let x = lot.x; x < lot.x + lot.w; x++) sum += state.map.fertility[z * S + x]!;
  return sum / (lot.w * lot.d);
}

/** Hours in the cycle that rescores empty lots: each lot once a day, a slice each hour. */
export const DESIRABILITY_SLICES = 24;

/**
 * The hourly slice of the lot scoring (the zoning system calls it): empty lots whose id falls in
 * this hour's slice get their desirability again, and the UI hears of those that moved. A daily
 * rescore of every lot at once would be one long tick in a big town; this is 24 short ones.
 */
export function refreshDesirability(state: WorldState, ctx: TickCtx | null, slice: number): number {
  let species: SpeciesDef[] | null = null;
  let services: Services | null = null;
  let n = 0;
  for (const lot of state.lots) {
    if (lot.buildingId || lot.id % DESIRABILITY_SLICES !== slice) continue;
    species ??= townSpecies(state);
    services ??= servicesOf(state);
    const d = lotDesirability(state, lot, species, services);
    n++;
    if (d === lot.desirability) continue;
    lot.desirability = d;
    ctx?.events.push({ e: 'lot.updated', l: lotView(lot) });
  }
  return n;
}

/** Desirability 0 to 100 of a lot for its zone. */
export function lotDesirability(
  state: WorldState,
  lot: Lot,
  species: readonly SpeciesDef[],
  services: Services,
): number {
  const [x, z] = lotMiddle(lot);
  const m = state.map;
  let score = 35;
  score += Math.min(25, (averageAround(m.charm, x, z, 3) * 25) / 40);
  if (covered(services.wells, x, z)) score += 8;
  if (covered(services.outlets, x, z)) score += 8;
  if (species.length > 0) {
    let taste = 0;
    for (const sp of species) taste += tasteScore(state, sp, x, z);
    taste /= species.length;
    score += Math.max(-15, Math.min(25, taste)) * 0.6;
  }
  const noise = averageAround(m.charmNoise, x, z, 2);
  switch (lot.zone) {
    case Zone.homesLow:
    case Zone.homesMedium:
      score -= Math.min(25, noise);
      break;
    case Zone.shops:
      score += Math.min(15, homeCount(state, x, z, 8) * 2) - Math.min(10, noise / 2);
      break;
    case Zone.crafts:
      if (services.reach.some((r) => within(r, lot.frontage))) score += 10;
      break;
    case Zone.farms:
      score += (lotFertility(state, lot) - 40) / 3 - noise / 3;
      break;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The row or column of road a lot fronts. */
function frontLine(lot: Lot): number {
  return lot.rot % 2 === 0 ? Math.floor(lot.frontage / S) : lot.frontage % S;
}

/** Homes of both densities count as one kind of neighbor; shops, crafts and farms each their own. */
function zoneKind(zone: number): number {
  return zone === Zone.homesMedium ? Zone.homesLow : zone;
}

/** True when the lot stands a level or more above the land around it, or high in the valley. */
function isHigh(state: WorldState, x: number, z: number): boolean {
  const h = state.map.height[z * S + x]!;
  if (h >= 6) return true;
  return h >= averageAround(state.map.height, x, z, 8) + 1;
}

/**
 * The district style for a new lot: most often its neighbors' (lots within six tiles, the most
 * common style, so a street reads as one place), otherwise the one the land suits best.
 */
export function pickStyle(state: WorldState, lot: Lot): string {
  const [x, z] = lotMiddle(lot);
  const styles = content.styles;
  if (styles.length === 0) return '';
  // Neighbors on the same side of the same road, in the same kind of zone (a row of cottages, a
  // parade of shops) read as one; across the road or past the shops it may change.
  const near = styles.map(() => 0);
  const kind = zoneKind(lot.zone);
  for (const other of state.lots) {
    if (other.id === lot.id || !other.style || other.rot !== lot.rot || zoneKind(other.zone) !== kind)
      continue;
    if (frontLine(other) !== frontLine(lot)) continue;
    const [ox, oz] = lotMiddle(other);
    if (Math.abs(ox - x) > 6 || Math.abs(oz - z) > 6) continue;
    const k = styles.findIndex((s) => s.id === other.style);
    if (k >= 0) near[k]! += 1;
  }
  const h = mix(lot.id, 7);
  let follow = -1;
  for (let k = 0; k < near.length; k++)
    if (near[k]! > 0 && (follow < 0 || near[k]! > near[follow]!)) follow = k;
  // One lot in five breaks ranks, so even a tidy row has a house that is not quite like the rest.
  if (follow >= 0 && h % 5 !== 0) return styles[follow]!.id;
  const zoneId = content.zoneByValue.get(lot.zone)?.id ?? '';
  const water = waterWithin(state, x, z, 8) >= 0;
  const high = isHigh(state, x, z);
  const street = state.map.road[lot.frontage] === Road.street;
  const nature = treeCount(state, x, z, 3) >= 3 || averageAround(state.map.charmNature, x, z, 3) >= 10;
  let best = 0;
  let bestScore = -1;
  for (let j = 0; j < styles.length; j++) {
    // Start the tie-breaks at a different style per lot.
    const k = (j + (h >>> 8)) % styles.length;
    const s = styles[k]!.suits;
    let v = 0;
    if (s.water && water) v += 3;
    if (s.high && high) v += 3;
    if (s.street && street) v += 2;
    if (s.nature && nature) v += 2;
    if (s.zones?.includes(zoneId)) v += 3;
    if (v > bestScore) {
      bestScore = v;
      best = k;
    }
  }
  return styles[best]!.id;
}
