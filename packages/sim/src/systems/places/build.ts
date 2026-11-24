// The place pass's sources (docs/spec/19-evenings.md, Places: Where places come from and What a place
// has): pattern sites, sitting spots, porches and hosts (buildings, fires, the ice, the festival site
// on its night), each with seats, standing room, kinds, shelter, warmth and the outlets within reach.
// Pure: reads saved state and writes nothing to it. The draw's parts that move with the hour (charm,
// lanterns, winter) are filled by draw.ts; the live part (Treats on a shelf) by placeDraw.
import { content, type DecorDef, type HostDef, type PlaceKind } from '@qoti/content';
import { MAP_SIZE, PLACE_KINDS, TILE_FP } from '../../constants';
import type { Building, Decor, EntityId, Place, PlaceSource, WorldState } from '../../contracts';
import { buildingRect, decorTileX, decorTileZ, isHomeDef } from '../../conditions/geo';
import { findById } from '../../state/entities';
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
import { SIG, sameSignature } from './signature';
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
  /** Winter spares it: sheltered, warm, or the ice. R3.0: a fire's warmth is read each tick (`fires`). */
  winterExempt: boolean;
  /** R3.0: the light pieces on its tiles, sorted by id (its lit part reads supplies' decorLit each tick). */
  lamps: EntityId[];
  /** R3.0: its fires (members that warm), sorted by id: warm while one burns (supplies' pieceRests). */
  fires: EntityId[];
  /** R3.0: sheltered, heated or the ice: winter spares it whatever its fires do. */
  exempt: boolean;
  /** R3.0: a heated host (the Bath House, the tavern): warm whatever its fires do. */
  hostWarm: boolean;
  /** What stands there as found at rebuild (PlaceFeature bits: pieces, buildings, water). */
  base: number;
  /** `base` and the bits that move with the map (a mature tree, no road), set each tick by draw.ts. */
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
        seats: def.seats ?? 0,
        warm: def.warm === true,
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
  /** R3.0: warm from a heated host (the Bath House, the tavern), not a fire. */
  hostWarm: boolean;
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
    hostWarm: false,
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
  if (host.warm) {
    d.warm = true;
    d.hostWarm = true;
  }
  addAround(d.tiles, door);
}

/**
 * Every place the town has now, sorted by id. Sources in the spec's order: pattern sites; the
 * festival site on its night; sitting spots (seat pieces in no site, up to `spotMaxPieces` within
 * `spotRadius` of the lowest id); fires (joining a spot within `spotRadius`, else a place of their
 * own); porches; building hosts (a site member is part of its site); the skating ice. Then outlets
 * and cafe tables, kinds and standing. `sig` is the place signature (signature.ts) of the state now:
 * with it, the drafts whose inputs did not change since this state's last build are kept.
 */
