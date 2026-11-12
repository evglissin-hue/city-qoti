// V2.0: the dab kit's interface (`docs/spec/17-presentation.md`, A painted green world). One helper
// that V2B builds and that near tree crowns, hedges, reeds and ivy all use: small brush-dab
// triangles laid over a set of soft blobs, each dab tinted a little apart, shaded by its blob's soft
// normal (lighter toward the sky), with a few gaps to the boughs, and thinned by the season. The
// dabs are written through the caller's `ShapeBuilder` with surface leaf, so they join the kit's one
// geometry (opaque, no alpha test, no transparency) and keep its attributes.
//
// V2B: built. Each dab is one small, slightly long triangle laid on a blob's surface, its tip hanging
// a little down the slope like a leaf (or up, for reeds, with `lift`), turned and tilted a touch at
// random, and shaded by the soft normal on all three corners (`ShapeBuilder.triN`), so a crown reads
// as one round mass of strokes rather than facets. A dab's corners at its root are a shade darker
// than its tip, so overlapping dabs read as separate strokes up close. Every random draw happens for
// every dab whatever the options, so gaps and thinning only ever remove dabs, in a fixed order. The
// signature is the contract; options are added at the end, never renamed or reordered.
import { Color } from 'three';
import { seeded, type ShapeBuilder, type V3 } from './geometry';
import { SURFACE } from './surface';

/** One soft blob of foliage, in the kit's local space (tiles; y up). */
export interface DabBlob {
  /** The blob's middle. */
  center: V3;
  /** Its radii along x, y and z (an ellipsoid). */
  radii: V3;
  /**
   * Where the soft normal points from: a dab's normal is the direction from this point to the dab,
   * so blobs that share a point (a crown's heart, a hedge's spine) shade as one soft mass. Defaults
   * to `center`.
   */
  normalFrom?: V3;
  /** The blob's base color (sRGB hex, a palette 2.0 foliage swatch). */
  color: number;
}

/** How the dabs are laid. Every value is a plain number, so a kit's key stays a string of them. */
export interface DabOptions {
  /** Dabs over all the blobs together, before gaps and thinning (a near crown: 180 to 320). */
  count: number;
  /** A dab's size in tiles (the side of its triangle). */
  size: number;
  /** How far apart each dab's tint wanders from its blob's color, 0 (none) to 1. */
  tintSpread: number;
  /** How much lighter dabs get toward the sky (normal up), 0 to 1. */
  skyLighten: number;
  /** The share of the blobs' surface left open to show the boughs, 0 to 1. */
  gaps: number;
  /**
   * The season's thinning: 1 is a full crown, 0 bare (dabs thin from Autumn day 4 and are gone in
   * winter). Dabs drop in a fixed order, so a crown thins without reshuffling.
   */
  thin: number;
  /** The random stream's seed (the kit's `opts.seed`), so the same tree gets the same dabs. */
  seed: number;
  /**
   * V2B: which way a dab's tip points along the blob's surface: -1 (the default) hangs it down the
   * slope like a leaf, 1 stands it up like a blade (reeds), 0 turns it any way.
   */
  lift?: number;
  /** V2B: how much longer than wide a dab is (1 by default, a rounder leaf; reeds 2 or more). */
  stretch?: number;
}

/** Hole caps per blob (where `gaps` opens the crown to its boughs). */
const HOLES = 3;
/** Draws per dab from the random stream, whatever the options (so thinning never reshuffles). */
const DRAWS = 12;

const tmp = new Color();
const hsl = { h: 0, s: 0, l: 0 };

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** A color from HSL, as sRGB hex (three's `Color` works in the working color space). */
function hexFromHsl(h: number, s: number, l: number): number {
  return tmp.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0.02, 0.96)).getHex();
}

/**
 * The color a dab of `color` takes where its soft normal has `ny` as its height (1 up, -1 down),
 * before its own wander: lighter, warmer and a touch more saturated toward the sky, deeper below.
 * Far crowns paint their vertices with it, so a far crown carries its near dabs' tints and the
 * swap between the two levels does not pop.
 */
