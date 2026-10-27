// The hearth advisor (I1, C3X; ported in C5.0): the Hearth player's turn. It answers up to three
// wishes (benches, trees, flowers, a path or lanterns on the walk to work, a closer well), then
// dresses one lane with lanterns and flowers, follows the Pattern Book's hints to a Tree Place and a
// Well Gathering Place, so charm grows and patterns can be found.
import { content } from '@qoti/content';
import {
  calendar,
  canPaintRoad,
  canPlaceDecor,
  doorTile,
  findById,
  findRoute,
  TILE_FP,
  townStock,
  treeStage,
  worldIndex,
  type Building,
  type WorldState,
} from '@qoti/sim';
import type { Planner } from '../planner';
import { count, G, idx, S, sites } from '../town';
import type { Advisor, AdvisorDef } from './types';

/** A tree on the map, grown to at least `stage`, within `r` tiles of a building. */
function treeNear(w: WorldState, b: Building, r: number, stage: number): boolean {
  const def = content.buildingById.get(b.def)!;
  const [bw, bd] = b.rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
  for (let z = Math.max(0, b.z - r); z < Math.min(S, b.z + bd + r); z++)
    for (let x = Math.max(0, b.x - r); x < Math.min(S, b.x + bw + r); x++) {
      // Measured as the Pattern Book does: straight-line distance from the footprint.
      const gx = Math.max(0, b.x - x, x - (b.x + bw - 1));
      const gz = Math.max(0, b.z - z, z - (b.z + bd - 1));
      const v = w.map.tree[z * S + x]!;
      if (v && treeStage(v) >= stage && gx * gx + gz * gz <= r * r + r) return true;
    }
  return false;
}

class Hearth implements Advisor {
  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  /** The walk from work to home, door to door, as the wishes check it (null when unreachable). */
  private commute(home: number, work: number): number[] | null {
    const w = this.w;
    const h = findById(w.buildings, home);
    const b = findById(w.buildings, work);
    if (!h || !b) return null;
    return findRoute(w, doorTile(b), doorTile(h), false);
  }

  /** C4X: "a proper path" wishes: path on every grass tile of the walk to work. */
  private commutePath(home: number, work: number): boolean {
    const route = this.commute(home, work);
    if (!route) return false;
    const reader = worldIndex(this.w).reader;
    const tiles: [number, number][] = [];
    for (const i of route) {
      if (this.w.map.road[i]) continue;
      const t: [number, number] = [i % S, Math.floor(i / S)];
      if (canPaintRoad(reader, 'path', [t]).ok) tiles.push(t);
    }
    if (tiles.length === 0 || tiles.length > 120 || this.p.coins() < 40) return false;
    return this.p.do('path to work for a wish', [{ t: 'road.paint', kind: 'path', tiles }]);
  }

  /** C4X: "lanterns on my way home" wishes: a lantern every third step of the walk. */
  private commuteLanterns(home: number, work: number): boolean {
    const route = this.commute(home, work);
    if (!route || route.length > 90 || this.p.coins() < 60) return false;
    let ok = false;
    for (let k = 1; k < route.length; k += 3) {
      const i = route[k]!;
      ok =
        this.place('lantern', this.p.decorSpot('lantern', i % S, Math.floor(i / S), 1), 'on the way home') ||
        ok;
    }
    return ok;
  }

  private place(def: string, at: [number, number] | null, why: string): boolean {
    if (!at) return false;
    return this.p.do(`${def} ${why}`, [
      { t: 'decor.place', def, fx: at[0], fz: at[1], rot: (at[0] * 31 + at[1]) % 64 },
    ]);
  }

