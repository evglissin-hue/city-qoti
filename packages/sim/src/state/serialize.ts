import { Gunzip, gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { MAP_SIZE } from '../constants';
import type { LayerName, MapLayers, Uint16LayerName, WorldState } from '../contracts';
import { createLayers, INT32_LAYERS, LAYER_NAMES, UINT16_LAYERS } from '../map/layers';
import { RNG_STREAMS } from '../rng/streams';
import { base64ToBytes, bytesToBase64, bytesToWords, wordsToBytes } from './base64';
import { byPlaceId } from './evenings';
import { checkSaveVersion, type SaveObject } from './version';

// Save format: JSON where typed arrays are base64 (little-endian), then gzip. fflate keeps
// this synchronous, so the sim stays free of async (CompressionStream is async-only).

interface SaveFile {
  saveVersion: number;
  seed: string;
  settings: WorldState['settings'];
  lastTurn: number;
  tick: number;
  time: WorldState['time'];
  rng: string;
  nextId: number;
  /** R2 (R2.0): the Uint16 layers (UINT16_LAYERS) sit beside the others, little-endian. */
  map: Record<LayerName | Uint16LayerName, string>;
  meta: WorldState['meta'];
  seats: WorldState['seats'];
  buildings: WorldState['buildings'];
  decor: WorldState['decor'];
  notes: WorldState['notes'];
  residents: WorldState['residents'];
  households: WorldState['households'];
  economy: WorldState['economy'];
  logistics: WorldState['logistics'];
  hearth: WorldState['hearth'];
  wishes: WorldState['wishes'];
  chronicle: WorldState['chronicle'];
  achievements: WorldState['achievements'];
  stats: WorldState['stats'];
  networkVersion: number;
  // I2 (C4.0)
  market: WorldState['market'];
  levers: WorldState['levers'];
  loans: WorldState['loans'];
  lots: WorldState['lots'];
  trade: WorldState['trade'];
  carts: WorldState['carts'];
  charter: WorldState['charter'];
  innovations: WorldState['innovations'];
  plans: WorldState['plans'];
  requests: WorldState['requests'];
  stories: WorldState['stories'];
  village: WorldState['village'];
  // I3 (C5.0)
  weather: WorldState['weather'];
  warmth: WorldState['warmth'];
  festival: WorldState['festival'];
  renown: WorldState['renown'];
  commissions: WorldState['commissions'];
  dock: WorldState['dock'];
  nature: WorldState['nature'];
  threats: WorldState['threats'];
  watch: WorldState['watch'];
  raid: WorldState['raid'];
  trial: WorldState['trial'];
  guide: WorldState['guide'];
  seasons: WorldState['seasons'];
  // R1 (R1.0)
  carrier: WorldState['carrier'];
  seasonPlan: WorldState['seasonPlan'];
  demand: WorldState['demand'];
  // R2 (R2.0)
  places: WorldState['places'];
  gaps: WorldState['gaps'];
  streets: WorldState['streets'];
  evenings: WorldState['evenings'];
  // R3 (R3.0)
  supplies: WorldState['supplies'];
  masters: WorldState['masters'];
  townBook: WorldState['townBook'];
  threads: WorldState['threads'];
  /** Absent until the first calling is earned. */
  calling?: string;
}

export function serialize(state: WorldState): Uint8Array {
  const map = {} as Record<LayerName | Uint16LayerName, string>;
  for (const name of LAYER_NAMES) {
    const layer = state.map[name];
    map[name] = bytesToBase64(layer instanceof Int32Array ? wordsToBytes(layer) : layer);
  }
  for (const name of UINT16_LAYERS) map[name] = bytesToBase64(u16ToBytes(state.map[name]));
  const save: SaveFile = {
    saveVersion: state.saveVersion,
    seed: state.seed,
    settings: state.settings,
    lastTurn: state.lastTurn,
    tick: state.tick,
    time: state.time,
    rng: bytesToBase64(wordsToBytes(state.rng)),
    nextId: state.nextId,
    map,
    meta: state.meta,
    seats: state.seats,
    buildings: state.buildings,
    decor: state.decor,
    notes: state.notes,
    residents: state.residents,
    households: state.households,
    economy: state.economy,
    logistics: state.logistics,
    hearth: state.hearth,
    wishes: state.wishes,
    chronicle: state.chronicle,
    achievements: state.achievements,
    stats: state.stats,
    networkVersion: state.networkVersion,
    market: state.market,
    levers: state.levers,
    loans: state.loans,
    lots: state.lots,
    trade: state.trade,
    carts: state.carts,
    charter: state.charter,
    innovations: state.innovations,
    plans: state.plans,
    requests: state.requests,
    stories: state.stories,
    village: state.village,
    weather: state.weather,
    warmth: state.warmth,
    festival: state.festival,
    renown: state.renown,
    commissions: state.commissions,
    dock: state.dock,
    nature: state.nature,
    threats: state.threats,
    watch: state.watch,
    raid: state.raid,
    trial: state.trial,
    guide: state.guide,
    seasons: state.seasons,
    carrier: state.carrier,
    seasonPlan: state.seasonPlan,
    demand: state.demand,
    places: state.places,
    gaps: state.gaps,
    streets: state.streets,
    evenings: state.evenings,
    supplies: state.supplies,
    masters: state.masters,
    townBook: state.townBook,
    threads: state.threads,
    ...(state.calling !== undefined && { calling: state.calling }),
  };
  // mtime 0 keeps the bytes a pure function of the state.
  return gzipSync(strToU8(JSON.stringify(save)), { level: 6, mtime: 0 });
}

/**
 * Reads a save. R1's fresh start (docs/spec/21-networking-and-saves.md): a valley saved before
 * version 6 was founded under the old rules and is refused with an OldValleyError (code OLD_VALLEY)
 * rather than converted; one from a newer game is refused too.
 */
export function deserialize(data: Uint8Array): WorldState {
  const parsed = JSON.parse(strFromU8(gunzipSync(data))) as SaveObject;
  return build(checkSaveVersion(parsed) as unknown as SaveFile);
}

/**
 * Reads a save's version from its first bytes, without inflating the rest or building a world
 * (the title screen uses it to tell an old valley). Null when the bytes are not a save.
 */
export function peekSaveVersion(data: Uint8Array): number | null {
  let head = '';
  try {
    const gz = new Gunzip((chunk) => {
      if (head.length < 4096) head += strFromU8(chunk);
    });
    gz.push(data.subarray(0, Math.min(data.length, 4096)), false);
  } catch {
    // A truncated stream still yields what it inflated; anything else is not a save.
  }
  const m = /"saveVersion":\s*(\d+)/.exec(head);
  return m ? Number(m[1]) : null;
}

function build(save: SaveFile): WorldState {
  const n = MAP_SIZE * MAP_SIZE;
  const map: MapLayers = createLayers(MAP_SIZE);
  for (const name of LAYER_NAMES) {
    const encoded = save.map[name];
    if (typeof encoded !== 'string') throw new Error(`Save is missing layer ${name}`);
    const bytes = base64ToBytes(encoded);
    if (INT32_LAYERS.has(name)) {
      if (bytes.length !== n * 4) throw new Error(`Layer ${name} has the wrong size`);
      bytesToWords(bytes, map[name] as Int32Array);
    } else {
      if (bytes.length !== n) throw new Error(`Layer ${name} has the wrong size`);
      (map[name] as Uint8Array).set(bytes);
    }
  }
  for (const name of UINT16_LAYERS) {
    const encoded = save.map[name];
    if (typeof encoded !== 'string') throw new Error(`Save is missing layer ${name}`);
    const bytes = base64ToBytes(encoded);
    if (bytes.length !== n * 2) throw new Error(`Layer ${name} has the wrong size`);
    bytesToU16(bytes, map[name]);
  }
  const rngBytes = base64ToBytes(save.rng);
  if (rngBytes.length !== RNG_STREAMS.length * 16) throw new Error('Save has the wrong RNG size');
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
  return {
    saveVersion: save.saveVersion,
    seed: save.seed,
    settings: save.settings,
    lastTurn: save.lastTurn,
    tick: save.tick,
    time: save.time,
    rng: bytesToWords(rngBytes, new Uint32Array(RNG_STREAMS.length * 4)),
    nextId: save.nextId,
    map,
    meta: save.meta,
    seats: [...save.seats].sort((a, b) => a.seat - b.seat),
    buildings: [...save.buildings].sort(byId),
    decor: [...save.decor].sort(byId),
    notes: [...save.notes].sort(byId),
    residents: [...save.residents].sort(byId),
    households: [...save.households].sort(byId),
    economy: save.economy,
    logistics: save.logistics,
    hearth: save.hearth,
    wishes: [...save.wishes].sort(byId),
    chronicle: [...save.chronicle].sort(byId),
    achievements: save.achievements,
    stats: save.stats,
    networkVersion: save.networkVersion,
    market: save.market,
    levers: save.levers,
    loans: { loans: [...save.loans.loans].sort(byId) },
    lots: [...save.lots].sort(byId),
    trade: save.trade,
    carts: [...save.carts].sort(byId),
    charter: save.charter,
    innovations: save.innovations,
    plans: [...save.plans].sort(byId),
    requests: [...save.requests].sort(byId),
    stories: save.stories,
    village: save.village,
    weather: save.weather,
    warmth: save.warmth,
    festival: save.festival,
    renown: save.renown,
    commissions: { list: [...save.commissions.list].sort(byId) },
    dock: { ...save.dock, boats: [...save.dock.boats].sort(byId) },
    nature: save.nature,
    threats: save.threats,
    watch: save.watch,
    raid: save.raid,
    trial: save.trial,
    guide: save.guide,
    seasons: save.seasons,
    carrier: save.carrier,
    seasonPlan: save.seasonPlan,
    demand: save.demand,
    places: [...save.places].sort(byPlaceId),
    gaps: { ...save.gaps, open: [...save.gaps.open].sort(byId) },
    streets: [...save.streets].sort(byId),
    evenings: save.evenings,
    supplies: save.supplies,
    masters: save.masters,
    townBook: save.townBook,
    threads: save.threads,
    ...(save.calling !== undefined && { calling: save.calling }),
  };
}

/** Little-endian bytes of a Uint16 layer (saves read the same on any machine). */
function u16ToBytes(layer: Uint16Array): Uint8Array {
  const out = new Uint8Array(layer.length * 2);
  for (let i = 0; i < layer.length; i++) {
    const v = layer[i]!;
    out[i * 2] = v & 0xff;
    out[i * 2 + 1] = v >>> 8;
  }
  return out;
}

function bytesToU16(bytes: Uint8Array, into: Uint16Array): void {
  for (let i = 0; i < into.length; i++) into[i] = bytes[i * 2]! | (bytes[i * 2 + 1]! << 8);
}
