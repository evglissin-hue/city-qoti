import type { RejectReason } from '@qoti/sim';

/** Gentle, dry explanations for rejected actions (warm, never babyish, no em dashes). */
export const REJECT_TEXT: Record<RejectReason, string> = {
  OUT_OF_BOUNDS: 'That is off the edge of the map.',
  LOCKED_PARCEL: 'That land is not open yet.',
  WATER: 'That spot is mostly river.',
  OCCUPIED: 'Something is already there.',
  TOO_STEEP: 'Too steep. Even the goats would complain.',
  NEEDS_DEPOSIT: 'This wants to sit on a deposit.',
  NEEDS_WATER_EDGE: 'This wants to be by the water.',
  NEEDS_FERTILITY: 'The soil here is too thin for that.',
  CANNOT_AFFORD: 'The treasury says no.',
  NOT_FOUND: 'Nothing there to remove.',
  NOT_ALLOWED: 'That does not belong there.',
  TOGETHER_ONLY: 'This valley waits until you are both here.',
  TOO_MANY: 'That is a lot at once. Try a little less.',
  INVALID: 'That did not quite work.',
  LEAN_TIMES: 'Lean times. New building waits until the books are back above zero.',
  LOCKED: 'Not yet. The Pattern Book has to find this one first.',
  OUT_OF_RANGE: 'Too far from the grain farm to tend.',
  CHANGED: 'Things have moved on since then, so there is nothing to undo.',
  CREDIT_LIMIT: 'The County Bank has lent all it cares to for now. Pay some back first.',
  NOT_READY: 'Not every goal on the Charter is met yet. Close, though.',
  // I3 (C5.0)
  WOULD_ENCLOSE: 'That wall would shut someone in. They would notice.',
  FROZEN: 'The river is frozen. It will thaw in spring, as rivers do.',
  NO_RAID: 'There is no raid on. The bell can rest.',
  // Playtest round three
  CUT_OFF:
    'Nobody can walk to that door: a cliff or the river is in the way. Turn it, or build where a path can reach.',
  // P1 (playtest)
  HALL_STAYS:
    'The town hall stays. Its builders raise everything else, and nobody wants to learn who would raise a new one.',
  TOO_LATE: 'Too late for that. The evening has begun, so the plans will have to wait for next season.',
  // R1 (R1.0): the site rules of specialized buildings
  NEEDS_WOODS: 'A forester needs woods to work in. Find a spot with more grown trees about.',
  NEEDS_RIVER: 'This one wants its door on the river. A pond will not do; it has tried.',
  NEEDS_OPEN_GROUND: 'A windmill needs elbow room. Move it clear of the neighbors and their washing.',
  NEEDS_ROAD: 'This wants a proper road at the door. Carts do not do footpaths.',
  NEEDS_VALLEY_ROAD: 'Too far from the valley road. The traders will not come looking.',
};

export function rejectText(reason: RejectReason | undefined): string {
  return reason ? REJECT_TEXT[reason] : REJECT_TEXT.INVALID;
}

/** Undo toasts (Ctrl+Z). */
export const undoText = {
  done: (label: string) => `Undid ${label}.`,
  empty: 'Nothing left to undo. Everything here is on purpose now.',
  refused: (reason: RejectReason) =>
    reason === 'CHANGED' ? REJECT_TEXT.CHANGED : `Could not undo that. ${REJECT_TEXT[reason]}`,
  /** I2 (C4F): Ctrl+Z while sketching takes back the last blueprint piece. */
  sketch: 'Rubbed out the last bit of the sketch.',
};