export function dabTint(color: number, ny: number, skyLighten: number): number {
  tmp.setHex(color).getHSL(hsl);
  const up = clamp(ny, -1, 1);
  const l = hsl.l + skyLighten * (up > 0 ? 0.15 : 0.11) * up;
  return hexFromHsl(
    hsl.h - skyLighten * 0.03 * Math.max(0, up),
    hsl.s + skyLighten * 0.08 * up,
    up > 0 ? Math.min(l, lightCap(hsl.l)) : l,
  );
}

/** V2X: the lightest a dab of a swatch of lightness `l` may get: its light tone, never toward white. */
const SKY_REACH = 0.07;
const SKY_CEILING = 0.82;
function lightCap(l: number): number {
  return Math.max(l, Math.min(l + SKY_REACH, SKY_CEILING));
}

/** A tint, held at its swatch's light tone at most (the wander and the sky together never pass it). */
function capLight(hex: number, swatch: number): number {
  tmp.setHex(swatch).getHSL(hsl);
  const cap = lightCap(hsl.l);
  tmp.setHex(hex).getHSL(hsl);
  return hsl.l <= cap ? hex : hexFromHsl(hsl.h, hsl.s, cap);
}

/** Pulls `p` in to just outside the ellipsoid (`center`, `radii`) when it stands further off. */
function hug(p: V3, center: V3, radii: V3): void {
  const ex = (p[0] - center[0]) / radii[0];
  const ey = (p[1] - center[1]) / radii[1];
  const ez = (p[2] - center[2]) / radii[2];
  const e = Math.sqrt(ex * ex + ey * ey + ez * ez);
  if (e <= 1) return;
  const k = 1 / e;
  p[0] = center[0] + (p[0] - center[0]) * k;
  p[1] = center[1] + (p[1] - center[1]) * k;
  p[2] = center[2] + (p[2] - center[2]) * k;
}

/** Probe directions per blob for its exposed share. */
const PROBES = 48;
/** The golden angle, for even spirals over a sphere. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** True when `p` lies well inside a blob other than `self`. */
function buriedIn(blobs: readonly DabBlob[], self: number, p: V3): boolean {
  for (let o = 0; o < blobs.length; o++) {
    if (o === self) continue;
    const ob = blobs[o]!;
    const ex = (p[0] - ob.center[0]) / ob.radii[0];
    const ey = (p[1] - ob.center[1]) / ob.radii[1];
    const ez = (p[2] - ob.center[2]) / ob.radii[2];
    if (ex * ex + ey * ey + ez * ez < 0.78) return true;
  }
  return false;
}

/** About an ellipsoid's surface area over 4 pi, for sharing dabs out between blobs. */
function areaOf(r: V3): number {
  return (r[0] * r[1] + r[1] * r[2] + r[0] * r[2]) / 3;
}

/**
 * Lays brush dabs over `blobs` into `b` with surface leaf and returns how many triangles it wrote.
 * The caller sets `b`'s level and any `glow` beforehand; the helper restores the builder's surface
 * id as it found it.
 */
