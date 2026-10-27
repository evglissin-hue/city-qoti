// The autoplayer's Village chapter (C4B): once the hamlet is a Village, the Ledger player lays a
// high street off the town's lanes into open land and zones it the way a real one fills in, shops
// by the junction, homes along the middle (cottages one side, townhouses the other), workshops
// further out and farms at the end where the soil is good. From then on the village grows itself;
// the Ledger stops building homes by hand. Also: the frontage as a top-down map, and the numbers a
// day line adds for growth.
import { content } from '@qoti/content';
import {
  canPaintRoad,
  canPlaceBuilding,
  doorTile,
  FIELD_MIN_FERTILITY,
  growthDemand,
  MAP_SIZE,
  type Building,
  type Command,
  type GrowthDemand,
  type Rect,
  type Rot4,
  type WorldState,
  worldIndex,
  Zone,
} from '@qoti/sim';

const S = MAP_SIZE;

/** Harness only: the valley holds the Village rank, as if the Charter had been claimed. */
export function promoteToVillage(w: WorldState): void {
  if (w.charter.rank !== 'hamlet') return;
  const charter = content.charterById.get('village');
  w.charter.rank = 'village';
  w.charter.charter = content.charters.find((c) => c.from === 'village')?.id ?? '';
  w.charter.progress = [];
  w.charter.ready = false;
  w.charter.history.push({ rank: 'village', tick: w.tick, seats: [0, 1] });
  for (const u of charter?.unlocks ?? []) if (!w.hearth.unlocked.includes(u)) w.hearth.unlocked.push(u);
}

export interface HighStreet {
  /** Lane tiles from the junction outward. */
  tiles: [number, number][];
  /** Direction along the street and to its left. */
  dx: number;
  dz: number;
}

const LENGTH = 22;
const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function townCenter(w: WorldState): [number, number] {
  const th = w.buildings.find((b) => b.def === 'town-hall');
  if (th) return [th.x + 2, th.z + 2];
  const [x0, z0, x1, z1] = w.meta.startArea;
  return [(x0 + x1) >> 1, (z0 + z1) >> 1];
}

function open(w: WorldState, x: number, z: number): boolean {
  if (x < 2 || z < 2 || x >= S - 2 || z >= S - 2) return false;
  const i = z * S + x;
  const m = w.map;
  return !m.road[i] && !m.occupant[i] && !m.water[i] && !m.fieldOwner[i] && !m.zone[i];
}

/**
 * The best place for a high street: straight out from a road tile near the town hall into open
 * land, gentle enough to pave, with the most open ground three tiles deep on both sides (trees
 * count against it, distance from the hall a little too).
 */
export function planHighStreet(w: WorldState): HighStreet | null {
  const [cx, cz] = townCenter(w);
  const reader = worldIndex(w).reader;
  const stores = w.buildings
    .filter((b) => b.def === 'storehouse')
    .map((b) => {
      const d = doorTile(b);
      return [d % S, Math.floor(d / S)] as const;
    });
  let best: HighStreet | null = null;
  let bestScore = -Infinity;
  for (let z = cz - 24; z <= cz + 24; z++) {
    for (let x = cx - 24; x <= cx + 24; x++) {
      if (x < 0 || z < 0 || x >= S || z >= S || !w.map.road[z * S + x]) continue;
      for (const [dx, dz] of DIRS) {
        const tiles: [number, number][] = [];
        for (let k = 1; k <= LENGTH; k++) tiles.push([x + dx * k, z + dz * k]);
        if (!tiles.every(([tx, tz]) => open(w, tx, tz))) continue;
        if (!canPaintRoad(reader, 'lane', tiles).ok) continue;
        let score = 0;
        for (const [tx, tz] of tiles) {
          // Porters must reach it, or nothing grown there gets its planks.
          if (!stores.some(([sx, sz]) => Math.abs(sx - tx) + Math.abs(sz - tz) <= 22)) score -= 12;
          for (const side of [-1, 1]) {
            for (let d = 1; d <= 3; d++) {
              const sx = tx + -dz * side * d;
              const sz = tz + dx * side * d;
              if (!open(w, sx, sz)) score -= 2;
              else if (w.map.tree[sz * S + sx]) score -= 0.5;
              else score += 1;
            }
          }
        }
        score -= (Math.abs(x - cx) + Math.abs(z - cz)) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = { tiles, dx, dz };
        }
      }
    }
  }
  return best;
}

