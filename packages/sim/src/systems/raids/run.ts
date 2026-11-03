// Raid resolution (C5D): docs/spec/14-challenge.md, Raid resolution, the seven steps.
// 1. Raiders spawn at the telegraphed edge at dusk, morale 10, carrying up to 8 units each.
// 2. They path to the most valuable stores; walls and shut gates are broken by hit points over time
//    (systems/defenses), open gates are walked through.
// 3. Towers lower the morale of raiders in range (systems/defenses).
// 4. The Watch posts at its guard points (or the richest store) and intercepts raiders within 8
//    tiles; in contact each side loses morale by the other's strength. A raider at 0 flees, or is
//    captured with 2 or more Watch members beside them; a member at 0 is shaken, goes home and
//    rests a day. Nobody is hurt.
// 5. A raider at a store takes up to 8 of its most valuable goods, lowers its condition by 20%,
//    and runs for the edge; goods carried by a captured raider are recovered. A store with the
//    Watch at its door holds: the raider waits beside them, losing heart, until one side breaks.
// 6. The bell sends everyone indoors (systems/watch/overrides); folk caught outside near raiders
//    get a fright (-10 mood).
// 7. The raid ends when no raiders are left on the map, or at dawn.
// Morale moves in 1/1024 steps, so every sum is exact on every machine.
import { content } from '@qoti/content';
import {
  MAP_SIZE,
  RAID_HISTORY_MAX,
  RAIDER_CARRY,
  RAIDER_MORALE,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../../constants';
import type {
  Building,
  LiveRaid,
  RaidResultView,
  RaidSide,
  Raider,
  Resident,
  TickCtx,
  WatchInRaid,
  WorldState,
} from '../../contracts';
import { findById } from '../../state/entities';
import { buildingView } from '../../view';
import { raidView, threatView, watchView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { stowNearest } from '../logistics/stores';
import { findPath } from '../movement/astar';
import { walkPermille } from '../movement/factors';
import { moveResident } from '../movement/api';
import { advance, tileTicks } from '../movement';
import { addRenown } from '../renown/api';
import { addMoodModifier } from '../residents/api';
import { frontOf, heldValue, valuables } from '../threats/api';
import { raiderGrid, wallAt } from './grid';

const S = MAP_SIZE;

/** Morale units: 1024 to a point. */
export const UNIT = 1024;
/** Raider morale lost per tick per Watch member in contact, x training x Watch morale / 10000. */
export const CONTACT = 48;
/** Watch morale lost per tick per raider in contact (x1.5 on Fierce). */
export const RAIDER_HIT = 20;
/** Raiders frighten folk outdoors within this many tiles; the Watch intercepts within 8. */
export const FRIGHT_RANGE = 5;
export const INTERCEPT_RANGE = 8;
export const FRIGHT_MOOD = -10;
/** The share of a store's condition a raider's visit takes, percent. */
export const LOOT_CONDITION = 20;
/** Renown for a raid repelled, and one held with nothing stolen. */
export const RENOWN_REPELLED = 2;
export const RENOWN_HELD = 3;
/** Watch morale after a raid: up for a win, down for a loss. */
export const MORALE_SWING = 5;
/** Raiders come out of the strip this deep along their side. */
export const SPAWN_DEPTH = 8;
/** Raiders run: percent of a walker's ticks per tile. */
export const RAIDER_PACE = 60;
/** A raid lasts until dawn: twelve hours from dusk. */
export const RAID_TICKS = 12 * TICKS_PER_HOUR;

/** Condition points lost this raid, for the result card (view only: never saved or hashed). */
const damage = new WeakMap<LiveRaid, number>();

export function drain(r: { morale: number }, units: number): void {
  if (units <= 0) return;
  r.morale = Math.max(0, r.morale - units / UNIT);
}

const SIDE_NAMES: [RaidSide, string][] = [
  ['n', 'north'],
  ['e', 'east'],
  ['s', 'south'],
  ['w', 'west'],
];

export function sideName(side: RaidSide): string {
  return SIDE_NAMES.find(([s]) => s === side)![1];
}

/** True when a tile lies in the strip along a side that raiders come from and run back to. */
export function onSide(side: RaidSide, tile: number): boolean {
  const x = tile % S;
  const z = Math.floor(tile / S);
  switch (side) {
    case 'n':
      return z < SPAWN_DEPTH;
    case 's':
      return z >= S - SPAWN_DEPTH;
    case 'w':
      return x < SPAWN_DEPTH;
    default:
      return x >= S - SPAWN_DEPTH;
  }
}

/** The tile on a raid's side a raider at `from` can reach in the fewest steps, or -1. */
export function exitFor(state: WorldState, side: RaidSide, from: number): number {
  const steps = stepsTo(state, from);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < S * S; i++) {
    const d = steps[i]!;
    if (d < 0 || d >= bestD || !onSide(side, i)) continue;
    best = i;
    bestD = d;
  }
  return best;
}

/** Steps from `from` to every tile a raider could walk it from (-1 where it cannot): raiders' grid, cliffs block. */
function stepsTo(state: WorldState, from: number): Int32Array {
  const grid = raiderGrid(state);
  const h = state.map.height;
  const out = new Int32Array(S * S).fill(-1);
  out[from] = 0;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const t = queue[q]!;
    const x = t % S;
    const z = (t - x) / S;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
      const nz = d === 2 ? z + 1 : d === 3 ? z - 1 : z;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const n = nz * S + nx;
      if (out[n]! >= 0 || grid.cost[n] === 0) continue;
      const dh = h[n]! - h[t]!;
      if (dh >= 2 || dh <= -2) continue;
      out[n] = out[t]! + 1;
      queue.push(n);
    }
  }
  return out;
}

