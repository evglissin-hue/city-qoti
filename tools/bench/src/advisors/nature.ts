// The nature advisor (C5C): the Hearth hand inviting wildlife, from Village rank. It proposes; the
// planner's money and build queue decide. One afternoon job a day at most, in this order:
// - an apiary once the town has an orchard or a market garden (a want, so it waits its turn);
// - flowers by each orchard and apiary (three within three tiles), for the pollinators;
// - hedges along a lane near homes (a run of four, up to HEDGES), for the hedgerow birds;
// - a pond near homes once affordable (a 2 x 3 dig of fertile low ground), then planting, a bench
//   and a path by it (the Pond Garden) and reeds once they are unlocked;
// - low walls and ivy for garden nooks, and now and then a module on a townhouse.
// Everything it spends keeps the planner's reserve (MONEY_RESERVE) plus a margin in hand, and comes
// out of the season's surplus (income over expenses so far), so nature is paid for by a town in profit.
import { content } from '@qoti/content';
import {
  canPaintRoad,
  canPlaceDecor,
  doorTile,
  hasTag,
  pondBlocked,
  pondCost,
  rankAtLeast,
  TILE_FP,
  worldIndex,
  type Building,
  type WorldState,
} from '@qoti/sim';
import { costOf, MONEY_RESERVE, type Planner } from '../planner';
import { count, countTrade, S } from '../town';
import type { Advisor, AdvisorDef, Visit } from './types';

/** Coins the advisor keeps in hand above the planner's reserve before spending on nature. */
export const NATURE_MARGIN = 150;
/** Hedge pieces it plants in all. */
export const HEDGES = 24;
/** Days between modules. */
export const MODULE_EVERY = 4;

function homes(w: WorldState): Building[] {
  return w.buildings.filter(
    (b) => b.stage === 'built' && content.buildingById.get(b.def)?.category === 'home',
  );
}

function decorNear(w: WorldState, tag: string, x: number, z: number, r: number): number {
  let n = 0;
  for (const d of w.decor) {
    if (!content.decorById.get(d.def)?.tags.includes(tag)) continue;
    const dx = d.fx / TILE_FP - x - 0.5;
    const dz = d.fz / TILE_FP - z - 0.5;
    if (dx * dx + dz * dz <= r * r) n++;
  }
  return n;
}

class Nature implements Advisor {
  private day = 0;
  private lastModule = -MODULE_EVERY;
  private pond: [number, number] | null = null;

  constructor(readonly p: Planner) {}

  private get w(): WorldState {
    return this.p.w;
  }

  /** Coins to spare: the reserve and a margin in hand, and this season's books in the black. */
  private spare(cost: number): boolean {
    if (this.p.seasonBalance() < cost) return false;
    return this.p.coins() >= cost + MONEY_RESERVE + NATURE_MARGIN;
  }

  private place(def: string, at: [number, number] | null, why: string): boolean {
    if (!at || !this.spare(4)) return false;
    return this.p.do(`${def} ${why}`, [
      { t: 'decor.place', def, fx: at[0], fz: at[1], rot: (at[0] * 31 + at[1]) % 64 },
    ]);
  }

  private flowersBy(def: string): boolean {
    for (const b of this.w.buildings) {
      if (!hasTag(b, def) || b.stage !== 'built') continue;
      const door = doorTile(b);
      const x = door % S;
      const z = Math.floor(door / S);
      if (decorNear(this.w, 'flower', x, z, 4) >= 3) continue;
      let ok = false;
      for (let k = 0; k < 3; k++)
        ok = this.place('flower-bed', this.p.decorSpot('flower-bed', x, z, 3), `by the ${def}`) || ok;
      if (ok) return true;
    }
    return false;
  }

  private hedges(): boolean {
    const w = this.w;
    if (w.decor.filter((d) => d.def === 'hedge').length >= HEDGES) return false;
    for (const h of homes(w)) {
      const door = doorTile(h);
      const x = door % S;
      const z = Math.floor(door / S);
      if (decorNear(w, 'hedge', x, z, 6) > 0) continue;
      let n = 0;
      for (let k = 0; k < 4; k++)
        if (this.place('hedge', this.p.decorSpot('hedge', x, z, 3), 'along the lane')) n++;
      if (n > 0) return true;
    }
    return false;
  }

