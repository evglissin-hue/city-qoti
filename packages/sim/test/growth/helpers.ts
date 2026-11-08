// Helpers for the C4B tests: zoning rectangles by command, running a zoning pass, reading lots back
// and drawing a little map of a frontage (handy when a test fails).
import { content } from '@qoti/content';
import type { Lot, Rect, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { zoningPass } from '../../src/systems/zoning/lots';
import { rejection, run, S } from '../helpers';

/** Paints a zone over a rectangle (inclusive) by command; fails the test on a rejection. */
export function paintZone(state: WorldState, zone: string, rect: Rect): SimCtx {
  const tiles: [number, number][] = [];
  for (let z = rect[1]; z <= rect[3]; z++) for (let x = rect[0]; x <= rect[2]; x++) tiles.push([x, z]);
  const ctx = run(state, { t: 'zone.paint', zone, tiles });
  const why = rejection(ctx);
  if (why) throw new Error(`zone.paint refused: ${why}`);
  return ctx;
}

/** One zoning pass now, with its events. */
export function zoneNow(state: WorldState): { ctx: SimCtx; added: number; removed: number } {
  const ctx = createTickCtx(state);
  const r = zoningPass(state, ctx);
  return { ctx, ...r };
}

/** Lots whose rect lies inside `rect` (inclusive). */
export function lotsIn(state: WorldState, rect: Rect): Lot[] {
  return state.lots.filter(
    (l) => l.x >= rect[0] && l.z >= rect[1] && l.x + l.w - 1 <= rect[2] && l.z + l.d - 1 <= rect[3],
  );
}

/**
 * A map of a rect: road (= lane, # street, . path), lots by letter (a, b, c... capitals once grown),
 * buildings B, zoned but uncut z, grass blank.
 */
export function frontageMap(state: WorldState, rect: Rect): string {
  const m = state.map;
  const rows: string[] = [];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const index = new Map(state.lots.map((l, k) => [l.id, k]));
  for (let z = rect[1]; z <= rect[3]; z++) {
    let row = '';
    for (let x = rect[0]; x <= rect[2]; x++) {
      const i = z * S + x;
      const r = m.road[i]!;
      if (r) row += r === Road.street ? '#' : r === Road.lane ? '=' : '.';
      else if (m.lot[i]) {
        const lot = state.lots[index.get(m.lot[i]!)!]!;
        const ch = letters[index.get(lot.id)! % 26]!;
        row += m.occupant[i] ? ch.toUpperCase() : ch;
      } else if (m.occupant[i]) row += 'B';
      else if (m.zone[i]) row += 'z';
      else row += ' ';
    }
    rows.push(row.trimEnd());
  }
  return rows.join('\n');
}

/** The content zone id of a lot. */
export function zoneOf(lot: Lot): string {
  return content.zoneByValue.get(lot.zone)?.id ?? '';
}
