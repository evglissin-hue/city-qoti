// Cached sun shadows (V1D; docs/spec/20-architecture.md, Lean renderer). The shadow map renders only
// when something it shows changed: the sun moved more than about half a degree (the light steps
// every in-game quarter hour), the frustum had to follow the view, the map size changed, or the
// renderer says static content changed. The frustum follows the view with hysteresis (it re-centers
// only once the view target leaves its inner half, grows only when the view no longer fits and
// shrinks only when it is far too big) and its center snaps to whole shadow texels, so a re-render
// for any reason but the sun draws every shadow edge exactly where it was. Moving layers never cast:
// residents keep their own blob shadows (and V1C's blob layer covers animals and carts).
import { Vector3, type DirectionalLight } from 'three';

/** The sun direction may drift this far (radians, about half a degree) before shadows re-render. */
export const SUN_EPSILON = 0.5 * (Math.PI / 180);
/** Half the shadow frustum's width, in tiles, never smaller or larger than these. */
export const MIN_HALF = 18;
export const MAX_HALF = 140;
/** The frustum is fitted this much bigger than the view needs, so a zoom does not refit it at once. */
const SLACK = 1.2;
/** Shrink only once the view needs less than this share of the frustum. */
const SHRINK_BELOW = 0.6;
/** Re-center once the view target is farther than this share of the half width from the center. */
const RECENTER_AT = 0.5;

/** The half width (tiles) the view needs at this camera distance (as the classic engine fitted it). */
export function halfFor(viewDistance: number): number {
  return Math.min(MAX_HALF, Math.max(MIN_HALF, viewDistance * 0.95));
}

const x = new Vector3();
const y = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Snaps `center` to whole texels of a shadow map `size` texels across `2 * half` tiles, in the
 * light's view plane (the light looks along `-sunDir` with the world up, as three's shadow camera
 * does). Depth along the light is left alone: an orthographic map does not care.
 */
export function snapToTexels(center: Vector3, sunDir: Vector3, half: number, size: number, out = new Vector3()): Vector3 {
  x.crossVectors(UP, sunDir);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  y.crossVectors(sunDir, x).normalize();
  const texel = (2 * half) / Math.max(1, size);
  const cx = Math.round(center.dot(x) / texel) * texel;
  const cy = Math.round(center.dot(y) / texel) * texel;
  const cz = center.dot(sunDir);
  return out
    .copy(x)
    .multiplyScalar(cx)
    .addScaledVector(y, cy)
    .addScaledVector(sunDir, cz);
}

export interface ShadowView {
  /** The ground point the camera looks at, and the camera's distance to it. */
  target: Vector3;
  distance: number;
  /** Toward the sun, normalized. */
  sunDir: Vector3;
  /** The shadow map's size in texels. */
  size: number;
}

export class ShadowCache {
  /** Shadow map renders so far (the `?debug` overlay). */
  renders = 0;
  private readonly center = new Vector3(Number.NaN, 0, 0);
  private half = 0;
  private size = 0;
  private readonly sunDir = new Vector3();
  private readonly tmp = new Vector3();
  private readonly snapped = new Vector3();
  private forced = true;
  /** Why the last render happened, for the overlay and tests. */
  reason = '';

  /** Asks for a render on the next chance (quality change, first frame). */
  force(): void {
    this.forced = true;
  }

  /** Whether the frustum has to follow the view (a re-center or a resize). */
  private refit(v: ShadowView): boolean {
    if (Number.isNaN(this.center.x)) return true;
    const want = halfFor(v.distance);
    if (want > this.half || want < this.half * SHRINK_BELOW) return true;
    // Distance from the center in the light's view plane: along the light does not matter.
    const d = this.tmp.copy(v.target).sub(this.center);
    const along = d.dot(v.sunDir);
    d.addScaledVector(v.sunDir, -along);
    return d.length() > this.half * RECENTER_AT;
  }

  /**
   * Why the shadow map must render this frame, or null when the cached one still holds. `content`
   * says static content changed in a way the map should show (the renderer decides when).
   */
  due(v: ShadowView, content: boolean): string | null {
    if (this.forced) return 'forced';
    if (v.size !== this.size) return 'size';
    if (this.sunDir.angleTo(v.sunDir) > SUN_EPSILON) return 'sun';
    if (this.refit(v)) return 'view';
    if (content) return 'content';
    return null;
  }

  /**
   * Places the light and its shadow camera for a render now (call it only on a frame whose scene
   * pass sees the static layers, after `due` said so), and counts the render.
   */
  apply(light: DirectionalLight, v: ShadowView, reason: string): void {
    const refit = this.refit(v) || v.size !== this.size;
    if (refit || this.forced) {
      const want = halfFor(v.distance);
      if (Number.isNaN(this.center.x) || want > this.half || want < this.half * SHRINK_BELOW)
        this.half = Math.min(MAX_HALF * SLACK, want * SLACK);
      this.center.copy(v.target);
    }
    this.size = v.size;
    this.sunDir.copy(v.sunDir);
    const half = this.half;
    const c = snapToTexels(this.center, v.sunDir, half, v.size, this.snapped);
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = half * 4 + 200;
    cam.updateProjectionMatrix();
    light.target.position.copy(c);
    light.position.copy(c).addScaledVector(v.sunDir, half * 2 + 80);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    this.forced = false;
    this.reason = reason;
    this.renders++;
  }

  /** The frustum's current half width, for tests and the overlay. */
  get halfWidth(): number {
    return this.half;
  }
}