/**
 * Spawn tiles in the strip along a side (up to SPAWN_DEPTH in from the edge): the ones nearest the
 * first store by walking, two apart, so a raid comes out of the telegraphed woods and reaches the
 * town before dawn.
 */
function spawnTiles(state: WorldState, side: RaidSide, n: number, goal: number): number[] {
  const grid = raiderGrid(state);
  const steps = goal >= 0 ? stepsTo(state, goal) : null;
  const cand: [tile: number, d: number][] = [];
  for (let a = 0; a < S; a++) {
    for (let depth = 0; depth < SPAWN_DEPTH; depth++) {
      const i =
        side === 'n'
          ? depth * S + a
          : side === 's'
            ? (S - 1 - depth) * S + a
            : side === 'w'
              ? a * S + depth
              : a * S + (S - 1 - depth);
      if (grid.cost[i] === 0) continue;
      const d = steps ? steps[i]! : Math.abs(a - (S >> 1));
      if (d < 0) continue;
      cand.push([i, d]);
    }
  }
  cand.sort((x, y) => x[1] - y[1] || x[0] - y[0]);
  const out: number[] = [];
  for (const [i] of cand) {
    if (out.length >= n) break;
    if (out.some((o) => dist(o, i) < 2)) continue;
    out.push(i);
  }
  return out;
}