export function buildPlaces(state: WorldState, sig?: readonly number[]): BuiltPlaces {
  const drafts: Draft[] = [];
  const claimed = new Set<EntityId>();
  const last = lastBuilds.get(state);
  // Porches and hosts read the buildings, the households and the sites' claims; outlets and cafe
  // tables the buildings alone. Unchanged parts of the signature keep last build's drafts of them.
  const sameHosts =
    sig !== undefined &&
    last?.sig !== undefined &&
    sameSignature(last.sig, sig, SIG.buildings, SIG.sites + 2);
  const sameOutlets =
    sig !== undefined &&
    last?.sig !== undefined &&
    sameSignature(last.sig, sig, SIG.buildings, SIG.buildings + 2);

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
      const piece = findById(state.decor, id);
      if (piece) {
        const def = content.decorById.get(piece.def);
        if (def) addPiece(d, piece, def);
        d.tiles.push(tileOfDecor(piece));
        continue;
      }
      const b = findById(state.buildings, id);
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
  // (The decor list is sorted by id, so seeds come in id order. A piece is free while no site, the
  // festival or an earlier spot has claimed it.)
  const spots: Draft[] = [];
  const seats = seatGrid(state, claimed);
  const R = P.spotRadius;
  for (const seed of seats) {
    if (claimed.has(seed.id)) continue;
    const seedTile = tileOfDecor(seed);
    const sx = seedTile % S;
    const sz = (seedTile - sx) / S;
    const near: [dist: number, piece: Decor][] = [];
    // Every free seat piece within a Manhattan reach of spotRadius, tile by tile over the diamond.
    for (let dz = -R; dz <= R; dz++) {
      const z = sz + dz;
      if (z < 0 || z >= S) continue;
      const w = R - Math.abs(dz);
      for (let dx = -w; dx <= w; dx++) {
        const x = sx + dx;
        if (x < 0 || x >= S) continue;
        const t = z * S + x;
        if (seatEpoch[t] !== seatEpochId) continue;
        for (let j = seatHead[t]!; j >= 0; j = seatNext[j]!) {
          const other = seats[j]!;
          if (other === seed || claimed.has(other.id)) continue;
          near.push([Math.abs(dx) + Math.abs(dz), other]);
        }
      }
    }
    near.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
    const d = draft(seatsPlaceId(seed.id), 'seats', seed.def, seedTile);
    const take = Math.min(near.length, Math.max(0, P.spotMaxPieces - 1));
    for (let k = -1; k < take; k++) {
      const piece = k < 0 ? seed : near[k]![1];
      claimed.add(piece.id);
      addPiece(d, piece, content.decorById.get(piece.def)!);
      addAround(d.tiles, tileOfDecor(piece));
    }
    spots.push(d);
    drafts.push(d);
  }

  // Fires: a fire within reach of a spot warms that spot; one on its own is a place of its own.
  // The first spot (in list order) within spotRadius of a tile, found from the lowest list index
  // at each spot tile over the diamond around it.
  let spotsGridded = false;
  const firstSpot = (t: number): Draft | undefined => {
    if (!spotsGridded) {
      spotsGridded = true;
      spotEpochId++;
      if (spotEpochId === 0x7fffffff) {
        spotEpoch.fill(0);
        spotEpochId = 1;
      }
      for (let i = spots.length - 1; i >= 0; i--) {
        const at = spots[i]!.tile;
        spotEpoch[at] = spotEpochId;
        spotAt[at] = i;
      }
    }
    const fx = t % S;
    const fz = (t - fx) / S;
    let best = -1;
    for (let dz = -R; dz <= R; dz++) {
      const z = fz + dz;
      if (z < 0 || z >= S) continue;
      const w = R - Math.abs(dz);
      for (let dx = -w; dx <= w; dx++) {
        const x = fx + dx;
        if (x < 0 || x >= S) continue;
        const at = z * S + x;
        if (spotEpoch[at] !== spotEpochId) continue;
        const i = spotAt[at]!;
        if (best < 0 || i < best) best = i;
      }
    }
    return best < 0 ? undefined : spots[best];
  };
  for (const piece of state.decor) {
    if (claimed.has(piece.id) || !DECOR_INFO.get(piece.def)?.warm) continue;
    const def = content.decorById.get(piece.def)!;
    claimed.add(piece.id);
    const t = tileOfDecor(piece);
    const spot = spots.length > 0 ? firstSpot(t) : undefined;
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
  const hostDrafts: [draft: Draft, kinds: number][] = [];
  if (sameHosts) {
    for (const [d, kinds] of last!.hosts) {
      const copy = { ...d, kinds };
      hostDrafts.push([copy, kinds]);
      drafts.push(copy);
    }
  }
  let householdAt: Map<EntityId, EntityId> | null = null;
  for (const b of sameHosts ? [] : state.buildings) {
    if (b.stage !== 'built' || claimed.has(b.id)) continue;
    const def = content.buildingById.get(b.def);
    if (!def) continue;
    if (isHomeDef(def) && b.rt?.modules?.some(([, m]) => m === 'porch')) {
      if (!householdAt) {
        // The first household (in list order) at each home, as the porch's own.
        householdAt = new Map();
        for (const h of state.households) if (!householdAt.has(h.homeId)) householdAt.set(h.homeId, h.id);
      }
      const household = householdAt.get(b.id) ?? 0;
      if (household) {
        const door = doorTile(b, def);
        const d = draft(porchPlaceId(b.id), 'porch', b.def, door);
        d.members.push(b.id);
        d.seats = P.porchSeats;
        d.household = household;
        d.porch = true;
        d.kinds |= kindBit('sit');
        addAround(d.tiles, door);
        hostDrafts.push([d, d.kinds]);
        drafts.push(d);
      }
    }
    if (def.host) {
      const door = doorTile(b, def);
      const d = draft(hostPlaceId(b.id), 'host', b.def, door);
      addHost(d, b, def.host, door);
      const [x0, z0, x1, z1] = buildingRect(b, def);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) d.tiles.push(z * S + x);
      hostDrafts.push([d, d.kinds]);
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
  const outlets: [id: EntityId, door: number][] = sameOutlets ? last!.outletList : [];
  const cafes: [id: EntityId, door: number, seats: number][] = sameOutlets ? last!.cafes : [];
  for (const b of sameOutlets ? [] : state.buildings) {
    if (b.stage !== 'built') continue;
    const sells = sellsTreats(state, b);
    const tables = cafeTables(state, b);
    if (!sells && tables <= 0) continue;
    const door = doorTile(b);
    if (sells) outlets.push([b.id, door]);
    if (tables > 0) cafes.push([b.id, door, tables]);
  }
  drafts.sort(byPlaceId);
  for (const [id, door, seats] of cafes) {
    const d = drafts.find(
      (p) => (p.source === 'seats' || p.source === 'site') && nearAny(p.tiles, door, P.cafeRadius),
    );
    if (!d) continue;
    d.seats += seats;
    d.members.push(id);
    d.tiles.push(door);
  }

  // Outlets by a coarse cell of their door, so each place checks only those near it.
  const outletCells: ([id: EntityId, door: number][] | undefined)[] = new Array(CELLS * CELLS);
  for (const o of outlets) (outletCells[cellOf(o[1])] ??= []).push(o);
  const grid = worldIndex(state).decorGrid;
  const wet = waterReach(state, P.waterRadius);

  // What changed since this state's last build: a place whose draft is the same and none of whose
  // inputs changed is the place that build finished (the loop below reads nothing else), so it is kept.
  const decorNow = decorSnapshot(state);
  const buildingsNow = buildingSnapshot(state);
  const changes = last ? changesSince(last, outlets, wet, decorNow, buildingsNow) : null;
  const finished = new Map<string, Finished>();

  const places: Place[] = [];
  const extras: PlaceExtra[] = [];
  for (const d of drafts) {
    const kinds0 = d.kinds;
    const prev = changes ? last!.finished.get(d.id) : undefined;
    if (prev && changes && unchanged(prev, d, changes)) {
      places.push(prev.place);
      extras.push(prev.extra);
      finished.set(d.id, { draft: d, kinds0, place: prev.place, extra: prev.extra });
      continue;
    }
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
    const lamps: EntityId[] = [];
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
      if (info.light) {
        lights = true;
        lamps.push(piece.id);
      }
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
    for (const id of d.members) features |= buildingFeatures(findById(state.buildings, id));
    for (const id of near) features |= buildingFeatures(findById(state.buildings, id));
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
    const fires: EntityId[] = [];
    for (const id of place.members) {
      const m = findById(state.decor, id);
      if (m && DECOR_INFO.get(m.def)?.warm) fires.push(id);
    }
    lamps.sort((a, b) => a - b);
    const extra: PlaceExtra = {
      lights,
      winterExempt: d.sheltered || d.warm || d.ice,
      lamps,
      fires,
      exempt: d.sheltered || d.hostWarm || d.ice,
      hostWarm: d.hostWarm,
      base: features,
      features,
    };
    extraOf.set(place, extra);
    places.push(place);
    extras.push(extra);
    finished.set(d.id, { draft: d, kinds0, place, extra });
  }
  lastBuilds.set(state, {
    sig,
    hosts: hostDrafts,
    outletList: outlets,
    cafes,
    finished,
    decor: decorNow,
    buildings: buildingsNow,
    outlets: outlets.flat(),
    wet,
  });
  return { places, extras };
}

// --- Keeping what did not change ----------------------------------------------------------------
//
// A place's finish (the loop above) reads its draft, the decor on its tiles, the water mask, the
// outlets within serveRadius and the tags of its member and outlet buildings. The last build's
// finished places are kept beside the inputs it read, and a place is taken over only when its draft
// is equal field by field and none of those inputs changed: the result is then exactly what finishing
// it again would give, so a state with a last build and a fresh one (a seat joining) see equal places.

/** A finished place and the draft it was finished from (`kinds0`: the draft's kinds before finishing). */
interface Finished {
  draft: Draft;
  kinds0: number;
  place: Place;
  extra: PlaceExtra;
}

/** Entities by id (both sorted ascending) with a packed value of what the finish reads of them. */
interface Snapshot {
  ids: Int32Array;
  values: Int32Array;
}

interface LastBuild {
  /** The signature it was built for (none when the caller gave none). */
  sig: readonly number[] | undefined;
  /** Porch and host drafts as drafted, with their kinds then (finishing adds kinds to a draft). */
  hosts: [draft: Draft, kinds: number][];
  outletList: [id: EntityId, door: number][];
  cafes: [id: EntityId, door: number, seats: number][];
  finished: Map<string, Finished>;
  decor: Snapshot;
  buildings: Snapshot;
  /** The outlets as [id, door, id, door, ...] in building order. */
  outlets: number[];
  wet: Uint8Array;
}

/** Each state's last build (derived, never saved; a fresh state simply has none). */
const lastBuilds = new WeakMap<WorldState, LastBuild>();

const DECOR_INDEX = new Map(content.decor.map((d, i) => [d.id, i]));
const BUILDING_INDEX = new Map(content.buildings.map((b, i) => [b.id, i]));
const TRADE_INDEX = new Map(content.trades.map((t, i) => [t.id, i]));

/** Each decor piece's def and tile, as def index times the map's tiles plus the tile. */
function decorSnapshot(state: WorldState): Snapshot {
  const n = state.decor.length;
  const ids = new Int32Array(n);
  const values = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const d = state.decor[i]!;
    ids[i] = d.id;
    values[i] = (DECOR_INDEX.get(d.def) ?? content.decor.length) * S * S + tileOfDecor(d);
  }
  return { ids, values };
}

/** Each building's def and trade (what hasTag reads), packed. */
function buildingSnapshot(state: WorldState): Snapshot {
  const n = state.buildings.length;
  const ids = new Int32Array(n);
  const values = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const b = state.buildings[i]!;
    ids[i] = b.id;
    const trade = b.trade === undefined ? 0 : (TRADE_INDEX.get(b.trade) ?? content.trades.length) + 1;
    values[i] = (BUILDING_INDEX.get(b.def) ?? content.buildings.length) * 4096 + trade;
  }
  return { ids, values };
}

