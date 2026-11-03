// Threats, the Watch and raids API (C5.0 contract; C5D owns them). docs/spec/14-challenge.md.
import { content } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  MAP_SIZE,
  PENNIES_PER_COIN,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
} from '../../constants';
import type { Building, ScheduledRaid, WorldState } from '../../contracts';
import { decorTileX, decorTileZ } from '../../conditions/geo';
import { entranceTiles } from '../../rules/footprint';
import { isGateDef } from '../../rules/wall';
import { townStock } from '../../view/hamlet';

const S = MAP_SIZE;

/**
 * Wealth W = treasury + stored goods at base price + a tenth of the buildings' value
 * (14-challenge.md, Threat pressure), in pennies. Building value is each built building's coin cost.
 */
export function wealth(state: WorldState): number {
  let w = Math.max(0, state.economy.treasury);
  const stock = townStock(state);
  content.goods.forEach((g, i) => {
    w += (stock[i] ?? 0) * g.basePrice;
  });
  let value = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    value += (content.buildingById.get(b.def)?.cost?.coins ?? 0) * PENNIES_PER_COIN;
  }
  return w + Math.floor(value / 10);
}

// --- What raiders want --------------------------------------------------------------------------

/** Stores raiders go for: storehouses, market stalls and the trading post (and farms' piles). */
export function isValuable(def: string): boolean {
  const d = content.buildingById.get(def);
  if (!d) return false;
  return d.category === 'storage' || !!d.tags?.includes('outlet') || !!d.tags?.includes('trading-post');
}

/** Goods value (pennies) a building holds: store and output piles at base price. */
export function heldValue(b: Building): number {
  const rt = b.rt;
  if (!rt) return 0;
  let v = 0;
  for (let g = 0; g < rt.store.length; g++) {
    const n = rt.store[g]! + rt.output[g]!;
    if (n > 0) v += n * (content.goods[g]?.basePrice ?? 0);
  }
  return v;
}

/** The tile in front of a building's door. */
export function frontOf(b: Building): number {
  const def = content.buildingById.get(b.def);
  if (!def) return b.z * S + b.x;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  return front[1] * S + front[0];
}

/** Built stores raiders target, in id order. */
export function valuables(state: WorldState): Building[] {
  return state.buildings.filter((b) => b.stage === 'built' && isValuable(b.def));
}

// --- Deterrence ---------------------------------------------------------------------------------

/** Deterrence weights, permille (14-challenge.md, Threat pressure, As built). */
export const DETER_WALLS = 450;
export const DETER_TOWERS = 250;
export const DETER_LANTERNS = 100;
export const DETER_WATCH_MAX = 300;
/** Deterrence per point of Watch strength (members x training x morale). */
export const DETER_WATCH_PER = 30;
/** The most deterrence can take off a day's pressure gain, permille. */
export const DETER_CAP = 850;

/** A walled area larger than this (tiles) is the open valley, as far as deterrence goes. */
export const WALLED_MAX = 1600;

const QUEUE = new Int32Array(S * S);
const STAMP = new Uint32Array(S * S);
let stamp = 0;

/**
 * Which door fronts sit inside walls: raiders could not walk to them from the valley's edge with
 * every gate shut (walls, gates and buildings block, water blocks unless a road bridges it, cliffs
 * block). A flood from each front, shared by fronts in the same area, gives up as open at the map
 * edge or past WALLED_MAX tiles, so an open town costs one capped flood.
 */
export function walledFronts(state: WorldState, fronts: readonly number[]): boolean[] {
  const { occupant, water, road, height } = state.map;
  const out: boolean[] = [];
  const results: boolean[] = [];
  const first = stamp + 1;
  for (const f of fronts) {
    if (f < 0 || f >= S * S) {
      out.push(false);
      continue;
    }
    if (STAMP[f]! >= first) {
      out.push(results[STAMP[f]! - first]!);
      continue;
    }
    const mark = ++stamp;
    let tail = 0;
    STAMP[f] = mark;
    QUEUE[tail++] = f;
    let open = false;
    for (let q = 0; q < tail && !open; q++) {
      const t = QUEUE[q]!;
      const x = t % S;
      const z = (t - x) / S;
      if (x === 0 || z === 0 || x === S - 1 || z === S - 1 || tail > WALLED_MAX) {
        open = true;
        break;
      }
      const h = height[t]!;
      for (let d = 0; d < 4; d++) {
        const n = d === 0 ? t + 1 : d === 1 ? t - 1 : d === 2 ? t + S : t - S;
        if (STAMP[n]! === mark || occupant[n] || (road[n] === 0 && water[n] !== 0)) continue;
        const dh = height[n]! - h;
        if (dh >= 2 || dh <= -2) continue;
        STAMP[n] = mark;
        QUEUE[tail++] = n;
      }
    }
    results[mark - first] = !open;
    out.push(!open);
  }
  if (stamp > 0xfffff000) {
    STAMP.fill(0);
    stamp = 0;
  }
  return out;
}

/** Built watchtowers. */
export function towers(state: WorldState): Building[] {
  return state.buildings.filter(
    (b) => b.stage === 'built' && !!content.buildingById.get(b.def)?.defense?.towerRange,
  );
}

