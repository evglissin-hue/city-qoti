// Circus visitors (C5A, docs/spec/14-challenge.md, Weather and events): on the circus evening folk
// from the next valleys walk in at the valley gate, stand round the Village Green for the show and
// walk home again. They are view only: rows in the agent frame worked out from the event and the
// clock along one cached path, so nothing is saved, nothing is hashed, and the sim never waits on
// them. The coins and the mood were booked when the circus started (systems/weather).
// View code: floats are fine, nothing feeds back.
import { AGENT_STRIDE, AgentAnim, AgentFlags, MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { WorldState } from '../../contracts';
import { walkGrid } from '../../systems/movement/grid';
import { pathBetween } from '../../systems/movement/paths';
import { gateTile } from '../../systems/residents/lifecycle';
import { dayIndex, tickOfDay } from '../../systems/residents/time';

/** Visitor ids sit far above any entity id (exact in a Float32 row up to 2^24). */
export const VISITOR_ID_BASE = 1 << 23;
/**
 * The show runs from 19:00: visitors set off from the gate in time to reach the green by then (not
 * before 14:00), a few minutes apart, and leave from 21:00, early enough to be through the gate by
 * a quarter to midnight. A green further than that walk allows draws no visitors.
 */
const SHOW = 19 * TICKS_PER_HOUR;
const EARLIEST = 14 * TICKS_PER_HOUR;
const LEAVE = 21 * TICKS_PER_HOUR;
const HOME_BY = 23.75 * TICKS_PER_HOUR;
const ARRIVE_GAP = 12;
const LEAVE_GAP = 8;
/** A visitor for every few residents, within these bounds. */
const MIN_VISITORS = 6;
const MAX_VISITORS = 16;
const PER_RESIDENTS = 5;

interface Route {
  /** Tile centers from the gate to the green. */
  tiles: number[];
  /** Ticks walked on reaching each tile (cum[0] = 0 at the gate). */
  cum: number[];
}

const routes = new WeakMap<WorldState, { key: string; route: Route | null }>();

function routeFor(state: WorldState, gate: number, green: number): Route | null {
  const grid = walkGrid(state);
  const key = `${gate}:${green}:${grid.epoch}`;
  const hit = routes.get(state);
  if (hit && hit.key === key) return hit.route;
  const path = pathBetween(state, gate, green);
  let route: Route | null = null;
  if (path && path.length > 0) {
    const tiles = [gate, ...path];
    const cum = [0];
    for (let i = 1; i < tiles.length; i++) cum.push(cum[i - 1]! + Math.max(1, grid.ticks[tiles[i]!] || 10));
    route = { tiles, cum };
  }
  routes.set(state, { key, route });
  return route;
}

/** Where a walker is after `t` ticks along the route: [x, z, heading]. */
function along(route: Route, t: number): [number, number, number] {
  const { tiles, cum } = route;
  const last = tiles.length - 1;
  if (t >= cum[last]!)
    return [...centerOf(tiles[last]!), headingTo(tiles[last - 1] ?? tiles[last]!, tiles[last]!)];
  let i = 1;
  while (i < last && cum[i]! <= t) i++;
  const a = tiles[i - 1]!;
  const b = tiles[i]!;
  const f = (t - cum[i - 1]!) / Math.max(1, cum[i]! - cum[i - 1]!);
  const [ax, az] = centerOf(a);
  const [bx, bz] = centerOf(b);
  return [ax + (bx - ax) * f, az + (bz - az) * f, headingTo(a, b)];
}

function centerOf(tile: number): [number, number] {
  return [(tile % MAP_SIZE) + 0.5, Math.floor(tile / MAP_SIZE) + 0.5];
}

/** 0 faces +z, increasing clockwise seen from above, to the nearest eighth (as agents.ts). */
function heading8(dx: number, dz: number): number {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  if (az <= 0.414 * ax) return dx > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (ax <= 0.414 * az) return dz > 0 ? 0 : Math.PI;
  if (dx > 0) return dz > 0 ? Math.PI / 4 : (3 * Math.PI) / 4;
  return dz > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
}

function headingTo(from: number, to: number): number {
  const [fx, fz] = centerOf(from);
  const [tx, tz] = centerOf(to);
  return heading8(tx - fx, tz - fz);
}

/** Spots round the green (unit directions, eight ways), a ring a little wider for each eight. */
const ROUND: readonly [number, number][] = [
  [0, 1],
  [0.71, -0.71],
  [-1, 0],
  [0.71, 0.71],
  [0, -1],
  [-0.71, 0.71],
  [1, 0],
  [-0.71, -0.71],
];

/** How many visitors the circus brings to a town of this size. */
export function visitorCount(residents: number): number {
  return Math.max(MIN_VISITORS, Math.min(MAX_VISITORS, Math.round(residents / PER_RESIDENTS)));
}

/**
 * Rows for the circus visitors out right now, appended to `out` from row `n`; returns the new row
 * count. `grow` makes room for one more row and returns the (possibly new) array.
 */
export function writeVisitorRows(
  state: WorldState,
  out: Float32Array<ArrayBuffer>,
  n: number,
  grow: (rows: number) => Float32Array<ArrayBuffer>,
): { out: Float32Array<ArrayBuffer>; n: number } {
  const today = dayIndex(state.tick);
  const v = state.weather.events.find((e) => e.event === 'circus' && dayIndex(e.start) === today);
  if (!v || state.tick < v.start) return { out, n };
  const site = state.hearth.sites.find((s) => s.pattern === 'village-green');
  if (!site) return { out, n };
  const tod = tickOfDay(state.tick);
  if (tod < EARLIEST) return { out, n };
  const route = routeFor(state, gateTile(state), site.anchor);
  if (!route) return { out, n };
  const walk = route.cum[route.cum.length - 1]!;
  const firstOff = Math.max(EARLIEST, SHOW - walk);
  const lastLeave = HOME_BY - walk;
  const h = state.map.height;
  const [gx, gz] = centerOf(site.anchor);
  const count = visitorCount(state.residents.length);
  for (let k = 0; k < count; k++) {
    const setOff = firstOff + k * ARRIVE_GAP;
    const leave = Math.min(LEAVE + k * LEAVE_GAP, lastLeave);
    if (leave <= setOff + walk) continue;
    if (tod < setOff || tod >= leave + walk) continue;
    let x: number;
    let z: number;
    let heading: number;
    let anim: number = AgentAnim.walk;
    if (tod < setOff + walk) {
      [x, z, heading] = along(route, tod - setOff);
    } else if (tod < leave) {
      // Round the green, facing the middle; the second eight stand a step further out.
      const [ux, uz] = ROUND[k % ROUND.length]!;
      const r = 1.3 + 0.9 * Math.floor(k / ROUND.length);
      x = gx + ux * r;
      z = gz + uz * r;
      heading = heading8(-ux, -uz);
      anim = AgentAnim.idle;
    } else {
      [x, z, heading] = along(route, walk - (tod - leave));
      heading = heading > 0 ? heading - Math.PI : heading + Math.PI;
    }
    const tile = Math.floor(z) * MAP_SIZE + Math.floor(x);
    if ((n + 1) * AGENT_STRIDE > out.length) out = grow(n + 1);
    const o = n * AGENT_STRIDE;
    out[o] = VISITOR_ID_BASE + k;
    out[o + 1] = x;
    out[o + 2] = z;
    out[o + 3] = h[tile] ?? 0;
    out[o + 4] = heading;
    out[o + 5] = anim;
    out[o + 6] = 0;
    out[o + 7] = AgentFlags.visitor | AgentFlags.happy;
    n++;
  }
  return { out, n };
}
