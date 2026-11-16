// The place pass's sources (docs/spec/19-evenings.md, Places: Where places come from and What a place
// has): pattern sites, sitting spots, porches and hosts (buildings, fires, the ice, the festival site
// on its night), each with seats, standing room, kinds, shelter, warmth and the outlets within reach.
// Pure: reads saved state and writes nothing to it. The draw's parts that move with the hour (charm,
// lanterns, winter) are filled by draw.ts; the live part (Treats on a shelf) by placeDraw.
import { content, type DecorDef, type HostDef, type PlaceKind } from '@qoti/content';
import { MAP_SIZE, PLACE_KINDS, TILE_FP } from '../../constants';
import type { Building, Decor, EntityId, Place, PlaceSource, WorldState } from '../../contracts';
import { buildingRect, decorTileX, decorTileZ, isHomeDef } from '../../conditions/geo';
import {
  byPlaceId,
  festivalPlaceId,
  firePlaceId,
  hostPlaceId,
  icePlaceId,
  porchPlaceId,
  seatsPlaceId,
  sitePlaceId,
} from '../../state/evenings';
import { cafeTables } from '../growth/cafes';
import { sellsTreats } from '../market/round';
import { doorTile } from '../movement/api';
import { heldRect } from '../festivals/site';
import { skatingSpots } from '../seasons/place';
import { worldIndex } from '../../state/worldIndex';
import { hasTag } from '../../state/zones';

const S = MAP_SIZE;
const P = content.places;
const WALKS = new Set(P.walkPatterns);
const MEETS = new Set(P.meetPatterns);
const VIEW_PIECES = new Set(P.viewPieces);

/** The draw's fixed parts and what draw.ts needs each hour, kept beside each place (same order). */
export interface PlaceExtra {
  /** A lantern or other light stands on its tiles (the lit part after `PLACES.litHour`). */
  lights: boolean;
  /** Winter spares it: sheltered, warm, or the ice. */
  winterExempt: boolean;
  /** What stands there, for a resident's taste (PlaceFeature bits; tree and quiet set each tick). */
  features: number;
}

/** What stands at a place, as bits, for a resident's taste (residents/outings.ts tasteFor). */
export const PlaceFeature = {
  flower: 1,
  tree: 2,
  hedge: 4,
  mooring: 8,
  light: 16,
  market: 32,
  baker: 64,
  tavern: 128,
  well: 256,
  herb: 512,
  /** No road among its tiles. */
  quiet: 1024,
  water: 2048,
} as const;

const DECOR_FEATURES: readonly [tag: string, bit: number][] = [
  ['flower', PlaceFeature.flower],
  ['verge', PlaceFeature.flower],
  ['blossom', PlaceFeature.flower],
  ['tree', PlaceFeature.tree],
  ['fruit', PlaceFeature.tree],
  ['hedge', PlaceFeature.hedge],
  ['mooring', PlaceFeature.mooring],
  ['light', PlaceFeature.light],
  ['lantern', PlaceFeature.light],
  ['herb', PlaceFeature.herb],
];
/** What a decor def brings to a place, worked out once from content. */
const DECOR_INFO = new Map(
  content.decor.map((def) => {
    let features = 0;
    for (const [tag, bit] of DECOR_FEATURES) if (def.tags.includes(tag)) features |= bit;
    return [
      def.id,
      {
        features,
        light: def.tags.includes('light') || def.tags.includes('lantern'),
        play: def.tags.includes('play'),
        view: VIEW_PIECES.has(def.id),
      },
    ] as const;
  }),
);

const BUILDING_FEATURES: readonly [tag: string, bit: number][] = [
  ['market', PlaceFeature.market],
  ['baker', PlaceFeature.baker],
  ['tavern', PlaceFeature.tavern],
  ['well', PlaceFeature.well],
];

function buildingFeatures(b: Building | undefined): number {
  if (!b) return 0;
  let bits = 0;
  for (const [tag, bit] of BUILDING_FEATURES) if (hasTag(b, tag)) bits |= bit;
  return bits;
}

/** Built places, sorted by id, with their extras in the same order. */
export interface BuiltPlaces {
  places: Place[];
  extras: PlaceExtra[];
}

/** Bits of a place's kinds, by PLACE_KINDS index. */
const KIND_BIT = new Map<PlaceKind, number>(PLACE_KINDS.map((k, i) => [k, 1 << i]));

function kindBit(k: PlaceKind): number {
  return KIND_BIT.get(k) ?? 0;
}