export function brushDabs(b: ShapeBuilder, blobs: readonly DabBlob[], opts: DabOptions): number {
  if (blobs.length === 0 || opts.count <= 0 || b.silent) return 0;
  const start = b.triangles;
  const surface = b.surfaceId;
  b.surface(SURFACE.leaf);
  const rnd = seeded(Math.floor(opts.seed) * 7919 + 4099);
  const lift = opts.lift ?? -1;
  const stretch = opts.stretch ?? 1;
  const thin = clamp(opts.thin, 0, 1);
  // A spherical cap of half-angle t covers (1 - cos t) / 2 of the sphere: HOLES caps cover `gaps`.
  const holeCos = 1 - (2 * clamp(opts.gaps, 0, 0.9)) / HOLES;
  // Dabs go where they can be seen: each blob's share is its surface not buried in another blob
  // (probed along a fixed spiral), so a crown of overlapping clumps spends its dabs on its outside.
  const exposed = blobs.map((bl, bi) => {
    let open = 0;
    for (let j = 0; j < PROBES; j++) {
      const y = 1 - (2 * (j + 0.5)) / PROBES;
      const k = Math.sqrt(1 - y * y);
      const phi = j * GOLDEN;
      const p: V3 = [
        bl.center[0] + Math.cos(phi) * k * bl.radii[0],
        bl.center[1] + y * bl.radii[1],
        bl.center[2] + Math.sin(phi) * k * bl.radii[2],
      ];
      if (!buriedIn(blobs, bi, p)) open++;
    }
    return open / PROBES;
  });
  let total = 0;
  blobs.forEach((bl, i) => (total += areaOf(bl.radii) * exposed[i]!));
  let carry = 0;
  for (let bi = 0; bi < blobs.length; bi++) {
    const bl = blobs[bi]!;
    const [cx, cy, cz] = bl.center;
    const [rx, ry, rz] = bl.radii;
    const from = bl.normalFrom ?? bl.center;
    // This blob's dabs (its share of the exposed surface, spread over a jittered spiral that also
    // covers the buried part, which is skipped), its hole caps (low on the sides, where the boughs
    // show) and the axis its thinning runs along (so a crown thins in patches, not evenly).
    const want = (opts.count * areaOf(bl.radii) * exposed[bi]!) / Math.max(1e-6, total) + carry;
    const placed = Math.floor(want);
    carry = want - placed;
    const n = placed === 0 ? 0 : Math.ceil(placed / Math.max(0.15, exposed[bi]!));
    const holes: V3[] = [];
    for (let h = 0; h < HOLES; h++) {
      const a = rnd() * Math.PI * 2;
      const y = -0.55 + rnd() * 0.75;
      const k = Math.sqrt(1 - y * y);
      holes.push([Math.cos(a) * k, y, Math.sin(a) * k]);
    }
    const ta = rnd() * Math.PI * 2;
    const thinAxis: V3 = [Math.cos(ta) * 0.8, 0.6, Math.sin(ta) * 0.8];
    let seen = 0;
    for (let i = 0; i < n; i++) {
      const r: number[] = [];
      for (let d = 0; d < DRAWS; d++) r.push(rnd());
      // A direction on a jittered spiral over the sphere (even cover, no clumps), a little sparser
      // underneath (seldom seen from a town builder's camera).
      const t = Math.min(1, Math.max(0, (i + 0.5 + (r[0]! - 0.5) * 0.9) / n));
      const y = 1 - 2 * Math.pow(t, 1.25);
      const phi = i * GOLDEN + (r[1]! - 0.5) * 1.2;
      const k = Math.sqrt(Math.max(0, 1 - y * y));
      const dx = Math.cos(phi) * k;
      const dz = Math.sin(phi) * k;
      // On the surface, some a little proud of it (a soft, broken outline).
      const push = 0.97 + r[4]! * 0.04;
      const px = cx + dx * rx * push;
      const py = cy + y * ry * push;
      const pz = cz + dz * rz * push;
      // Buried inside another blob: nobody would see it.
      if (buriedIn(blobs, bi, [px, py, pz])) continue;
      // The soft normal, from the blob's normal point, lifted a little (light falls in from above).
      let nx = px - from[0];
      let ny = py - from[1] + 0.12 * ry;
      let nz = pz - from[2];
      let nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // A dab on the inner side of a lump (facing back into the mass) is hidden too.
      const ox = dx / rx;
      const oy = y / ry;
      const oz = dz / rz;
      if (ox * nx + oy * ny + oz * nz < -0.05 * Math.sqrt(ox * ox + oy * oy + oz * oz)) continue;
      // The blob's share is spent (the spiral over-covers by the exposed estimate's error). Neither
      // this nor anything above reads the gaps or the thinning, so those only ever remove dabs.
      if (++seen > placed) continue;
      // The order this dab drops in as the season thins the crown: mostly random, a little by side.
      const order =
        r[2]! * 0.72 + 0.28 * (0.5 + 0.5 * (dx * thinAxis[0] + y * thinAxis[1] + dz * thinAxis[2]));
      if (order >= thin) continue;
      let open = false;
      for (const h of holes) {
        const c = dx * h[0] + y * h[1] + dz * h[2];
        if (c > holeCos + (r[3]! - 0.5) * 0.5 * (1 - holeCos)) open = true;
      }
      if (open) continue;
      // The dab's own face: the soft normal tilted a little at random.
      let fx = nx + (r[5]! - 0.5) * 0.12;
      let fy = ny + (r[6]! - 0.5) * 0.12;
      let fz = nz + (r[7]! - 0.5) * 0.12;
      nl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      fx /= nl;
      fy /= nl;
      fz /= nl;
      // Its long axis: down (or up) the slope, turned a little; any way where the face is flat.
      let ax = 0;
      let ay = lift;
      let az = 0;
      const along = ax * fx + ay * fy + az * fz;
      ax -= fx * along;
      ay -= fy * along;
      az -= fz * along;
      let al = Math.sqrt(ax * ax + ay * ay + az * az);
      if (al < 0.25) {
        // Flat on top (or no lift asked): a level direction from the dab's own draw.
        const t = r[8]! * Math.PI * 2;
        const qx = Math.cos(t);
        const qz = Math.sin(t);
        const dq = qx * fx + qz * fz;
        ax = qx - fx * dq;
        ay = -fy * dq;
        az = qz - fz * dq;
        al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      }
      ax /= al;
      ay /= al;
      az /= al;
      // Turn it about the face by up to 40 degrees either way.
      const turn = (r[9]! - 0.5) * 0.8;
      const ct = Math.cos(turn);
      const st = Math.sin(turn);
      const bx = fy * az - fz * ay;
      const by = fz * ax - fx * az;
      const bz = fx * ay - fy * ax;
      const ex = ax * ct + bx * st;
      const ey = ay * ct + by * st;
      const ez = az * ct + bz * st;
      const sx = fy * ez - fz * ey;
      const sy = fz * ex - fx * ez;
      const sz = fx * ey - fy * ex;
      const size = opts.size * (0.8 + r[10]! * 0.45);
      const L = size * stretch;
      // A leaf-shaped dab sits evenly on its spot; a blade (`stretch` given) keeps its long tip.
      const tipK = opts.stretch === undefined ? 0.5 : 0.62;
      const W = size * (opts.stretch === undefined ? 0.62 : 0.5);
      const tip: V3 = [px + ex * L * tipK, py + ey * L * tipK, pz + ez * L * tipK];
      const b0: V3 = [
        px - ex * L * (1 - tipK) + sx * W,
        py - ey * L * (1 - tipK) + sy * W,
        pz - ez * L * (1 - tipK) + sz * W,
      ];
      const b1: V3 = [
        px - ex * L * (1 - tipK) - sx * W,
        py - ey * L * (1 - tipK) - sy * W,
        pz - ez * L * (1 - tipK) - sz * W,
      ];
      // V2X: a hanging dab's corners are laid back down to the blob's surface (they would stand off
      // it, the flat triangle's tip riding proud of a round mass), so the outline stays round.
      if (lift <= 0) for (const c of [tip, b0, b1]) hug(c, bl.center, bl.radii);
      // Its tint: the blob's color, wandering a little, shaded lighter toward the sky.
      tmp.setHex(bl.color).getHSL(hsl);
      const wander = hexFromHsl(
        hsl.h + (r[11]! - 0.5) * 0.07 * opts.tintSpread,
        hsl.s + (r[3]! - 0.5) * 0.18 * opts.tintSpread,
        hsl.l + (r[10]! - 0.5) * 0.12 * opts.tintSpread + (r[4]! - 0.5) * 0.06 * opts.tintSpread,
      );
      const tipHex = capLight(dabTint(wander, ny, opts.skyLighten), bl.color);
      tmp.setHex(tipHex).getHSL(hsl);
      const rootHex = hexFromHsl(hsl.h, hsl.s, hsl.l * 0.9);
      b.triN(tip, b0, b1, [nx, ny, nz], tipHex, rootHex, rootHex, [fx, fy, fz]);
    }
  }
  b.surface(surface);
  return b.triangles - start;
}