  /** Answer up to three wishes, then dress one lane. */
  visit(): void {
    const p = this.p;
    const w = this.w;
    let answered = 0;
    for (const wish of [...w.wishes]) {
      if (answered >= 3) break;
      const home = findById(w.buildings, wish.home);
      if (!home) continue;
      const door = doorTile(home);
      const hx = door % S;
      const hz = Math.floor(door / S);
      const nearWater = (fx: number, fz: number) => {
        const x = Math.floor(fx / TILE_FP);
        const z = Math.floor(fz / TILE_FP);
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) if (w.map.water[idx(x + dx, z + dz)]) return true;
        return false;
      };
      let ok = false;
      switch (wish.template) {
        case 'somewhere-to-sit':
          ok = this.place('bench', p.decorSpot('bench', hx, hz, 2), 'for a wish');
          break;
        case 'tree-by-my-window':
          ok = this.place('cherry-tree', p.decorSpot('cherry-tree', hx, hz, 2), 'for a wish');
          break;
        case 'flowers-on-the-lane':
          for (let k = 0; k < 3; k++)
            ok = this.place('flower-bed', p.decorSpot('flower-bed', hx, hz, 3), 'for a wish') || ok;
          break;
        case 'river-bench':
          ok = this.place('bench', p.decorSpot('bench', hx, hz, 8, nearWater), 'by the river');
          break;
        case 'a-garden-plot':
          ok = w.hearth.unlocked.includes('herb-planter')
            ? this.place('herb-planter', p.decorSpot('herb-planter', hx, hz, 2), 'for a wish')
            : false;
          break;
        case 'a-proper-path':
          ok = this.commutePath(wish.home, wish.work);
          break;
        case 'lantern-on-my-way-home':
          ok = this.commuteLanterns(wish.home, wish.work);
          break;
        case 'a-well-closer':
          // C4C: one well per ten residents is plenty (a Village run built forty).
          if (
            p.coins() > 60 &&
            townStock(w)[G('stone')]! >= 12 &&
            sites(w) < 3 &&
            count(w, 'well') <= w.residents.length / 10
          )
            ok = !!p.build('well');
          break;
        default:
          break;
      }
      if (ok) answered++;
    }
    // Then a lane: lanterns every few tiles along roads near homes, a bench and flowers by the
    // well, and the odd fruit tree, so charm grows and patterns can be found.
    const homes = w.buildings.filter((b) => b.def === 'cottage');
    const pick = homes[(calendar(w.tick).day + w.residents.length) % Math.max(1, homes.length)];
    if (pick) {
      const door = doorTile(pick);
      const [x, z] = [door % S, Math.floor(door / S)];
      this.place('lantern', p.decorSpot('lantern', x, z, 2), 'on the lane');
      this.place(w.decor.length % 2 ? 'flower-bed' : 'planter', p.decorSpot('planter', x, z, 2), 'by a door');
    }
    this.treePlace();
    this.wellGathering();
  }

  /**
   * Seats and shade by the well with the most homes around it (the Well Gathering Place wants
   * three within eight tiles), counted at that well, not across town (C4X: the tree place's
   * benches used to stop it, and the first well was often off on its own).
   */
  private wellGathering(): void {
    const p = this.p;
    const w = this.w;
    const homesNear = (b: Building) =>
      w.buildings.filter(
        (h) =>
          h.stage === 'built' &&
          content.buildingById.get(h.def)?.housing &&
          Math.abs(h.x - b.x) <= 9 &&
          Math.abs(h.z - b.z) <= 9,
      ).length;
    // C4X: the first such well (most homes first) where two seats and a tree can still go; the
    // busiest one was sometimes boxed in by homes and fields, and the pattern never came.
    const wells = w.buildings
      .filter((b) => b.def === 'well' && b.stage === 'built' && homesNear(b) >= 3)
      .sort((a, b) => homesNear(b) - homesNear(a) || a.id - b.id);
    // Once the Pattern Book hints at it and the hamlet has a few streets (seats placed on day one
    // took the plots the first cottages wanted).
    const gather = w.hearth.hints.includes('well-gathering-place') && w.residents.length >= 20;
    for (const well of gather ? wells : []) {
      // Distances as the Pattern Book measures them: from the well's footprint, in a straight line.
      const d = content.buildingById.get(well.def)!;
      const [ww, wd] = well.rot % 2 === 0 ? d.size : [d.size[1], d.size[0]];
      const reach = (r: number) => (fx: number, fz: number) => {
        const tx = Math.floor(fx / TILE_FP);
        const tz = Math.floor(fz / TILE_FP);
        const gx = Math.max(0, well.x - tx, tx - (well.x + ww - 1));
        const gz = Math.max(0, well.z - tz, tz - (well.z + wd - 1));
        return gx * gx + gz * gz <= r * r + r;
      };
      const near = (def: string, r: number) =>
        w.decor.filter((x) => x.def === def && reach(r)(x.fx, x.fz)).length;
      const shade = reach(3);
      const benches = near('bench', 2) >= 2 ? null : p.decorSpot('bench', well.x, well.z, 4, reach(2));
      if (near('bench', 2) < 2 && !benches) continue;
      const shaded = near('apple-tree', 3) + near('cherry-tree', 3) > 0 || treeNear(w, well, 3, 2);
      const tree = shaded
        ? null
        : (['apple-tree', 'cherry-tree'] as const)
            .map((t) => [t, p.decorSpot(t, well.x, well.z, 5, shade)] as const)
            .find(([, at]) => at);
      if (!shaded && !tree) continue;
      if (benches) this.place('bench', benches, 'by the well');
      if (tree) this.place(tree[0], tree[1], 'by the well');
      break;
    }
  }

  /**
   * C4X: the Pattern Book's Tree Place, as a human reads its hint once it shows ("a grown tree where
   * paths meet, with a couple of seats in its shade"): a garden tree just off a straight lane near
   * the town hall, a bench on either side of it. Without it the harness found only two patterns on
   * some valleys and never met the Village Charter.
   */
  private treePlace(): void {
    const w = this.w;
    if (!w.hearth.hints.includes('tree-place') || this.p.coins() < 60) return;
    if (w.hearth.discovered.some((p) => p.pattern === 'tree-place')) return;
    const reader = worldIndex(w).reader;
    const tree = content.decorById.get('cherry-tree')!;
    const bench = content.decorById.get('bench')!;
    const hall = w.buildings.find((b) => b.def === 'town-hall');
    const cx = hall?.x ?? S >> 1;
    const cz = hall?.z ?? S >> 1;
    const road = (x: number, z: number) =>
      x > 0 && z > 0 && x < S - 1 && z < S - 1 && !!w.map.road[idx(x, z)];
    const free = (x: number, z: number) =>
      !road(x, z) && !w.map.zone[idx(x, z)] && !w.map.occupant[idx(x, z)];
    const at = (x: number, z: number): [number, number] => [
      x * TILE_FP + TILE_FP / 2,
      z * TILE_FP + TILE_FP / 2,
    ];
    for (let r = 2; r <= 30; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!road(x, z)) continue;
          // Along an east-west run the tree stands north or south of it, and the other way round.
          const runs: [ax: number, az: number][] = [];
          if (road(x - 1, z) && road(x + 1, z)) runs.push([1, 0]);
          if (road(x, z - 1) && road(x, z + 1)) runs.push([0, 1]);
          for (const [ax, az] of runs) {
            for (const side of [1, -1]) {
              const tx = x + az * side;
              const tz = z + ax * side;
              const b1: [number, number] = [tx - ax, tz - az];
              const b2: [number, number] = [tx + ax, tz + az];
              if (!free(tx, tz) || !free(...b1) || !free(...b2)) continue;
              const t = at(tx, tz);
              const p1 = at(...b1);
              const p2 = at(...b2);
              const rot = ax ? 0 : 16;
              if (!canPlaceDecor(reader, tree, t[0], t[1], 0).ok) continue;
              if (!canPlaceDecor(reader, bench, p1[0], p1[1], rot).ok) continue;
              if (!canPlaceDecor(reader, bench, p2[0], p2[1], rot).ok) continue;
              this.p.do('a tree place by the lane', [
                { t: 'decor.place', def: 'cherry-tree', fx: t[0], fz: t[1], rot: 0 },
                { t: 'decor.place', def: 'bench', fx: p1[0], fz: p1[1], rot },
                { t: 'decor.place', def: 'bench', fx: p2[0], fz: p2[1], rot },
              ]);
              return;
            }
          }
        }
      }
    }
  }
}

export const hearth: AdvisorDef = {
  id: 'hearth',
  slot: 60,
  plays: (opts) => opts.hearth !== false,
  create: (p) => new Hearth(p),
};
