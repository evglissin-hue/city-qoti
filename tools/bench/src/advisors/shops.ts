// The shops advisor (R2E): the Ledger's reading of the evening round (docs/spec/19-evenings.md,
// Shops follow the walkers; Evening streets; Gaps). It zones shops where folk walk of an evening and
// by places that have nothing to sell, and marks a busy place's stretch of road an evening street
// when carts can go round. It places no decor (the Hearth dresses the streets) and builds nothing.
// On a town with no footfall and no live place (the stand-ins before R2A to R2C land) it does
// nothing, and the land advisor's Shops bar answers as it always did.
import { content } from '@qoti/content';
import {
  doorTile,
  Flags,
  MAP_SIZE,
  meetsRequires,
  placesView,
  TICKS_PER_DAY,
  Zone,
  type PlaceView,
  type WorldState,
} from '@qoti/sim';
import type { Planner } from '../planner';
import { growableLots } from '../town';
import { frontageFor, openGround } from '../village';
import type { Advisor, AdvisorDef, Visit } from './types';

const S = MAP_SIZE;
const PLACES = content.places;

/** Score a place adds to a Shops run within reach of it (footfall counts one a step); an unserved place pulls three times as hard. */
const PLACE_PULL = 60;
/** Tiles of shops frontage painted for a place with nothing to sell: three lots' worth. */
const PLACE_SHOP_TILES = 27;
/** Tiles of lot depth behind the road. */
const SHOP_DEPTH = 3;
/** Coins in hand before a stall is built by a place (the stall costs 10 coins and 6 timber). */
const STALL_COINS = 60;
/** An evening street is at most this many road tiles. */
export const MAX_STRETCH = 8;
/** At most this many evening stretches in town. */
const MAX_STRETCHES = 3;
/** A cart's way round may be this much longer than the stretch: twice its length plus this many tiles. */
const DETOUR_SLACK = 10;

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const cheb = (a: number, b: number) =>
  Math.max(Math.abs((a % S) - (b % S)), Math.abs(Math.floor(a / S) - Math.floor(b / S)));

/** Grown-ups: the young and adult residents (the evening's tally counts the same). */
function grownups(w: WorldState): number {
  let n = 0;
  for (const r of w.residents) if (r.stage === 'young' || r.stage === 'adult') n++;
  return n;
}

/** Visitors a place drew `ago` evenings back (0 is the last entry, the evening under way or last closed). */
function visitorsAgo(p: PlaceView, ago: number): number {
  return p.visitors[p.visitors.length - 1 - ago] ?? 0;
}

/** A place that drew `unservedVisitors` or more on each of the last `evenings` evenings and has nothing to sell. */
function unserved(p: PlaceView, evenings: number): boolean {
  if (p.serves.length > 0) return false;
  for (let k = 0; k < evenings; k++) if (visitorsAgo(p, k) < PLACES.unservedVisitors) return false;
  return true;
}

/**
 * Shops frontage ranked by the walks: open frontage for the `shops` zone (as `frontageFor` finds it)
 * whose runs score by the evening footfall on the road tiles they front and by live places within
 * `placeNearShopRadius` tiles, more for a place with nothing to sell. Null while there is no
 * footfall and no live place, so a caller falls back to `frontageFor`.
 */
export function walkFrontage(w: WorldState): [number, number][] | null {
  const places = placesView(w).places;
  const foot = w.map.footfallEve;
  let walked = places.length > 0;
  for (let i = 0; !walked && i < foot.length; i++) if (foot[i]) walked = true;
  if (!walked) return null;
  const pulls = places.map((p) => ({
    tile: p.tile,
    pull: PLACE_PULL * (visitorsAgo(p, 0) >= PLACES.unservedVisitors && p.serves.length === 0 ? 3 : 1),
  }));
  return frontageFor(w, 'shops', {
    rank: (road, lots) => {
      let score = 0;
      for (const [x, z] of road) score += foot[z * S + x]!;
      for (const { tile, pull } of pulls)
        if (lots.some(([x, z]) => cheb(z * S + x, tile) <= PLACES.placeNearShopRadius)) score += pull;
      return score;
    },
  });
}

/**
 * Open lot ground by a road within a place's reach, to paint shops on: columns of `SHOP_DEPTH` open
 * tiles off a road tile near the place, nearest the place first. Null when there is none.
 */