/**
 * A place under construction: its tiles and members (repeats allowed until it is finished), the
 * room, and what it offers (kinds as KIND_BIT bits). Plain arrays and numbers, so a rebuild of a
 * City's six hundred places allocates little.
 */
interface Draft {
  id: string;
  source: PlaceSource;
  def: string;
  tile: number;
  tiles: number[];
  members: EntityId[];
  seats: number;
  childSeats: number;
  standing: number;
  kinds: number;
  sheltered: boolean;
  warm: boolean;
  ice: boolean;
  walkTiles: number;
  household?: EntityId;
  /** Porches hold their household's seats and no standing room. */
  porch: boolean;
}

function draft(id: string, source: PlaceSource, def: string, tile: number): Draft {
  return {
    id,
    source,
    def,
    tile,
    tiles: [],
    members: [],
    seats: 0,
    childSeats: 0,
    standing: 0,
    kinds: 0,
    sheltered: false,
    warm: false,
    ice: false,
    walkTiles: 0,
    porch: false,
  };
}

function tileOfDecor(d: Decor): number {
  return decorTileZ(d) * S + decorTileX(d);
}

/** The tile and its 8 neighbors inside the map. */
function addAround(set: number[], tile: number): void {
  const x = tile % S;
  const z = (tile - x) / S;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < S && nz < S) set.push(nz * S + nx);
    }
  }
}

function manhattan(a: number, b: number): number {
  const ax = a % S;
  const bx = b % S;
  return Math.abs(ax - bx) + Math.abs((a - ax) / S - (b - bx) / S);
}

/** A decor piece's seats, child seats, standing and warmth go into the draft. */
function addPiece(d: Draft, piece: Decor, def: DecorDef): void {
  d.members.push(piece.id);
  const seats = def.seats ?? 0;
  d.seats += seats;
  if (def.childSeats) d.childSeats += seats;
  d.standing += def.standing ?? 0;
  if (def.warm) d.warm = true;
}

/** A host building's room and kinds go into the draft. */
function addHost(d: Draft, b: Building, host: HostDef, door: number): void {
  d.members.push(b.id);
  d.seats += host.seats;
  d.standing += host.standing;
  for (const k of host.kinds) d.kinds |= kindBit(k);
  if (host.sheltered) d.sheltered = true;
  if (host.warm) d.warm = true;
  addAround(d.tiles, door);
}

/**
 * Every place the town has now, sorted by id. Sources in the spec's order: pattern sites; the
 * festival site on its night; sitting spots (seat pieces in no site, up to `spotMaxPieces` within
 * `spotRadius` of the lowest id); fires (joining a spot within `spotRadius`, else a place of their
 * own); porches; building hosts (a site member is part of its site); the skating ice. Then outlets
 * and cafe tables, kinds and standing.
 */
