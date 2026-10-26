import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { MAP_SIZE } from '../constants';
import type { LayerName, MapLayers, WorldState } from '../contracts';
import { createLayers, INT32_LAYERS, LAYER_NAMES } from '../map/layers';
import { RNG_STREAMS } from '../rng/streams';
import { base64ToBytes, bytesToBase64, bytesToWords, wordsToBytes } from './base64';
import { migrateSave, type SaveObject } from './version';

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
  map: Record<LayerName, string>;
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
}

export function serialize(state: WorldState): Uint8Array {
  const map = {} as Record<LayerName, string>;
  for (const name of LAYER_NAMES) {
    const layer = state.map[name];
    map[name] = bytesToBase64(layer instanceof Int32Array ? wordsToBytes(layer) : layer);
  }
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
  };
  // mtime 0 keeps the bytes a pure function of the state.
  return gzipSync(strToU8(JSON.stringify(save)), { level: 6, mtime: 0 });
}

export function deserialize(data: Uint8Array): WorldState {
  const parsed = JSON.parse(strFromU8(gunzipSync(data))) as SaveObject;
  const save = migrateSave(parsed) as unknown as SaveFile;
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
  };
}
