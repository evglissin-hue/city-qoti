// Documented gesture tests: what a mouse and a trackpad send, and what the camera does with it.
import { describe, expect, it } from 'vitest';
import { classifyWheel, isMouseWheel, WheelClassifier, type WheelLike } from './gesture';

const ev = (p: Partial<WheelLike>): WheelLike => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false,
  ...p,
});

describe('wheel gesture classification', () => {
  it('zooms on a trackpad pinch (ctrl+wheel), in toward the view on a spread', () => {
    const g = classifyWheel(ev({ deltaY: -3.5, ctrlKey: true }));
    expect(g.kind).toBe('zoom');
    if (g.kind === 'zoom') expect(g.factor).toBeLessThan(1);
  });

  it('clamps a huge pinch event so the view never lurches', () => {
    const g = classifyWheel(ev({ deltaY: 900, ctrlKey: true }));
    if (g.kind !== 'zoom') throw new Error('expected zoom');
    expect(g.factor).toBeLessThan(1.5);
  });

  it('pans on a two-finger scroll, so the ground follows the fingers', () => {
    expect(classifyWheel(ev({ deltaX: 4.2, deltaY: -7.5 }))).toEqual({ kind: 'pan', dx: -4.2, dy: 7.5 });
  });

  it('rotates on Shift plus two-finger scroll, on either axis', () => {
    expect(classifyWheel(ev({ deltaX: 10, shiftKey: true })).kind).toBe('rotate');
    expect(classifyWheel(ev({ deltaY: 10, shiftKey: true })).kind).toBe('rotate');
  });

  it('zooms on a notched mouse wheel in pixel mode (Chrome, Safari) and line mode (Firefox)', () => {
    expect(isMouseWheel(ev({ deltaY: 100 }))).toBe(true);
    expect(isMouseWheel(ev({ deltaY: 3, deltaMode: 1 }))).toBe(true);
    expect(classifyWheel(ev({ deltaY: 100 })).kind).toBe('zoom');
    expect(classifyWheel(ev({ deltaY: -3, deltaMode: 1 })).kind).toBe('zoom');
    expect(isMouseWheel(ev({ deltaY: 12.5 }))).toBe(false);
  });

  it('keeps panning when a fast trackpad swipe looks like a mouse notch', () => {
    const c = new WheelClassifier();
    expect(c.classify(ev({ deltaY: 6.25 }), 1000).kind).toBe('pan');
    expect(c.classify(ev({ deltaY: 120 }), 1100).kind).toBe('pan');
    // Long after the trackpad went quiet, a notch is a mouse again.
    expect(c.classify(ev({ deltaY: 120 }), 5000).kind).toBe('zoom');
  });
});
