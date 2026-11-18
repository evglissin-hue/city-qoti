// V4: tea-break mode (docs/spec/17-presentation.md, Visual direction, 6; docs/build/v4-wave-notes.md).
// After TEA_BREAK_AFTER_MS without input (a setting, on by default; never while a tool is in hand
// or a card is open) the camera follows a resident on their evening round or circles the day's
// busiest place, and any input puts the view back exactly where it was (`CameraController`'s
// `saveView` and `restoreView`). Each seat's tea break is its own: camera state is never shared.
//
// V4.0 fixed the contract (the idle timer with its guards, the plan's shape); V4C built the choice
// and `app/teaBreakHost.ts`, which runs it.
import { content } from '@qoti/content';
import { AGENT_STRIDE, AgentAnim, AgentField, AgentFlags, footprintSize, MAP_SIZE } from '@qoti/sim';
import type { Mirror } from '../state/mirror';

/** How long without input before a tea break starts. */
export const TEA_BREAK_AFTER_MS = 90_000;

/** What keeps a tea break from starting. Each is read when the timer is asked, never cached. */
export interface TeaBreakGuards {
  /** The setting (`UiSettings.teaBreak`, on by default). */
  enabled(): boolean;
  /** A tool other than inspect is in hand (`ToolManager.active`). */
  toolInHand(): boolean;
  /**
   * A card, book, letter or dialog is open: the inspector's selection, a book panel, the season
   * card, a raid or festival card, the evening edition, a letter, the settings (UiState's signals).
   */
  cardOpen(): boolean;
  /** Anything else that owns the camera: photo mode, Measure this laptop, following a resident by hand. */
  busy(): boolean;
}

/** What a tea break watches, from shared state only. */
export type TeaBreakPlan =
  /** Follow a resident on their evening round (the existing follow camera, gliding slowly). */
  | { kind: 'follow'; residentId: number }
  /** Circle the day's busiest place, `distance` tiles out. */
  | { kind: 'orbit'; x: number; z: number; distance: number };

/** Counts the time since the last input. Pure: the caller passes the clock and the guards. */
export class IdleTimer {
  private last: number;

  constructor(
    now = 0,
    readonly after = TEA_BREAK_AFTER_MS,
  ) {
    this.last = now;
  }

  /** Any input at `now` (ms): a key, a click, a drag, the wheel, a touch. */
  poke(now: number): void {
    this.last = now;
  }

  /** How long there has been no input, in ms. */
  idleFor(now: number): number {
    return Math.max(0, now - this.last);
  }

  /** Whether a tea break may start now: idle long enough, and no guard in the way. */
  due(now: number, guards: TeaBreakGuards): boolean {
    return (
      this.idleFor(now) >= this.after &&
      guards.enabled() &&
      !guards.toolInHand() &&
      !guards.cardOpen() &&
      !guards.busy()
    );
  }
}

/** A tea break's follow camera: this far out, a little lower than the play camera's 45 degrees. */
export const FOLLOW_DISTANCE = 26;
/** A tea break's circle: this far out from the busiest place, at the play camera's pitch. */
export const ORBIT_DISTANCE = 34;
/** A full turn about the busiest place takes about two minutes. */
export const ORBIT_SPEED = (2 * Math.PI) / 120;
/** The evening round, as the tea break reads it: from when folk have set off to bedtime (19-evenings.md). */
export const ROUND_FROM_HOUR = 17.5;
export const ROUND_TO_HOUR = 21;
/** Footfall is summed over a square this many tiles out from each candidate's middle. */
const BUSY_REACH = 4;
/** A place with folk there right now counts this much footfall for each of them. */
const PRESENT_WEIGHT = 24;
/** A second circle goes somewhere at least this far from the first. */
const ELSEWHERE = 16;

/** What `chooseTeaBreak` reads: the Mirror, or any object with these parts of it (tests). */
export type TeaBreakMirror = Pick<
  Mirror,
  'clock' | 'agents' | 'residents' | 'places' | 'buildings' | 'footfall'
>;

/** Optional hints for `chooseTeaBreak`. */
export interface TeaBreakChoice {
  /** Where the camera looks now: of residents equally worth following, the nearest wins. */
  near?: { x: number; z: number };
  /** The plan just watched, to pick something else (a different resident, a place elsewhere). */
  previous?: TeaBreakPlan | null;
  /** Skip the evening round and go straight to the busiest place (a follow that went indoors). */
  noFollow?: boolean;
}

const NOT_ON_ROUND =
  AgentFlags.child | AgentFlags.raider | AgentFlags.wolf | AgentFlags.visitor | AgentFlags.watch;

/** Whether the clock is inside the evening round. */
export function onRoundHour(clock: { hour: number; minute: number }): boolean {
  const h = clock.hour + clock.minute / 60;
  return h >= ROUND_FROM_HOUR && h < ROUND_TO_HOUR;
}

/**
 * A resident out on their evening round, from the latest agent frame: a grown-up resident walking,
 * seated at a place or dancing (not a child, a raider, a wolf, a visitor or the Watch, and not at
 * work or carrying). Walkers first, since a walk is better to watch than a seat; then the nearest
 * to `near`; then the lowest id, so the pick is the same every time.
 */
