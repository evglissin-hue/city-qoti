// Command registry: one line per command, in alphabetical order by type.
import type { Command, CommandType } from '../contracts';
import * as build from './build';
import * as charter from './charter';
import * as customize from './customize';
import * as decor from './decor';
import * as field from './field';
import * as ledger from './ledger';
import * as levers from './levers';
import * as loan from './loan';
import * as note from './note';
import * as plan from './plan';
import * as recipe from './recipe';
import * as request from './request';
import * as road from './road';
import * as runtime from './runtime';
import * as seat from './seat';
import * as sys from './sys';
import * as terrain from './terrain';
import * as time from './time';
import * as trade from './trade';
import * as tree from './tree';
import type { AnyHandler } from './util';
import * as valley from './valley';
import * as zone from './zone';

// prettier-ignore
export const commandHandlers: readonly AnyHandler[] = [
  customize.customize,
  recipe.pinRecipe,
  build.place,
  build.remove,
  runtime.setPaused,
  runtime.setPriority,
  charter.claim,
  decor.place,
  decor.placeRun,
  decor.remove,
  field.paint,
  field.remove,
  ledger.setForSale,
  levers.setPriceCap,
  levers.setTaxRate,
  levers.setWageLevel,
  loan.repay,
  loan.take,
  note.pin,
  note.remove,
  plan.add,
  plan.approve,
  plan.comment,
  plan.remove,
  plan.seen,
  request.add,
  request.resolve,
  road.paint,
  road.remove,
  seat.setProfile,
  sys.seatJoined,
  sys.seatLeft,
  terrain.lower,
  terrain.raise,
  time.setSpeed,
  trade.setStandingOrder,
  tree.plant,
  tree.remove,
  valley.setSettings,
  zone.clear,
  zone.paint,
];

const byType = new Map<CommandType, AnyHandler>(commandHandlers.map((h) => [h.type, h]));

export function handlerFor(cmd: Command): AnyHandler | undefined {
  return typeof cmd === 'object' && cmd !== null ? byType.get(cmd.t) : undefined;
}

/** Commands still accepted in a together-only valley while a seat is alone. */
export const ALLOWED_WHEN_APART: ReadonlySet<CommandType> = new Set<CommandType>([
  'note.pin',
  'note.remove',
  'plan.comment',
  'plan.seen',
  'request.add',
  'seat.setProfile',
  'sys.seatJoined',
  'sys.seatLeft',
  'time.setSpeed',
  'valley.setSettings',
]);

export { ensureSeat } from './seat';
export type { AnyHandler, HandlerFor } from './util';
