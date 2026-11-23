// V4B: the ink style of `capture()` (17-presentation.md, Visual direction, second pass, 6: Storybook
// pictures). One offscreen pass a picture, at rest, never per frame: the renderer draws the valley
// into a float target with a depth texture (`captureInk` in renderer.ts), and this pass turns its
// color and depth into an ink-and-wash page:
//
// - lines where the depth breaks (a silhouette, inked on its near side only) or the facing breaks
//   (a crease: the second difference of 1/z, which is zero on any plane seen in perspective, so
//   flat ground and walls stay clean however steeply they recede), thin and warm sepia, wobbling a
//   little as a pen does, lighter with distance;
// - a limited wash: each color drawn toward the nearest of a handful of the palette's watercolor
//   tones (`storybookInk.wash`), its values gathered into soft bands, then laid on the paper as a
//   transparent glaze (multiplied, so the paper shows through the lights);
// - paper grain the pigment settles into, an uneven wash, and soft ragged edges where the picture
//   fades into the page.
//
// Sizes are in "slot pixels" (a 480 x 360 picture is the 240 x 180 CSS slot at 2x): lines, grain
// and wobble scale with the output, so a 1600 x 1200 print reads as the same picture, larger.
import {
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { storybookInk } from '@qoti/art';
import { FULLSCREEN_VERTEX, fullScreenTriangle } from './post';

/** The width the ink's sizes are tuned at (the Pattern Book's slot at 2x). */
export const INK_BASE_WIDTH = 480;

/** Supersampling for a picture of `w` x `h`: small pictures at twice their size, prints at their own. */
export function inkScale(w: number, h: number): 1 | 2 {
  return w * h > 1_000_000 ? 1 : 2;
}

/** sRGB 0 to 1, as the shader's wash works in display values. */
function srgb(hex: number): Vector3 {
  return new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export const INK_FRAGMENT = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uSrc;
  uniform vec2 uOut;
  uniform float uNear;
  uniform float uFar;
  uniform float uFocal;
  uniform float uFocusZ;
  uniform float uExposure;
  uniform float uSlot;
  uniform float uSeed;
  uniform float uNight;
  uniform float uWarmth;
  uniform vec3 uLamp;
  uniform vec3 uPaper;
  uniform vec3 uGrain;
  uniform vec3 uLine;
  uniform vec3 uLineSoft;
  uniform vec3 uSky;
  uniform vec3 uWash[9];
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i + uSeed);
    float b = hash(i + vec2(1.0, 0.0) + uSeed);
    float c = hash(i + vec2(0.0, 1.0) + uSeed);
    float d = hash(i + vec2(1.0, 1.0) + uSeed);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 3.7);
  }

  // Khronos PBR Neutral, as look.ts and the plain capture's CPU copy.
  vec3 neutral(vec3 c) {
    c *= uExposure;
    float x = min(c.r, min(c.g, c.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c -= offset;
    float peak = max(c.r, max(c.g, c.b));
    const float start = 0.76;
    if (peak < start) return c;
    float d = 1.0 - start;
    float np = 1.0 - d * d / (peak + d - start);
    c *= np / peak;
    float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
    return mix(c, vec3(np), g);
  }
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  // 1/z (view distance) at a source uv; 0 where nothing stands (the far plane, the sky).
  float invz(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    if (d >= 1.0) return 0.0;
    float z = uNear * uFar / (uFar - d * (uFar - uNear));
    return 1.0 / z;
  }

  // How much ink one axis asks for, from 1/z at the center and +-d (r source pixels away).
  // A silhouette: a neighbor stands well behind (in world units, and at least a few pixels' worth),
  // inked on the near side only, so lines never double. A crease: the second difference of 1/z made
  // dimensionless (a change of slope, whatever the distance or the picture's size); zero on planes.
  float axisInk(vec2 uv, vec2 d, float r, float wc) {
    float wa = invz(uv + d);
    float wb = invz(uv - d);
    float zc = 1.0 / wc;
    float za = wa > 0.0 ? 1.0 / wa : uFar;
    float zb = wb > 0.0 ? 1.0 / wb : uFar;
    float thr = max(0.35, 5.0 * zc / uFocal);
    float behind = max(za - zc, zb - zc);
    float sil = smoothstep(thr, thr * 2.2, behind);
    float before = max(zc - za, zc - zb);
    float plane = 1.0 - smoothstep(thr * 0.5, thr, max(behind, before));
    float e = (wa + wb - 2.0 * wc) / wc * uFocal / r;
    float crease = smoothstep(0.55, 1.5, abs(e)) * plane;
    return max(sil, crease * 0.8);
  }

  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // The limited wash: the color drawn toward its nearest tones among the palette's nine.
  vec3 washTone(vec3 s) {
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 9; i++) {
      vec3 t = uWash[i];
      // Hue matters more than value here: compare with the value taken out.
      vec3 dv = (s - lum(s)) - (t - lum(t));
      float d2 = dot(dv, dv) * 4.0 + (lum(s) - lum(t)) * (lum(s) - lum(t));
      float w = exp(-d2 / 0.012);
      acc += t * w;
      wsum += w;
    }
    return wsum > 1e-5 ? acc / wsum : s;
  }

  // Values gathered into soft bands, as a painter lays three or four washes.
  float bands(float v) {
    float n = 4.0;
    float x = v * n;
    float f = fract(x);
    return (floor(x) + smoothstep(0.3, 0.7, f)) / n;
  }

  // The pen at one point: silhouettes and creases on four axes, and the faint line round a pane.
  float lineAt(vec2 uv, float r, vec2 srcPx) {
    float w0 = invz(uv);
    if (w0 <= 0.0) return 0.0;
    float line = axisInk(uv, vec2(r, 0.0) * srcPx, r, w0);
    line = max(line, axisInk(uv, vec2(0.0, r) * srcPx, r, w0));
    float rd = r * 0.7071;
    line = max(line, axisInk(uv, vec2(rd, rd) * srcPx, r, w0));
    line = max(line, axisInk(uv, vec2(rd, -rd) * srcPx, r, w0));
    // Panes and doors lie flat in their wall: catch them by their value against the wall's.
    float lx = lum(texture2D(tColor, uv + vec2(r, 0.0) * srcPx).rgb) - lum(texture2D(tColor, uv - vec2(r, 0.0) * srcPx).rgb);
    float ly = lum(texture2D(tColor, uv + vec2(0.0, r) * srcPx).rgb) - lum(texture2D(tColor, uv - vec2(0.0, r) * srcPx).rgb);
    float lc = lum(texture2D(tColor, uv).rgb) + 0.05;
    line = max(line, smoothstep(1.0, 1.8, length(vec2(lx, ly)) / lc) * 0.4);
    // Far things take a fainter line.
    float far = clamp((1.0 / w0) / max(uFocusZ, 1.0), 0.0, 3.0);
    return line * mix(1.0, 0.45, smoothstep(0.9, 2.2, far));
  }

  void main() {
    vec2 px = vUv * uOut;
    float k = uOut.x / ${INK_BASE_WIDTH.toFixed(1)};
    vec2 srcPx = 1.0 / uSrc;
    float scale = uSrc.x / uOut.x;

    // The page: grain at two sizes, and the ragged edge where the picture fades into it.
    vec2 gp = px / k;
    float grain = fbm(gp * 0.55);
    float tooth = vnoise(gp * 1.7);
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y) * uOut.y / uOut.x);
    float ragged = 0.035 + 0.03 * fbm(vUv * vec2(9.0, 7.0) + 3.0);
    float inside = smoothstep(ragged * 0.35, ragged, edge);

    // The color, tone mapped to display values (the source is linear light).
    vec4 src = texture2D(tColor, vUv);
    vec3 s = toSrgb(neutral(src.rgb));
    bool sky = invz(vUv) <= 0.0;

    // Wash: hue drawn well toward the palette and softened, values lifted into a watercolor's high
    // key and gathered into soft bands (a painter's three or four washes), shadows leaning to umber.
    float L = lum(s);
    vec3 hue = mix(s, washTone(s), 0.68);
    float lift = mix(0.36 + 0.66 * pow(L, 0.8), 0.14 + 0.95 * pow(L, 0.7), uNight);
    float target = bands(clamp(lift, 0.0, 0.96));
    // Lift the value without blowing up the chroma: what the hue cannot carry is laid as paper tone.
    float gain = min(target / max(lum(hue), 0.02), 2.2);
    vec3 tone = hue * gain + (target - lum(hue) * gain);
    // A limited wash: no hot colors, softer still by night.
    vec3 chroma = tone - lum(tone);
    float cap = mix(0.24, 0.14, uNight);
    tone = lum(tone) + chroma * 0.95 * min(1.0, cap / max(length(chroma), 1e-4));
    tone = mix(tone, tone * uWash[7] / lum(uWash[7]), (1.0 - target) * 0.3);
    // The hour's glaze: a warm one at golden hour; by night a blue-grey wash over all but the lamps.
    tone = mix(tone, tone * vec3(1.14, 1.0, 0.8), clamp(uWarmth, 0.0, 1.0) * 0.7);
    float lamp = smoothstep(0.16, 0.42, L) * smoothstep(0.03, 0.14, s.r - s.b) * uNight;
    vec3 moon = tone * uWash[4] / lum(uWash[4]);
    tone = mix(tone, mix(moon, tone, 0.35), uNight * (1.0 - lamp));
    tone = mix(tone, mix(tone, uLamp, 0.5), lamp);
    // Glaze over the paper: laid unevenly (a wash pools and thins), the paper showing through, and
    // darker where the pigment settles into the grain.
    vec3 T = clamp(tone / uPaper, 0.0, 1.0);
    float bleed = fbm(gp * 0.04 + 11.0);
    float density = (0.72 + 0.28 * smoothstep(0.15, 0.85, bleed)) * inside;
    vec3 col = uPaper * mix(vec3(1.0), T, density);
    float pool = (1.0 - lum(T)) * density;
    col *= 1.0 - 0.16 * pool * (tooth - 0.4);
    if (sky) {
      float up = smoothstep(0.35, 1.0, vUv.y);
      col = uPaper * mix(vec3(1.0), uSky / uPaper, 0.35 * up * inside * (0.7 + 0.3 * bleed));
    }

    // Lines: a pen that wobbles a little and presses unevenly, taken at four points a pixel so its
    // edges are soft.
    vec2 wob = (vec2(vnoise(gp * 0.06 + 1.3), vnoise(gp * 0.06 + 8.9)) - 0.5) * 1.3 * k;
    vec2 uv = vUv + wob / uOut;
    float r = 0.8 * k * scale;
    vec2 q = 0.25 / uOut;
    float line = 0.25 * (lineAt(uv + vec2(-q.x, -q.y), r, srcPx) + lineAt(uv + vec2(q.x, -q.y), r, srcPx)
      + lineAt(uv + vec2(-q.x, q.y), r, srcPx) + lineAt(uv + vec2(q.x, q.y), r, srcPx));
    float press = 0.72 + 0.28 * vnoise(gp * 0.09 + 4.2);
    line *= press * inside;
    vec3 pen = mix(uLine, uLineSoft, 0.35 * (1.0 - press));
    col = mix(col, pen, clamp(line, 0.0, 1.0) * 0.85);

    // The paper's own grain over everything.
    col *= mix(vec3(1.0), uGrain / uPaper, 0.22 * (grain - 0.3));
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

