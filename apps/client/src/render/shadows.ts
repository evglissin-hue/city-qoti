// Cached sun shadows (V1D; docs/spec/20-architecture.md, Lean renderer). The shadow map renders only
// when something it shows changed: the sun moved more than about half a degree (the light steps
// every in-game quarter hour), the frustum had to follow the view, the map size changed, or the
// renderer says static content changed. The frustum follows the view with hysteresis (it re-centers
// only once the view target leaves its inner half, grows only when the view no longer fits and
// shrinks only when it is far too big) and its center snaps to whole shadow texels, so a re-render
// for any reason but the sun draws every shadow edge exactly where it was. Moving layers never cast:
// residents keep their own blob shadows (and V1C's blob layer covers animals and carts).
//
// V4A: each sample of the developing picture at rest (refine.ts) lights the static layers from a
// direction of its own, the sun moved inside its disc or a part of the sky, and renders a shadow
// map for it: a second map of the same size (`SampleSun`), so the cached one, which moving layers
// still receive, stays exactly as it was. The sample's frustum is the cached one's (center and
// size), snapped to whole texels in the sample direction's own plane, so every rest draws the same
// soft shadows and nothing swims.
import { Vector3, type DirectionalLight, type DirectionalLightShadow } from 'three';

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
export function snapToTexels(
  center: Vector3,
  sunDir: Vector3,
  half: number,
  size: number,
  out = new Vector3(),
): Vector3 {
  x.crossVectors(UP, sunDir);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  y.crossVectors(sunDir, x).normalize();
  const texel = (2 * half) / Math.max(1, size);
  const cx = Math.round(center.dot(x) / texel) * texel;
  const cy = Math.round(center.dot(y) / texel) * texel;
  const cz = center.dot(sunDir);
  return out.copy(x).multiplyScalar(cx).addScaledVector(y, cy).addScaledVector(sunDir, cz);
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

  /**
   * V4A: places `light` and its shadow camera (the sample's shadow, swapped in by `SampleSun`) for
   * one sample lit from `dir`: the cached frustum's center and size, snapped to texels of a map
   * `size` across in `dir`'s own plane. Not a render of the cached map (`renders` stays). False
   * before the first render, when there is no frustum to follow.
   */
  placeSample(
    light: DirectionalLight,
    dir: Vector3,
    size: number,
    fit?: { center: Vector3; half: number },
  ): boolean {
    if (!fit && (Number.isNaN(this.center.x) || this.half <= 0)) return false;
    const half = fit ? fit.half : this.half;
    const c = snapToTexels(fit ? fit.center : this.center, dir, half, size, this.sampleCenter);
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = half * 4 + 200;
    cam.updateProjectionMatrix();
    light.target.position.copy(c);
    light.position.copy(c).addScaledVector(dir, half * 2 + 80);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
    return true;
  }

  private readonly sampleCenter = new Vector3();
}

/**
 * V4A: `dir` (toward the sun, unit) turned by `p`, a point of the unit disc, scaled to `radius`
 * radians: where the sun sits inside its disc for one sample.
 */
export function discDirection(
  dir: Vector3,
  p: readonly [number, number],
  radius: number,
  out = new Vector3(),
): Vector3 {
  const a = new Vector3().crossVectors(UP, dir);
  if (a.lengthSq() < 1e-8) a.set(1, 0, 0);
  a.normalize();
  const b = new Vector3().crossVectors(dir, a).normalize();
  const t = Math.tan(radius);
  return out
    .copy(dir)
    .addScaledVector(a, p[0] * t)
    .addScaledVector(b, p[1] * t)
    .normalize();
}

/** V4A: from this view distance (tiles) a sample's shadow map is coarser (`sampleShadowSize`). */
export const FAR_SAMPLE_VIEW = 90;

/**
 * V4A (V3's far-camera list): a sample's shadow map size. On far views the shadow pass covers much
 * of the valley and the sun's disc already softens every edge by more than a texel, so each
 * sample's map is half the cached one's (never under 1024): a quarter of the texels to fill, and
 * the cached map, which moving layers receive, keeps its size.
 */
export function sampleShadowSize(plain: number, viewDistance: number): number {
  return viewDistance >= FAR_SAMPLE_VIEW ? Math.max(1024, Math.min(plain, plain / 2)) : plain;
}

/**
 * V4A: lights one sample of the development from a direction of its own with a shadow map of its
 * own, then puts the light back. `begin` swaps the light's shadow for the sample's (the same size,
 * bias and filter: no shader changes) and places both; `end` swaps the cached shadow back and
 * returns the light where `ShadowCache.apply` left it.
 */
export class SampleSun {
  private shadow: DirectionalLightShadow | null = null;
  private plain: DirectionalLightShadow | null = null;
  private readonly position = new Vector3();
  private readonly target = new Vector3();

  /**
   * Swaps in the sample's shadow and places it for `dir`, its filter `radius` texels wide and its
   * map `mapSize` across (the cached one's by default); false (nothing changed) if it cannot.
   * V4X: `fit` puts the frustum about a capture's own aim (`center`, `half` in tiles) instead of
   * following the main view, so a capture of somewhere else gets its own soft shadows.
   */
  begin(
    light: DirectionalLight,
    cache: ShadowCache,
    dir: Vector3,
    radius?: number,
    mapSize?: number,
    fit?: { center: Vector3; half: number },
  ): boolean {
    if (this.plain) return false;
    const plain = light.shadow;
    const size = mapSize ?? plain.mapSize.x;
    if (!this.shadow || this.shadow.mapSize.x !== size || this.shadow.mapSize.y !== size) {
      this.shadow?.dispose();
      this.shadow = plain.clone();
      this.shadow.mapSize.set(size, size);
    }
    const s = this.shadow;
    s.bias = plain.bias;
    s.normalBias = plain.normalBias;
    s.radius = radius ?? plain.radius;
    this.position.copy(light.position);
    this.target.copy(light.target.position);
    light.shadow = s;
    if (!cache.placeSample(light, dir, size, fit)) {
      light.shadow = plain;
      return false;
    }
    this.plain = plain;
    return true;
  }

  /** The cached shadow back on the light, and the light back where it was. */
  end(light: DirectionalLight): void {
    if (!this.plain) return;
    light.shadow = this.plain;
    this.plain = null;
    light.position.copy(this.position);
    light.target.position.copy(this.target);
    light.target.updateMatrixWorld();
    light.updateMatrixWorld();
  }

  dispose(): void {
    this.shadow?.dispose();
    this.shadow = null;
  }
}
