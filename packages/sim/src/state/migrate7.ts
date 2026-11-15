// Save version 6 to 7 (R2.0, the evening round; docs/spec/21-networking-and-saves.md, Version
// changes). Frozen: it must turn a version 6 save into exactly what R2.0's version 7 holds, whatever
// later cycles change in the systems, so it reads no system code and keeps its own small tables.
import { MAP_SIZE } from '../constants';
import { seedStream } from '../rng/streams';
import { base64ToBytes, bytesToBase64 } from './base64';
import type { SaveObject } from './version';

/** The evenings need a resident from before R2 starts with (19-evenings.md: 50 for a newcomer). */
const EVENINGS_START = 50;
/** Version 6's need count (NEED_IDS before `evenings`). */
const V6_NEEDS = 9;
/** Version 6's RNG streams (before `round`). */
const V6_STREAMS = 8;
/** R2.0's stand-in storeys: a home by the tier it houses, a business by its level. */
const HOME_STOREYS: Record<string, number> = { cottage: 1.5, townhouse: 2 };
const BUSINESS_STOREYS = [1, 1.5, 2];
/** Ranks at or above the Village (whose Charter unlocks the brazier from R2.0). */
const VILLAGE_OR_MORE = ['village', 'town', 'marketTown', 'city'];

interface V6Building {
  def: string;
  lot?: number;
  trade?: string;
  level?: number;
  storeys?: number;
}

export function migrate6to7(save: SaveObject): SaveObject {
  const n = MAP_SIZE * MAP_SIZE;
  const map = { ...(save.map as Record<string, string>) };
  // The footfall layers, zeroed (16 bits a tile).
  const zeros = bytesToBase64(new Uint8Array(n * 2));
  map.footfallDay = zeros;
  map.footfallEve = zeros;
  // The `round` stream, seeded as a fresh valley seeds it, after the eight streams before it.
  const old = base64ToBytes(save.rng as string);
  const rng = new Uint8Array(old.length + 16);
  rng.set(old);
  const words = new Uint32Array(4);
  seedStream(words, 0, save.seed as string, 'round');
  for (let w = 0; w < 4; w++) {
    const v = words[w]!;
    const o = V6_STREAMS * 16 + w * 4;
    rng[o] = v & 0xff;
    rng[o + 1] = (v >>> 8) & 0xff;
    rng[o + 2] = (v >>> 16) & 0xff;
    rng[o + 3] = v >>> 24;
  }
  // Every resident gains the evenings need at the start value.
  const residents = (save.residents as { needs: number[] }[]).map((r) =>
    r.needs.length === V6_NEEDS ? { ...r, needs: [...r.needs, EVENINGS_START] } : r,
  );
  // Every lot is a plot in no row; grown buildings take their stand-in storeys.
  const lots = (save.lots as object[]).map((l) => ({ ...l, row: 0, kind: 'plot' }));
  const buildings = (save.buildings as V6Building[]).map((b) => {
    if (!b.lot || b.storeys !== undefined) return b;
    const storeys = b.trade
      ? BUSINESS_STOREYS[Math.max(0, Math.min(2, (b.level ?? 1) - 1))]!
      : (HOME_STOREYS[b.def] ?? 1);
    return { ...b, storeys };
  });
  // A town past its Village Charter claimed it before the brazier existed: unlock it as the claim
  // would have (the Charter's unlocks go into hearth.unlocked).
  const hearth = save.hearth as { unlocked: string[] };
  const rank = (save.charter as { rank: string }).rank;
  const unlocked =
    VILLAGE_OR_MORE.includes(rank) && !hearth.unlocked.includes('brazier')
      ? [...hearth.unlocked, 'brazier']
      : hearth.unlocked;
  return {
    ...save,
    saveVersion: 7,
    hearth: { ...hearth, unlocked },
    map,
    rng: bytesToBase64(rng),
    residents,
    lots,
    buildings,
    // No places, gaps or street names yet; an empty evening.
    places: [],
    gaps: { open: [], closed: [], streaks: [], closedCount: 0, closedBySeat: [0, 0, 0, 0], credited: [] },
    streets: [],
    evenings: {
      tonight: {
        day: -1,
        weather: 'fair',
        grownups: 0,
        out: 0,
        nowhere: 0,
        stood: 0,
        scoreSum: 0,
        friendships: 0,
        treatsAtStops: 0,
        treatsPassing: 0,
        treatsDoorstep: 0,
        takings: 0,
      },
      history: [],
      outRun: 0,
      allOut: 0,
      stoodThisSeason: 0,
      seatedSeasons: 0,
    },
  };
}