/** Zones along a high street: shops, homes (cottages left, townhouses right), crafts, farms. */
export function zoneHighStreet(w: WorldState, street: HighStreet): Command[] {
  const byZone = new Map<string, [number, number][]>();
  const add = (zone: string, x: number, z: number) => {
    if (!open(w, x, z)) return;
    const list = byZone.get(zone) ?? [];
    list.push([x, z]);
    byZone.set(zone, list);
  };
  const { dx, dz } = street;
  street.tiles.forEach(([tx, tz], k) => {
    for (const side of [-1, 1]) {
      const left = side === -1;
      // Farms want good soil: the last stretch, if it has it, else more cottages.
      let fert = 0;
      for (let d = 1; d <= 3; d++) fert += w.map.fertility[(tz + dx * side * d) * S + tx + -dz * side * d]!;
      const farm = k >= 17 && fert / 3 >= FIELD_MIN_FERTILITY;
      const zone =
        k < 4
          ? 'shops'
          : k < 13
            ? left
              ? 'homes-low'
              : 'homes-medium'
            : k < 17
              ? 'crafts'
              : farm
                ? 'farms'
                : 'homes-low';
      const depth = zone === 'farms' ? 7 : 3;
      for (let d = 1; d <= depth; d++) add(zone, tx + -dz * side * d, tz + dx * side * d);
    }
  });
  const cmds: Command[] = [];
  for (const [zone, tiles] of byZone) {
    for (let k = 0; k < tiles.length; k += 256)
      cmds.push({ t: 'zone.paint', zone, tiles: tiles.slice(k, k + 256) });
  }
  return cmds;
}

/**
 * Where the Ledger puts a storehouse for the far end of the high street, so porters reach the lots
 * there: the free spot nearest the street's end, door onto a road, off the zoned land (C4X: and
 * within reach of a standing storehouse, whose porters must bring its own planks, and of at least
 * two lots no porter reaches yet; the spot at the very end was out of every porter's reach, so the
 * site stood unsupplied until it was cancelled, again and again).
 */
export function storehouseSpot(w: WorldState, street: HighStreet): [number, number, Rot4] | null {
  const def = content.buildingById.get('storehouse')!;
  const reader = worldIndex(w).reader;
  const [ex, ez] = street.tiles[street.tiles.length - 1]!;
  const man = (a: number, x: number, z: number) => Math.abs((a % S) - x) + Math.abs(Math.floor(a / S) - z);
  const stores = w.buildings.filter((b) => b.def === 'storehouse' && b.stage === 'built').map((b) => doorTile(b));
  const far = w.lots
    .filter((l) => !l.buildingId && !stores.some((d) => man(d, l.frontage % S, Math.floor(l.frontage / S)) <= 22))
    .map((l) => l.frontage);
  for (let r = 1; r <= 20; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
          const p = canPlaceBuilding(reader, def, ex + dx, ez + dz, rot);
          if (!p.ok || p.warnings.includes('NO_ROAD')) continue;
          if (p.tiles.some(([x, z]) => w.map.zone[z * S + x])) continue;
          const door = doorTile({ def: 'storehouse', x: ex + dx, z: ez + dz, rot } as Building, def);
          const dx0 = door % S;
          const dz0 = Math.floor(door / S);
          if (!stores.some((d) => man(d, dx0, dz0) <= 22)) continue;
          if (far.filter((f) => man(f, dx0, dz0) <= 22).length < 2) continue;
          return [ex + dx, ez + dz, rot];
        }
      }
    }
  }
  return null;
}

/** Empty lots of the high street porters cannot reach yet. */
export function unreachedLots(w: WorldState): number {
  const stores = w.buildings
    .filter((b) => b.def === 'storehouse')
    .map((b) => {
      const d = doorTile(b);
      return [d % S, Math.floor(d / S)] as const;
    });
  let n = 0;
  for (const l of w.lots) {
    if (l.buildingId) continue;
    const fx = l.frontage % S;
    const fz = Math.floor(l.frontage / S);
    if (!stores.some(([x, z]) => Math.abs(x - fx) + Math.abs(z - fz) <= 22)) n++;
  }
  return n;
}

/** The rect around a high street and its zones, for maps. */
export function streetRect(street: HighStreet, pad = 9): Rect {
  const xs = street.tiles.map(([x]) => x);
  const zs = street.tiles.map(([, z]) => z);
  return [
    Math.max(0, Math.min(...xs) - pad),
    Math.max(0, Math.min(...zs) - pad),
    Math.min(S - 1, Math.max(...xs) + pad),
    Math.min(S - 1, Math.max(...zs) + pad),
  ];
}