  /** A 2 x 3 block of ground a pond may go in, near a home. */
  private pondSpot(): [number, number][] | null {
    const w = this.w;
    for (const h of homes(w)) {
      for (let r = 2; r <= 12; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const tiles: [number, number][] = [];
            for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) tiles.push([h.x + dx + a, h.z + dz + b]);
            if (tiles.some(([x, z]) => x < 2 || z < 2 || x >= S - 2 || z >= S - 2)) continue;
            if (pondBlocked(w, tiles) === null) return tiles;
          }
        }
      }
    }
    return null;
  }

  private dig(): boolean {
    const w = this.w;
    if (this.pond || !this.spare(pondCost(6) / 100 + 40)) return false;
    if (homes(w).length < 8) return false;
    const tiles = this.pondSpot();
    if (!tiles || !this.p.do('dig a pond near homes', [{ t: 'terrain.pond', tiles }])) return false;
    this.pond = tiles[0]!;
    return true;
  }

  /** Planting, a bench and a path by the pond; reeds once unlocked. */
  private pondGarden(): boolean {
    if (!this.pond) return false;
    const [x, z] = this.pond;
    const w = this.w;
    if (decorNear(w, 'flower', x + 1, z, 4) < 2)
      return this.place('flower-bed', this.p.decorSpot('flower-bed', x + 1, z, 3), 'by the pond');
    if (decorNear(w, 'seat', x + 1, z, 4) < 1)
      return this.place('bench', this.p.decorSpot('bench', x + 1, z, 3), 'by the pond');
    if (w.hearth.unlocked.includes('reed-bed') && decorNear(w, 'reeds', x + 1, z, 4) < 2)
      return this.place('reed-bed', this.p.decorSpot('reed-bed', x + 1, z, 2), 'in the pond');
    // A path along the pond's south side, so walkers come by.
    const tiles: [number, number][] = [];
    for (let a = -1; a <= 3; a++) tiles.push([x + a, z + 2]);
    const reader = worldIndex(w).reader;
    const fresh = tiles.filter(
      ([tx, tz]) => !w.map.road[tz * S + tx] && canPaintRoad(reader, 'path', [[tx, tz]]).ok,
    );
    if (fresh.length === 0 || !this.spare(fresh.length)) return false;
    return this.p.do('path by the pond', [{ t: 'road.paint', kind: 'path', tiles: fresh }]);
  }

  /** Low walls and ivy for garden nooks, and a module on a townhouse now and then. */
  private nooks(): boolean {
    const w = this.w;
    if (this.day - this.lastModule < MODULE_EVERY) return false;
    const th = w.buildings.find(
      (b) =>
        b.stage === 'built' &&
        b.def === 'townhouse' &&
        b.rt &&
        !b.rt.moduleNext &&
        !b.rt.upgrade &&
        !(b.rt.modules ?? []).some(([s]) => s === 'wall'),
    );
    const target = th ?? w.buildings.find((b) => b.def === 'herbalists-cottage' && b.rt && !b.rt.moduleNext);
    if (!target || !this.spare(10)) return false;
    const open = content.buildingById
      .get(target.def)
      ?.moduleSlots?.find(([s]) => !(target.rt!.modules ?? []).some(([x]) => x === s));
    if (!open) return false;
    const mod = open[0] === 'wall' ? 'ivy' : content.modules.find((m) => m.slot === open[0])?.id;
    if (!mod || !this.spare((content.moduleById.get(mod)?.cost?.coins ?? 0) + 10)) return false;
    this.lastModule = this.day;
    return this.p.do(`${mod} on a ${target.def}`, [
      { t: 'build.setModule', id: target.id, slot: open[0], module: mod },
    ]);
  }

  /**
   * R1F (the village advisor's in R1.0, a Hearth job): flowers and a tree by the homes with the
   * plainest streets, so they reach the Craftsfolk's charm.
   */
  private dress(): void {
    const w = this.w;
    const homes = w.buildings
      .filter((b) => b.stage === 'built' && content.buildingById.get(b.def)?.housing)
      .map((b) => ({ b, charm: charmAt(w, b) }))
      .filter((x) => x.charm < 32)
      .sort((a, b) => a.charm - b.charm || a.b.id - b.b.id)
      .slice(0, 10);
    for (const { b } of homes) {
      const door = doorTile(b);
      const x = door % S;
      const z = Math.floor(door / S);
      for (const def of ['flower-bed', 'planter', 'cherry-tree']) {
        const spot = streetDecorSpot(w, def, x, z);
        if (spot)
          this.p.do(`${def} for the street`, [{ t: 'decor.place', def, fx: spot[0], fz: spot[1], rot: 0 }]);
      }
    }
  }

  visit(v: Visit): void {
    const w = this.w;
    if (!v.afternoon || !rankAtLeast(w, 'village')) return;
    this.dress();
    this.day++;
    if (count(w, 'apiary') === 0 && (countTrade(w, 'orchard') > 0 || countTrade(w, 'market-garden') > 0)) {
      this.p.propose({
        def: 'apiary',
        priority: 2,
        cost: costOf('apiary'),
        pressing: false,
        essential: false,
      });
    }
    if (this.flowersBy('orchard') || this.flowersBy('apiary')) return;
    if (this.hedges()) return;
    if (this.dig() || this.pondGarden()) return;
    this.nooks();
  }
}

function charmAt(w: WorldState, b: Building): number {
  const door = doorTile(b);
  const x = door % S;
  const z = Math.floor(door / S);
  let sum = 0;
  let n = 0;
  for (let dz = -3; dz <= 3; dz++)
    for (let dx = -3; dx <= 3; dx++) {
      const i = (z + dz) * S + x + dx;
      if (i >= 0 && i < w.map.charm.length) {
        sum += w.map.charm[i]!;
        n++;
      }
    }
  return n ? sum / n : 0;
}

/** A free spot for decor within three tiles of a door, or null. */
function streetDecorSpot(w: WorldState, def: string, x: number, z: number): [number, number] | null {
  const d = content.decorById.get(def)!;
  const reader = worldIndex(w).reader;
  for (let r = 1; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const fx = (x + dx) * TILE_FP + TILE_FP / 2;
        const fz = (z + dz) * TILE_FP + TILE_FP / 2;
        if (canPlaceDecor(reader, d, fx, fz, 0).ok) return [fx, fz];
      }
    }
  }
  return null;
}

export const nature: AdvisorDef = {
  id: 'nature',
  lane: 'hearth',
  // After the Hearth's wishes and decor (60).
  slot: 65,
  plays: (opts, w) => w.settings.mode === 'standard' && opts.hearth !== false && content.wildlife.length > 0,
  create: (p) => new Nature(p),
};
