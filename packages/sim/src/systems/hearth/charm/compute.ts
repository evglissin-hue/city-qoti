// Charm for one 16 x 16 chunk (docs/spec/12-hearth.md, Charm). Every tile gathers the sources
// within reach: each adds its value with linear falloff to 0 one tile past its radius; only the two
// strongest instances of a source type count per tile and category (no spam); noise always adds
// up. Then variety, clutter, enclosure and pattern site bonuses. Floats are used inside one tile's
// sum (same operations in the same order on every machine) and rounded before they are stored.
// Scratch buffers are module-level and reused, so a recompute allocates almost nothing.
import { content } from '@qoti/content';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE, TILE_FP } from '../../../constants';
import type { LayerName, MapLayers, Rect, TickCtx, WorldState } from '../../../contracts';
import { buildingRect, decorInRect, expandRect, rectGap2 } from '../../../conditions/geo';
import { findById } from '../../../state/entities';
import { skatingSpots } from '../../seasons/place';
import { streetNoise } from '../../traffic/noise';
import {
  BUILDING_SOURCES,
  CAT,
  CHARM_REACH,
  CLUTTER,
  CONSTRUCTION,
  DECOR_LINEAR,
  DECOR_REACH,
  DECOR_SOURCES,
  ENCLOSURE,
  HEIGHT_VIEW,
  MATURE_TREE,
  PATH_COMFORT,
  SKATING_COMFORT,
  type Source,
  TYPE_COUNT,
  VARIETY,
  WATER_VIEW,
  WINDOW_BOXES,
  YOUNG_TREE,
} from './sources';

const S = MAP_SIZE;
const DECOR_INDEX = new Map(content.decor.map((d, i) => [d.id, i]));
const BUILDING_INDEX = new Map(content.buildings.map((b, i) => [b.id, i]));
const PATTERN_INDEX = new Map(content.patterns.map((p, i) => [p.id, i]));

/** Layer names in category order, then the total. */
export const CHARM_LAYERS: readonly (keyof MapLayers & LayerName)[] = [
  'charmNature',
  'charmComfort',
  'charmLight',
  'charmView',
  'charmNoise',
  'charm',
];

// --- Scratch ------------------------------------------------------------------------------------

const MAX_DECOR = 4096;
const decorX = new Float64Array(MAX_DECOR);
const decorZ = new Float64Array(MAX_DECOR);
const decorDef = new Int32Array(MAX_DECOR);
// The same pieces sorted into rows (local z), so a tile only visits the rows within reach.
const ROWS = CHUNK_SIZE + 2 * DECOR_REACH;
const rowStart = new Int32Array(ROWS + 1);
const rowOf = new Int32Array(MAX_DECOR);
const sortedX = new Float64Array(MAX_DECOR);
const sortedZ = new Float64Array(MAX_DECOR);
const sortedDef = new Int32Array(MAX_DECOR);

interface NearBuilding {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  sources: Source[];
}
const nearBuildings: NearBuilding[] = [];

const KEYS = TYPE_COUNT * 5;
const best1 = new Float64Array(KEYS);
const best2 = new Float64Array(KEYS);
const keyUsed = new Uint8Array(KEYS);
const touched = new Int32Array(KEYS);
let touchedCount = 0;
const seenType = new Uint8Array(TYPE_COUNT);
const seenList = new Int32Array(TYPE_COUNT);

/** Site bonus cores: tile coordinates per site with the pattern's value, radius and category. */
const MAX_CORE = 8192;
const coreX = new Int32Array(MAX_CORE);
const coreZ = new Int32Array(MAX_CORE);
const coreSite = new Int32Array(MAX_CORE);
const siteValue: number[] = [];
const siteRadius: number[] = [];
const siteCat: number[] = [];
const sitePattern: number[] = [];
const patternBonus = new Float64Array(Math.max(1, content.patterns.length));

