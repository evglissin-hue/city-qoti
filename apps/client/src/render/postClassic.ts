// The classic post chain (before V1D), kept behind `?engine=classic` until V1X so both engines can
// be measured on the same build (docs/build/cycle-v1d-lean-renderer.md). The game draws with the
// lean frame graph in post.ts; V1X deletes this file.
import {
  HalfFloatType,
  RawShaderMaterial,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';
import {
  applyGrade,
  bloomFor,
  LOOK_BLOOM_RADIUS,
  LOOK_GLSL,
  lookUniforms,
  tiltFor,
  type GradeSeason,
  type LookUniforms,
} from './look';

export type { GradeSeason } from './look';

const PASS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A 9-tap tilt-shift blur along one axis, scaled by the look's mask (as three's tilt shaders). */
function tiltFragment(axis: 'x' | 'y'): string {
  const at = (k: string): string =>
    axis === 'x' ? `vec2(vUv.x ${k} * hh, vUv.y)` : `vec2(vUv.x, vUv.y ${k} * hh)`;
  const taps: [string, string][] = [
    ['- 4.0', '0.051'],
    ['- 3.0', '0.0918'],
    ['- 2.0', '0.12245'],
    ['- 1.0', '0.1531'],
    ['', '0.1633'],
    ['+ 1.0', '0.1531'],
    ['+ 2.0', '0.12245'],
    ['+ 3.0', '0.0918'],
    ['+ 4.0', '0.051'],
  ];
  return /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float h;
    ${LOOK_GLSL}
    varying vec2 vUv;
    void main() {
      vec4 sum = vec4(0.0);
      float hh = h * lookTiltMask(vUv);
      ${taps
        .map(([k, w]) =>
          k
            ? `sum += texture2D(tDiffuse, ${at(k)}) * ${w};`
            : `sum += texture2D(tDiffuse, vec2(vUv.x, vUv.y)) * ${w};`,
        )
        .join('\n      ')}
      gl_FragColor = sum;
    }
  `;
}

/** Tone mapping and sRGB, as three's OutputPass does, through the look's operator. */
const OUTPUT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  ${LOOK_GLSL}
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
    gl_FragColor.rgb = lookToneMap(gl_FragColor.rgb);
    gl_FragColor = lookSrgb(gl_FragColor);
  }
`;

/** The seasonal grade and the vignette on display colors, last. */
const GRADE_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  ${LOOK_GLSL}
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(lookGrade(c.rgb) * lookVignette(vUv), c.a);
  }
`;

/**
 * The classic Medium and High post: gentle bloom (high threshold, so mostly lit windows and flames at night),
 * a tilt-shift that keeps the middle band sharp and grows softer as the camera pulls back, tone
 * mapping, then the seasonal grade with a soft vignette. The passes share one set of look uniforms.
 */
export class PostChain {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hTilt: ShaderPass;
  private readonly vTilt: ShaderPass;
  private readonly look: LookUniforms = lookUniforms();
  private tilt = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
  ) {
    const size = renderer.getSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size.clone(), 0.35, LOOK_BLOOM_RADIUS, 0.92);
    this.composer.addPass(this.bloom);
    const pass = (name: string, fragmentShader: string, extra: Record<string, { value: unknown }> = {}) =>
      new ShaderPass(
        new ShaderMaterial({
          name,
          uniforms: { tDiffuse: { value: null }, ...extra, ...this.look },
          vertexShader: PASS_VERTEX,
          fragmentShader,
        }),
      );
    this.hTilt = pass('LookTiltX', tiltFragment('x'), { h: { value: 0 } });
    this.vTilt = pass('LookTiltY', tiltFragment('y'), { h: { value: 0 } });
    this.composer.addPass(this.hTilt);
    this.composer.addPass(this.vTilt);
    this.composer.addPass(
      new ShaderPass(
        new RawShaderMaterial({
          name: 'LookOutput',
          uniforms: { tDiffuse: { value: null }, ...this.look },
          vertexShader: OutputShader.vertexShader,
          fragmentShader: OUTPUT_FRAGMENT,
        }),
      ),
    );
    this.composer.addPass(pass('LookGrade', GRADE_FRAGMENT));
    this.setSeason('spring');
    this.setSize(size.x, size.y, renderer.getPixelRatio());
  }

  /** Bloom grows a little at night so windows and lanterns glow without washing out the day. */
  setNight(night: number): void {
    const b = bloomFor(night);
    this.bloom.strength = b.strength;
    this.bloom.threshold = b.threshold;
    this.look.uLookBloomStrength.value = b.strength;
    this.look.uLookBloomThreshold.value = b.threshold;
  }

  private season: GradeSeason = 'spring';
  private warmth = 0;

  /** C3D-1: the seasonal grade hook (Spring only until a season pass). */
  setSeason(season: GradeSeason): void {
    this.season = season;
    applyGrade(this.look, this.season, this.warmth);
  }

  /** C3D-1: dusk and dawn split toning, 0 to 1: rose highlights and violet shadows. */
  setWarmth(w: number): void {
    if (Math.abs(w - this.warmth) < 0.005) return;
    this.warmth = w;
    applyGrade(this.look, this.season, this.warmth);
  }

  /** Tilt-shift strength from the camera distance (look.ts); at zero the two passes are skipped. */
  setViewDistance(distance: number): void {
    const k = tiltFor(distance);
    if (Math.abs(k - this.tilt) < 0.02) return;
    this.tilt = k;
    this.applyTilt();
  }

  private applyTilt(): void {
    this.hTilt.enabled = this.vTilt.enabled = this.tilt > 0.02;
    (this.hTilt.uniforms.h as { value: number }).value = (1.5 * this.tilt) / (this.width * this.pixelRatio);
    (this.vTilt.uniforms.h as { value: number }).value = (1.5 * this.tilt) / (this.height * this.pixelRatio);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.applyTilt();
  }

  render(): void {
    // Exposure follows the light (renderer.toneMappingExposure), as three's OutputPass read it.
    this.look.uLookExposure.value = this.renderer.toneMappingExposure;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
