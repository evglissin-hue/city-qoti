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
  OUT_OF_RANGE: 'Too far from the farmhouse to tend.',
  CHANGED: 'Things have moved on since then, so there is nothing to undo.',
  CREDIT_LIMIT: 'The County Bank has lent all it cares to for now. Pay some back first.',
  NOT_READY: 'Not every goal on the Charter is met yet. Close, though.',
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
};