/** Stores raiders head for: the richest three with anything in them (most valuable first). */
export function raidTargets(state: WorldState): Building[] {
  return valuables(state)
    .map((b) => ({ b, v: heldValue(b) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.b.id - b.b.id)
    .slice(0, 3)
    .map((x) => x.b);
}

function plan(state: WorldState, r: Raider, to: number): void {
  if (r.tile === to) {
    r.move = null;
    return;
  }
  const path = findPath(raiderGrid(state), state.map.height, r.tile, to);
  r.move =
    path && path.length > 0
      ? { path, step: 0, progress: 0, target: to, reason: 'task', version: state.networkVersion }
      : null;
}

/** Step 1: the raid comes at dusk. */
export function startRaid(state: WorldState, ctx: TickCtx): void {
  const s = state.threats.scheduled!;
  const targets = raidTargets(state);
  const tiles = spawnTiles(state, s.side, s.strength, targets[0] ? frontOf(targets[0]) : -1);
  const raiders: Raider[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const r: Raider = {
      id: state.nextId++,
      tile: tiles[i]!,
      move: null,
      morale: RAIDER_MORALE,
      load: [],
      state: 'approach',
      target: targets.length > 0 ? targets[i % targets.length]!.id : 0,
    };
    if (r.target) plan(state, r, frontOf(findById(state.buildings, r.target)!));
    else {
      r.state = 'flee';
      plan(state, r, r.tile);
    }
    raiders.push(r);
  }
  const watch: WatchInRaid[] = state.watch.members
    .map((id) => findById(state.residents, id))
    .filter((r): r is Resident => !!r)
    .map((r) => ({
      resident: r.id,
      state: (r.watch?.shakenUntil ?? 0) > state.tick ? ('home' as const) : ('guard' as const),
      morale: RAIDER_MORALE,
    }));
  // A bell tower rings itself; without one, a seat rings the bell.
  const bellTower = state.buildings.some((b) => b.stage === 'built' && b.def === 'bell-tower');
  state.raid = {
    id: state.nextId++,
    startTick: state.tick,
    side: s.side,
    band: s.band,
    raiders,
    watch,
    bell: bellTower,
    lanterns: false,
  };
  state.threats.pressure = 0;
  damage.set(state.raid, 0);
  ctx.events.push({ e: 'raid.started', r: raidView(state)! });
}

function active(r: Raider): boolean {
  return r.state === 'approach' || r.state === 'loot' || r.state === 'flee';
}

function adjacent(a: number, b: number): boolean {
  const ax = a % S;
  const bx = b % S;
  return Math.abs(ax - bx) <= 1 && Math.abs((a - ax) / S - (b - bx) / S) <= 1;
}

function dist(a: number, b: number): number {
  const ax = a % S;
  const bx = b % S;
  return Math.max(Math.abs(ax - bx), Math.abs((a - ax) / S - (b - bx) / S));
}

/** Towers with crew this raid: [tower, crew] (one each while there are hands, two with plenty). */
export function towerCrews(state: WorldState): [tower: Building, crew: number[]][] {
  const raid = state.raid;
  if (!raid) return [];
  const hands = raid.watch
    .filter((w) => w.state === 'guard' || w.state === 'intercept')
    .map((w) => w.resident);
  const tw = state.buildings.filter(
    (b) => b.stage === 'built' && !!content.buildingById.get(b.def)?.defense?.towerRange,
  );
  const posts = Math.min(tw.length, Math.floor(hands.length / 2));
  const two = posts > 0 && hands.length >= posts * 2 + 4;
  const out: [Building, number[]][] = [];
  let k = 0;
  for (let i = 0; i < posts; i++) {
    const crew = [hands[k++]!];
    if (two) crew.push(hands[k++]!);
    out.push([tw[i]!, crew]);
  }
  return out;
}

/** Where a Watch member in the raid is headed: a tower, a raider to intercept, a guard point. */
export function watchGoal(state: WorldState, residentId: number): number | null {
  const raid = state.raid;
  if (!raid) return null;
  const w = raid.watch.find((x) => x.resident === residentId);
  if (!w || (w.state !== 'guard' && w.state !== 'intercept')) return null;
  const r = findById(state.residents, residentId);
  if (!r) return null;
  for (const [tower, crew] of towerCrews(state)) if (crew.includes(residentId)) return frontOf(tower);
  let best: Raider | null = null;
  let bestD = INTERCEPT_RANGE + 1;
  for (const x of raid.raiders) {
    if (!active(x)) continue;
    const d = dist(r.tile, x.tile);
    if (d < bestD) {
      best = x;
      bestD = d;
    }
  }
  if (best) return best.tile;
  return guardTile(state, raid.watch.indexOf(w));
}

/** The k-th member's guard point: the posture, else the richest store's door. */
export function guardTile(state: WorldState, k: number): number {
  const p = state.watch.posture;
  if (p.length > 0) return p[k % p.length]!;
  const t = raidTargets(state)[0] ?? valuables(state)[0];
  if (t) return frontOf(t);
  const hall = state.buildings.find((b) => b.def === 'town-hall');
  return hall ? frontOf(hall) : (S >> 1) * S + (S >> 1);
}

/** True when a raider stands where it was going (its store's door, or the edge when running). */
function atGoal(state: WorldState, r: Raider): boolean {
  if (r.state === 'flee') return onSide(state.raid!.side, r.tile);
  const b = findById(state.buildings, r.target);
  return !!b && r.tile === frontOf(b);
}

/** True when a Watch member on their feet stands on or beside a tile. */
function guarded(state: WorldState, tile: number): boolean {
  for (const w of state.raid!.watch) {
    if (w.state !== 'guard' && w.state !== 'intercept') continue;
    const res = findById(state.residents, w.resident);
    if (res && !res.inside && adjacent(res.tile, tile)) return true;
  }
  return false;
}

/** Moves a raider a tick along its path; a wall ahead stops it (systems/defenses breaks it). */
function stepRaider(state: WorldState, r: Raider): boolean {
  const m = r.move;
  if (!m || m.step >= m.path.length) {
    r.move = null;
    return true;
  }
  const next = m.path[m.step]!;
  if (wallAt(state, next)) return false;
  const grid = raiderGrid(state);
  if (grid.cost[next] === 0) {
    plan(state, r, m.target);
    return false;
  }
  const p = walkPermille(state, { kind: 'raider', id: r.id }, next);
  const T = tileTicks(grid.ticks[next]!, (RAIDER_PACE * p) / 1000);
  m.progress = advance(m.progress, T);
  if (m.progress < 256) return false;
  r.tile = next;
  m.step += 1;
  m.progress = 0;
  if (m.step >= m.path.length) {
    r.move = null;
    return true;
  }
  return false;
}

/** Step 5: takes up to RAIDER_CARRY of the store's most valuable goods and dents it. */
function loot(state: WorldState, r: Raider, b: Building): void {
  const rt = b.rt;
  if (!rt) return;
  const order = content.goods.map((g, i) => ({ i, p: g.basePrice })).sort((a, c) => c.p - a.p || a.i - c.i);
  let room = RAIDER_CARRY;
  for (const { i } of order) {
    if (room === 0) break;
    for (const pile of [rt.store, rt.output]) {
      const free = pile === rt.store ? pile[i]! - rt.reservedOut[i]! : pile[i]!;
      const n = Math.min(room, Math.max(0, free));
      if (n <= 0) continue;
      pile[i]! -= n;
      room -= n;
      const have = r.load.find((l) => l[0] === i);
      if (have) have[1] += n;
      else r.load.push([i, n]);
    }
  }
  const lost = Math.floor((rt.condition * LOOT_CONDITION) / 100);
  rt.condition -= lost;
  if (state.raid) damage.set(state.raid, (damage.get(state.raid) ?? 0) + lost);
}

/** Recovers a captured raider's load into the nearest storehouses. */
function recover(state: WorldState, r: Raider): void {
  for (const [g, n] of r.load) stowNearest(state, r.tile, g, n, 0);
  r.load = [];
}

export function capture(state: WorldState, ctx: TickCtx, r: Raider): void {
  r.state = 'captured';
  r.move = null;
  recover(state, r);
  if (!state.threats.captives.includes(r.id)) {
    state.threats.captives.push(r.id);
    state.threats.captives.sort((a, b) => a - b);
  }
  ctx.events.push({ e: 'bandit.captured', id: r.id, at: [r.tile % S, Math.floor(r.tile / S)] });
}

function flee(state: WorldState, r: Raider): void {
  r.state = 'flee';
  if (onSide(state.raid!.side, r.tile)) {
    r.move = null;
    return;
  }
  const exit = exitFor(state, state.raid!.side, r.tile);
  if (exit >= 0) plan(state, r, exit);
  else r.move = null;
}

/** One tick of the raid (systems/raids). Returns true when it ended. */
export function raidTick(state: WorldState, ctx: TickCtx): boolean {
  const raid = state.raid!;
  // Raiders walk, loot and run.
  for (const r of raid.raiders) {
    if (!active(r)) continue;
    if (!r.move && !atGoal(state, r) && r.state !== 'flee') {
      // Not yet on its way (a raider placed by hand, or after a store emptied): plan the walk.
      const b = findById(state.buildings, r.target);
      if (b) plan(state, r, frontOf(b));
    }
    if (!r.move && !atGoal(state, r)) {
      // No way there: an approach turns back, a runaway slips off the map where they stand.
      const running = r.state === 'flee';
      if (!running) flee(state, r);
      if (running || !r.move) r.state = 'gone';
      continue;
    }
    const arrived = stepRaider(state, r);
    if (!arrived) continue;
    if (r.state === 'flee') {
      if (onSide(raid.side, r.tile)) {
        r.state = 'gone';
        r.move = null;
      } else flee(state, r);
      continue;
    }
    const b = findById(state.buildings, r.target);
    if (b && r.tile === frontOf(b)) {
      r.state = 'loot';
      // A store with the Watch at its door holds: the raider waits there, losing heart, until the
      // guard is broken or it is.
      if (guarded(state, r.tile)) continue;
      loot(state, r, b);
      if (r.load.length === 0) {
        // Nothing left here: try the next richest store once, else go home empty-handed.
        const next = raidTargets(state).find((x) => x.id !== b.id);
        if (next && r.target !== next.id) {
          r.target = next.id;
          r.state = 'approach';
          plan(state, r, frontOf(next));
          continue;
        }
      }
      flee(state, r);
    } else flee(state, r);
  }

  // The Watch: move to their goals every few ticks.
  if (state.tick % 10 === 0) {
    for (const w of raid.watch) {
      const res = findById(state.residents, w.resident);
      if (!res) continue;
      if (w.state === 'shaken' || w.state === 'home') continue;
      const goal = watchGoal(state, w.resident);
      if (goal === null) continue;
      w.state = raid.raiders.some((x) => active(x) && x.tile === goal) ? 'intercept' : 'guard';
      res.activity = { kind: 'leisure', tile: goal };
      if (res.tile !== goal && res.move?.target !== goal) moveResident(state, res, goal, 'schedule');
    }
  }

  // Contact: each side loses morale by the other's strength.
  const fierce = state.settings.threat === 'fierce';
  const hit = fierce ? (RAIDER_HIT * 3) / 2 : RAIDER_HIT;
  const training = state.watch.training;
  const moraleW = state.watch.morale;
  for (const w of raid.watch) {
    if (w.state !== 'guard' && w.state !== 'intercept') continue;
    const res = findById(state.residents, w.resident);
    if (!res || res.inside) continue;
    let foes = 0;
    for (const r of raid.raiders) {
      if (!active(r) || !adjacent(res.tile, r.tile)) continue;
      foes++;
      drain(r, Math.floor((training * moraleW * CONTACT) / 10000));
    }
    drain(w, foes * hit);
    if (w.morale <= 0) {
      w.state = 'shaken';
      if (res.watch) res.watch.shakenUntil = state.tick + TICKS_PER_DAY;
      res.activity = { kind: 'home' };
    }
  }
  // Raiders at 0 flee, or are captured with two of the Watch beside them.
  for (const r of raid.raiders) {
    if (!active(r) || r.morale > 0) continue;
    let near = 0;
    for (const w of raid.watch) {
      if (w.state !== 'guard' && w.state !== 'intercept') continue;
      const res = findById(state.residents, w.resident);
      if (res && !res.inside && adjacent(res.tile, r.tile)) near++;
    }
    if (near >= 2) capture(state, ctx, r);
    else if (r.state !== 'flee') flee(state, r);
  }

  // Folk caught outside near a raider get a fright.
  if (state.tick % 20 === 0) {
    for (const res of state.residents) {
      if (res.inside || raid.watch.some((w) => w.resident === res.id)) continue;
      if (raid.raiders.some((r) => active(r) && dist(r.tile, res.tile) <= FRIGHT_RANGE))
        addMoodModifier(state, res.id, { kind: 'fright', value: FRIGHT_MOOD, ticks: TICKS_PER_DAY });
    }
  }

  if (state.tick % TICKS_PER_HOUR === 0) ctx.events.push({ e: 'raid.updated', r: raidView(state)! });
  if (!raid.raiders.some(active) || state.tick >= raid.startTick + RAID_TICKS) {
    endRaid(state, ctx);
    return true;
  }
  return false;
}

function stolenText(load: number[]): string {
  const parts: string[] = [];
  load.forEach((n, g) => {
    if (n > 0) parts.push(`${n} ${content.goods[g]!.name.toLowerCase()}`);
  });
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Step 7 and after: the result card, renown, morale, the Chronicle and The Gate Held. */
export function endRaid(state: WorldState, ctx: TickCtx): void {
  const raid = state.raid!;
  const stolenBy = new Array<number>(content.goods.length).fill(0);
  let escaped = 0;
  let turned = 0;
  let captured = 0;
  for (const r of raid.raiders) {
    if (active(r)) r.state = 'gone';
    if (r.state === 'captured') {
      captured++;
      turned++;
    } else if (r.load.length > 0) {
      escaped++;
      for (const [g, n] of r.load) stolenBy[g]! += n;
    } else turned++;
    r.move = null;
  }
  let stolen = 0;
  for (const n of stolenBy) stolen += n;
  const repelled = stolen === 0 || turned > escaped;
  const held = repelled && stolen === 0;
  const t = state.threats;
  t.history.push({ tick: raid.startTick, band: raid.band, side: raid.side, stolen, captured, repelled });
  if (t.history.length > RAID_HISTORY_MAX) t.history.splice(0, t.history.length - RAID_HISTORY_MAX);
  if (held) state.seasons.raidsHeld += 1;
  const renown = repelled ? (held ? RENOWN_HELD : RENOWN_REPELLED) : 0;
  if (renown > 0) addRenown(state, ctx, renown, 'raid');
  const before = state.watch.morale;
  state.watch.morale = Math.max(0, Math.min(100, before + (repelled ? MORALE_SWING : -MORALE_SWING)));
  // Gates the bell shut open again.
  if (raid.bell) {
    for (const b of state.buildings) {
      if (b.rt && b.rt.open === false && content.buildingById.get(b.def)?.defense?.passable === 'gate') {
        b.rt.open = true;
        ctx.events.push({ e: 'building.updated', b: buildingView(b) });
      }
    }
    state.networkVersion += 1;
  }
  const focusB = findById(state.buildings, raid.raiders.find((r) => r.target)?.target ?? 0);
  const focus = focusB ? frontOf(focusB) : (raid.raiders[0]?.tile ?? 0);
  const kind = held ? 'raid-held' : repelled ? 'raid-repelled' : 'raid-lost';
  chronicle(state, ctx, kind, {
    text: [
      ['side', sideName(raid.side)],
      ['stolen', stolenText(stolenBy)],
    ],
    snapshot: { focus: [focus % S, Math.floor(focus / S)], radius: 12 },
  });
  const card: RaidResultView = {
    tick: state.tick,
    band: raid.band,
    side: raid.side,
    stolen: stolenBy.flatMap((n, g) => (n > 0 ? [[content.goods[g]!.id, n] as [string, number]] : [])),
    damage: damage.get(raid) ?? 0,
    captured,
    repelled,
    renown,
    morale: state.watch.morale - before,
  };
  t.scheduled = null;
  for (const w of raid.watch) {
    const res = findById(state.residents, w.resident);
    if (res && res.activity.kind === 'leisure') res.activity = { kind: 'home' };
  }
  state.raid = null;
  ctx.events.push({ e: 'raid.ended', r: card });
  ctx.events.push({ e: 'threat.updated', t: threatView(state) });
  ctx.events.push({ e: 'watch.updated', w: watchView(state) });
}
