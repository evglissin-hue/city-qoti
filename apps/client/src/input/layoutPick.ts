import { signal } from '@preact/signals';

/** The pattern whose layout the Lay it out tool is holding, or null while it has nothing to lay out. */
export const chosenPattern = signal<string | null>(null);
/** Where to go when the layout is sketched or put away (the tool the player came from). */
let back: (() => void) | null = null;

/**
 * "Lay it out": picks a discovered pattern's layout for the tool. The caller then selects the
 * 'layout' tool; `then` runs when the sketch is made or put away, to return to the previous tool.
 */
export function layOut(patternId: string | null, then?: () => void): void {
  chosenPattern.value = patternId;
  back = then ?? null;
}

/** Clears the pick and returns to the tool the player came from. */
export function putLayoutAway(): void {
  const then = back;
  layOut(null);
  then?.();
}
