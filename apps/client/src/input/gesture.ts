// Wheel gesture classification, kept pure so it can be unit tested without a browser.
//
// What browsers send:
// - Trackpad pinch: wheel events with ctrlKey set (Chrome, Firefox, Safari) and small,
//   fractional deltaY. We zoom.
// - Trackpad two-finger scroll: pixel-mode wheel events with small or fractional deltas on
//   both axes. We pan, so the ground follows the fingers.
// - Shift plus two-finger scroll: we rotate (yaw). Some browsers move deltaY into deltaX
//   while Shift is held, so either axis counts.
// - Mouse wheel: line mode (Firefox), or whole-number deltaY of 50 or more with no deltaX
//   (Chrome, Safari). We zoom, since a mouse has no other way to.

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export type WheelGesture =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'rotate'; dYaw: number };

const LINE_PX = 16;
const PAGE_PX = 400;

/** True when the event looks like a notched mouse wheel rather than a trackpad. */
export function isMouseWheel(e: WheelLike): boolean {
  if (e.deltaMode === 1 || e.deltaMode === 2) return true;
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}

/** Turns one wheel event into a camera gesture. Zoom factors above 1 move the camera away. */
export function classifyWheel(e: WheelLike): WheelGesture {
  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * scale;
  const dy = e.deltaY * scale;
  if (e.ctrlKey) {
    // Pinch arrives as ctrl+wheel. Clamp so one big event never lurches the view.
    const step = Math.max(-40, Math.min(40, dy));
    return { kind: 'zoom', factor: Math.exp(step * 0.01) };
  }
  if (e.shiftKey) return { kind: 'rotate', dYaw: -(dx || dy) * 0.004 };
  if (isMouseWheel(e)) {
    return { kind: 'zoom', factor: Math.exp(Math.sign(dy) * Math.min(Math.abs(dy), 150) * 0.0018) };
  }
  return { kind: 'pan', dx: -dx, dy: -dy };
}

/**
 * Remembers whether a trackpad was seen recently, so a fast two-finger swipe (which can look
 * like a mouse notch) keeps panning instead of suddenly zooming.
 */
export class WheelClassifier {
  private trackpadUntil = -Infinity;

  classify(e: WheelLike, nowMs: number): WheelGesture {
    const mouse = isMouseWheel(e);
    if (!mouse || e.ctrlKey) this.trackpadUntil = nowMs + 600;
    if (mouse && !e.ctrlKey && !e.shiftKey && nowMs < this.trackpadUntil && e.deltaMode === 0) {
      return { kind: 'pan', dx: -e.deltaX, dy: -e.deltaY };
    }
    return classifyWheel(e);
  }
}