export function shopsNear(w: WorldState, place: { tile: number }): [number, number][] | null {
  const reach = PLACES.serveRadius;
  const px = place.tile % S;
  const pz = Math.floor(place.tile / S);
  const columns: { d: number; tiles: [number, number][] }[] = [];
  for (let z = Math.max(2, pz - reach - 1); z <= Math.min(S - 3, pz + reach + 1); z++) {
    for (let x = Math.max(2, px - reach - 1); x <= Math.min(S - 3, px + reach + 1); x++) {
      if (!w.map.road[z * S + x]) continue;
      for (const [dx, dz] of DIRS) {
        const col: [number, number][] = [];
        for (let k = 1; k <= SHOP_DEPTH; k++) {
          const tx = x + dx * k;
          const tz = z + dz * k;
          if (!openGround(w, tx, tz) || w.map.tree[tz * S + tx] || w.map.lot[tz * S + tx]) break;
          col.push([tx, tz]);
        }
        if (col.length < SHOP_DEPTH) continue;
        const d = cheb(col[0]![1] * S + col[0]![0], place.tile);
        if (d <= reach) columns.push({ d, tiles: col });
      }
    }
  }
  columns.sort((a, b) => a.d - b.d);
  const seen = new Set<number>();
  const out: [number, number][] = [];
  for (const c of columns) {
    if (c.tiles.some(([x, z]) => seen.has(z * S + x))) continue;
    for (const [x, z] of c.tiles) {
      seen.add(z * S + x);
      out.push([x, z]);
    }
    if (out.length >= PLACE_SHOP_TILES) break;
  }
  return out.length > 0 ? out : null;
}

/** Whether a shops lot, empty or zoned and not yet cut, lies within a place's `serveRadius`. */
function shopsLotNear(w: WorldState, place: { tile: number }): boolean {
  const reach = PLACES.serveRadius;
  const px = place.tile % S;
  const pz = Math.floor(place.tile / S);
  for (const l of growableLots(w)) {
    if (l.buildingId || l.zone !== Zone.shops) continue;
    const dx = Math.max(l.x - px, 0, px - (l.x + l.w - 1));
    const dz = Math.max(l.z - pz, 0, pz - (l.z + l.d - 1));
    if (Math.max(dx, dz) <= reach) return true;
  }
  for (let z = Math.max(0, pz - reach); z <= Math.min(S - 1, pz + reach); z++)
    for (let x = Math.max(0, px - reach); x <= Math.min(S - 1, px + reach); x++)
      if (w.map.zone[z * S + x] === Zone.shops && !w.map.lot[z * S + x]) return true;
  return false;
}

/** Whether a building loses its deliveries after 17:00 on an evening street: a workshop, a stall or a specialized building. */
function needsCarts(def: string): boolean {
  const d = content.buildingById.get(def);
  return !!d && (!!d.specialized || !!d.tags?.includes('workshop') || d.id === 'market-stall');
}

/**
 * The road tiles (tile indexes) of an evening street for a place, or null: the road within two
 * tiles of the place, at most `MAX_STRETCH` tiles grown outward from the nearest; no bridge, none
 * already marked, busy (its busiest tile passes a tenth of the grown-ups on a night), no workshop,
 * stall or specialized building's door on it, and a road route round it between its two ends no
 * longer than twice its length plus ten tiles (a dead end has no way round).
 */
export function eveningStretch(
  w: WorldState,
  place: { tile: number; tiles?: readonly number[] },
): number[] | null {
  const m = w.map;
  const near = [place.tile, ...(place.tiles ?? [])];
  const cand = new Set<number>();
  for (const t of near) {
    const tx = t % S;
    const tz = Math.floor(t / S);
    for (let z = Math.max(0, tz - 2); z <= Math.min(S - 1, tz + 2); z++)
      for (let x = Math.max(0, tx - 2); x <= Math.min(S - 1, tx + 2); x++)
        if (m.road[z * S + x]) cand.add(z * S + x);
  }
  if (cand.size === 0) return null;
  // Part of this stretch is an evening street already: leave it.
  for (const i of cand) if (m.flags[i]! & Flags.evening) return null;
  const dist = (i: number) => Math.min(...near.map((t) => cheb(i, t)));
  const sorted = [...cand].sort((a, b) => dist(a) - dist(b) || a - b);
  const stretch: number[] = [sorted[0]!];
  const inStretch = new Set(stretch);
  while (stretch.length < MAX_STRETCH) {
    const next = sorted.find(
      (i) => !inStretch.has(i) && DIRS.some(([dx, dz]) => inStretch.has(i + dz * S + dx)),
    );
    if (next === undefined) break;
    stretch.push(next);
    inStretch.add(next);
  }
  if (stretch.some((i) => m.water[i])) return null;
  // Busy: the busiest tile passes a tenth of the grown-ups.
  const need = Math.ceil((grownups(w) * PLACES.footfallFullPercent) / 100);
  let busiest = 0;
  for (const i of stretch) busiest = Math.max(busiest, m.footfallEve[i]!);
  if (busiest === 0 || busiest < need) return null;
  // Nothing on it needs a cart after 17:00.
  for (const b of w.buildings) if (needsCarts(b.def) && inStretch.has(doorTile(b))) return null;
  for (const l of w.lots) if (l.buildingId && l.zone !== Zone.shops && inStretch.has(l.frontage)) return null;
  // A way round: its two ends (the roads leaving it) joined by a route off the stretch.
  const exits = new Set<number>();
  for (const i of stretch)
    for (const [dx, dz] of DIRS) {
      const x = (i % S) + dx;
      const z = Math.floor(i / S) + dz;
      if (x < 0 || z < 0 || x >= S || z >= S) continue;
      const j = z * S + x;
      if (m.road[j] && !inStretch.has(j)) exits.add(j);
    }
  if (exits.size < 2) return null;
  const ends = [...exits];
  let a = ends[0]!;
  let b = ends[1]!;
  let far = -1;
  for (const p of ends)
    for (const q of ends) {
      const d = Math.abs((p % S) - (q % S)) + Math.abs(Math.floor(p / S) - Math.floor(q / S));
      if (d > far) {
        far = d;
        a = p;
        b = q;
      }
    }
  const limit = 2 * stretch.length + DETOUR_SLACK;
  if (!roundTrip(w, a, b, inStretch, limit)) return null;
  return stretch;
}

