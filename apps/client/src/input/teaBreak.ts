// V4: tea-break mode (docs/spec/17-presentation.md, Visual direction, 6; docs/build/v4-wave-notes.md).
// After TEA_BREAK_AFTER_MS without input (a setting, on by default; never while a tool is in hand
// or a card is open) the camera follows a resident on their evening round or circles the day's
// busiest place, and any input puts the view back exactly where it was (`CameraController`'s
// `saveView` and `restoreView`). Each seat's tea break is its own: camera state is never shared.
//
// V4.0 fixes the contract: the idle timer (whole, with its guards; nothing starts it yet) and the
// plan's shape, with `chooseTeaBreak` a stub that never picks anything. V4C owns this file.
import type { Mirror } from '../state/mirror';

/** How long without input before a tea break starts. */
export const TEA_BREAK_AFTER_MS = 90_000;

/** What keeps a tea break from starting. Each is read when the timer is asked, never cached. */
export interface TeaBreakGuards {
  /** The setting (`UiSettings.teaBreak`, on by default). */
  enabled(): boolean;
  /** A tool other than inspect is in hand (`ToolManager.active`). */
  toolInHand(): boolean;
  /**
   * A card, book, letter or dialog is open: the inspector's selection, a book panel, the season
   * card, a raid or festival card, the evening edition, a letter, the settings (UiState's signals).
   */
  cardOpen(): boolean;
  /** Anything else that owns the camera: photo mode, Measure this laptop, following a resident by hand. */
  busy(): boolean;
}

/** What a tea break watches, from shared state only. */
export type TeaBreakPlan =
  /** Follow a resident on their evening round (the existing follow camera, gliding slowly). */
  | { kind: 'follow'; residentId: number }
  /** Circle the day's busiest place, `distance` tiles out. */
  | { kind: 'orbit'; x: number; z: number; distance: number };

/** Counts the time since the last input. Pure: the caller passes the clock and the guards. */
export class IdleTimer {
  private last: number;

  constructor(
    now = 0,
    readonly after = TEA_BREAK_AFTER_MS,
  ) {
    this.last = now;
  }

  /** Any input at `now` (ms): a key, a click, a drag, the wheel, a touch. */
  poke(now: number): void {
    this.last = now;
  }

  /** How long there has been no input, in ms. */
  idleFor(now: number): number {
    return Math.max(0, now - this.last);
  }

  /** Whether a tea break may start now: idle long enough, and no guard in the way. */
  due(now: number, guards: TeaBreakGuards): boolean {
    return (
      this.idleFor(now) >= this.after &&
      guards.enabled() &&
      !guards.toolInHand() &&
      !guards.cardOpen() &&
      !guards.busy()
    );
  }
}

/**
 * Picks what a tea break watches: a resident on their evening round in the evening, else the day's
 * busiest place, from shared state only (the Mirror), so the pick never needs the network. V4.0's
 * stub picks nothing, so no tea break can start before V4C.
 */
export function chooseTeaBreak(mirror: Mirror): TeaBreakPlan | null {
  void mirror;
  return null;
}
