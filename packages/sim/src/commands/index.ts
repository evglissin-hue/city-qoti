// Command registry: one line per command, in alphabetical order by type.
import type { Command, CommandType } from '../contracts';
import * as build from './build';
import * as decor from './decor';
import * as note from './note';
import * as road from './road';
import * as seat from './seat';
import * as sys from './sys';
import * as time from './time';
import * as tree from './tree';
import type { AnyHandler } from './util';
import * as valley from './valley';

// prettier-ignore
export const commandHandlers: readonly AnyHandler[] = [
  build.place,
  build.remove,
  decor.place,
  decor.placeRun,
  decor.remove,
  note.pin,
  note.remove,
  road.paint,
  road.remove,
  seat.setProfile,
  sys.seatJoined,
  sys.seatLeft,
  time.setSpeed,
  tree.plant,
  tree.remove,
  valley.setSettings,
];

const byType = new Map<CommandType, AnyHandler>(commandHandlers.map((h) => [h.type, h]));

export function handlerFor(cmd: Command): AnyHandler | undefined {
  return typeof cmd === 'object' && cmd !== null ? byType.get(cmd.t) : undefined;
}

/** Commands still accepted in a together-only valley while a seat is alone. */
export const ALLOWED_WHEN_APART: ReadonlySet<CommandType> = new Set<CommandType>([
  'note.pin',
  'note.remove',
  'seat.setProfile',
  'sys.seatJoined',
  'sys.seatLeft',
  'time.setSpeed',
  'valley.setSettings',
]);

export { ensureSeat } from './seat';
export type { AnyHandler, HandlerFor } from './util';
