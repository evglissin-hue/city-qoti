// Threat pressure, the raid schedule, telegraphing and the wolves' nights (C5D).
// docs/spec/14-challenge.md, Threat pressure and Telegraphing (As built has the numbers).
import { content } from '@qoti/content';
import { DAYS_PER_SEASON, MAP_SIZE, TICKS_PER_DAY } from '../../constants';
import type { RaidBand, RaidSide, ScheduledRaid, TickCtx, WorldState } from '../../contracts';
import { Terrain } from '../../map/layers';
import type { Rng } from '../../contracts';
import { rankAtLeast } from '../../state/village';
import { threatView } from '../../view/seasons';
import { seasonNow, weatherToday } from '../seasons/api';
import { dayIndex } from '../economy/time';
import { DETER_CAP, deterrenceParts, raidStartTick, towers, wealth } from './api';

const S = MAP_SIZE;

/** Pressure in permille of the threshold; a raid is due at 1000 (600 on Fierce). */
export const THRESHOLD = 1000;
export const FIERCE_THRESHOLD = 600;
/** Pressure never climbs past this (a raid's size stops growing). */
export const PRESSURE_MAX = 3000;
/** k(rank): pennies of wealth per permille of pressure a day (a Village worth 1,500 coins gains 100). */
export const PRESSURE_K: readonly [rank: string, k: number][] = [
  ['village', 1500],
  ['town', 3000],
  ['city', 6000],
];
/** Raiders: 2 plus 4 per threshold of pressure, 3 to 12 (x1.5 on Fierce). */
export const RAIDERS_MIN = 3;
export const RAIDERS_MAX = 12;
/** Warning: two days before dusk on the raid day, a third with a watchtower, one fewer in fog. */
export const WARNING_DAYS = 2;
/** Wolves' nights each winter (the evening's day index). */
export const WOLF_NIGHTS = 2;

/** The k for the town's rank (the highest it has reached). */
export function pressureK(state: WorldState): number {
  let k = PRESSURE_K[0]![1];
  for (const [rank, v] of PRESSURE_K) if (rankAtLeast(state, rank as 'village')) k = v;
  return k;
}

export function thresholdFor(state: WorldState): number {
  return state.settings.threat === 'fierce' ? FIERCE_THRESHOLD : THRESHOLD;
}

/** True when raids can come at all: a standard valley at Village rank, and not on Peaceful. */
export function raidsPossible(state: WorldState): boolean {
  return state.settings.threat !== 'peaceful' && rankAtLeast(state, 'village');
}

/** A day's pressure gain: W / k, less deterrence (at most DETER_CAP of it). */
export function dailyGain(state: WorldState, deterrence: number): number {
  const gain = Math.floor(wealth(state) / pressureK(state));
  return Math.floor((gain * (1000 - Math.min(DETER_CAP, deterrence))) / 1000);
}

/** Raiders for a pressure (on the town's dial). */
export function raidersFor(state: WorldState, pressure: number): number {
  let n = 2 + Math.floor((pressure * 4) / THRESHOLD);
  if (state.settings.threat === 'fierce') n = Math.floor((n * 3) / 2);
  return Math.max(RAIDERS_MIN, Math.min(RAIDERS_MAX, n));
}

export function bandFor(raiders: number): RaidBand {
  return raiders <= 4 ? 'small' : raiders <= 8 ? 'medium' : 'large';
}

/** Forest tiles in the strip along each edge (n, e, s, w), plus one so every edge can be picked. */
function edgeForest(state: WorldState): [RaidSide, number][] {
  const t = state.map.terrain;
  const strip = 8;
  const count = (fn: (a: number, b: number) => number) => {
    let n = 1;
    for (let a = 0; a < S; a++) for (let b = 0; b < strip; b++) if (t[fn(a, b)] === Terrain.forestFloor) n++;
    return n;
  };
  return [
    ['n', count((a, b) => b * S + a)],
    ['e', count((a, b) => a * S + (S - 1 - b))],
    ['s', count((a, b) => (S - 1 - b) * S + a)],
    ['w', count((a, b) => a * S + b)],
  ];
}

/** Picks the approach side, weighted by forest along each edge (bandits come from the woods). */
export function pickSide(state: WorldState, rng: Rng): RaidSide {
  const sides = edgeForest(state);
  let total = 0;
  for (const [, w] of sides) total += w;
  let roll = rng.int(total);
  for (const [side, w] of sides) {
    if (roll < w) return side;
    roll -= w;
  }
  return 'n';
}

/** The signs a raid shows, in the order they appear: tracks only in winter's snow. */
export function signsFor(season: number): string[] {
  return season === 3 ? ['tracks', 'crows', 'letter'] : ['crows', 'letter'];
}

