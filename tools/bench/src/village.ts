// The autoplayer's Village chapter (C4B): once the hamlet is a Village, the Ledger player lays a
// high street off the town's lanes into open land and zones it the way a real one fills in, shops
// by the junction, homes along the middle (cottages one side, townhouses the other), workshops
// further out and farms at the end where the soil is good. From then on the village grows itself;
// the Ledger stops building homes by hand. Also: the frontage as a top-down map, and the numbers a
// day line adds for growth.
// R1.0: the street is laid on the first day (Homes, Workshops and Farmland are open from founding);
// shops and townhouses join the layout from Village rank.
import { content } from '@qoti/content';
import {
  applyRankDefaults,
  canPaintRoad,
  canPlaceBuilding,
  doorTile,
  FIELD_GOOD_FERTILITY,
  growthDemand,
  MAP_SIZE,
  Road,
  type Building,
  type Command,
  type GrowthDemand,
  type Rect,
  type Rot4,
  type WorldState,
  worldIndex,
  Zone,
} from '@qoti/sim';
import { growableLots, isGarden } from './town';

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
  // R1: the carrier's Village defaults (Wares and Treats to Always), as the real claim sets them.
  applyRankDefaults(w);
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
export function planHighStreet(w: WorldState, length = LENGTH): HighStreet | null {
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
        for (let k = 1; k <= length; k++) tiles.push([x + dx * k, z + dz * k]);
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

/**
 * Zones along a high street: shops, homes (cottages left, townhouses right), crafts, farms. R1: a
 * Hamlet's street (`village` false) has only the zones open from founding: workshops by the
 * junction, cottages both sides, more workshops, then Farmland on good soil.
 */
export function zoneHighStreet(w: WorldState, street: HighStreet, village = true): Command[] {
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
      const farm = k >= 17 && fert / 3 >= FIELD_GOOD_FERTILITY;
      const zone =
        k < 4
          ? village
            ? 'shops'
            : 'crafts'
          : k < 13
            ? left || !village
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
 * there: the free spot nearest the lots porters miss (C4X: on any street, not only the first), door onto a road, off the zoned land (C4X: and
 * within reach of a standing storehouse, whose porters must bring its own planks, and of at least
 * two lots no porter reaches yet; the spot at the very end was out of every porter's reach, so the
 * site stood unsupplied until it was canceled, again and again).
 */
export function storehouseSpot(w: WorldState, street: HighStreet): [number, number, Rot4] | null {
  const def = content.buildingById.get('storehouse')!;
  const reader = worldIndex(w).reader;
  const man = (a: number, x: number, z: number) => Math.abs((a % S) - x) + Math.abs(Math.floor(a / S) - z);
  const stores = w.buildings
    .filter((b) => b.def === 'storehouse' && b.stage === 'built')
    .map((b) => doorTile(b));
  const far = growableLots(w)
    .filter(
      (l) => !l.buildingId && !stores.some((d) => man(d, l.frontage % S, Math.floor(l.frontage / S)) <= 22),
    )
    .map((l) => l.frontage);
  // Searched from the middle of the lots no porter reaches (on any street), else the street's end.
  let [ex, ez] = street.tiles[street.tiles.length - 1]!;
  if (far.length > 0) {
    ex = Math.round(far.reduce((n, f) => n + (f % S), 0) / far.length);
    ez = Math.round(far.reduce((n, f) => n + Math.floor(f / S), 0) / far.length);
  }
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

/** R1F: the zone id a demand bar asks for, in DEMAND_KINDS order (Homes, Shops, Workshops, Farmland). */
export const BAR_ZONES: readonly string[] = ['homes-low', 'shops', 'crafts', 'farms'];

/** What `frontageFor` reads; `rank` (R2E) adds to a candidate run's score from the road tiles it fronts and the lot tiles. */
export interface FrontageOpts {
  minLen?: number;
  maxLen?: number;
  depth?: number;
  tiles?: number;
  rank?: (road: readonly [number, number][], lots: readonly [number, number][]) => number;
}

/**
 * R1F: open frontage for `zone` along the town's roads, the way a player answers a lit demand bar:
 * a straight run of `minLen` to `maxLen` tiles beside a lane or street (or a path, which costs no
 * new road), `depth` tiles
 * deep on one side, all open (no road, building, water, field, zone or tree), within the porters'
 * 22 tiles of a storehouse door, and for Farmland on soil good enough to farm. The run nearest the
 * town center wins. Returns the tiles to paint, or null when no run fits.
 */
export function frontageFor(w: WorldState, zone: string, opts: FrontageOpts = {}): [number, number][] | null {
  // R1F: several runs, best first, until about `tiles` tiles (a few lots) are found: one stroke a
  // bar, not one lot a day.
  const want = opts.tiles ?? 40;
  const taken = new Set<number>();
  const out: [number, number][] = [];
  while (out.length < want) {
    const run = bestRun(w, zone, opts, taken);
    if (!run) break;
    for (const [x, z] of run) taken.add(z * S + x);
    out.push(...run);
  }
  return out.length > 0 ? out.slice(0, 256) : null;
}

function bestRun(
  w: WorldState,
  zone: string,
  opts: FrontageOpts,
  taken: ReadonlySet<number>,
): [number, number][] | null {
  const farms = zone === 'farms';
  const minLen = opts.minLen ?? 4;
  const maxLen = opts.maxLen ?? 10;
  const depth = opts.depth ?? (farms ? 5 : 3);
  const [cx, cz] = townCenter(w);
  const doors = w.buildings
    .filter((b) => b.def === 'storehouse' && b.stage === 'built')
    .map((b) => doorTile(b));
  const reached = (x: number, z: number) =>
    doors.some((d) => Math.abs((d % S) - x) + Math.abs(Math.floor(d / S) - z) <= 22);
  // Lots are cut along paths too; lanes and streets are preferred.
  const paved = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < S && z < S && w.map.road[z * S + x]! >= Road.path;
  const column = (x: number, z: number, px: number, pz: number): boolean => {
    if (!reached(x + px, z + pz)) return false;
    let fert = 0;
    for (let d = 1; d <= depth; d++) {
      const tx = x + px * d;
      const tz = z + pz * d;
      if (!open(w, tx, tz) || w.map.tree[tz * S + tx] || taken.has(tz * S + tx)) return false;
      fert += w.map.fertility[tz * S + tx]!;
    }
    return !farms || fert / depth >= FIELD_GOOD_FERTILITY;
  };
  let best: [number, number][] | null = null;
  let bestScore = -Infinity;
  // R1F: as far out as the porters' storehouses go (a Village used up the frontage within 30 tiles).
  for (let z = Math.max(1, cz - 45); z <= Math.min(S - 2, cz + 45); z++) {
    for (let x = Math.max(1, cx - 45); x <= Math.min(S - 2, cx + 45); x++) {
      if (!paved(x, z)) continue;
      for (const [ax, az] of [
        [1, 0],
        [0, 1],
      ] as const) {
        // Only from the start of a straight run.
        if (paved(x - ax, z - az)) continue;
        let len = 0;
        while (paved(x + ax * len, z + az * len)) len++;
        for (const side of [-1, 1]) {
          const px = -az * side;
          const pz = ax * side;
          let k = 0;
          while (k < len) {
            if (!column(x + ax * k, z + az * k, px, pz)) {
              k++;
              continue;
            }
            const from = k;
            while (k < len && k - from < maxLen && column(x + ax * k, z + az * k, px, pz)) k++;
            const n = k - from;
            if (n < minLen) continue;
            const mx = x + ax * (from + (n >> 1));
            const mz = z + az * (from + (n >> 1));
            const lane = w.map.road[z * S + x]! >= Road.lane ? 6 : 0;
            let score = n * 2 + lane - (Math.abs(mx - cx) + Math.abs(mz - cz)) * 0.5;
            const run: [number, number][] = [];
            for (let j = from; j < k; j++)
              for (let d = 1; d <= depth; d++) run.push([x + ax * j + px * d, z + az * j + pz * d]);
            if (opts.rank) {
              const road: [number, number][] = [];
              for (let j = from; j < k; j++) road.push([x + ax * j, z + az * j]);
              score += opts.rank(road, run);
            }
            if (score <= bestScore) continue;
            bestScore = score;
            best = run;
          }
        }
      }
    }
  }
  return best;
}

/**
 * R1F: zones a new street for the bars that are lit, in the high street's order (shops by the
 * junction, homes, workshops, farms at the end where the soil is good), an equal stretch each.
 */
export function zoneStreetFor(w: WorldState, street: HighStreet, zones: readonly string[]): Command[] {
  const order = ['shops', 'homes-low', 'homes-medium', 'crafts', 'farms'].filter((z) => zones.includes(z));
  if (order.length === 0) return [];
  const byZone = new Map<string, [number, number][]>();
  const { dx, dz } = street;
  const per = Math.ceil(street.tiles.length / order.length);
  street.tiles.forEach(([tx, tz], k) => {
    const zone = order[Math.min(order.length - 1, Math.floor(k / per))]!;
    for (const side of [-1, 1]) {
      const depth = zone === 'farms' ? 5 : 3;
      let fert = 0;
      for (let d = 1; d <= depth; d++)
        fert += w.map.fertility[(tz + dx * side * d) * S + tx + -dz * side * d]!;
      if (zone === 'farms' && fert / depth < FIELD_GOOD_FERTILITY) continue;
      for (let d = 1; d <= depth; d++) {
        const x = tx + -dz * side * d;
        const z = tz + dx * side * d;
        if (!open(w, x, z)) continue;
        const list = byZone.get(zone) ?? [];
        list.push([x, z]);
        byZone.set(zone, list);
      }
    }
  });
  const cmds: Command[] = [];
  for (const [zone, tiles] of byZone)
    for (let k = 0; k < tiles.length; k += 256)
      cmds.push({ t: 'zone.paint', zone, tiles: tiles.slice(k, k + 256) });
  return cmds;
}

/** Empty lots of the high street porters cannot reach yet. */
export function unreachedLots(w: WorldState): number {
  return farFrontages(w).length;
}

/** The frontage tiles of empty lots no storehouse's porters reach (22 tiles from any storehouse door). */
export function farFrontages(w: WorldState): number[] {
  const stores = w.buildings
    .filter((b) => b.def === 'storehouse')
    .map((b) => {
      const d = doorTile(b);
      return [d % S, Math.floor(d / S)] as const;
    });
  const far: number[] = [];
  for (const l of growableLots(w)) {
    if (l.buildingId) continue;
    const fx = l.frontage % S;
    const fz = Math.floor(l.frontage / S);
    if (!stores.some(([x, z]) => Math.abs(x - fx) + Math.abs(z - fz) <= 22)) far.push(l.frontage);
  }
  return far;
}

/**
 * R1X: where a storehouse the town wants anyway should go while lots lie beyond every porter: spots
 * whose middle is within reach of two or more of those lots (an `only` for the build queue), or null
 * with fewer than two. Willow's second storehouse went wherever it first fit from the town's middle,
 * north of town, and its far home lots stood empty for a week with timber in store.
 */
export function towardFarLots(
  w: WorldState,
): ((x: number, z: number, wd: number, dp: number) => boolean) | null {
  const far = farFrontages(w);
  if (far.length < 2) return null;
  return (x, z, wd, dp) => {
    const cx = x + (wd >> 1);
    const cz = z + (dp >> 1);
    let n = 0;
    for (const f of far)
      if (Math.abs((f % S) - cx) + Math.abs(Math.floor(f / S) - cz) <= 20 && ++n >= 2) return true;
    return false;
  };
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
      else if (m.lot[i]) {
        const at = w.lots.find((l) => l.id === m.lot[i]);
        // R2F: a garden lot is courtyard, drawn 'g', never an empty lot of its zone.
        row += at && isGarden(at) ? 'g' : (ZONE_CHAR[at?.zone ?? 0] ?? ':');
      } else if (m.fieldOwner[i]) row += '~';
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
    lots: growableLots(w).length,
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

/** R2E: whether a tile is open ground for zoning (no road, building, water, field, zone; inside the map's margin). */
export const openGround = open;

// --- R2E: a closed block of streets (gardens and corners) ------------------------------------------

/** A ring of street with lots cut inside it on all four sides, leaving a hollow behind their backs. */
export interface Block {
  /** The ring's road tiles in walking order. */
  ring: [number, number][];
  /** Min corner and side length of the ring's square. */
  x0: number;
  z0: number;
  n: number;
  /** The inner frontage by side: north, south, west, east (3 tiles deep, corners shared). */
  sides: [number, number][][];
}

/** Ring side lengths tried, in tiles: inner width 9 less two lots of depth 3 leaves a hollow of 3. */
export const BLOCK_SIDES: readonly number[] = [11, 10, 12];
/** How far from the anchor (a tile of the village street) a block's middle may lie. */
const BLOCK_REACH = 26;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * R2E: the nearest flat open square, joined to a road (a ring tile touches one, from outside),
 * where a ring of street fits with its whole inside free, so the lots cut inside it on four sides
 * close a hollow. Within porters' reach of a storehouse when it can be; null when nothing fits.
 */
export function planBlock(w: WorldState, anchor: readonly [number, number][]): Block | null {
  if (anchor.length === 0) return null;
  const reader = worldIndex(w).reader;
  const doors = w.buildings
    .filter((b) => b.def === 'storehouse' && b.stage === 'built')
    .map((b) => doorTile(b));
  const reached = (x: number, z: number) =>
    doors.some((d) => Math.abs((d % S) - x) + Math.abs(Math.floor(d / S) - z) <= 22);
  const [ax, az] = anchor[anchor.length >> 1]!;
  let best: Block | null = null;
  let bestScore = -Infinity;
  for (const n of BLOCK_SIDES) {
    for (let z0 = az - BLOCK_REACH; z0 <= az + BLOCK_REACH; z0++) {
      for (let x0 = ax - BLOCK_REACH; x0 <= ax + BLOCK_REACH; x0++) {
        if (x0 < 3 || z0 < 3 || x0 + n >= S - 3 || z0 + n >= S - 3) continue;
        const cx = x0 + (n >> 1);
        const cz = z0 + (n >> 1);
        let near = Infinity;
        for (const [sx, sz] of anchor) near = Math.min(near, Math.abs(sx - cx) + Math.abs(sz - cz));
        let score = -near - (n === 11 ? 0 : 3);
        if (score <= bestScore) continue;
        // The ring and its inside are open ground, flat enough to cut lots on.
        let ok = true;
        let lo = Infinity;
        let hi = -Infinity;
        for (let z = z0; z < z0 + n && ok; z++) {
          for (let x = x0; x < x0 + n; x++) {
            if (!open(w, x, z)) {
              ok = false;
              break;
            }
            const h = w.map.height[z * S + x]!;
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        }
        if (!ok || hi - lo > 2) continue;
        const ring: [number, number][] = [];
        for (let x = x0; x < x0 + n; x++) ring.push([x, z0]);
        for (let z = z0 + 1; z < z0 + n; z++) ring.push([x0 + n - 1, z]);
        for (let x = x0 + n - 2; x >= x0; x--) ring.push([x, z0 + n - 1]);
        for (let z = z0 + n - 2; z > z0; z--) ring.push([x0, z]);
        const inSquare = (x: number, z: number) => x >= x0 && x < x0 + n && z >= z0 && z < z0 + n;
        const joined = ring.some(([x, z]) =>
          NEIGHBORS.some(([dx, dz]) => {
            const tx = x + dx;
            const tz = z + dz;
            return (
              tx >= 0 && tz >= 0 && tx < S && tz < S && !inSquare(tx, tz) && w.map.road[tz * S + tx]! > 0
            );
          }),
        );
        if (!joined || !canPaintRoad(reader, 'street', ring).ok) continue;
        if (!reached(cx, cz)) score -= 30;
        if (score <= bestScore) continue;
        const inner = n - 2;
        const band = (fn: (k: number, d: number) => [number, number]): [number, number][] => {
          const out: [number, number][] = [];
          for (let d = 1; d <= 3; d++) for (let k = 0; k < inner; k++) out.push(fn(k, d));
          return out;
        };
        const sides: [number, number][][] = [
          band((k, d) => [x0 + 1 + k, z0 + d]),
          band((k, d) => [x0 + 1 + k, z0 + n - 1 - d]),
          band((k, d) => [x0 + d, z0 + 1 + k]),
          band((k, d) => [x0 + n - 1 - d, z0 + 1 + k]),
        ];
        bestScore = score;
        best = { ring, x0, z0, n, sides };
      }
    }
  }
  return best;
}

/** The side of a block (0 north, 1 south, 2 west, 3 east) whose middle lies nearest the anchor. */
export function nearestSide(b: Block, anchor: readonly [number, number][]): number {
  const mid = b.n >> 1;
  const middles: [number, number][] = [
    [b.x0 + mid, b.z0],
    [b.x0 + mid, b.z0 + b.n - 1],
    [b.x0, b.z0 + mid],
    [b.x0 + b.n - 1, b.z0 + mid],
  ];
  let best = 0;
  let bestD = Infinity;
  middles.forEach(([x, z], i) => {
    for (const [sx, sz] of anchor) {
      const d = Math.abs(sx - x) + Math.abs(sz - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/** The commands that zone a block's inside: homes-medium all round, shops on `shopSide` when `shops`. */
export function zoneBlock(b: Block, shops: boolean, shopSide: number): Command[] {
  const seen = new Set<number>();
  const byZone = new Map<string, [number, number][]>();
  b.sides.forEach((tiles, side) => {
    const zone = shops && side === shopSide ? 'shops' : 'homes-medium';
    for (const [x, z] of tiles) {
      const i = z * S + x;
      if (seen.has(i)) continue;
      seen.add(i);
      const list = byZone.get(zone) ?? [];
      list.push([x, z]);
      byZone.set(zone, list);
    }
  });
  const cmds: Command[] = [];
  for (const [zone, tiles] of byZone) cmds.push({ t: 'zone.paint', zone, tiles });
  return cmds;
}