/** Calls `fn` with the value of every entity added, removed or changed between two snapshots. */
function diff(a: Snapshot, b: Snapshot, fn: (id: number, value: number) => void): void {
  let i = 0;
  let j = 0;
  while (i < a.ids.length || j < b.ids.length) {
    const ai = i < a.ids.length ? a.ids[i]! : Infinity;
    const bj = j < b.ids.length ? b.ids[j]! : Infinity;
    if (ai === bj) {
      if (a.values[i] !== b.values[j]) {
        fn(ai, a.values[i]!);
        fn(bj, b.values[j]!);
      }
      i++;
      j++;
    } else if (ai < bj) {
      fn(ai, a.values[i]!);
      i++;
    } else {
      fn(bj, b.values[j]!);
      j++;
    }
  }
}

interface Changes {
  /** dirty[tile] === dirtyId: a decor piece came, went or changed on the tile. */
  dirtyId: number;
  /** Buildings whose def or trade changed, or that came or went. */
  buildings: Set<EntityId>;
  /** Doors of outlets that came, went or moved. */
  outletDoors: number[];
}

const dirty = new Int32Array(S * S);
let dirtyId = 0;

function changesSince(
  last: LastBuild,
  outlets: readonly [EntityId, number][],
  wet: Uint8Array,
  decorNow: Snapshot,
  buildingsNow: Snapshot,
): Changes | null {
  // A new water mask (water or roads changed) touches places anywhere: finish them all.
  if (wet !== last.wet) return null;
  dirtyId++;
  if (dirtyId === 0x7fffffff) {
    dirty.fill(0);
    dirtyId = 1;
  }
  const T = S * S;
  diff(last.decor, decorNow, (_id, value) => {
    dirty[value % T] = dirtyId;
  });
  const buildings = new Set<EntityId>();
  diff(last.buildings, buildingsNow, (id) => {
    buildings.add(id);
  });
  // Outlets: the pairs in one list and not the other (both are in building order, by id).
  const outletDoors: number[] = [];
  const was = last.outlets;
  let i = 0;
  let j = 0;
  while (i < was.length || j < outlets.length) {
    const ai = i < was.length ? was[i]! : Infinity;
    const bj = j < outlets.length ? outlets[j]![0] : Infinity;
    if (ai === bj) {
      if (was[i + 1] !== outlets[j]![1]) outletDoors.push(was[i + 1]!, outlets[j]![1]);
      i += 2;
      j++;
    } else if (ai < bj) {
      outletDoors.push(was[i + 1]!);
      i += 2;
    } else {
      outletDoors.push(outlets[j]![1]);
      j++;
    }
  }
  return { dirtyId, buildings, outletDoors };
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** True when the place `prev` finished is what finishing `d` now would give. */
function unchanged(prev: Finished, d: Draft, c: Changes): boolean {
  const a = prev.draft;
  if (
    a.source !== d.source ||
    a.def !== d.def ||
    a.tile !== d.tile ||
    a.seats !== d.seats ||
    a.childSeats !== d.childSeats ||
    a.standing !== d.standing ||
    prev.kinds0 !== d.kinds ||
    a.sheltered !== d.sheltered ||
    a.warm !== d.warm ||
    a.hostWarm !== d.hostWarm ||
    a.ice !== d.ice ||
    a.walkTiles !== d.walkTiles ||
    a.household !== d.household ||
    a.porch !== d.porch ||
    !sameNumbers(a.tiles, d.tiles) ||
    !sameNumbers(a.members, d.members)
  ) {
    return false;
  }
  const place = prev.place;
  for (const t of place.tiles) if (dirty[t] === c.dirtyId) return false;
  if (c.buildings.size > 0) {
    for (const id of place.members) if (c.buildings.has(id)) return false;
    for (const id of place.outlets) if (c.buildings.has(id)) return false;
  }
  for (const door of c.outletDoors) if (nearAny(place.tiles, door, P.serveRadius)) return false;
  return true;
}

/** Each place's extra, by the place object (a place kept by a later build keeps its extra). */
const extraOf = new WeakMap<Place, PlaceExtra>();

/** The extra of a place this module finished. */
export function placeExtra(place: Place): PlaceExtra | undefined {
  return extraOf.get(place);
}

/** Each sitting spot's lowest list index by tile for the fires pass (valid where spotEpoch is current). */
const spotEpoch = new Int32Array(S * S);
const spotAt = new Int32Array(S * S);
let spotEpochId = 0;

/** Seat pieces by tile for the spots pass: seatHead[tile] is valid when seatEpoch[tile] is current. */
const seatEpoch = new Int32Array(S * S);
const seatHead = new Int32Array(S * S);
let seatNext = new Int32Array(256);
let seatEpochId = 0;

/** The seat pieces no site or the festival claimed, in id order, linked by tile (seatHead, seatNext). */
function seatGrid(state: WorldState, claimed: ReadonlySet<EntityId>): Decor[] {
  seatEpochId++;
  if (seatEpochId === 0x7fffffff) {
    seatEpoch.fill(0);
    seatEpochId = 1;
  }
  const seats: Decor[] = [];
  for (const d of state.decor) {
    if (claimed.has(d.id) || (DECOR_INFO.get(d.def)?.seats ?? 0) <= 0) continue;
    seats.push(d);
  }
  if (seatNext.length < seats.length) seatNext = new Int32Array(seats.length * 2);
  for (let i = 0; i < seats.length; i++) {
    const t = tileOfDecor(seats[i]!);
    if (seatEpoch[t] !== seatEpochId) {
      seatEpoch[t] = seatEpochId;
      seatHead[t] = -1;
    }
    seatNext[i] = seatHead[t]!;
    seatHead[t] = i;
  }
  return seats;
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
