// Friendships (docs/spec/11-residents.md, Friendships). Residents who spend an hour in the same
// place (a workplace, a friend's kitchen, the same bench) gain points with each other, scaled by
// trait compatibility; neighbors within 6 tiles gain a little each day just by waving over the
// fence. Levels at 10, 30, 60, 100 and 150 points; at most 5 friends, the weakest acquaintance
// making way for a new one; 1 point of decay per day apart (Shy friendships every other day).
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_FRIENDS, TICKS_PER_DAY } from '../../constants';
import type { Friend, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { addMoodModifier } from './api';
import { chebyshev, doorOf, eachBuildingNear, tileX, tileZ } from './places';
import { pushHistory } from './records';
import { dayIndex } from './time';
import { compatibility, traitPercent } from './traits';

export const FRIEND_LEVELS = [10, 30, 60, 100, 150] as const;
/**
 * Points per hour together before compatibility and traits: a visit at a friend's kitchen table
 * counts most, an hour on the same bench next, working side by side least (it adds up, though).
 */
export const POINTS_PER_HOUR = { visit: 3, outdoors: 2, work: 1 } as const;
/** Outdoor patches are keyed above every entity id (ids stay below 2^30). */
const OUTDOORS = 1073741824;
/** Neighbors live within this many tiles of each other (door to door). */
const NEIGHBOR_TILES = 6;
/** Larger gatherings pair each resident with this many of the others per hour. */
const MAX_PAIRS_EACH = 4;

export function levelFor(points: number): number {
  let level = 0;
  for (let i = 0; i < FRIEND_LEVELS.length; i++) if (points >= FRIEND_LEVELS[i]!) level = i + 1;
  return level;
}

function entry(r: Resident, id: number): Friend | undefined {
  for (const f of r.friends) if (f.id === id) return f;
  return undefined;
}

/** Drops one side of a friendship (the caller drops the other). */
export function removeFriend(r: Resident, id: number): void {
  const i = r.friends.findIndex((f) => f.id === id);
  if (i >= 0) r.friends.splice(i, 1);
}

function addEntry(r: Resident, f: Friend): void {
  let i = r.friends.length;
  while (i > 0 && r.friends[i - 1]!.id > f.id) i--;
  r.friends.splice(i, 0, f);
}

/** The weakest entry (fewest points, then highest id), or undefined. */
function weakest(r: Resident): Friend | undefined {
  let w: Friend | undefined;
  for (const f of r.friends) if (!w || f.points < w.points || (f.points === w.points && f.id > w.id)) w = f;
  return w;
}

/** Makes room on a full list by dropping its weakest acquaintance (level 0); false when it cannot. */
function makeRoom(state: WorldState, r: Resident): boolean {
  if (r.friends.length < MAX_FRIENDS) return true;
  const w = weakest(r);
  if (!w || w.level > 0) return false;
  removeFriend(r, w.id);
  const other = findById(state.residents, w.id);
  if (other) removeFriend(other, r.id);
  return true;
}

/** Adds friendship points to a pair, symmetrically. */
export function befriend(state: WorldState, a: Resident, b: Resident, points: number): void {
  if (a.id === b.id || points <= 0) return;
  const day = dayIndex(state.tick);
  let fa = entry(a, b.id);
  let fb = entry(b, a.id);
  if (!fa || !fb) {
    if (fa) removeFriend(a, b.id);
    if (fb) removeFriend(b, a.id);
    if (!makeRoom(state, a) || !makeRoom(state, b)) return;
    fa = { id: b.id, level: 0, points: 0, lastMet: day };
    fb = { id: a.id, level: 0, points: 0, lastMet: day };
    addEntry(a, fa);
    addEntry(b, fb);
  }
  const before = fa.level;
  fa.points += points;
  fb.points = fa.points;
  fa.lastMet = fb.lastMet = day;
  fa.level = fb.level = levelFor(fa.points);
  if (fa.level > before && fa.level === 1) {
    for (const [r, o] of [
      [a, b],
      [b, a],
    ] as const) {
      addMoodModifier(state, r.id, { kind: 'new-friend', value: 5, ticks: 2 * TICKS_PER_DAY });
      pushHistory(state, r, 'friend', o.id);
    }
  } else if (fa.level > before && fa.level >= 3) {
    pushHistory(state, a, `friend-${fa.level}`, b.id);
    pushHistory(state, b, `friend-${fa.level}`, a.id);
  }
}

/** Points a pair gains for an hour together. */
export function pairPoints(a: Resident, b: Resident, base: number = POINTS_PER_HOUR.outdoors): number {
  const rate = (traitPercent(a, 'friendshipRate') + traitPercent(b, 'friendshipRate')) / 2;
  return Math.max(1, Math.round((base * compatibility(a, b) * rate) / 10000));
}

let keys = new Float64Array(256);

/** Where a resident is for friendship purposes: a building, a 3 x 3 patch outdoors, or nowhere. */
function placeKey(r: Resident): number {
  if (r.inside) return r.inside;
  if (r.move) return 0;
  const k = r.activity.kind;
  if (k !== 'leisure' && k !== 'play' && k !== 'stroll' && k !== 'visit' && k !== 'work' && k !== 'task') {
    return 0;
  }
  const x = r.tile % MAP_SIZE;
  const z = (r.tile - x) / MAP_SIZE;
  return OUTDOORS + Math.floor(z / 3) * 64 + Math.floor(x / 3);
}

/** Family does not count, and children make friends with children. */
export function canBefriend(a: Resident, b: Resident): boolean {
  return a.householdId !== b.householdId && (a.stage === 'child') === (b.stage === 'child');
}

/** Hourly: residents sharing a place gain points with each other. */
export function hourlyFriendships(state: WorldState): void {
  const rs = state.residents;
  if (rs.length < 2) return;
  if (keys.length < rs.length) keys = new Float64Array(rs.length * 2);
  let n = 0;
  for (let i = 0; i < rs.length; i++) {
    const key = placeKey(rs[i]!);
    if (key) keys[n++] = key * 65536 + i;
  }
  const sorted = keys.subarray(0, n).sort();
  let start = 0;
  while (start < n) {
    const key = Math.floor(sorted[start]! / 65536);
    const base =
      key >= OUTDOORS
        ? POINTS_PER_HOUR.outdoors
        : content.buildingById.get(findById(state.buildings, key)?.def ?? '')?.housing
          ? POINTS_PER_HOUR.visit
          : POINTS_PER_HOUR.work;
    let end = start + 1;
    while (end < n && Math.floor(sorted[end]! / 65536) === key) end++;
    const size = end - start;
    if (size > 1) {
      // Small groups pair everyone once; big gatherings pair each resident with a few neighbors.
      const all = size - 1 <= MAX_PAIRS_EACH * 2;
      for (let i = start; i < end; i++) {
        const a = rs[sorted[i]! % 65536]!;
        const last = all ? end - 1 - i : MAX_PAIRS_EACH;
        for (let k = 1; k <= last; k++) {
          const j = all ? i + k : start + ((i - start + k) % size);
          const b = rs[sorted[j]! % 65536]!;
          if (canBefriend(a, b)) befriend(state, a, b, pairPoints(a, b, base));
        }
      }
    }
    start = end;
  }
}

/** Daily: neighbors within 6 tiles gain a point; friendships apart decay. */
export function dailyFriendships(state: WorldState): void {
  const day = dayIndex(state.tick);
  // Decay, once per pair (from the lower id's side).
  for (const r of state.residents) {
    for (let i = r.friends.length - 1; i >= 0; i--) {
      const f = r.friends[i]!;
      if (f.id < r.id || f.lastMet >= day - 1) continue;
      const other = findById(state.residents, f.id);
      const back = other ? entry(other, r.id) : undefined;
      const slow =
        traitPercent(r, 'friendshipDecay') < 100 || (!!other && traitPercent(other, 'friendshipDecay') < 100);
      if (slow && day % 2 === 1) continue;
      f.points -= 1;
      f.level = levelFor(f.points);
      if (back) {
        back.points = f.points;
        back.level = f.level;
      }
      if (f.points <= 0) {
        r.friends.splice(i, 1);
        if (other) removeFriend(other, r.id);
      }
    }
  }
  // Neighbors: each household with its three nearest neighbors within 6 tiles (higher ids only, so
  // each pair is visited once).
  const hs = state.households;
  const byHome = new Map<number, number[]>();
  for (const h of hs) {
    if (!h.homeId) continue;
    const list = byHome.get(h.homeId);
    if (list) list.push(h.id);
    else byHome.set(h.homeId, [h.id]);
  }
  for (const h of hs) {
    const door = doorOf(state, h.homeId);
    if (door < 0) continue;
    const near: [d: number, id: number][] = [];
    eachBuildingNear(state, tileX(door), tileZ(door), NEIGHBOR_TILES, (b, od) => {
      const d = chebyshev(door, od);
      if (d > NEIGHBOR_TILES) return;
      for (const id of byHome.get(b.id) ?? []) if (id > h.id) near.push([d, id]);
    });
    near.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let k = 0; k < near.length && k < 3; k++) {
      const o = findById(hs, near[k]![1])!;
      for (const a of h.members) {
        const ra = findById(state.residents, a);
        if (!ra) continue;
        for (const b of o.members) {
          const rb = findById(state.residents, b);
          if (rb && canBefriend(ra, rb)) befriend(state, ra, rb, 1);
        }
      }
    }
  }
}