function roundWalker(m: TeaBreakMirror, opts: TeaBreakChoice): number | null {
  const L = m.agents.latest;
  const avoid = opts.previous?.kind === 'follow' ? opts.previous.residentId : -1;
  let best = -1;
  let bestRank = -1;
  let bestDist = Infinity;
  for (let o = 0; o + AGENT_STRIDE <= L.length; o += AGENT_STRIDE) {
    const id = L[o + AgentField.id]!;
    const flags = L[o + AgentField.flags]!;
    const anim = L[o + AgentField.anim]!;
    if (id === avoid || flags & NOT_ON_ROUND || !m.residents.has(id)) continue;
    const rank = anim === AgentAnim.walk ? 2 : anim === AgentAnim.sit || anim === AgentAnim.dance ? 1 : 0;
    if (rank === 0) continue;
    const near = opts.near;
    const dist = near ? Math.abs(L[o + AgentField.x]! - near.x) + Math.abs(L[o + AgentField.z]! - near.z) : 0;
    if (rank > bestRank || (rank === bestRank && (dist < bestDist || (dist === bestDist && id < best)))) {
      best = id;
      bestRank = rank;
      bestDist = dist;
    }
  }
  return best >= 0 ? best : null;
}

/** Footfall (the day's and the evening's) in the square `BUSY_REACH` out from a tile. */
function footfallNear(day: Uint16Array, eve: Uint16Array, x: number, z: number): number {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let sum = 0;
  for (let tz = Math.max(0, cz - BUSY_REACH); tz <= Math.min(MAP_SIZE - 1, cz + BUSY_REACH); tz++) {
    for (let tx = Math.max(0, cx - BUSY_REACH); tx <= Math.min(MAP_SIZE - 1, cx + BUSY_REACH); tx++) {
      const i = tz * MAP_SIZE + tx;
      sum += (day[i] ?? 0) + (eve[i] ?? 0);
    }
  }
  return sum;
}

/**
 * The day's busiest place: of every place (its tiles' middle) and every standing building (its
 * footprint's middle), the one with the most footfall around it, a place's folk there now counting
 * extra. With `previous` an orbit, somewhere at least `ELSEWHERE` tiles from it if anywhere else is
 * busy at all. Null when nothing is busy.
 */
function busiestPlace(m: TeaBreakMirror, opts: TeaBreakChoice): { x: number; z: number } | null {
  const foot = m.footfall.value;
  const day = foot?.day ?? new Uint16Array(0);
  const eve = foot?.eve ?? new Uint16Array(0);
  const prev = opts.previous?.kind === 'orbit' ? opts.previous : null;
  let best: { x: number; z: number; score: number } | null = null;
  let bestElsewhere: { x: number; z: number; score: number } | null = null;
  const consider = (x: number, z: number, score: number) => {
    if (score <= 0) return;
    if (!best || score > best.score) best = { x, z, score };
    const away = !prev || Math.abs(x - prev.x) + Math.abs(z - prev.z) >= ELSEWHERE;
    if (away && (!bestElsewhere || score > bestElsewhere.score)) bestElsewhere = { x, z, score };
  };
  for (const p of m.places.values()) {
    const tiles = p.tiles.length > 0 ? p.tiles : [p.tile];
    let sx = 0;
    let sz = 0;
    for (const t of tiles) {
      sx += (t % MAP_SIZE) + 0.5;
      sz += Math.floor(t / MAP_SIZE) + 0.5;
    }
    const x = sx / tiles.length;
    const z = sz / tiles.length;
    consider(x, z, footfallNear(day, eve, x, z) + p.present * PRESENT_WEIGHT);
  }
  for (const b of m.buildings.values()) {
    if (b.stage !== 'built') continue;
    const def = content.buildingById.get(b.def);
    const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
    const x = b.x + w / 2;
    const z = b.z + d / 2;
    consider(x, z, footfallNear(day, eve, x, z));
  }
  const pick = (bestElsewhere ?? best) as { x: number; z: number } | null;
  return pick ? { x: pick.x, z: pick.z } : null;
}

/**
 * Picks what a tea break watches: a resident on their evening round in the evening (from 17:30,
 * when folk have set off, to 21:00, when they go home), else the day's busiest place (the place or
 * building with the most footfall about it, folk there now counting extra), from shared state only
 * (the Mirror), so the pick never needs the network. Null when nobody is out and nothing is busy:
 * no tea break then.
 */
export function chooseTeaBreak(mirror: TeaBreakMirror, opts: TeaBreakChoice = {}): TeaBreakPlan | null {
  if (!opts.noFollow && onRoundHour(mirror.clock.value)) {
    const residentId = roundWalker(mirror, opts);
    if (residentId !== null) return { kind: 'follow', residentId };
  }
  const place = busiestPlace(mirror, opts);
  return place ? { kind: 'orbit', x: place.x, z: place.z, distance: ORBIT_DISTANCE } : null;
}
