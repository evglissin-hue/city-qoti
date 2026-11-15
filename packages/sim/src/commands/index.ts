// Command registry: one line per command, in alphabetical order by type.
import type { Command, CommandType } from '../contracts';
import * as bandit from './bandit';
import * as build from './build';
import * as carrier from './carrier';
import * as charter from './charter';
import * as commission from './commission';
import * as customize from './customize';
import * as decor from './decor';
import * as festival from './festival';
import * as field from './field';
import * as guide from './guide';
import * as levers from './levers';
import * as loan from './loan';
import * as marketDays from './marketDays';
import * as module from './module';
import * as move from './move';
import * as note from './note';
import * as plan from './plan';
import * as pond from './pond';
import * as recipe from './recipe';
import * as request from './request';
import * as road from './road';
import * as runtime from './runtime';
import * as season from './season';
import * as seat from './seat';
import * as sys from './sys';
import * as terrain from './terrain';
import * as time from './time';
import * as tree from './tree';
import type { AnyHandler } from './util';
import * as valley from './valley';
import * as wall from './wall';
import * as watch from './watch';
import * as zone from './zone';

// prettier-ignore
export const commandHandlers: readonly AnyHandler[] = [
  bandit.decide,
  customize.customize,
  move.moveBuilding,
  recipe.pinRecipe,
  build.place,
  build.remove,
  module.setModule,
  runtime.setPaused,
  runtime.setPriority,
  carrier.setBudget,
  carrier.setReserve,
  carrier.setRule,
  charter.claim,
  commission.accept,
  commission.decline,
  move.moveDecor,
  decor.place,
  decor.placeRun,
  decor.remove,
  festival.keepPiece,
  festival.plan,
  field.paint,
  field.remove,
  wall.setGate,
  guide.setHidden,
  marketDays.setMarketDay,
  levers.setPriceCap,
  marketDays.setQuietHours,
  levers.setTaxRate,
  levers.setWageLevel,
  loan.repay,
  loan.take,
  note.pin,
  note.remove,
  plan.add,
  plan.approve,
  plan.comment,
  plan.edit,
  plan.remove,
  plan.seen,
  request.add,
  request.resolve,
  road.paint,
  road.remove,
  season.setPlan,
  seat.setProfile,
  sys.seatJoined,
  sys.seatLeft,
  terrain.lower,
  pond.pond,
  terrain.raise,
  time.setSpeed,
  tree.plant,
  tree.remove,
  valley.setSettings,
  wall.paint,
  wall.remove,
  watch.lightLanterns,
  watch.ringBell,
  watch.setBudget,
  watch.setPosture,
  watch.setTarget,
  zone.clear,
  zone.paint,
];

const byType = new Map<CommandType, AnyHandler>(commandHandlers.map((h) => [h.type, h]));

export function handlerFor(cmd: Command): AnyHandler | undefined {
  return typeof cmd === 'object' && cmd !== null ? byType.get(cmd.t) : undefined;
}

/** Commands still accepted in a together-only valley while a seat is alone. */
export const ALLOWED_WHEN_APART: ReadonlySet<CommandType> = new Set<CommandType>([
  'guide.setHidden',
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
