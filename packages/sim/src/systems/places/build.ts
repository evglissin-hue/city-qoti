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
import { TREE_MATURE, treeStage } from '../../map/layers';

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
  /** What stands there, for a resident's taste (PlaceFeature bits). */
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

/** A place under construction: sets of tiles and members, the room, and what it offers. */
interface Draft {
  id: string;
  source: PlaceSource;
  def: string;
  tile: number;
  tiles: Set<number>;
  members: Set<EntityId>;
  seats: number;
  childSeats: number;
  standing: number;
  kinds: Set<PlaceKind>;
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
    tiles: new Set(),
    members: new Set(),
    seats: 0,
    childSeats: 0,
    standing: 0,
    kinds: new Set(),
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
function addAround(set: Set<number>, tile: number): void {
  const x = tile % S;
  const z = (tile - x) / S;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < S && nz < S) set.add(nz * S + nx);
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
  d.members.add(piece.id);
  const seats = def.seats ?? 0;
  d.seats += seats;
  if (def.childSeats) d.childSeats += seats;
  d.standing += def.standing ?? 0;
  if (def.warm) d.warm = true;
}

/** A host building's room and kinds go into the draft. */
function addHost(d: Draft, b: Building, host: HostDef, door: number): void {
  d.members.add(b.id);
  d.seats += host.seats;
  d.standing += host.standing;
  for (const k of host.kinds) d.kinds.add(k);
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
    for (const t of site.tiles) d.tiles.add(t);
    d.tiles.add(site.anchor);
    for (const id of site.members) {
      claimed.add(id);
      const piece = decorById.get(id);
      if (piece) {
        const def = content.decorById.get(piece.def);
        if (def) addPiece(d, piece, def);
        d.tiles.add(tileOfDecor(piece));
        continue;
      }
      const b = buildingById.get(id);
      if (!b) continue;
      d.members.add(id);
      const def = content.buildingById.get(b.def);
      const door = doorTile(b, def);
      if (b.stage === 'built' && def?.host) addHost(d, b, def.host, door);
      else d.tiles.add(door);
    }
    if (WALKS.has(site.pattern)) {
      d.kinds.add('walk');
      d.walkTiles = site.tiles.length;
    }
    if (MEETS.has(site.pattern)) d.kinds.add('meet');
    drafts.push(d);
  }

  // The festival site on its night: its pieces and the open ground of its rect.
  if (plan && festRect) {
    const anchor = festSite ? festSite.anchor : festRect[1] * S + festRect[0];
    const d = draft(festivalPlaceId(anchor), 'host', plan.festival, anchor);
    for (let z = festRect[1]; z <= festRect[3]; z++)
      for (let x = festRect[0]; x <= festRect[2]; x++) d.tiles.add(z * S + x);
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
    d.kinds.add('meet');
    d.kinds.add('eat');
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
  for (const seed of seatPieces) {
    if (inSpot.has(seed.id)) continue;
    const seedTile = tileOfDecor(seed);
    const near: [dist: number, piece: Decor][] = [];
    for (const other of seatPieces) {
      if (other === seed || inSpot.has(other.id)) continue;
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
    d.kinds.add('meet');
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
        d.members.add(b.id);
        d.seats = P.porchSeats;
        d.household = household;
        d.porch = true;
        d.kinds.add('sit');
        addAround(d.tiles, door);
        drafts.push(d);
      }
    }
    if (def.host) {
      const door = doorTile(b, def);
      const d = draft(hostPlaceId(b.id), 'host', b.def, door);
      addHost(d, b, def.host, door);
      const [x0, z0, x1, z1] = buildingRect(b, def);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) d.tiles.add(z * S + x);
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
      for (const k of P.iceKinds) d.kinds.add(k);
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
    d.members.add(b.id);
    d.tiles.add(door);
  }

  const places: Place[] = [];
  const extras: PlaceExtra[] = [];
  for (const d of drafts) {
    const tiles = [...d.tiles].sort((a, b) => a - b);
    const near: EntityId[] = [];
    for (const [id, door] of outlets) if (nearAny(d.tiles, door, P.serveRadius)) near.push(id);
    near.sort((a, b) => a - b);

    // Kinds: pieces and water decide most of them.
    let pieceKinds = 0;
    let lights = false;
    let features = 0;
    let quiet = true;
    const seen = new Set<string>();
    for (const t of tiles) {
      if (state.map.road[t]) quiet = false;
      const tv = state.map.tree[t]!;
      if (tv && treeStage(tv) >= TREE_MATURE) features |= PlaceFeature.tree;
      for (const piece of decorOn(state, t)) {
        const def = content.decorById.get(piece.def);
        if (!def) continue;
        if (!seen.has(def.id)) {
          seen.add(def.id);
          pieceKinds += 1;
        }
        if (def.tags.includes('light') || def.tags.includes('lantern')) lights = true;
        for (const [tag, bit] of DECOR_FEATURES) if (def.tags.includes(tag)) features |= bit;
        if (def.tags.includes('play')) d.kinds.add('play');
        if (VIEW_PIECES.has(def.id)) d.kinds.add('view');
      }
    }
    if (d.seats - d.childSeats > 0) d.kinds.add('sit');
    if (d.childSeats > 0) d.kinds.add('play');
    if (near.length > 0) d.kinds.add('eat');
    const water = waterNear(state, tiles, P.waterRadius);
    if (water) d.kinds.add('view');
    for (const id of d.members) features |= buildingFeatures(buildingById.get(id));
    for (const id of near) features |= buildingFeatures(buildingById.get(id));
    if (quiet) features |= PlaceFeature.quiet;
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
      members: [...d.members].sort((a, b) => a - b),
      seats: d.seats,
      childSeats: d.childSeats,
      standing,
      kinds: PLACE_KINDS.filter((k) => d.kinds.has(k)),
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

/** True when some tile of the set lies within `radius` (Manhattan) of `tile`. */
function nearAny(tiles: ReadonlySet<number>, tile: number, radius: number): boolean {
  for (const t of tiles) if (manhattan(t, tile) <= radius) return true;
  return false;
}

/** Decor standing on a tile (its center inside the tile), in id order. */
function decorOn(state: WorldState, tile: number): Decor[] {
  const x = tile % S;
  const z = (tile - x) / S;
  const out: Decor[] = [];
  for (const d of worldIndex(state).decorGrid.near(x * TILE_FP + 128, z * TILE_FP + 128, TILE_FP)) {
    if (decorTileX(d) === x && decorTileZ(d) === z) out.push(d);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Water (not under a road) within `radius` tiles (Chebyshev) of any of the tiles. */
function waterNear(state: WorldState, tiles: readonly number[], radius: number): boolean {
  const water = state.map.water;
  const road = state.map.road;
  for (const t of tiles) {
    const x = t % S;
    const z = (t - x) / S;
    for (let dz = -radius; dz <= radius; dz++) {
      const nz = z + dz;
      if (nz < 0 || nz >= S) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= S) continue;
        const i = nz * S + nx;
        if (water[i] && !road[i]) return true;
      }
    }
  }
  return false;
}
