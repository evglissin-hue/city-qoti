// Wildlife and the Field Guide (C5C; docs/spec/12-hearth.md, Nature and the Field Guide). Hourly,
// for each species in its seasons and hours: the watched chunks (where folk walk: a path or lane, or
// a resident outdoors) whose habitat scores meet all its needs are suitable; fish are watched only by
// a fisher at work on open water, honeybees only near an apiary. With n suitable chunks the chance of
// a sighting is rarity x min(n, 3) permille (at most 900), rolled on the 'nature' stream. The first
// sighting writes a Field Guide page for both seats, credited to the seats whose pieces made the
// habitat there, and a Chronicle line with a snapshot. Later sightings only count.
import { content, type WildlifeDef } from '@qoti/content';
import { CHUNK_SIZE, CHUNKS_PER_SIDE, MAP_SIZE } from '../../constants';
import type { FieldGuideEntry, SeatId, TickCtx, WorldState } from '../../contracts';
import { seasonAt } from '../../state/seasons';
import { fieldGuideEntryView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { creditText, placeName } from '../chronicle/text';
import { hourOf } from '../economy/time';
import { isFrozen } from '../seasons/api';
import { habitatMet, isHive } from './effects';
import { buildingChunk, buildingHabitats, CHUNKS, chunkOfFp, chunkOfTile, decorHabitats } from './habitats';

const S = MAP_SIZE;
/** Most suitable chunks that raise the odds. */
export const SIGHTING_CHUNKS = 3;
/** Highest chance of a sighting in an hour, permille. */
export const SIGHTING_CAP = 900;
/** Field Guide hints shown at a time. */
export const HINTS = 3;

/** The hour (0 to 23) falls in [from, to), wrapping past midnight. */
export function inHours(def: WildlifeDef, hour: number): boolean {
  const [from, to] = def.hours;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export function inSeason(def: WildlifeDef, season: number): boolean {
  return def.seasons.includes(season);
}

/** Chunks with a road in them. */
function roadChunks(state: WorldState): Uint8Array {
  const out = new Uint8Array(CHUNKS);
  const road = state.map.road;
  for (let i = 0; i < S * S; i++) {
    if (road[i]) {
      const x = i % S;
      out[chunkOfTile(x, (i - x) / S)] = 1;
    }
  }
  return out;
}

/** Chunks someone is watching: a path or lane, or a resident outdoors. */
export function watchedChunks(state: WorldState): Uint8Array {
  const out = roadChunks(state);
  for (const r of state.residents) {
    if (r.inside) continue;
    const x = r.tile % S;
    out[chunkOfTile(x, (r.tile - x) / S)] = 1;
  }
  return out;
}

/** Chunks with a fisher at work (open water) or an apiary standing. */
function specialChunks(state: WorldState, needs: string): Uint8Array {
  const out = new Uint8Array(CHUNKS);
  if (needs === 'fisher' && isFrozen(state)) return out;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    const def = content.buildingById.get(b.def);
    if (needs === 'hive' ? isHive(def) : needs === 'fisher' && isFisher(def, b.rt.present)) {
      out[buildingChunk(b)] = 1;
    }
  }
  return out;
}

function isFisher(def: ReturnType<typeof content.buildingById.get>, present: number): boolean {
  return (
    present > 0 && !!def?.methods?.some((m) => m.kind === 'gather' && m.outputs.some(([g]) => g === 'fish'))
  );
}

/** Chunks where this species could be seen right now (habitat, watchers, needs), ascending. */
export function suitableChunks(state: WorldState, def: WildlifeDef, watched: Uint8Array): number[] {
  const where = def.needs ? specialChunks(state, def.needs) : watched;
  const out: number[] = [];
  for (let c = 0; c < CHUNKS; c++) if (where[c] && habitatMet(state, def, c)) out.push(c);
  return out;
}

/** Chance of a sighting this hour with n suitable chunks, permille. */
export function sightingChance(def: WildlifeDef, n: number): number {
  return n <= 0 ? 0 : Math.min(SIGHTING_CAP, def.rarity * Math.min(n, SIGHTING_CHUNKS));
}

/** The hourly pass. */
export function rollSightings(state: WorldState, ctx: TickCtx): void {
  const season = seasonAt(state.tick).season;
  const hour = hourOf(state.tick);
  let watched: Uint8Array | null = null;
  for (const def of content.wildlife) {
    if (!inSeason(def, season) || !inHours(def, hour)) continue;
    watched ??= watchedChunks(state);
    const chunks = suitableChunks(state, def, watched);
    if (chunks.length === 0) continue;
    const rng = ctx.rng('nature');
    if (rng.int(1000) >= sightingChance(def, chunks.length)) continue;
    sight(state, ctx, def, chunks[rng.int(chunks.length)]!);
  }
}

/** Seats whose pieces make the habitats this species needs in chunk c, sorted. */
export function creditFor(state: WorldState, def: WildlifeDef, c: number): SeatId[] {
  const wanted = new Set<string>(def.habitats.map(([h]) => h));
  const counts = [0, 0, 0, 0];
  const helps = (pts: [number, number][] | undefined) => !!pts?.some(([h]) => wanted.has(HABITAT_NAMES[h]!));
  for (const d of state.decor) {
    if (chunkOfFp(d.fx, d.fz) === c && helps(decorHabitats(d.def))) counts[d.builtBy]!++;
  }
  for (const b of state.buildings) {
    if (b.stage !== 'built' || buildingChunk(b) !== c) continue;
    const pts = buildingHabitats(b.def);
    if (helps(pts) || (b.handmade && (b.rt?.modules?.length ?? 0) > 0)) counts[b.builtBy]!++;
  }
  const seats: SeatId[] = [];
  for (let s = 0; s < counts.length; s++) if (counts[s]! > 0) seats.push(s as SeatId);
  return seats.length > 0 ? seats : [...state.time.connected];
}

const HABITAT_NAMES = content.habitats.map((h) => h.id as string);

function chunkCenter(c: number): number {
  const x = (c % CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
  const z = Math.floor(c / CHUNKS_PER_SIDE) * CHUNK_SIZE + CHUNK_SIZE / 2;
  return z * S + x;
}

/** Records a sighting in chunk c: a new page the first time, a count after. */
export function sight(state: WorldState, ctx: TickCtx, def: WildlifeDef, c: number): FieldGuideEntry {
  const guide = state.nature.guide;
  const known = guide.find((e) => e.species === def.id);
  if (known) {
    known.count++;
    return known;
  }
  const entry: FieldGuideEntry = {
    species: def.id,
    firstTick: state.tick,
    seats: creditFor(state, def, c),
    count: 1,
  };
  let at = 0;
  while (at < guide.length && guide[at]!.species < def.id) at++;
  guide.splice(at, 0, entry);
  refreshHints(state);
  ctx.events.push({ e: 'species.sighted', s: fieldGuideEntryView(entry) });
  const tile = chunkCenter(c);
  chronicle(state, ctx, 'first-sighting', {
    text: [
      ['species', def.name.charAt(0).toLowerCase() + def.name.slice(1)],
      ['place', placeName(state, ctx, tile)],
      ['credit', creditText(state, ctx, entry.seats)],
    ],
    seats: entry.seats,
    snapshot: { focus: [tile % S, Math.floor(tile / S)], radius: CHUNK_SIZE / 2 },
  });
  return entry;
}

/** The three hints: the commonest species not yet found (rarity, then id). */
export function refreshHints(state: WorldState): void {
  const found = new Set(state.nature.guide.map((e) => e.species));
  const open = content.wildlife
    .filter((w) => !found.has(w.id))
    .sort((a, b) => b.rarity - a.rarity || (a.id < b.id ? -1 : 1));
  const hints = open.slice(0, HINTS).map((w) => w.id);
  hints.sort();
  state.nature.hints = hints;
}

/** Hours of the day a species is about (for hints and tests): the list of hours. */
export function hoursOf(def: WildlifeDef): number[] {
  const out: number[] = [];
  for (let h = 0; h < 24; h++) if (inHours(def, h)) out.push(h);
  return out;
}