export function buildPlaces(state: WorldState): BuiltPlaces {
  const drafts: Draft[] = [];
  const claimed = new Set<EntityId>();
  const decorById = new Map<EntityId, Decor>();
  for (const d of state.decor) decorById.set(d.id, d);
  const buildingById = new Map<EntityId, Building>();
  for (const b of state.buildings) buildingById.set(b.id, b);

  // The festival on its night: held on a pattern site, that site is the festival's place tonight.
  const plan = state.festival.live ? state.festival.plan : null;
  const festRect = plan ? heldRect(state, plan.site) : null;
  const festSite = plan?.site && 'pattern' in plan.site ? plan.site : null;

  // Pattern sites.
  for (const site of state.hearth.sites) {
    if (festSite && festSite.pattern === site.pattern && festSite.anchor === site.anchor) continue;
    const d = draft(sitePlaceId(site.pattern, site.anchor), 'site', site.pattern, site.anchor);
    for (const t of site.tiles) d.tiles.push(t);
    d.tiles.push(site.anchor);
    for (const id of site.members) {
      claimed.add(id);
      const piece = decorById.get(id);
      if (piece) {
        const def = content.decorById.get(piece.def);
        if (def) addPiece(d, piece, def);
        d.tiles.push(tileOfDecor(piece));
        continue;
      }
      const b = buildingById.get(id);
      if (!b) continue;
      const def = content.buildingById.get(b.def);
      const door = doorTile(b, def);
      if (b.stage === 'built' && def?.host) addHost(d, b, def.host, door);
      else {
        d.members.push(id);
        d.tiles.push(door);
      }
    }
    if (WALKS.has(site.pattern)) {
      d.kinds |= kindBit('walk');
      d.walkTiles = site.tiles.length;
    }
    if (MEETS.has(site.pattern)) d.kinds |= kindBit('meet');
    drafts.push(d);
  }

  // The festival site on its night: its pieces and the open ground of its rect.
  if (plan && festRect) {
    const anchor = festSite ? festSite.anchor : festRect[1] * S + festRect[0];
    const d = draft(festivalPlaceId(anchor), 'host', plan.festival, anchor);
    for (let z = festRect[1]; z <= festRect[3]; z++)
      for (let x = festRect[0]; x <= festRect[2]; x++) d.tiles.push(z * S + x);
    for (const piece of state.decor) {
      const t = tileOfDecor(piece);
      const x = t % S;
      const z = (t - x) / S;
      if (x < festRect[0] || x > festRect[2] || z < festRect[1] || z > festRect[3]) continue;
      if (claimed.has(piece.id)) continue;
      claimed.add(piece.id);
      const def = content.decorById.get(piece.def);
      if (def) addPiece(d, piece, def);
    }
    d.standing += P.festivalStanding;
    d.kinds |= kindBit('meet') | kindBit('eat');
    drafts.push(d);
  }

  // Sitting spots: seat pieces in no site, by id; each takes the free seats within reach of it.
  const seatPieces: Decor[] = [];
  for (const piece of state.decor) {
    if (claimed.has(piece.id)) continue;
    if ((content.decorById.get(piece.def)?.seats ?? 0) > 0) seatPieces.push(piece);
  }
  seatPieces.sort((a, b) => a.id - b.id);
  const spots: Draft[] = [];
  const inSpot = new Set<EntityId>();
  const free = new Set<EntityId>(seatPieces.map((p) => p.id));
  const decorGrid = worldIndex(state).decorGrid;
  for (const seed of seatPieces) {
    if (inSpot.has(seed.id)) continue;
    const seedTile = tileOfDecor(seed);
    const near: [dist: number, piece: Decor][] = [];
    // A Manhattan reach of spotRadius lies inside the circle of that many tiles (plus a tile's width).
    for (const other of decorGrid.near(seed.fx, seed.fz, (P.spotRadius + 1) * TILE_FP)) {
      if (other === seed || !free.has(other.id) || inSpot.has(other.id)) continue;
      const dist = manhattan(seedTile, tileOfDecor(other));
      if (dist <= P.spotRadius) near.push([dist, other]);
    }
    near.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
    const d = draft(seatsPlaceId(seed.id), 'seats', seed.def, seedTile);
    for (const piece of [seed, ...near.slice(0, Math.max(0, P.spotMaxPieces - 1)).map((n) => n[1])]) {
      inSpot.add(piece.id);
      claimed.add(piece.id);
      addPiece(d, piece, content.decorById.get(piece.def)!);
      addAround(d.tiles, tileOfDecor(piece));
    }
    spots.push(d);
    drafts.push(d);
  }

  // Fires: a fire within reach of a spot warms that spot; one on its own is a place of its own.
  for (const piece of state.decor) {
    if (claimed.has(piece.id)) continue;
    const def = content.decorById.get(piece.def);
    if (!def?.warm) continue;
    claimed.add(piece.id);
    const t = tileOfDecor(piece);
    const spot = spots.find((s) => manhattan(s.tile, t) <= P.spotRadius);
    if (spot) {
      addPiece(spot, piece, def);
      addAround(spot.tiles, t);
      continue;
    }
    const d = draft(firePlaceId(piece.id), 'host', piece.def, t);
    addPiece(d, piece, def);
    addAround(d.tiles, t);
    d.kinds |= kindBit('meet');
    drafts.push(d);
  }

  // Porches and building hosts.
  for (const b of state.buildings) {
    if (b.stage !== 'built' || claimed.has(b.id)) continue;
    const def = content.buildingById.get(b.def);
    if (!def) continue;
    if (isHomeDef(def) && b.rt?.modules?.some(([, m]) => m === 'porch')) {
      let household: EntityId = 0;
      for (const h of state.households) if (h.homeId === b.id) household = household || h.id;
      if (household) {
        const door = doorTile(b, def);
        const d = draft(porchPlaceId(b.id), 'porch', b.def, door);
        d.members.push(b.id);
        d.seats = P.porchSeats;
        d.household = household;
        d.porch = true;
        d.kinds |= kindBit('sit');
        addAround(d.tiles, door);
        drafts.push(d);
      }
    }
    if (def.host) {
      const door = doorTile(b, def);
      const d = draft(hostPlaceId(b.id), 'host', b.def, door);
      addHost(d, b, def.host, door);
      const [x0, z0, x1, z1] = buildingRect(b, def);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) d.tiles.push(z * S + x);
      drafts.push(d);
    }
  }

  // The skating ice: a place at each skating spot while the river is frozen.
  if (state.weather.river.frozen) {
    for (const spot of skatingSpots(state)) {
      const d = draft(icePlaceId(spot), 'host', 'ice', spot);
      addAround(d.tiles, spot);
      d.standing += P.iceStanding;
      d.ice = true;
      for (const k of P.iceKinds) d.kinds |= kindBit(k);
      drafts.push(d);
    }
  }

  // Outlets that sell Treats, and shops with tables out (R2B decides both).
  const outlets: [id: EntityId, door: number][] = [];
  const cafes: [b: Building, door: number, seats: number][] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const sells = sellsTreats(state, b);
    const tables = cafeTables(state, b);
    if (!sells && tables <= 0) continue;
    const door = doorTile(b);
    if (sells) outlets.push([b.id, door]);
    if (tables > 0) cafes.push([b, door, tables]);
  }
  drafts.sort(byPlaceId);
  for (const [b, door, seats] of cafes) {
    const d = drafts.find(
      (p) => (p.source === 'seats' || p.source === 'site') && nearAny(p.tiles, door, P.cafeRadius),
    );
    if (!d) continue;
    d.seats += seats;
    d.members.push(b.id);
    d.tiles.push(door);
  }

  // Outlets by a coarse cell of their door, so each place checks only those near it.
  const outletCells: ([id: EntityId, door: number][] | undefined)[] = new Array(CELLS * CELLS);
  for (const o of outlets) (outletCells[cellOf(o[1])] ??= []).push(o);
  const grid = worldIndex(state).decorGrid;
  const wet = waterReach(state, P.waterRadius);

  const places: Place[] = [];
  const extras: PlaceExtra[] = [];
  for (const d of drafts) {
    const tiles = sortedUnique(d.tiles);
    // Mark this place's tiles on the scratch stamp (a membership test with no Set).
    stampId++;
    if (stampId === 0x7fffffff) {
      stamp.fill(0);
      stampId = 1;
    }
    for (const t of tiles) stamp[t] = stampId;
    let x0 = S;
    let z0 = S;
    let x1 = -1;
    let z1 = -1;
    for (const t of tiles) {
      const x = t % S;
      const z = (t - x) / S;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    let near: EntityId[] = NONE;
    const r = P.serveRadius;
    for (let cz = cellCoord(z0 - r); cz <= cellCoord(z1 + r); cz++) {
      for (let cx = cellCoord(x0 - r); cx <= cellCoord(x1 + r); cx++) {
        const list = outletCells[cz * CELLS + cx];
        if (!list) continue;
        for (const [id, door] of list) {
          if (!nearAny(tiles, door, r)) continue;
          if (near === NONE) near = [];
          near.push(id);
        }
      }
    }
    if (near.length > 1) near.sort((a, b) => a - b);

    // Kinds: pieces and water decide most of them. One query for the decor over the place's box.
    let pieceKinds = 0;
    let lights = false;
    // The tree and quiet bits move with the map (trees grow, roads come and go): draw.ts sets them
    // each tick from the place's tiles, so they are never a step behind a fresh rebuild.
    let features = 0;
    seenDefs.length = 0;
    const reach = ((x1 - x0 + 1 + (z1 - z0 + 1)) * TILE_FP) / 2 + TILE_FP;
    for (const piece of grid.near(((x0 + x1 + 1) * TILE_FP) / 2, ((z0 + z1 + 1) * TILE_FP) / 2, reach)) {
      if (stamp[tileOfDecor(piece)] !== stampId) continue;
      const info = DECOR_INFO.get(piece.def);
      if (!info) continue;
      if (!seenDefs.includes(piece.def)) {
        seenDefs.push(piece.def);
        pieceKinds += 1;
      }
      if (info.light) lights = true;
      features |= info.features;
      if (info.play) d.kinds |= kindBit('play');
      if (info.view) d.kinds |= kindBit('view');
    }
    if (d.seats - d.childSeats > 0) d.kinds |= kindBit('sit');
    if (d.childSeats > 0) d.kinds |= kindBit('play');
    if (near.length > 0) d.kinds |= kindBit('eat');
    let water = false;
    for (const t of tiles) {
      if (wet[t]) {
        water = true;
        break;
      }
    }
    if (water) d.kinds |= kindBit('view');
    for (const id of d.members) features |= buildingFeatures(buildingById.get(id));
    for (const id of near) features |= buildingFeatures(buildingById.get(id));
    if (water) features |= PlaceFeature.water;

    let standing = d.standing;
    if (d.walkTiles > 0) standing += Math.floor(d.walkTiles / Math.max(1, P.walkTilesPerStroller));
    if (!d.porch) standing += Math.max(P.standingMin, Math.floor((d.seats * P.standingShare) / 100));

    const place: Place = {
      id: d.id,
      source: d.source,
      def: d.def,
      tile: d.tile,
      tiles,
      members: sortedUnique(d.members),
      seats: d.seats,
      childSeats: d.childSeats,
      standing,
      kinds: PLACE_KINDS.filter((k) => d.kinds & kindBit(k)),
      sheltered: d.sheltered,
      warm: d.warm,
      outlets: near,
      draw: 0,
      parts: {
        charm: 0,
        site: d.source === 'site' ? P.siteBonus : 0,
        pieces: Math.min(P.pieceKindMax, pieceKinds * P.pieceKindBonus),
        water: water ? P.waterBonus : 0,
        lit: 0,
        treats: 0,
        winter: 0,
      },
    };
    if (d.household !== undefined) place.household = d.household;
    places.push(place);
    extras.push({ lights, winterExempt: d.sheltered || d.warm || d.ice, features });
  }
  return { places, extras };
}

