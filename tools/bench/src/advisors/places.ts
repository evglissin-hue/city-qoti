// The places advisor (R2E): the Hearth player's evening economy. Folk walk out of an evening to
// places (docs/spec/19-evenings.md), so this advisor composes somewhere to go, with the Hearth's
// tools only (decor.place, and the shared buildings a Hearth player may start): seats at about one
// for every four grown-ups, benches in rows where homes have none within reach, a pattern site by
// the shops, the tavern and a well where folk live, and a brazier or two for winter. It zones
// nothing and never builds on a zoned lot, a road or a garden lot.
//
// On this branch's stand-ins no place is found and nobody goes out, so it counts seats from the
// decor and hosts it can see; once the place pass is live it reads `placesView` as well (a home is
// served when a place lies within the round's radius; a crowded place gets another bench).
import { content } from '@qoti/content';
import {
  calendar,
  canPlaceDecor,
  doorTile,
  loansOwed,
  placesView,
  rankAtLeast,
  TILE_FP,
  townStock,
  worldIndex,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { REPAY_RESERVE, type Planner } from '../planner';
import { count, G, idx, S, sites } from '../town';
import { serveService, wellFor } from './siting';
import type { Advisor, AdvisorDef } from './types';

/** Bench tuning (not a sim number): one seat for this many young and adult residents. */
export const GROWNUPS_PER_SEAT = 4;
/** A home is served by a seat within this many tiles (Manhattan) of its door. */
const HOME_REACH = 8;
/** A cluster of this many unserved homes gets a row of benches. */
const CLUSTER_HOMES = 3;
/** A cluster of this many homes with no well in reach gets one. */
const WELL_CLUSTER = 4;
/** Commands one visit may send. */
const VISIT_COMMANDS = 3;
/** Under this many coins the advisor sends nothing (as the hearth advisor). */
const MIN_COINS = 40;
/** R2X: one brazier for about this many grown-ups, each beside a busy open-air sitting spot. */
const BRAZIER_GROWNUPS = 15;
const AUTUMN = 2;

type Pt = [x: number, z: number];

/** Young and adult residents: the folk who go out of an evening. */
export function grownups(w: WorldState): number {
  let n = 0;
  for (const r of w.residents) if (r.stage === 'young' || r.stage === 'adult') n++;
  return n;
}

/** Seat spots in town: decor seats (not child-only) and built hosts' seats at their doors. */
export function townSeats(w: WorldState): { tile: number; seats: number; host: boolean }[] {
  const out: { tile: number; seats: number; host: boolean }[] = [];
  for (const d of w.decor) {
    const def = content.decorById.get(d.def);
    if (!def?.seats || def.childSeats) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    out.push({ tile: z * S + x, seats: def.seats, host: false });
  }
  for (const b of w.buildings) {
    const seats = content.buildingById.get(b.def)?.host?.seats;
    if (b.stage === 'built' && seats) out.push({ tile: doorTile(b), seats, host: true });
  }
  return out;
}

/** The town's seats: what `GROWNUPS_PER_SEAT` is measured against. */
export function seatCount(w: WorldState): number {
  let n = 0;
  for (const s of townSeats(w)) n += s.seats;
  return n;
}

const manhattan = (a: number, b: number): number =>
  Math.abs((a % S) - (b % S)) + Math.abs(Math.floor(a / S) - Math.floor(b / S));

const defHasTag = (def: string, tag: string): boolean =>
  content.buildingById.get(def)?.tags?.includes(tag) ?? false;

/** Squared tile distance from (x, z) to a building's footprint (0 inside), as the Pattern Book measures. */
function footGap2(b: Building, x: number, z: number): number {
  const def = content.buildingById.get(b.def)!;
  const [bw, bd] = b.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
  const gx = Math.max(0, b.x - x, x - (b.x + bw - 1));
  const gz = Math.max(0, b.z - z, z - (b.z + bd - 1));
  return gx * gx + gz * gz;
}

class Places implements Advisor {
  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  /** The planner's decision count when this visit began. */
  private start = 0;

  /**
   * Commands this visit may still send. P3A: counted live from the planner's records, so a step
   * that sends several (two shops dressed at three pieces each) cannot run past the cap.
   */
  private left(): number {
    return VISIT_COMMANDS - (this.p.decisions.length - this.start);
  }

  visit(): void {
    const p = this.p;
    const w = this.w;
    if (p.coins() < MIN_COINS) return;
    // Decor can wait while the town owes the bank (the planner's rule for what can wait).
    const spare = loansOwed(w) === 0 || p.coins() >= REPAY_RESERVE;
    this.start = p.decisions.length;
    const village = rankAtLeast(w, 'village');
    if (village) {
      this.tavern();
      if (spare && this.left() > 0) this.well();
      if (spare && this.left() >= 3) this.patternSite();
    }
    if (!spare) return;
    // P3A: a row needs two commands (a lone bench is no row): with one left, the next visit lays it.
    if (this.left() >= 2) this.benchRow();
    if (this.left() > 0) this.crowded();
    if (village && this.left() > 0) this.brazier();
  }

  /** The tavern where folk live: the Village advisor's old siting and budget, now the Hearth's. */
  private tavern(): void {
    if (content.buildingById.has('tavern')) serveService(this.p, 'tavern', 'social');
  }

  private homes(): Building[] {
    return this.w.buildings.filter((b) => b.stage === 'built' && content.buildingById.get(b.def)?.housing);
  }

  /** A well where 4+ homes have none in reach, sited for the cluster's most central home. */
  private well(): void {
    const w = this.w;
    const p = this.p;
    if (!content.buildingById.has('well')) return;
    if (p.coins() <= 60 || townStock(w)[G('stone')]! < 12 || sites(w) >= 3) return;
    if (count(w, 'well') > w.residents.length / 10) return;
    const r = content.buildingById.get('well')?.coverage?.find((c) => c.kind === 'water')?.radius ?? 8;
    const wells = w.buildings.filter((b) => b.def === 'well');
    const dry = this.homes().filter((h) => {
      const d = doorTile(h);
      const dx = d % S;
      const dz = Math.floor(d / S);
      return !wells.some((o) => (o.x - dx) ** 2 + (o.z - dz) ** 2 <= (r - 1) * (r - 1));
    });
    for (const h of dry) {
      const hd = doorTile(h);
      const group = dry.filter((o) => manhattan(doorTile(o), hd) <= r);
      if (group.length < WELL_CLUSTER) continue;
      let best = h;
      let bestSum = Infinity;
      for (const c of group) {
        let sum = 0;
        for (const o of group) sum += manhattan(doorTile(c), doorTile(o));
        if (sum < bestSum) [best, bestSum] = [c, sum];
      }
      const d = doorTile(best);
      if (wellFor(p, d % S, Math.floor(d / S))) return;
    }
  }

  /** The best free spot near (cx, cz): not a road, lot or water, scored by charm, lanterns and nearness. */
  private bestSpot(
    def: string,
    cx: number,
    cz: number,
    radius: number,
    ok: (x: number, z: number) => boolean,
  ): Pt | null {
    const w = this.w;
    const d = content.decorById.get(def)!;
    const reader = worldIndex(w).reader;
    const lanterns = w.decor
      .filter((x) => x.def === 'lantern')
      .map((x) => [x.fx / TILE_FP - 0.5, x.fz / TILE_FP - 0.5] as const);
    let best: Pt | null = null;
    let bestScore = -Infinity;
    for (let z = Math.max(1, cz - radius); z <= Math.min(S - 2, cz + radius); z++) {
      for (let x = Math.max(1, cx - radius); x <= Math.min(S - 2, cx + radius); x++) {
        const i = idx(x, z);
        if (w.map.road[i] || w.map.zone[i] || w.map.occupant[i] || w.map.water[i]) continue;
        if (!ok(x, z)) continue;
        const fx = x * TILE_FP + TILE_FP / 2;
        const fz = z * TILE_FP + TILE_FP / 2;
        if (!canPlaceDecor(reader, d, fx, fz, (x * 31 + z) % 64).ok) continue;
        let score = (w.map.charm[i] ?? 0) - 2 * (Math.abs(x - cx) + Math.abs(z - cz));
        for (const [lx, lz] of lanterns) if ((lx - x) ** 2 + (lz - z) ** 2 <= 9) score += 4;
        if (score > bestScore) [best, bestScore] = [[fx, fz], score];
      }
    }
    return best;
  }

  private nextToRoad = (x: number, z: number): boolean => {
    const r = this.w.map.road;
    return !!(r[idx(x + 1, z)] || r[idx(x - 1, z)] || r[idx(x, z + 1)] || r[idx(x, z - 1)]);
  };

  private place(def: string, at: Pt, why: string): boolean {
    const rot = (Math.floor(at[0] / TILE_FP) * 31 + Math.floor(at[1] / TILE_FP)) % 64;
    return this.p.do(`${def} ${why}`, [{ t: 'decor.place', def, fx: at[0], fz: at[1], rot }]);
  }

  private livePlaces() {
    return placesView(this.w).places;
  }

  /**
   * Whether a home has somewhere to sit within reach: live places with seats when there are any (R2X:
   * a well or a stall is a place with standing room only, and a row of benches is for sitting), else
   * the decor-derived seats.
   */
  private served(h: Building, seats: { tile: number }[], live: { tile: number; seats: number }[]): boolean {
    const d = doorTile(h);
    if (live.length > 0)
      return live.some((pl) => pl.seats > 0 && manhattan(pl.tile, d) <= content.places.radius);
    return seats.some((s) => manhattan(s.tile, d) <= HOME_REACH);
  }

  /**
   * A row of 2 to 4 benches near a cluster of 3+ homes with no seat in reach. The town-wide count
   * (`GROWNUPS_PER_SEAT`) only gates the fallback pair: a cluster nobody can sit near is served
   * whatever the total, since the Hearth's wish benches and the tavern can crowd the count while
   * whole streets have nowhere to go.
   */
  private benchRow(): void {
    const w = this.w;
    const grown = grownups(w);
    const seats = townSeats(w);
    const have = seats.reduce((n, s) => n + s.seats, 0);
    const target = grown / GROWNUPS_PER_SEAT;
    const live = this.livePlaces();
    const bare = this.homes().filter((h) => !this.served(h, seats, live));
    for (const h of bare) {
      const hd = doorTile(h);
      const cluster = bare.filter((o) => manhattan(doorTile(o), hd) <= HOME_REACH);
      if (cluster.length < CLUSTER_HOMES) continue;
      let cx = 0;
      let cz = 0;
      for (const o of cluster) {
        cx += doorTile(o) % S;
        cz += Math.floor(doorTile(o) / S);
      }
      cx = Math.round(cx / cluster.length);
      cz = Math.round(cz / cluster.length);
      const deficit = Math.ceil((grown / GROWNUPS_PER_SEAT - have) / 2);
      const want = Math.min(4, Math.max(2, deficit), this.left());
      if (this.row(cx, cz, want, 'in a row near homes') > 0) return;
    }
    // Every cluster has somewhere to sit; short of one seat in four grown-ups still, a pair of
    // benches goes by the home farthest from any seat.
    if (have >= target) return;
    let far: Building | null = null;
    let farD = -1;
    for (const h of this.homes()) {
      const hd = doorTile(h);
      const d = seats.reduce((m, s) => Math.min(m, manhattan(s.tile, hd)), 99);
      if (d > farD) [far, farD] = [h, d];
    }
    if (far)
      this.row(doorTile(far) % S, Math.floor(doorTile(far) / S), Math.min(2, this.left()), 'near a home');
  }

  /**
   * Places up to `n` benches that sit within the spot radius of each other; returns how many went
   * down. R2X: the spots are found before any is sent, and a row asked for two or more that cannot
   * fit two sends nothing (a lone bench is no row), so the caller tries the next cluster.
   */
  private row(cx: number, cz: number, n: number, why: string): number {
    const reach = content.places.spotRadius - 0.5;
    const planned: Pt[] = [];
    const taken = new Set<number>();
    for (let k = 0; k < n; k++) {
      const near = (x: number, z: number): boolean =>
        !taken.has(idx(x, z)) &&
        this.nextToRoad(x, z) &&
        planned.every(
          ([px, pz]) => (px / TILE_FP - 0.5 - x) ** 2 + (pz / TILE_FP - 0.5 - z) ** 2 <= reach * reach,
        );
      const first = planned[0];
      const [ax, az] = first ? [Math.floor(first[0] / TILE_FP), Math.floor(first[1] / TILE_FP)] : [cx, cz];
      const at = this.bestSpot('bench', ax, az, first ? Math.floor(reach) : 5, near);
      if (!at) break;
      planned.push(at);
      taken.add(idx(Math.floor(at[0] / TILE_FP), Math.floor(at[1] / TILE_FP)));
    }
    if (planned.length < Math.min(2, n)) return 0;
    let placed = 0;
    for (const at of planned) {
      if (!this.place('bench', at, why)) break;
      placed++;
    }
    return placed;
  }

  /** A place whose last evening's visitors beat 3x its seats gets another bench beside it. */
  private crowded(): void {
    for (const pl of this.livePlaces()) {
      const last = pl.visitors[pl.visitors.length - 1] ?? 0;
      if (pl.seats === 0 || pl.sheltered || last <= 3 * pl.seats) continue;
      if (this.row(pl.tile % S, Math.floor(pl.tile / S), 1, 'beside a crowded place') > 0) return;
    }
  }

  private isOutlet(b: Building): boolean {
    return b.stage === 'built' && (defHasTag(b.def, 'outlet') || defHasTag(b.def, 'tavern'));
  }

  private hasCorner(b: Building): boolean {
    const w = this.w;
    const d = doorTile(b);
    const dx = d % S;
    const dz = Math.floor(d / S);
    const road = (x: number, z: number): boolean => !!w.map.road[idx(x, z)];
    for (let z = dz - 2; z <= dz + 2; z++)
      for (let x = dx - 2; x <= dx + 2; x++) {
        if (!road(x, z)) continue;
        if ((road(x, z - 1) || road(x, z + 1)) && (road(x - 1, z) || road(x + 1, z))) return true;
      }
    return false;
  }

  /**
   * Corner Cafe where its recipe can be met (2 seat pieces and a flower piece within 2 tiles of a
   * tavern, baker or corner shop whose door is near a corner), else 2 benches and a flower piece
   * within the serve radius of an outlet's door, so a place is served.
   */
  private patternSite(): void {
    const w = this.w;
    const outlets = w.buildings.filter((b) => this.isOutlet(b)).sort((a, b) => a.id - b.id);
    if (outlets.length === 0) return;
    if (this.livePlaces().some((pl) => pl.serves.length > 0)) return;
    const seatPiece = (d: { def: string }): boolean => {
      const def = content.decorById.get(d.def);
      return !!def?.seats && !def.childSeats;
    };
    const flowerPiece = (d: { def: string }): boolean =>
      content.decorById.get(d.def)?.tags.includes('flower') ?? false;
    const tile = (d: { fx: number; fz: number }): Pt => [
      Math.floor(d.fx / TILE_FP),
      Math.floor(d.fz / TILE_FP),
    ];
    const attempt = (
      close: (x: number, z: number) => boolean,
      ox: number,
      oz: number,
    ): 'done' | 'have' | 'no' => {
      const pieces = w.decor.filter((d) => seatPiece(d) && close(...tile(d))).length;
      const flowers = w.decor.filter((d) => flowerPiece(d) && close(...tile(d))).length;
      if (pieces >= 2 && flowers >= 1) return 'have';
      const need = [
        ...Array<string>(Math.max(0, 2 - pieces)).fill('bench'),
        ...(flowers ? [] : ['flower-bed']),
      ];
      if (need.length > this.left()) return 'no';
      // P3A: the pieces sit together, within a spot's radius of each other, or they make no place:
      // two benches on either side of a market square stood seven tiles apart, no place served,
      // and every visit dressed another shop.
      const reach = content.places.spotRadius - 0.5;
      const set: Pt[] = [];
      const together = (x: number, z: number): boolean =>
        close(x, z) &&
        set.every(
          ([px, pz]) => (px / TILE_FP - 0.5 - x) ** 2 + (pz / TILE_FP - 0.5 - z) ** 2 <= reach * reach,
        );
      for (const def of need) {
        const at = this.bestSpot(def, ox, oz, 4, together);
        if (!at || !this.place(def, at, 'by the shop')) return 'no';
        set.push(at);
      }
      return 'done';
    };
    const cafe = (b: Building): boolean =>
      (defHasTag(b.def, 'cafe') || b.trade === 'baker') && this.hasCorner(b);
    if (!w.hearth.discovered.some((x) => x.pattern === 'corner-cafe')) {
      for (const b of outlets.filter(cafe)) {
        // The Pattern Book measures from the footprint: within 2 tiles (gap squared at most 6).
        const door = doorTile(b);
        const got = attempt((x, z) => footGap2(b, x, z) <= 6, door % S, Math.floor(door / S));
        if (got !== 'no') return;
      }
    }
    // Fallback: a place the shop can serve, near its door.
    const reach = content.places.serveRadius - 0.5;
    const spots = outlets.map((b) => {
      const door = doorTile(b);
      const dx = door % S;
      const dz = Math.floor(door / S);
      return { dx, dz, close: (x: number, z: number) => (x - dx) ** 2 + (z - dz) ** 2 <= reach * reach };
    });
    // Already one served by seats and flowers: done (one site until places say otherwise).
    for (const s of spots) {
      const pieces = w.decor.filter((d) => seatPiece(d) && s.close(...tile(d))).length;
      const flowers = w.decor.filter((d) => flowerPiece(d) && s.close(...tile(d))).length;
      if (pieces >= 2 && flowers >= 1) return;
    }
    for (const s of spots) if (attempt(s.close, s.dx, s.dz) !== 'no') return;
  }

  /**
   * In autumn, a brazier beside the busiest open-air sitting spots, one per ~15 grown-ups (R2X: two
   * for a whole town let every Craftsfolk household slide back over the winter).
   */
  private brazier(): void {
    const w = this.w;
    if (calendar(w.tick).season !== AUTUMN) return;
    if (!w.hearth.unlocked.includes('brazier') || !content.decorById.has('brazier')) return;
    const cap = Math.ceil(grownups(w) / BRAZIER_GROWNUPS);
    const braziers = w.decor.filter((d) => d.def === 'brazier');
    if (braziers.length >= cap) return;
    const live = this.livePlaces().filter((pl) => pl.seats > 0 && !pl.sheltered && !pl.warm);
    let spots: { x: number; z: number; weight: number }[];
    if (live.length > 0) {
      spots = live.map((pl) => ({
        x: pl.tile % S,
        z: Math.floor(pl.tile / S),
        weight: pl.visitors.reduce((a, v) => a + v, 0) * 100 + pl.seats,
      }));
    } else {
      // Decor-derived: seat pieces grouped within two spot radii, the biggest groups first.
      const bits = townSeats(w).filter((s) => !s.host);
      const taken = new Set<number>();
      spots = [];
      for (const s of bits) {
        if (taken.has(s.tile)) continue;
        let weight = 0;
        for (const o of bits)
          if (!taken.has(o.tile) && manhattan(o.tile, s.tile) <= content.places.spotRadius * 2) {
            weight += o.seats;
            taken.add(o.tile);
          }
        spots.push({ x: s.tile % S, z: Math.floor(s.tile / S), weight });
      }
    }
    spots.sort((a, b) => b.weight - a.weight);
    let have = braziers.length;
    const placed: Pt[] = [];
    for (const s of spots) {
      if (have >= cap || this.left() <= 0) return;
      const near = (fx: number, fz: number) =>
        (fx / TILE_FP - 0.5 - s.x) ** 2 + (fz / TILE_FP - 0.5 - s.z) ** 2 <= 16;
      if (braziers.some((b) => near(b.fx, b.fz)) || placed.some(([fx, fz]) => near(fx, fz))) continue;
      const at = this.bestSpot('brazier', s.x, s.z, 3, () => true);
      if (at && this.place('brazier', at, 'for winter')) {
        placed.push(at);
        have++;
      }
    }
  }
}

export const places: AdvisorDef = {
  id: 'places',
  lane: 'hearth',
  slot: 62,
  plays: (opts) => opts.hearth !== false,
  create: (p) => new Places(p),
};
