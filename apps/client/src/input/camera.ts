import { MAP_SIZE, type MapReader } from '@qoti/sim';
import { MathUtils, Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { levelY } from '../render/coords';
import { WheelClassifier } from './gesture';

// Camera rules from docs/spec/17-presentation.md: FOV 30, pitch 30 to 65 (default 45), free yaw,
// distance 12 to 320 tiles, smooth damping, clamped to the valley.
export const FOV = 30;
const PLAY = {
  pitchMin: MathUtils.degToRad(30),
  pitchMax: MathUtils.degToRad(65),
  distMin: 12,
  distMax: 320,
  margin: 0,
};
// C5E: photo mode's free camera, beyond the play clamp (17-presentation.md, Camera).
const FREE = {
  pitchMin: MathUtils.degToRad(8),
  pitchMax: MathUtils.degToRad(85),
  distMin: 3,
  distMax: 420,
  margin: 48,
};
let limits = PLAY;
/** C5E: photo mode lifts the play clamp (pitch, distance and the valley's edge); off restores it. */
export function setFreeCamera(on: boolean): void {
  limits = on ? FREE : PLAY;
}
// Critically damped smoothing times in seconds: hands-on input settles fast, a focus glides.
const SMOOTH_INPUT = 0.16;
const SMOOTH_FOCUS = 0.42;
const SMOOTH_REDUCED = 0.04;
/**
 * V4C: a tea break's glide (`setDrift`): long enough that following a resident looks like a slow
 * walk beside them and the move from the player's view to the busiest place takes a few seconds.
 */
export const SMOOTH_DRIFT = 1.6;
/** V4C: a tea break circles at the play camera's default pitch, inside the play clamp. */
export const ORBIT_PITCH = MathUtils.degToRad(45);
/** V4C: a tea break never circles faster than a full turn in a minute. */
const ORBIT_MAX_SPEED = (2 * Math.PI) / 60;

/**
 * V4C: the pose a tea break's circle asks for, kept inside the play clamp whatever it is given (a
 * pitch of 45 degrees and a distance from 12 to 320 tiles, so the camera sits above the roofs and
 * never inside a wall), and its speed kept slow. Pure, for tests.
 */
export function orbitGoal(around: CameraOrbit): {
  x: number;
  z: number;
  pitch: number;
  distance: number;
  speed: number;
} {
  return {
    x: MathUtils.clamp(around.x, 0, MAP_SIZE),
    z: MathUtils.clamp(around.z, 0, MAP_SIZE),
    pitch: MathUtils.clamp(ORBIT_PITCH, PLAY.pitchMin, PLAY.pitchMax),
    distance: MathUtils.clamp(around.distance, PLAY.distMin, PLAY.distMax),
    speed: MathUtils.clamp(
      Number.isFinite(around.speed) ? around.speed : 0,
      -ORBIT_MAX_SPEED,
      ORBIT_MAX_SPEED,
    ),
  };
}

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

/**
 * V4.0: a camera pose to put back exactly (tea-break mode keeps the player's view while it drifts,
 * and any input restores it): the ground point looked at, yaw and pitch in radians, the distance.
 */
export type CameraView = View;

/** V4.0: what tea-break mode's camera circles (V4C): a ground point, at a distance, once a while. */
export interface CameraOrbit {
  x: number;
  z: number;
  distance: number;
  /** Radians a second; tea-break mode keeps it slow (V4C tunes it). */
  speed: number;
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
  /** V4C: a tea break's slow glide is on. */
  private drift = false;
  /** V4C: the tea break's circle, while it turns. */
  private around: ReturnType<typeof orbitGoal> | null = null;
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

  /** Where the camera looks, for the ambience (C5G): ground focus, yaw and distance. */
  get look(): { x: number; z: number; yaw: number; distance: number } {
    const v = this.view;
    return { x: v.x, z: v.z, yaw: v.yaw, distance: v.distance };
  }

  private get worldPerPixel(): number {
    const height = this.el.clientHeight || 1;
    return (2 * this.view.distance * Math.tan(MathUtils.degToRad(FOV / 2))) / height;
  }

  /** Drag the ground: the point under the cursor follows it. */
  panByPixels(dx: number, dy: number): void {
    this.smooth = SMOOTH_INPUT;
    this.around = null;
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
    this.around = null;
    this.goal.yaw += dYaw;
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + dPitch, limits.pitchMin, limits.pitchMax);
  }

  zoomBy(factor: number): void {
    this.smooth = SMOOTH_INPUT;
    this.around = null;
    this.goal.distance = MathUtils.clamp(this.goal.distance * factor, limits.distMin, limits.distMax);
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

  /**
   * Glides to a spot (go to partner, inspector links). Instant when motion is reduced. V4C: an
   * optional pitch (radians, kept inside the clamp) for the tea break's follow.
   */
  focus(x: number, z: number, distance?: number, pitch?: number): void {
    // V4C: while a tea break drifts, a follow glides slowly, like a walk beside the resident.
    this.smooth = this.drift ? SMOOTH_DRIFT : SMOOTH_FOCUS;
    this.around = null;
    this.goal.x = x;
    this.goal.z = z;
    if (distance !== undefined)
      this.goal.distance = MathUtils.clamp(distance, limits.distMin, limits.distMax);
    if (pitch !== undefined) this.goal.pitch = MathUtils.clamp(pitch, limits.pitchMin, limits.pitchMax);
    this.clamp();
    if (this.reducedMotion) {
      Object.assign(this.view, this.goal);
      for (const f of FIELDS) this.vel[f].v = 0;
    }
  }

  /** V4.0: the view the camera is settling on (its goal), to put back after a tea break. */
  saveView(): CameraView {
    return { ...this.goal };
  }

  /**
   * V4.0: puts a saved view back exactly: the goal and the shown view both, at once (any input during
   * a tea break restores the view where it was; no glide back, so nothing lands a pixel off).
   */
  restoreView(v: CameraView): void {
    this.around = null;
    this.drift = false;
    this.smooth = SMOOTH_INPUT;
    Object.assign(this.goal, v);
    this.snap();
  }

  /**
   * V4.0, built by V4C: tea-break mode's slow circle about a point, or null to stop (the view stays
   * where the circle left it). The circle's center, distance and the play camera's 45 degree pitch
   * are the goal (inside the play clamp, `orbitGoal`), the yaw turns at `speed`, and the camera eases
   * onto it with the drift's long glide. Any hands-on move, a `focus` or a `restoreView` ends it.
   * With reduced motion the circle holds still (V4C's host never asks for one then).
   */
  orbit(around: CameraOrbit | null): void {
    if (!around) {
      this.around = null;
      return;
    }
    const o = orbitGoal(around);
    this.smooth = this.drift ? SMOOTH_DRIFT : SMOOTH_FOCUS;
    this.goal.x = o.x;
    this.goal.z = o.z;
    this.goal.pitch = o.pitch;
    this.goal.distance = o.distance;
    this.around = o;
  }

  /** V4C: whether a tea break's circle is turning. */
  get orbiting(): boolean {
    return this.around !== null;
  }

  /**
   * V4.0, built by V4C: tea-break mode's slow glide: while it is on, `focus` and `orbit` ease with
   * `SMOOTH_DRIFT` instead of the interface's quicker glide. Off goes back to the hands-on glide.
   */
  setDrift(on: boolean): void {
    this.drift = on;
    this.smooth = on ? SMOOTH_DRIFT : SMOOTH_INPUT;
  }

  /** Jumps straight to a view, skipping the animation (first frame, tests). */
  snap(): void {
    Object.assign(this.view, this.goal);
    for (const f of FIELDS) this.vel[f].v = 0;
    this.groundY = this.targetGround();
    this.apply();
  }

  private clamp(): void {
    this.goal.x = MathUtils.clamp(this.goal.x, -limits.margin, MAP_SIZE + limits.margin);
    this.goal.z = MathUtils.clamp(this.goal.z, -limits.margin, MAP_SIZE + limits.margin);
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
    // V4C: the tea break's circle turns the goal's yaw; the drift's glide follows it round.
    if (this.around && !this.reducedMotion) this.goal.yaw += this.around.speed * Math.min(dt, 0.1);

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