/** Days of warning today: two, a third with a built watchtower. */
export function warningDays(state: WorldState): number {
  let n = WARNING_DAYS;
  for (const b of towers(state))
    n = Math.max(n, WARNING_DAYS + (content.buildingById.get(b.def)?.defense?.warningDays ?? 0));
  return n;
}

/** The latest a raid's signs may appear: the evening before (P36, never a surprise). */
export function latestTelegraph(r: ScheduledRaid): number {
  return raidStartTick(r) - TICKS_PER_DAY;
}

/** The daily threat pass at 00:40 (systems/threats). */
export function threatDay(state: WorldState, ctx: TickCtx): void {
  const t = state.threats;
  const { season, year, day } = seasonNow(state);
  const today = dayIndex(state.tick);
  let changed = false;

  // Deterrence and pressure (Village rank on; Peaceful never builds any).
  const parts = deterrenceParts(state);
  if (
    parts.walls !== t.deterrence.walls ||
    parts.towers !== t.deterrence.towers ||
    parts.lanterns !== t.deterrence.lanterns ||
    parts.watch !== t.deterrence.watch
  ) {
    t.deterrence = parts;
    changed = true;
  }
  if (raidsPossible(state) && !state.raid) {
    const d = parts.walls + parts.towers + parts.lanterns + parts.watch;
    const p = Math.min(PRESSURE_MAX, t.pressure + dailyGain(state, d));
    if (p !== t.pressure) {
      t.pressure = p;
      changed = true;
    }
  } else if (state.settings.threat === 'peaceful' && t.pressure !== 0) {
    t.pressure = 0;
    changed = true;
  }

  // A scheduled raid from an earlier season that never came (a load mid-way): let it go.
  if (t.scheduled && raidStartTick(t.scheduled) + TICKS_PER_DAY < state.tick && !state.raid) {
    t.scheduled = null;
    changed = true;
  }

  // Day 1: schedule this season's raid when pressure is over the threshold.
  if (day === 1 && !t.scheduled && raidsPossible(state) && t.pressure >= thresholdFor(state)) {
    const rng = ctx.rng('threats');
    const raidOn = 3 + rng.int(3);
    const strength = raidersFor(state, t.pressure);
    const r: ScheduledRaid = {
      season: season as ScheduledRaid['season'],
      year,
      day: raidOn,
      side: pickSide(state, rng),
      band: bandFor(strength),
      strength,
      telegraphTick: 0,
      signs: [],
    };
    r.telegraphTick = Math.min(
      latestTelegraph(r),
      Math.max(state.tick, raidStartTick(r) - warningDays(state) * TICKS_PER_DAY),
    );
    t.scheduled = r;
    changed = true;
  }

  // Fog hides the signs for a day, never past the evening before.
  const r = t.scheduled;
  if (r && weatherToday(state) === 'fog' && r.signs.length === 0) {
    const dayEnd = (today + 1) * TICKS_PER_DAY;
    if (r.telegraphTick < dayEnd) {
      const later = Math.min(latestTelegraph(r), Math.max(r.telegraphTick, state.tick) + TICKS_PER_DAY);
      if (later !== r.telegraphTick) {
        r.telegraphTick = later;
        changed = true;
      }
    }
  }
  // Signs: the first when the raid is telegraphed (raids system, on the tick), one more each day.
  if (r && r.signs.length > 0 && state.tick >= r.telegraphTick) {
    const all = signsFor(r.season);
    if (r.signs.length < all.length) {
      r.signs.push(all[r.signs.length]!);
      changed = true;
    }
  }

  // Winter day 1: plan the wolves' nights (never the first night; the tutorial and Peaceful only howl).
  if (season === 3 && day === 1) {
    const rng = ctx.rng('threats');
    const nights: number[] = [];
    while (nights.length < WOLF_NIGHTS) {
      const n = today + 1 + rng.int(DAYS_PER_SEASON - 1);
      if (!nights.includes(n)) nights.push(n);
    }
    t.wolves = nights.sort((a, b) => a - b);
    changed = true;
  } else if (season !== 3 && t.wolves.length > 0) {
    t.wolves = [];
    changed = true;
  }

  if (changed) ctx.events.push({ e: 'threat.updated', t: threatView(state) });
}

/** Called every tick (raids system): shows the signs the moment the raid is telegraphed. */
export function telegraph(state: WorldState, ctx: TickCtx): void {
  const r = state.threats.scheduled;
  if (!r || r.signs.length > 0 || state.tick < r.telegraphTick) return;
  r.signs.push(signsFor(r.season)[0]!);
  ctx.events.push({ e: 'threat.updated', t: threatView(state) });
}
