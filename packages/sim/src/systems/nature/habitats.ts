// Habitats (C5C; docs/spec/12-hearth.md, Nature and the Field Guide). Six scores per chunk, 0 to
// 255, summed from content's habitat sources (decor and building tags, modules, map tiles, pattern
// sites) and recomputed at 02:00 for the chunks that changed since the last pass plus a rolling
// sixth of the map (so slow changes, trees growing up, are caught within six days). Chunks whose
// scores moved go out in habitats.updated for the overlay.
import { content } from '@qoti/content';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, HABITAT_IDS, MAP_SIZE, TICKS_PER_DAY, TILE_FP } from '../../constants';
import type { TickCtx, WorldState } from '../../contracts';
import { Terrain, treeStage, Water } from '../../map/layers';
import { footprintSize } from '../../rules/footprint';

const S = MAP_SIZE;
const H = HABITAT_IDS.length;
export const CHUNKS = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
/** The map is swept in this many parts, one a day, besides the changed chunks. */
export const ROLLING_PARTS = 6;
export const HABITAT_MAX = 255;

type Pts = [habitat: number, points: number][];

function habitatIndex(id: string): number {
  return (HABITAT_IDS as readonly string[]).indexOf(id);
}

const TERRAIN_BY_NAME: ReadonlyMap<string, number> = new Map([
  ['grass', Terrain.grass],
  ['meadow', Terrain.meadow],
  ['forestFloor', Terrain.forestFloor],
  ['sand', Terrain.sand],
]);
const WATER_BY_NAME: ReadonlyMap<string, number> = new Map([
  ['river', Water.river],
  ['riverDeep', Water.riverDeep],
  ['pond', Water.pond],
  ['canal', Water.canal],
]);
const TREE_STAGE: ReadonlyMap<string, number> = new Map([
  ['sapling', 0],
  ['young', 1],
  ['grown', 2],
  ['mature', 3],
]);

/** Points per piece by decor def, building def, module id; per tile by terrain, water, tree stage. */
const decorPts = new Map<string, Pts>();
const buildingPts = new Map<string, Pts>();
const modulePts = new Map<string, Pts>();
const sitePts = new Map<string, Pts>();
const customPts = new Map<string, Pts>();
const terrainPts: Pts[] = Array.from({ length: 16 }, () => []);
const waterPts: Pts[] = Array.from({ length: 8 }, () => []);
const treePts: Pts[] = Array.from({ length: 4 }, () => []);

function add(map: Map<string, Pts>, key: string, h: number, pts: number): void {
  const list = map.get(key) ?? [];
  list.push([h, pts]);
  map.set(key, list);
}

for (const src of content.habitatSources) {
  const h = habitatIndex(src.habitat);
  if (h < 0) continue;
  switch (src.from) {
    case 'decor':
      for (const d of content.decor) if (d.tags.includes(src.ref)) add(decorPts, d.id, h, src.points);
      break;
    case 'building':
      for (const b of content.buildings) if (b.tags?.includes(src.ref)) add(buildingPts, b.id, h, src.points);
      break;
    case 'module':
      add(modulePts, src.ref, h, src.points);
      break;
    case 'site':
      add(sitePts, src.ref, h, src.points);
      break;
    case 'custom':
      add(customPts, src.ref, h, src.points);
      break;
    case 'terrain': {
      const v = TERRAIN_BY_NAME.get(src.ref);
      if (v !== undefined) terrainPts[v]!.push([h, src.points]);
      break;
    }
    case 'water': {
      const v = WATER_BY_NAME.get(src.ref);
      if (v !== undefined) waterPts[v]!.push([h, src.points]);
      break;
    }
    case 'tree': {
      const v = TREE_STAGE.get(src.ref);
      if (v !== undefined) treePts[v]!.push([h, src.points]);
      break;
    }
  }
}

/** True when a decor def or building def adds to some habitat (credit for first sightings). */
export function decorHabitats(def: string): Pts | undefined {
  return decorPts.get(def);
}
export function buildingHabitats(def: string): Pts | undefined {
  return buildingPts.get(def);
}

export function chunkOfTile(x: number, z: number): number {
  return Math.floor(z / CHUNK_SIZE) * CHUNKS_PER_SIDE + Math.floor(x / CHUNK_SIZE);
}

export function chunkOfFp(fx: number, fz: number): number {
  return chunkOfTile(Math.floor(fx / TILE_FP), Math.floor(fz / TILE_FP));
}

/** The chunk of a building's footprint center. */
export function buildingChunk(b: { def: string; x: number; z: number; rot: number }): number {
  const def = content.buildingById.get(b.def);
  const [w, d] = def ? footprintSize(def, b.rot as 0) : [1, 1];
  return chunkOfTile(b.x + Math.floor((w - 1) / 2), b.z + Math.floor((d - 1) / 2));
}

