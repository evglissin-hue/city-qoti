import { MAP_SIZE, type MapReader } from '@qoti/sim';
import { MathUtils, type PerspectiveCamera } from 'three';
import { levelY } from '../render/coords';

// Camera rules from docs/spec/17-presentation.md: FOV 30, pitch 30 to 65 (default 45), free yaw,
// distance 12 to 320 tiles, smooth damping, clamped to the valley.
export const FOV = 30;
const PITCH_MIN = MathUtils.degToRad(30);
const PITCH_MAX = MathUtils.degToRad(65);
const DIST_MIN = 12;
const DIST_MAX = 320;
const DAMPING = 12;

interface View {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/**
 * Orbit-style camera around a ground target. Mouse: right-drag rotates, middle-drag pans, wheel
 * zooms. Trackpad: two-finger pan, pinch zoom, Shift+two-finger rotate. Keys: WASD or arrows pan,
 * Q and E rotate, T and G tilt, + and - zoom. Left clicks belong to tools.
 */
export class CameraController {
  private readonly view: View = {
    x: MAP_SIZE / 2,
    z: MAP_SIZE / 2,
    yaw: 0.5,
    pitch: MathUtils.degToRad(45),
    distance: 70,
  };
  private readonly goal: View = { ...this.view };
  private groundY = 0;
  private drag: { mode: 'rotate' | 'pan'; x: number; y: number; id: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly reader: MapReader,
    private readonly el: HTMLElement,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e) => {
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      this.drag = { mode: e.button === 2 ? 'rotate' : 'pan', x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    });
    on(el, 'pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.mode === 'rotate') this.rotateBy(-dx * 0.006, dy * 0.004);
      else this.panByPixels(dx, dy);
    });
    on(el, 'pointerup', (e) => {
      if (this.drag && e.pointerId === this.drag.id) this.drag = null;
    });
    on(el, 'contextmenu', (e) => e.preventDefault());
    on(el, 'auxclick', (e) => e.preventDefault());
    on(
      el,
      'wheel',
      (e) => {
        e.preventDefault();
        const mouseWheel =
          e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
        if (e.ctrlKey) this.zoomBy(Math.exp(e.deltaY * 0.01));
        else if (e.shiftKey) this.rotateBy(-(e.deltaX || e.deltaY) * 0.004, 0);
        else if (mouseWheel)
          this.zoomBy(Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 150) * 0.0018));
        else this.panByPixels(-e.deltaX, -e.deltaY);
      },
      { passive: false },
    );
    on(window, 'keydown', (e) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      this.keys.add(e.key.toLowerCase());
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
  }

  private get worldPerPixel(): number {
    const height = this.el.clientHeight || 1;
    return (2 * this.view.distance * Math.tan(MathUtils.degToRad(FOV / 2))) / height;
  }

  /** Drag the ground: the point under the cursor follows it. */
  panByPixels(dx: number, dy: number): void {
    const s = this.worldPerPixel;
    const forwardScale = s / Math.max(0.5, Math.sin(this.view.pitch));
    const yaw = this.goal.yaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    this.goal.x -= rightX * dx * s - fwdX * dy * forwardScale;
    this.goal.z -= rightZ * dx * s - fwdZ * dy * forwardScale;
    this.clamp();
  }

  rotateBy(dYaw: number, dPitch: number): void {
    this.goal.yaw += dYaw;
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  }

  zoomBy(factor: number): void {
    this.goal.distance = MathUtils.clamp(this.goal.distance * factor, DIST_MIN, DIST_MAX);
  }

  focus(x: number, z: number, distance?: number): void {
    this.goal.x = x;
    this.goal.z = z;
    if (distance !== undefined) this.goal.distance = MathUtils.clamp(distance, DIST_MIN, DIST_MAX);
    this.clamp();
  }

  /** Jumps straight to a view, skipping the animation (first frame, tests). */
  snap(): void {
    Object.assign(this.view, this.goal);
    this.groundY = this.targetGround();
    this.apply();
  }

  private clamp(): void {
    this.goal.x = MathUtils.clamp(this.goal.x, 0, MAP_SIZE);
    this.goal.z = MathUtils.clamp(this.goal.z, 0, MAP_SIZE);
  }

  private targetGround(): number {
    const tx = MathUtils.clamp(Math.floor(this.view.x), 0, MAP_SIZE - 1);
    const tz = MathUtils.clamp(Math.floor(this.view.z), 0, MAP_SIZE - 1);
    return levelY(this.reader.height(tx, tz));
  }

  /** Advances held keys and damping. Returns true while the camera is still moving. */
  update(dt: number): boolean {
    const k = this.keys;
    const pan = this.view.distance * 0.9 * dt;
    const px = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const pz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (px || pz) {
      const yaw = this.goal.yaw;
      this.goal.x += (Math.cos(yaw) * px + Math.sin(yaw) * pz) * pan;
      this.goal.z += (-Math.sin(yaw) * px + Math.cos(yaw) * pz) * pan;
      this.clamp();
    }
    if (k.has('q')) this.rotateBy(1.6 * dt, 0);
    if (k.has('e')) this.rotateBy(-1.6 * dt, 0);
    if (k.has('t')) this.rotateBy(0, 0.9 * dt);
    if (k.has('g')) this.rotateBy(0, -0.9 * dt);
    if (k.has('+') || k.has('=')) this.zoomBy(Math.exp(-1.4 * dt));
    if (k.has('-') || k.has('_')) this.zoomBy(Math.exp(1.4 * dt));

    const a = 1 - Math.exp(-dt * DAMPING);
    const v = this.view;
    const g = this.goal;
    const delta =
      Math.abs(g.x - v.x) +
      Math.abs(g.z - v.z) +
      Math.abs(g.yaw - v.yaw) * 20 +
      Math.abs(g.pitch - v.pitch) * 20 +
      Math.abs(g.distance - v.distance);
    const ground = this.targetGround();
    const groundDelta = Math.abs(ground - this.groundY);
    if (delta < 0.001 && groundDelta < 0.001) return false;
    v.x += (g.x - v.x) * a;
    v.z += (g.z - v.z) * a;
    v.yaw += (g.yaw - v.yaw) * a;
    v.pitch += (g.pitch - v.pitch) * a;
    v.distance += (g.distance - v.distance) * a;
    this.groundY += (ground - this.groundY) * a;
    this.apply();
    return true;
  }

  private apply(): void {
    const v = this.view;
    const horizontal = v.distance * Math.cos(v.pitch);
    this.camera.position.set(
      v.x + Math.sin(v.yaw) * horizontal,
      this.groundY + v.distance * Math.sin(v.pitch),
      v.z + Math.cos(v.yaw) * horizontal,
    );
    this.camera.lookAt(v.x, this.groundY, v.z);
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    for (const fn of this.cleanup) fn();
  }
}
