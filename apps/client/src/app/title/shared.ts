// P3D: what the title's menu and its living backdrop share. The backdrop (title/backdrop.ts and
// Backdrop.tsx) fills these in; the menu (Title.tsx and title/*.tsx) reads them. Nothing here
// imports the renderer, so the menu never waits for Three.js.
import { signal } from '@preact/signals';
import type { Quality } from '../../render/quality';

/** The backdrop's light: a golden afternoon, or dusk with the lamps lit. */
export type TitleLight = 'day' | 'dusk';

/**
 * The light for this visit: `?titleLight=day|dusk` first (shots and tests), then the player's own
 * clock (dusk from 18:00 to 05:59, when a lit window reads best), else day.
 */
export function titleLight(now: Date = new Date()): TitleLight {
  const q = new URLSearchParams(location.search).get('titleLight');
  if (q === 'day' || q === 'dusk') return q;
  const h = now.getHours();
  return h >= 18 || h < 6 ? 'dusk' : 'day';
}

/**
 * Where the backdrop stands: `painted` (the painted valley, shown at once and kept when there is no
 * WebGL), `loading` (the live valley is on its way, painted still showing), `live` (the live valley
 * has drawn its first frame and fades in), `gone` (disposed: the title has left for a game).
 */
export type BackdropPhase = 'painted' | 'loading' | 'live' | 'gone';
export const backdropPhase = signal<BackdropPhase>('painted');

/**
 * Where the town should sit on screen, as fractions of the view from its center: x to the right,
 * y downward. A layout with a column on the left asks for x > 0 so the card never covers the town.
 */
export interface Framing {
  x: number;
  y: number;
}

/** The live backdrop, while there is one: the settings card and the layout steer it through this. */
export interface BackdropControl {
  setQuality(q: Quality): void;
  /** Calm motion: the camera holds still (folk, smoke and lamps keep their own motion). */
  setCalm(on: boolean): void;
  setFraming(f: Framing): void;
}

export const backdrop: { current: BackdropControl | null } = { current: null };

/**
 * Counts for the leak test (`e2e/p3d-*`): every live backdrop made and disposed, and the workers,
 * animation frames and timers it holds right now. After leaving the title every `live*` is 0.
 */
export const backdropStats = {
  created: 0,
  disposed: 0,
  liveRenderers: 0,
  liveWorkers: 0,
  liveTimers: 0,
  /** Frames drawn by the backdrop's own drift loop (stays put once disposed). */
  frames: 0,
};
(globalThis as { __qotiBackdrop?: typeof backdropStats }).__qotiBackdrop = backdropStats;

/** Performance marks for the boot numbers (read by `e2e/p3d-boot.mjs`). */
export const MARK_MENU = 'qoti:menu-interactive';
export const MARK_BACKDROP = 'qoti:backdrop-first-frame';