/** Score of habitat h in chunk c. */
export function scoreAt(state: WorldState, h: number, c: number): number {
  return state.nature.habitats[h * CHUNKS + c] ?? 0;
}

/**
 * Marks a chunk for the next pass (standard valleys only). The charm's markChunks calls it, so the
 * list is every chunk the charm was told about since 02:00: what moves charm moves habitats.
 */
export function markHabitatChunk(state: WorldState, c: number): void {
  if (state.settings.mode !== 'standard') return;
  const list = state.nature.dirty ?? [];
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! < c) lo = mid + 1;
    else hi = mid;
  }
  if (list[lo] !== c) list.splice(lo, 0, c);
  state.nature.dirty = list;
}

const want = new Uint8Array(CHUNKS);
const sums = new Float64Array(CHUNKS * H);

function addPts(c: number, pts: Pts | undefined): void {
  if (!pts) return;
  for (const [h, p] of pts) sums[c * H + h]! += p;
}

/**
 * Scores of the given chunks, in the order given (each a list of six). Pure: reads the map, decor,
 * buildings, modules and pattern sites.
 */
export function scoreChunks(state: WorldState, chunks: readonly number[]): number[][] {
  want.fill(0);
  for (const c of chunks) {
    want[c] = 1;
    for (let h = 0; h < H; h++) sums[c * H + h] = 0;
  }
  const m = state.map;
  for (const c of chunks) {
    const cx = (c % CHUNKS_PER_SIDE) * CHUNK_SIZE;
    const cz = Math.floor(c / CHUNKS_PER_SIDE) * CHUNK_SIZE;
    for (let z = cz; z < cz + CHUNK_SIZE; z++) {
      for (let x = cx; x < cx + CHUNK_SIZE; x++) {
        const i = z * S + x;
        const w = m.water[i]!;
        if (w) {
          addPts(c, waterPts[w]);
          continue;
        }
        addPts(c, terrainPts[m.terrain[i]!]);
        const t = m.tree[i]!;
        if (t) addPts(c, treePts[treeStage(t)]);
      }
    }
  }
  for (const d of state.decor) {
    const pts = decorPts.get(d.def);
    if (!pts) continue;
    const c = chunkOfFp(d.fx, d.fz);
    if (want[c]) addPts(c, pts);
  }
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const c = buildingChunk(b);
    if (!want[c]) continue;
    addPts(c, buildingPts.get(b.def));
    if (b.custom?.windowBoxes === true) addPts(c, customPts.get('windowBoxes'));
    for (const [, mod] of b.rt?.modules ?? []) addPts(c, modulePts.get(mod));
  }
  for (const site of state.hearth.sites) {
    const pts = sitePts.get(site.pattern);
    if (!pts) continue;
    const c = chunkOfTile(site.anchor % S, Math.floor(site.anchor / S));
    if (want[c]) addPts(c, pts);
  }
  return chunks.map((c) => {
    const out: number[] = [];
    for (let h = 0; h < H; h++) out.push(Math.min(HABITAT_MAX, Math.round(sums[c * H + h]!)));
    return out;
  });
}

/** The chunks the 02:00 pass looks at today: the changed ones and today's sixth, or all at first. */
export function chunksToday(state: WorldState): number[] {
  const n = state.nature;
  if (n.habitats.every((v) => v === 0)) return Array.from({ length: CHUNKS }, (_, c) => c);
  const part = Math.floor(state.tick / TICKS_PER_DAY) % ROLLING_PARTS;
  const set = new Set(n.dirty ?? []);
  for (let c = part; c < CHUNKS; c += ROLLING_PARTS) set.add(c);
  return [...set].sort((a, b) => a - b);
}

/** Recomputes today's chunks, stores them and sends the ones that moved. Returns the chunks scored. */
export function updateHabitats(state: WorldState, ctx: TickCtx): number[] {
  const chunks = chunksToday(state);
  const scores = scoreChunks(state, chunks);
  const moved: [number, number[]][] = [];
  const hab = state.nature.habitats;
  chunks.forEach((c, k) => {
    const s = scores[k]!;
    let changed = false;
    for (let h = 0; h < H; h++) {
      if (hab[h * CHUNKS + c] !== s[h]) {
        hab[h * CHUNKS + c] = s[h]!;
        changed = true;
      }
    }
    if (changed) moved.push([c, s]);
  });
  delete state.nature.dirty;
  if (moved.length) ctx.events.push({ e: 'habitats.updated', chunks: moved });
  return chunks;
}

/** All six scores of a chunk, in HABITAT_IDS order. */
export function chunkScores(state: WorldState, c: number): number[] {
  const out: number[] = [];
  for (let h = 0; h < H; h++) out.push(scoreAt(state, h, c));
  return out;
}