/** Places with no outlet near share this one empty list (callers never mutate a place). */
const NONE: EntityId[] = [];

/** Scratch for a place's tiles while it is finished: stamp[tile] === stampId marks them. */
const stamp = new Int32Array(S * S);
let stampId = 0;

/** Decor defs already counted among a place's pieces (reused, emptied for each place). */
const seenDefs: string[] = [];

/** The numbers sorted ascending without repeats, as a new array. */
function sortedUnique(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const sorted = Int32Array.from(values).sort();
  const out: number[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1]) out.push(sorted[i]!);
  return out;
}

/** Coarse cells for finding outlets near a place (tiles per side). */
const CELL = 8;
const CELLS = Math.ceil(S / CELL);

function cellCoord(v: number): number {
  return Math.max(0, Math.min(CELLS - 1, Math.floor(v / CELL)));
}

function cellOf(tile: number): number {
  const x = tile % S;
  return cellCoord((tile - x) / S) * CELLS + cellCoord(x);
}

/** True when some tile lies within `radius` (Manhattan) of `tile`. */
function nearAny(tiles: Iterable<number>, tile: number, radius: number): boolean {
  for (const t of tiles) if (manhattan(t, tile) <= radius) return true;
  return false;
}

/** Tiles with water (not under a road) within `radius` (Chebyshev), by state; rebuilt when the water or roads change. */
const wetMasks = new WeakMap<WorldState, { key: number; radius: number; mask: Uint8Array }>();

