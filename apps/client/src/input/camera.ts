import { MAP_SIZE, type MapReader } from '@qoti/sim';
import { MathUtils, Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { levelY } from '../render/coords';
import { WheelClassifier } from './gesture';

// Camera rules from docs/spec/17-presentation.md: FOV 30, pitch 30 to 65 (default 45), free yaw,
// distance 12 to 320 tiles, smooth damping, clamped to the valley.
export const FOV = 30;
const PITCH_MIN = MathUtils.degToRad(30);
const PITCH_MAX = MathUtils.degToRad(65);
const DIST_MIN = 12;
const DIST_MAX = 320;
// Critically damped smoothing times in seconds: hands-on input settles fast, a focus glides.
const SMOOTH_INPUT = 0.16;
const SMOOTH_FOCUS = 0.42;
const SMOOTH_REDUCED = 0.04;

type Field = 'x' | 'z' | 'yaw' | 'pitch' | 'distance';
const FIELDS: readonly Field[] = ['x', 'z', 'yaw', 'pitch', 'distance'];

/**
 * One step of a critically damped spring toward `target` (the SmoothDamp closed form). Smooth
 * start, no overshoot, frame rate independent. Returns the new value; writes the new velocity.
 */
export function smoothDamp(
  current: number,
  target: number,
  vel: { v: number },
  smoothTime: number,
  dt: number,
): number {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * decay;
  return target + (change + temp) * decay;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

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
  private readonly vel: Record<Field, { v: number }> = {
    x: { v: 0 },
    z: { v: 0 },
    yaw: { v: 0 },
    pitch: { v: 0 },
    distance: { v: 0 },
  };
  private readonly groundVel = { v: 0 };
  private smooth = SMOOTH_INPUT;
  private readonly wheel = new WheelClassifier();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private gestureScale = 1;
  /** Follows `prefers-reduced-motion`; the settings panel may also set it. */
  reducedMotion = prefersReducedMotion();
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
      // Shift+right-drag pans too, for mice without a middle button.
      const mode = e.button === 2 && !e.shiftKey ? 'rotate' : 'pan';
      this.drag = { mode, x: e.clientX, y: e.clientY, id: e.pointerId };
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
        const g = this.wheel.classify(e, performance.now());
        if (g.kind === 'zoom') this.zoomAt(g.factor, e.clientX, e.clientY);
        else if (g.kind === 'rotate') this.rotateBy(g.dYaw, 0);
        else this.panByPixels(g.dx, g.dy);
      },
      { passive: false },
    );
    // Safari reports trackpad pinches as gesture events instead of ctrl+wheel.
    const gesture = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      const scale = g.scale ?? 1;
      if (e.type === 'gesturestart') this.gestureScale = scale;
      else if (scale > 0) {
        const r = el.getBoundingClientRect();
        this.zoomAt(
          this.gestureScale / scale,
          g.clientX ?? r.left + r.width / 2,
          g.clientY ?? r.top + r.height / 2,
        );
        this.gestureScale = scale;
      }
    };
    for (const type of ['gesturestart', 'gesturechange']) {
      el.addEventListener(type, gesture, { passive: false });
      this.cleanup.push(() => el.removeEventListener(type, gesture));
    }
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
    this.smooth = SMOOTH_INPUT;
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
    this.smooth = SMOOTH_INPUT;
    this.goal.yaw += dYaw;
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  }

  zoomBy(factor: number): void {
    this.smooth = SMOOTH_INPUT;
    this.goal.distance = MathUtils.clamp(this.goal.distance * factor, DIST_MIN, DIST_MAX);
  }

  /** Zooms toward (or away from) the ground point under the cursor, so it stays put. */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const before = this.goal.distance;
    this.zoomBy(factor);
    const ratio = this.goal.distance / before;
    const p = this.groundAt(clientX, clientY);
    if (!p || ratio === 1) return;
    this.goal.x = p.x + (this.goal.x - p.x) * ratio;
    this.goal.z = p.z + (this.goal.z - p.z) * ratio;
    this.clamp();
  }

  /** The point on the ground plane under a canvas pixel, if the ray reaches it. */
  private groundAt(clientX: number, clientY: number): Vector3 | null {
    const r = this.el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -this.groundY;
    const p = this.ray.ray.intersectPlane(this.plane, this.hit);
    if (!p) return null;
    const far = this.view.distance * 6;
    if (Math.abs(p.x - this.view.x) > far || Math.abs(p.z - this.view.z) > far) return null;
    return p;
  }

  /** Glides to a spot (go to partner, inspector links). Instant when motion is reduced. */
  focus(x: number, z: number, distance?: number): void {
    this.smooth = SMOOTH_FOCUS;
    this.goal.x = x;
    this.goal.z = z;
    if (distance !== undefined) this.goal.distance = MathUtils.clamp(distance, DIST_MIN, DIST_MAX);
    this.clamp();
    if (this.reducedMotion) {
      Object.assign(this.view, this.goal);
      for (const f of FIELDS) this.vel[f].v = 0;
    }
  }

  /** Jumps straight to a view, skipping the animation (first frame, tests). */
  snap(): void {
    Object.assign(this.view, this.goal);
    for (const f of FIELDS) this.vel[f].v = 0;
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
      this.smooth = SMOOTH_INPUT;
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

    const v = this.view;
    const g = this.goal;
    const delta =
      Math.abs(g.x - v.x) +
      Math.abs(g.z - v.z) +
      Math.abs(g.yaw - v.yaw) * 20 +
      Math.abs(g.pitch - v.pitch) * 20 +
      Math.abs(g.distance - v.distance);
    const speed = FIELDS.reduce((sum, f) => sum + Math.abs(this.vel[f].v), 0);
    const ground = this.targetGround();
    const groundDelta = Math.abs(ground - this.groundY);
    if (delta < 0.001 && speed < 0.001 && groundDelta < 0.001) {
      for (const f of FIELDS) this.vel[f].v = 0;
      return false;
    }
    const smooth = this.reducedMotion ? SMOOTH_REDUCED : this.smooth;
    const step = Math.min(dt, 0.1);
    for (const f of FIELDS) v[f] = smoothDamp(v[f], g[f], this.vel[f], smooth, step);
    this.groundY = smoothDamp(this.groundY, ground, this.groundVel, SMOOTH_FOCUS, step);
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
