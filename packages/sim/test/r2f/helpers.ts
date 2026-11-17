// Helpers for the R2F lot tests: street scenes on the village fixture, lot signatures that ignore ids,
// and quick looks at what the cutter did.
import { content } from '@qoti/content';
import type { Lot, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { growable } from '../../src/systems/growth';
import { growLot } from '../../src/systems/growth/api';
import { S } from '../helpers';
import { paintZone } from '../growth/helpers';

export { S };

/** Sets a straight run of road along x (z fixed) or along z (x fixed); bumps the network version. */
export function roadX(
  state: WorldState,
  z: number,
  x0: number,
  x1: number,
  kind: number = Road.street,
): void {
  for (let x = x0; x <= x1; x++) state.map.road[z * S + x] = kind;
  state.networkVersion++;
}
export function roadZ(
  state: WorldState,
  x: number,
  z0: number,
  z1: number,
  kind: number = Road.street,
): void {
  for (let z = z0; z <= z1; z++) state.map.road[z * S + x] = kind;
  state.networkVersion++;
}

/** The three streets that close a block against street B (z=70) on the village fixture (the master's snippet). */
export function closedBlockRoads(s: WorldState): void {
  for (let z = 58; z <= 82; z++) if (z !== 70) s.map.road[z * S + 84] = Road.street;
  for (let x = 66; x <= 84; x++) s.map.road[80 * S + x] = Road.street;
  for (let z = 71; z < 80; z++) s.map.road[z * S + 66] = Road.street;
  s.networkVersion++;
}

/** Zones of the closed block: Townhouses inside it, Shops on the north side of street B. */
export const BLOCK_ZONES: [string, [number, number, number, number]][] = [
  ['homes-medium', [67, 71, 83, 79]],
  ['shops', [70, 60, 83, 69]],
];

export function paintBlockZones(s: WorldState): void {
  for (const [zone, rect] of BLOCK_ZONES) paintZone(s, zone, rect);
}

/** The key of a lot that ignores its id and its row id. */
export function lotKey(l: Lot): string {
  return [
    l.kind,
    l.zone,
    `${l.x},${l.z}`,
    `${l.w}x${l.d}`,
    `rot${l.rot}`,
    `f${l.frontage}`,
    `f2:${l.frontage2 ?? '-'}`,
    l.corner ? 'corner' : '-',
    l.row ? 'row' : 'norow',
  ].join(' ');
}

/** Everything about the lots that must not depend on the order of painting: the lots and their rows, never ids. */
export function signature(state: WorldState): { lots: string[]; rows: string[] } {
  const lots = state.lots.map(lotKey).sort();
  const byRow = new Map<number, string[]>();
  for (const l of state.lots) {
    if (!l.row) continue;
    let list = byRow.get(l.row);
    if (!list) byRow.set(l.row, (list = []));
    list.push(lotKey(l));
  }
  const rows = [...byRow.values()].map((keys) => keys.sort().join(' | ')).sort();
  return { lots, rows };
}

/** Where a lot lies along its road, and its length there. */
export const along = (l: Lot): number => (l.rot % 2 === 0 ? l.x : l.z);
export const span = (l: Lot): number => (l.rot % 2 === 0 ? l.w : l.d);

/** The row lots of the state grouped by row id, each sorted along the road. */
export function rowsOf(state: WorldState): Map<number, Lot[]> {
  const rows = new Map<number, Lot[]>();
  for (const l of state.lots) {
    if (!l.row || l.kind === 'garden') continue;
    let list = rows.get(l.row);
    if (!list) rows.set(l.row, (list = []));
    list.push(l);
  }
  for (const list of rows.values()) list.sort((p, q) => along(p) - along(q) || p.id - q.id);
  return rows;
}

/** Grows up to `n` buildings on empty lots (a def of the lot's zone that fits), in lot order. Returns the lots grown. */
export function growSome(state: WorldState, n: number, pick: (l: Lot) => boolean = () => true): Lot[] {
  const out: Lot[] = [];
  for (const lot of [...state.lots]) {
    if (out.length >= n) break;
    if (lot.kind === 'garden' || lot.buildingId || !pick(lot)) continue;
    const zoneId = content.zoneByValue.get(lot.zone)?.id;
    if (!zoneId) continue;
    for (const def of growable(state, zoneId)) {
      if (growLot(state, null, lot.id, def.id)) {
        out.push(findById(state.lots, lot.id)!);
        break;
      }
    }
  }
  return out;
}

/** What an occupied lot must keep through any re-cut. */
export interface Held {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  frontage: number;
  buildingId: number;
}
export function hold(lots: readonly Lot[]): Held[] {
  return lots.map((l) => ({
    id: l.id,
    x: l.x,
    z: l.z,
    w: l.w,
    d: l.d,
    rot: l.rot,
    frontage: l.frontage,
    buildingId: l.buildingId,
  }));
}