function waterReach(state: WorldState, radius: number): Uint8Array {
  const { water, road } = state.map;
  // A hash of the water and road layers keys the mask, so it is always the state's own.
  let h = 0x811c9dc5;
  const w32 = new Uint32Array(water.buffer, water.byteOffset, water.byteLength >>> 2);
  const r32 = new Uint32Array(road.buffer, road.byteOffset, road.byteLength >>> 2);
  for (let i = 0; i < w32.length; i++) h = Math.imul(h ^ w32[i]!, 0x01000193);
  for (let i = 0; i < r32.length; i++) h = Math.imul(h ^ r32[i]!, 0x01000193);
  const key = h >>> 0;
  const cached = wetMasks.get(state);
  if (cached && cached.key === key && cached.radius === radius) return cached.mask;
  // Rows then columns: a running window of `radius` either way (Chebyshev distance).
  const rows = new Uint8Array(S * S);
  for (let z = 0; z < S; z++) {
    let last = -S;
    for (let x = 0; x < S; x++) {
      const i = z * S + x;
      if (water[i] && !road[i]) last = x;
      if (x - last <= radius) rows[i] = 1;
    }
    last = 2 * S;
    for (let x = S - 1; x >= 0; x--) {
      const i = z * S + x;
      if (water[i] && !road[i]) last = x;
      if (last - x <= radius) rows[i] = 1;
    }
  }
  const mask = new Uint8Array(S * S);
  for (let x = 0; x < S; x++) {
    let last = -S;
    for (let z = 0; z < S; z++) {
      if (rows[z * S + x]) last = z;
      if (z - last <= radius) mask[z * S + x] = 1;
    }
    last = 2 * S;
    for (let z = S - 1; z >= 0; z--) {
      if (rows[z * S + x]) last = z;
      if (last - z <= radius) mask[z * S + x] = 1;
    }
  }
  wetMasks.set(state, { key, radius, mask });
  return mask;
}