const SPAN = CHUNK_SIZE + 2 * CHARM_REACH;
const wall = new Uint8Array(SPAN * SPAN);
const heightSum = new Int32Array((SPAN + 1) * (SPAN + 1));
const cats = new Float64Array(5);
const out = new Float64Array(6);

// --- Per-tile helpers ---------------------------------------------------------------------------

let lit = false;
let noise = 0;

function add(s: Source, d: number): void {
  const reach = s.radius + 1;
  if (d >= reach) return;
  const v = ((lit ? s.night : s.value) * (reach - d)) / reach;
  if (v < 0) {
    noise -= v;
    return;
  }
  if (v === 0) return;
  const key = s.type * 5 + s.cat;
  if (!keyUsed[key]) {
    keyUsed[key] = 1;
    best1[key] = v;
    best2[key] = 0;
    touched[touchedCount++] = key;
  } else if (v > best1[key]!) {
    best2[key] = best1[key]!;
    best1[key] = v;
  } else if (v > best2[key]!) {
    best2[key] = v;
  }
}

/** Distance from a point to a rect in continuous tile units (0 inside). */
function rectDistance(px: number, pz: number, b: NearBuilding): number {
  const dx = px < b.x0 ? b.x0 - px : px > b.x1 ? px - b.x1 : 0;
  const dz = pz < b.z0 ? b.z0 - pz : pz > b.z1 ? pz - b.z1 : 0;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Buildings that close in a square: anything bigger than one tile, except flat plots. */
function isWallBuilding(state: WorldState, id: number, cache: Map<number, boolean>): boolean {
  let v = cache.get(id);
  if (v === undefined) {
    const b = findById(state.buildings, id);
    const def = b ? content.buildingById.get(b.def) : undefined;
    v = !!def && def.size[0] * def.size[1] > 1 && !(def.tags ?? []).includes('plot');
    cache.set(id, v);
  }
  return v;
}

// --- The chunk ----------------------------------------------------------------------------------

export function chunkRect(chunk: number): Rect {
  const x0 = (chunk % CHUNKS_PER_SIDE) * CHUNK_SIZE;
  const z0 = Math.floor(chunk / CHUNKS_PER_SIDE) * CHUNK_SIZE;
  return [x0, z0, Math.min(S, x0 + CHUNK_SIZE) - 1, Math.min(S, z0 + CHUNK_SIZE) - 1];
}

/**
 * Recomputes the six charm layers of one chunk. Marks changed layers dirty on ctx so clients get
 * LayerPatches. `nightLights` picks lantern values. Returns true when anything changed.
 */
export function recomputeChunk(
  state: WorldState,
  chunk: number,
  nightLights: boolean,
  ctx: TickCtx | null,
  wallCache: Map<number, boolean> = new Map(),
): boolean {
  lit = nightLights;
  const m = state.map;
  const rect = chunkRect(chunk);
  const [cx0, cz0, cx1, cz1] = rect;
  const maxReach = CHARM_REACH;

  // Decor within reach, sorted into rows.
  let nd = 0;
  const rz0 = cz0 - DECOR_REACH;
  rowStart.fill(0);
  for (const d of decorInRect(state, expandRect(rect, DECOR_REACH))) {
    const def = DECOR_INDEX.get(d.def);
    if (def === undefined || nd >= MAX_DECOR) continue;
    decorX[nd] = d.fx / TILE_FP;
    decorZ[nd] = d.fz / TILE_FP;
    decorDef[nd] = def;
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(decorZ[nd]!) - rz0));
    rowOf[nd] = row;
    rowStart[row + 1]!++;
    nd++;
  }
  for (let r = 0; r < ROWS; r++) rowStart[r + 1]! += rowStart[r]!;
  for (let k = 0; k < nd; k++) {
    const at = rowStart[rowOf[k]!]!++;
    sortedX[at] = decorX[k]!;
    sortedZ[at] = decorZ[k]!;
    sortedDef[at] = decorDef[k]!;
  }
  // rowStart[r] now holds the end of row r; shift back so rows span [rowStart[r], rowStart[r + 1]).
  for (let r = ROWS; r > 0; r--) rowStart[r] = rowStart[r - 1]!;
  rowStart[0] = 0;

  // Buildings within reach, with their sources.
  nearBuildings.length = 0;
  const reach2 = (maxReach + 1) * (maxReach + 1);
  for (const b of state.buildings) {
    const def = content.buildingById.get(b.def);
    if (!def) continue;
    const r = buildingRect(b, def);
    if (rectGap2(r, rect) > reach2) continue;
    const sources: Source[] = [];
    if (b.stage === 'construction') sources.push(CONSTRUCTION);
    else for (const s of BUILDING_SOURCES[BUILDING_INDEX.get(b.def)!]!) sources.push(s);
    if (b.custom?.windowBoxes === true) sources.push(WINDOW_BOXES);
    if (sources.length > 0) nearBuildings.push({ x0: r[0], z0: r[1], x1: r[2] + 1, z1: r[3] + 1, sources });
  }

  // Pattern site cores within reach.
  let nc = 0;
  siteValue.length = 0;
  siteRadius.length = 0;
  siteCat.length = 0;
  sitePattern.length = 0;
  for (const site of state.hearth.sites) {
    const def = content.patternById.get(site.pattern);
    if (!def || def.siteBonus.charm <= 0) continue;
    const r = def.siteBonus.radius + 1;
    const j = siteValue.length;
    let used = false;
    const consider = (t: number) => {
      const x = t % S;
      const z = (t - x) / S;
      if (x < cx0 - r || x > cx1 + r || z < cz0 - r || z > cz1 + r || nc >= MAX_CORE) return;
      coreX[nc] = x;
      coreZ[nc] = z;
      coreSite[nc] = j;
      nc++;
      used = true;
    };
    consider(site.anchor);
    for (const t of site.tiles) if (t !== site.anchor) consider(t);
    if (!used) continue;
    siteValue.push(def.siteBonus.charm);
    siteRadius.push(def.siteBonus.radius);
    siteCat.push(def.siteBonus.category ? CAT[def.siteBonus.category] : -1);
    sitePattern.push(PATTERN_INDEX.get(site.pattern)!);
  }

  // Wall buildings and height sums over the span around the chunk.
  const sx0 = cx0 - CHARM_REACH;
  const sz0 = cz0 - CHARM_REACH;
  for (let z = 0; z < SPAN; z++) {
    for (let x = 0; x < SPAN; x++) {
      const wx = sx0 + x;
      const wz = sz0 + z;
      let v = 0;
      if (wx >= 0 && wz >= 0 && wx < S && wz < S) {
        const id = m.occupant[wz * S + wx]!;
        if (id && isWallBuilding(state, id, wallCache)) v = 1;
      }
      wall[z * SPAN + x] = v;
    }
  }
  const W1 = SPAN + 1;
  for (let z = 0; z <= SPAN; z++) heightSum[z * W1] = 0;
  for (let x = 0; x <= SPAN; x++) heightSum[x] = 0;
  for (let z = 1; z <= SPAN; z++) {
    let row = 0;
    for (let x = 1; x <= SPAN; x++) {
      const wx = sx0 + x - 1;
      const wz = sz0 + z - 1;
      row += wx >= 0 && wz >= 0 && wx < S && wz < S ? m.height[wz * S + wx]! : 0;
      heightSum[z * W1 + x] = heightSum[(z - 1) * W1 + x]! + row;
    }
  }

  // I3 (C5A): skating spots near this chunk while the river is frozen.
  const skate: number[] = [];
  if (state.weather.river.frozen) {
    const sr = SKATING_COMFORT.radius;
    for (const t of skatingSpots(state)) {
      const x = t % S;
      const z = (t - x) / S;
      if (x >= cx0 - sr && x <= cx1 + sr && z >= cz0 - sr && z <= cz1 + sr) skate.push(x, z);
    }
  }
  const skateR = SKATING_COMFORT.radius * SKATING_COMFORT.radius;

  let changed = 0;
  const vR = VARIETY.radius * VARIETY.radius;
  const cR = CLUTTER.radius * CLUTTER.radius;
  const dR = DECOR_REACH * DECOR_REACH;
  for (let tz = cz0; tz <= cz1; tz++) {
    for (let tx = cx0; tx <= cx1; tx++) {
      const i = tz * S + tx;
      if (m.water[i]) {
        for (let k = 0; k < 6; k++) out[k] = 0;
        // I3 (C5A): the ice by a skating spot has a little comfort while the river is frozen (on the
        // ice only: the bank's homes and decor keep their charm).
        for (let k = 0; k < skate.length; k += 2) {
          const dx = skate[k]! - tx;
          const dz = skate[k + 1]! - tz;
          if (dx * dx + dz * dz <= skateR) {
            out[CAT.comfort] = SKATING_COMFORT.value;
            out[5] = SKATING_COMFORT.value;
            break;
          }
        }
        changed |= write(m, i);
        continue;
      }
      const px = tx + 0.5;
      const pz = tz + 0.5;
      cats.fill(0);
      noise = 0;
      touchedCount = 0;
      let seen = 0;
      let clutter = 0;

      const lr = tz - rz0;
      const k0 = rowStart[Math.max(0, lr - DECOR_REACH)]!;
      const k1 = rowStart[Math.min(ROWS, lr + DECOR_REACH + 1)]!;
      for (let k = k0; k < k1; k++) {
        const dx = sortedX[k]! - px;
        const dz = sortedZ[k]! - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 > dR) continue;
        const def = sortedDef[k]!;
        if (d2 <= vR && !seenType[def]) {
          seenType[def] = 1;
          seenList[seen++] = def;
        }
        if (d2 <= cR && !DECOR_LINEAR[def]) clutter++;
        const sources = DECOR_SOURCES[def]!;
        if (sources.length === 0) continue;
        const d = Math.sqrt(d2);
        for (const s of sources) add(s, d);
      }

      for (const b of nearBuildings) {
        const d = rectDistance(px, pz, b);
        for (const s of b.sources) add(s, d);
      }

      for (let dz = -2; dz <= 2; dz++) {
        const z = tz + dz;
        if (z < 0 || z >= S) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const x = tx + dx;
          if (x < 0 || x >= S) continue;
          const v = m.tree[z * S + x]!;
          if (!v) continue;
          // Forest trees are nature, not decor: they count for no-spam but not for variety.
          add((v & 7) >= 3 ? MATURE_TREE : YOUNG_TREE, Math.sqrt(dx * dx + dz * dz));
        }
      }

      // No spam: two strongest per type and category.
      for (let k = 0; k < touchedCount; k++) {
        const key = touched[k]!;
        cats[key % 5]! += best1[key]! + best2[key]!;
        keyUsed[key] = 0;
      }
      // I2 (C4B): streets and the carts on them are heard too.
      cats[CAT.noise] = noise + streetNoise(state, tx, tz);

      // Water in view: the nearest river or pond tile within the radius.
      let w2 = Infinity;
      const wr = WATER_VIEW.radius;
      for (let dz = -wr; dz <= wr; dz++) {
        const z = tz + dz;
        if (z < 0 || z >= S) continue;
        for (let dx = -wr; dx <= wr; dx++) {
          const x = tx + dx;
          if (x < 0 || x >= S || !m.water[z * S + x]) continue;
          const d2 = dx * dx + dz * dz;
          if (d2 < w2) w2 = d2;
        }
      }
      if (w2 !== Infinity) {
        const d = Math.sqrt(w2);
        if (d < wr + 1) cats[CAT.view]! += (WATER_VIEW.value * (wr + 1 - d)) / (wr + 1);
      }

      // Height: a lookout HEIGHT_VIEW.above levels over the average around it.
      const hw = HEIGHT_VIEW.window;
      const lx = tx - sx0;
      const lz = tz - sz0;
      const ax0 = Math.max(lx - hw, sx0 < 0 ? -sx0 : 0);
      const az0 = Math.max(lz - hw, sz0 < 0 ? -sz0 : 0);
      const ax1 = Math.min(lx + hw, S - 1 - sx0);
      const az1 = Math.min(lz + hw, S - 1 - sz0);
      const count = (ax1 - ax0 + 1) * (az1 - az0 + 1);
      const sum =
        heightSum[(az1 + 1) * W1 + ax1 + 1]! -
        heightSum[az0 * W1 + ax1 + 1]! -
        heightSum[(az1 + 1) * W1 + ax0]! +
        heightSum[az0 * W1 + ax0]!;
      if (m.height[i]! * count >= sum + HEIGHT_VIEW.above * count) cats[CAT.view]! += HEIGHT_VIEW.value;

      const road = m.road[i]!;
      if (road === 1) cats[CAT.comfort]! += PATH_COMFORT;

      // Variety, clutter and enclosure.
      let extra = Math.min(VARIETY.max, seen * VARIETY.per);
      for (let k = 0; k < seen; k++) seenType[seenList[k]!] = 0;
      if (clutter > CLUTTER.over) extra -= CLUTTER.penalty;
      if (!m.occupant[i] && road <= 2) {
        let sides = 0;
        for (let dir = 0; dir < 4; dir++) {
          const sx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
          const sz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
          for (let step = 1; step <= ENCLOSURE.reach; step++) {
            if (wall[(lz + sz * step) * SPAN + lx + sx * step]) {
              sides++;
              break;
            }
          }
        }
        if (sides >= ENCLOSURE.sides) extra += ENCLOSURE.bonus;
      }

      // Pattern site bonuses: the strongest site of each pattern counts.
      if (nc > 0) {
        patternBonus.fill(0);
        let any = false;
        for (let k = 0; k < nc; k++) {
          const j = coreSite[k]!;
          const r = siteRadius[j]! + 1;
          const dx = coreX[k]! - tx;
          const dz = coreZ[k]! - tz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          const v = (siteValue[j]! * (r - Math.sqrt(d2))) / r;
          const p = sitePattern[j]!;
          if (v > patternBonus[p]!) {
            patternBonus[p] = v;
            any = true;
          }
        }
        if (any) {
          for (let j = 0; j < siteValue.length; j++) {
            const p = sitePattern[j]!;
            const v = patternBonus[p]!;
            if (v <= 0) continue;
            patternBonus[p] = 0;
            const c = siteCat[j]!;
            if (c >= 0) cats[c]! += v;
            else extra += v;
          }
        }
      }

      for (let k = 0; k < 5; k++) out[k] = cats[k]!;
      out[5] = cats[0]! + cats[1]! + cats[2]! + cats[3]! - cats[4]! + extra;
      changed |= write(m, i);
    }
  }

  if (ctx && changed) {
    for (let k = 0; k < 6; k++) if (changed & (1 << k)) ctx.dirty.mark(CHARM_LAYERS[k]!, rect);
  }
  return changed !== 0;
}

/** Rounds and stores one tile; returns a bit per changed layer. */
function write(m: MapLayers, i: number): number {
  let bits = 0;
  for (let k = 0; k < 6; k++) {
    const max = k === 5 ? 100 : 255;
    const v = Math.max(0, Math.min(max, Math.round(out[k]!)));
    const layer = m[CHARM_LAYERS[k]!];
    if (layer[i] !== v) {
      layer[i] = v;
      bits |= 1 << k;
    }
  }
  return bits;
}