/** What the ink pass needs to know about the capture it inks. */
export interface InkInputs {
  color: Texture;
  depth: Texture;
  /** The source's size in pixels (the output times `inkScale`). */
  src: [number, number];
  near: number;
  far: number;
  /** The capture camera's vertical field of view, degrees. */
  fov: number;
  /** The distance from the camera to the picture's focus (lines fade beyond it). */
  focusZ: number;
  exposure: number;
  /** Varies the paper and the pen from picture to picture (any number; the same number, the same page). */
  seed: number;
  /** The hour's night (0 by day, 1 at full night) and golden warmth, from `lightingAt`. */
  night?: number;
  warmth?: number;
}

/** The ink pass: one fullscreen triangle into the caller's target. */
export class InkPass {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: ShaderMaterial;

  constructor() {
    const wash = storybookInk.wash.map((h) => srgb(h));
    this.material = new ShaderMaterial({
      name: 'InkPass',
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: INK_FRAGMENT,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uSrc: { value: new Vector2(1, 1) },
        uOut: { value: new Vector2(1, 1) },
        uNear: { value: 1 },
        uFar: { value: 100 },
        uFocal: { value: 1 },
        uFocusZ: { value: 1 },
        uExposure: { value: 1 },
        uSlot: { value: 1 },
        uSeed: { value: 0 },
        uNight: { value: 0 },
        uWarmth: { value: 0 },
        uLamp: { value: srgb(storybookInk.lampPool) },
        uPaper: { value: srgb(storybookInk.paper) },
        uGrain: { value: srgb(storybookInk.paperGrain) },
        uLine: { value: srgb(storybookInk.line) },
        uLineSoft: { value: srgb(storybookInk.lineSoft) },
        uSky: { value: srgb(storybookInk.sky) },
        uWash: { value: wash },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(fullScreenTriangle(), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Inks `inp` into `out` (an 8-bit target the size of the picture). */
  render(three: WebGLRenderer, inp: InkInputs, out: WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tColor!.value = inp.color;
    u.tDepth!.value = inp.depth;
    (u.uSrc!.value as Vector2).set(inp.src[0], inp.src[1]);
    (u.uOut!.value as Vector2).set(out.width, out.height);
    u.uNear!.value = inp.near;
    u.uFar!.value = inp.far;
    u.uFocal!.value = inp.src[1] / (2 * Math.tan((inp.fov * Math.PI) / 360));
    u.uFocusZ!.value = inp.focusZ;
    u.uExposure!.value = inp.exposure;
    u.uSeed!.value = (Math.abs(inp.seed) % 97) * 1.37;
    u.uNight!.value = inp.night ?? 0;
    u.uWarmth!.value = inp.warmth ?? 0;
    const prev = three.getRenderTarget();
    three.setRenderTarget(out);
    three.render(this.scene, this.camera);
    three.setRenderTarget(prev);
  }

  dispose(): void {
    this.material.dispose();
    for (const o of this.scene.children) (o as Mesh).geometry.dispose();
  }
}

/** Render layers an ink picture leaves out: the interface's marks, and the meadow's tufts and flowers. */
export const INK_LEAVES_OUT: readonly string[] = ['ghosts', 'meadow', 'notes', 'overlays', 'presence'];