/** Whether a road route of at most `limit` steps joins `a` to `b` without touching `avoid`. */
function roundTrip(w: WorldState, a: number, b: number, avoid: ReadonlySet<number>, limit: number): boolean {
  const seen = new Set<number>([a]);
  let frontier = [a];
  for (let d = 0; d <= limit && frontier.length > 0; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      if (i === b) return true;
      for (const [dx, dz] of DIRS) {
        const x = (i % S) + dx;
        const z = Math.floor(i / S) + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const j = z * S + x;
        if (seen.has(j) || avoid.has(j) || !w.map.road[j]) continue;
        seen.add(j);
        next.push(j);
      }
    }
    frontier = next;
  }
  return false;
}

class Shops implements Advisor {
  /** Day a place's shops were last painted (one place a day at most). */
  private paintedDay = 0;
  /** Evening stretches this advisor marked. */
  private marked = 0;

  constructor(readonly p: Planner) {}

  visit(v: Visit): void {
    if (v.afternoon) return;
    const w = this.p.w;
    const places = placesView(w).places;
    if (places.length === 0) return;
    this.nothingToSell(places);
    this.eveningStreet(places);
  }

  /** A place that drew a crowd two evenings running with nothing to sell: light the Shops bar by painting shops by it. */
  private nothingToSell(places: PlaceView[]): void {
    const w = this.p.w;
    const day = Math.floor(w.tick / TICKS_PER_DAY) + 1;
    if (this.paintedDay === day) return;
    const def = content.zoneById.get('shops');
    if (!def || !meetsRequires(w, def.requires)) return;
    const lacking = places
      .filter((p) => unserved(p, 2))
      .sort((a, b) => visitorsAgo(b, 0) - visitorsAgo(a, 0));
    for (const place of lacking) {
      if (shopsLotNear(w, place)) continue;
      const tiles = shopsNear(w, place);
      if (!tiles) {
        // R3X: no open ground by a road for shops (hazel's tree and well places stood hemmed in for
        // fifty days, their nothing-to-sell gaps never closing): a stall by the road beside the place
        // is the gap's other remedy ("a shop or stall with treats on the shelf within three tiles").
        if (this.stallBy(place)) {
          this.paintedDay = day;
          return;
        }
        continue;
      }
      if (this.p.do(`zone shops by ${place.name}`, [{ t: 'zone.paint', zone: 'shops', tiles }])) {
        this.paintedDay = day;
        return;
      }
    }
  }

  /** A market stall within the place's reach, when none stands or is going up there and the coffers allow. */
  private stallBy(place: PlaceView): boolean {
    const w = this.p.w;
    const reach = PLACES.serveRadius;
    if (w.buildings.some((b) => b.def === 'market-stall' && cheb(b.z * S + b.x, place.tile) <= reach + 1))
      return false;
    if (this.p.coins() < STALL_COINS) return false;
    return !!this.p.build('market-stall', (x, z) => cheb(z * S + x, place.tile) <= reach - 1);
  }

  /** A busy place's stretch of road becomes an evening street when carts can go round; one a visit, three in town. */
  private eveningStreet(places: PlaceView[]): void {
    const w = this.p.w;
    if (this.marked >= MAX_STRETCHES) return;
    const busy = [...places].sort((a, b) => visitorsAgo(b, 0) - visitorsAgo(a, 0));
    for (const place of busy) {
      const stretch = eveningStretch(w, place);
      if (!stretch) continue;
      const tiles = stretch.map((i): [number, number] => [i % S, Math.floor(i / S)]);
      if (this.p.do(`evening street by ${place.name}`, [{ t: 'road.setEvening', tiles, on: true }])) {
        this.marked++;
        return;
      }
    }
  }
}

export const shops: AdvisorDef = {
  id: 'shops',
  lane: 'ledger',
  // After the land advisor (20), which answers the bars, before the charter (30).
  slot: 22,
  // The Village run, as the village advisor plays.
  plays: (opts) => !!opts.village && content.buildingById.has('tavern'),
  create: (p) => new Shops(p),
};