const ZONE_CHAR: Record<number, string> = {
  [Zone.homesLow]: 'h',
  [Zone.homesMedium]: 'm',
  [Zone.shops]: 's',
  [Zone.crafts]: 'c',
  [Zone.farms]: 'f',
};
const BUILT_CHAR: Record<number, string> = {
  [Zone.homesLow]: 'H',
  [Zone.homesMedium]: 'M',
  [Zone.shops]: 'S',
  [Zone.crafts]: 'C',
  [Zone.farms]: 'F',
};

/**
 * A top-down map: roads (= lane, # street, . path), grown buildings by zone in capitals (H homes,
 * M townhouses, S shops, C crafts, F farms; + while going up), empty lots by their zone in lower
 * case, zoned land outside any lot ',', other buildings B, fields ~, trees ^, water w. Grass is
 * blank.
 */
export function frontageAscii(w: WorldState, rect: Rect): string {
  const m = w.map;
  const rows: string[] = [];
  for (let z = rect[1]; z <= rect[3]; z++) {
    let row = '';
    for (let x = rect[0]; x <= rect[2]; x++) {
      const i = z * S + x;
      const occ = m.occupant[i]!;
      const b = occ ? w.buildings.find((x2) => x2.id === occ) : undefined;
      const lot = b?.lot ? w.lots.find((l) => l.id === b.lot) : undefined;
      if (m.road[i]) row += m.road[i] === 3 ? '#' : m.road[i] === 2 ? '=' : '.';
      else if (b && lot) {
        row += b.stage === 'built' ? (BUILT_CHAR[lot.zone] ?? 'G') : '+';
      } else if (b) row += 'B';
      else if (m.lot[i]) row += ZONE_CHAR[w.lots.find((l) => l.id === m.lot[i])?.zone ?? 0] ?? ':';
      else if (m.fieldOwner[i]) row += '~';
      else if (m.zone[i]) row += ',';
      else if (m.water[i]) row += 'w';
      else if (m.tree[i]) row += '^';
      else row += ' ';
    }
    rows.push(row.trimEnd());
  }
  return rows.join('\n');
}

/** Grown buildings by def and by district style, for the end of a run ("cottage 7, sawpit 2 | brick 4..."). */
export function grownSummary(w: WorldState): string {
  const defs = new Map<string, number>();
  const styles = new Map<string, number>();
  for (const b of w.buildings) {
    if (!b.lot) continue;
    defs.set(b.def, (defs.get(b.def) ?? 0) + 1);
    styles.set(b.style ?? '', (styles.get(b.style ?? '') ?? 0) + 1);
  }
  const list = (m: Map<string, number>) =>
    [...m]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  return `grown: ${list(defs)} | styles: ${list(styles)}`;
}

/** One night's growth pass: what it wanted per zone kind, and what it started. */
export interface GrowthNight {
  demand: GrowthDemand;
  started: GrowthDemand;
}

/** Grown buildings added between two lines, per zone kind. */
export function grownSince(before: GrowthLine, after: GrowthLine): GrowthDemand {
  return {
    homes: after.homes - before.homes,
    shops: after.shops - before.shops,
    crafts: after.crafts - before.crafts,
    farms: after.farms - before.farms,
  };
}

export interface GrowthLine {
  /** The night that opened the day (Village runs, after the first). */
  night?: GrowthNight;
  lots: number;
  /** Grown buildings by zone kind: homes (both densities), shops, crafts, farms; built and going up. */
  homes: number;
  shops: number;
  crafts: number;
  farms: number;
  sites: number;
  demand: GrowthDemand;
}

export function growthLine(w: WorldState): GrowthLine {
  const out: GrowthLine = {
    lots: w.lots.length,
    homes: 0,
    shops: 0,
    crafts: 0,
    farms: 0,
    sites: 0,
    demand: growthDemand(w),
  };
  for (const b of w.buildings) {
    if (!b.lot) continue;
    const lot = w.lots.find((l) => l.id === b.lot);
    if (!lot) continue;
    if (b.stage === 'construction') out.sites++;
    if (lot.zone === Zone.homesLow || lot.zone === Zone.homesMedium) out.homes++;
    else if (lot.zone === Zone.shops) out.shops++;
    else if (lot.zone === Zone.crafts) out.crafts++;
    else if (lot.zone === Zone.farms) out.farms++;
  }
  return out;
}