/** A tower's morale range in tiles. */
export function towerRange(b: Building): number {
  return content.buildingById.get(b.def)?.defense?.towerRange ?? 0;
}

function near(b: Building, x: number, z: number, r: number): boolean {
  return Math.abs(b.x - x) <= r && Math.abs(b.z - z) <= r;
}

/** Today's deterrence parts, permille each (walls, towers, lanterns, the Watch). */
export function deterrenceParts(state: WorldState): {
  walls: number;
  towers: number;
  lanterns: number;
  watch: number;
} {
  const stores = valuables(state);
  const watch = Math.min(DETER_WATCH_MAX, watchStrength(state) * DETER_WATCH_PER);
  if (stores.length === 0) return { walls: 0, towers: 0, lanterns: 0, watch };
  const fronts = stores.map(frontOf);
  const walls = state.buildings.some(
    (b) => b.stage === 'built' && !!content.buildingById.get(b.def)?.defense?.blocks,
  );
  const shut = walls ? walledFronts(state, fronts) : fronts.map(() => false);
  const tw = towers(state);
  const lit = litTiles(state);
  let w = 0;
  let t = 0;
  let l = 0;
  for (let k = 0; k < stores.length; k++) {
    const b = stores[k]!;
    const front = fronts[k]!;
    if (shut[k]) w++;
    if (tw.some((x) => near(b, x.x, x.z, towerRange(x)))) t++;
    if (lit.has(front)) l++;
  }
  const n = stores.length;
  return {
    walls: Math.floor((DETER_WALLS * w) / n),
    towers: Math.floor((DETER_TOWERS * t) / n),
    lanterns: Math.floor((DETER_LANTERNS * l) / n),
    watch,
  };
}

/** Deterrence at a tile, permille: towers in range and lantern light there, plus the Watch. */
export function deterrenceAt(state: WorldState, tile: number): number {
  const x = tile % S;
  const z = Math.floor(tile / S);
  let d = Math.min(DETER_WATCH_MAX, watchStrength(state) * DETER_WATCH_PER);
  if (towers(state).some((b) => near(b, x, z, towerRange(b)))) d += DETER_TOWERS;
  if (lanternLit(state, tile)) d += DETER_LANTERNS;
  return d;
}

export function isRaidActive(state: WorldState): boolean {
  return state.raid !== null;
}

/** Members x training x morale, as in the Watch panel. */
export function watchStrength(state: WorldState): number {
  const w = state.watch;
  return Math.round((w.members.length * w.training * w.morale) / 10000);
}

/** A lantern stands on or next to the tile (night threats avoid it; raiders lose heart in it). */
export function lanternLit(state: WorldState, tile: number): boolean {
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  for (const d of state.decor) {
    const dx = Math.floor(d.fx / TILE_FP);
    const dz = Math.floor(d.fz / TILE_FP);
    if (Math.abs(dx - x) > 1 || Math.abs(dz - z) > 1) continue;
    if (content.decorById.get(d.def)?.tags.includes('lantern')) return true;
  }
  return false;
}

/** Lit tiles (on or next to a lantern), computed once for a pass over many tiles. */
export function litTiles(state: WorldState): Set<number> {
  const lit = new Set<number>();
  for (const d of state.decor) {
    if (!content.decorById.get(d.def)?.tags.includes('lantern')) continue;
    const x = decorTileX(d);
    const z = decorTileZ(d);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < S && nz < S) lit.add(nz * S + nx);
      }
  }
  return lit;
}

/** Tiles inside a Lantern Walk pattern site (C3B): its light counts double. */
export function lanternWalkTiles(state: WorldState): Set<number> {
  const out = new Set<number>();
  for (const s of state.hearth.sites) if (s.pattern === 'lantern-walk') for (const t of s.tiles) out.add(t);
  return out;
}

// --- Raid clock ---------------------------------------------------------------------------------

/** Dusk: raids come at 18:00. Dawn: they end at 06:00. */
export const DUSK_HOUR = 18;
export const DAWN_HOUR = 6;

/** Absolute day index of a scheduled raid. */
export function raidDay(r: Pick<ScheduledRaid, 'year' | 'season' | 'day'>): number {
  return (r.year * 4 + r.season) * DAYS_PER_SEASON + (r.day - 1);
}

/** The tick of `hour` on absolute day `day` (hours before 06:00 belong to the next calendar tick span). */
export function tickOn(day: number, hour: number): number {
  return day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

/** The tick a scheduled raid starts (dusk on its day). */
export function raidStartTick(r: Pick<ScheduledRaid, 'year' | 'season' | 'day'>): number {
  return tickOn(raidDay(r), DUSK_HOUR);
}

/** Wall pieces and gates with hit points: their maximum. */
export function maxHp(b: Building): number {
  return content.buildingById.get(b.def)?.defense?.hp ?? 0;
}

/** Hit points left (absent means whole). */
export function hpOf(b: Building): number {
  return b.rt?.hp ?? maxHp(b);
}

export { isGateDef };
