import {
  HalfFloatType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';

/**
 * C3D-1 seasonal grade, applied last on display colors: lift (shadows), gamma (mids) and gain
 * (highlights) per channel, plus saturation. Spring is a fresh, slightly warm grade with cool
 * shadows; the other seasons arrive with I3. The soft vignette rides along in the same pass (one
 * fewer full-screen pass); it darkens toward black as the old linear-space vignette did, so the
 * factor is raised to 1/2.2 for display colors.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: new Vector3(0, 0, 0) },
    gamma: { value: new Vector3(1, 1, 1) },
    gain: { value: new Vector3(1, 1, 1) },
    saturation: { value: 1 },
    vignette: { value: 0.8 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 lift;
    uniform vec3 gamma;
    uniform vec3 gain;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 x = clamp(c.rgb * gain + lift * (1.0 - c.rgb), 0.0, 1.0);
      x = pow(x, 1.0 / gamma);
      float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
      vec2 d = (vUv - 0.5) * vignette;
      float shade = pow(max(1.0 - dot(d, d), 0.0), 0.4545);
      gl_FragColor = vec4(mix(vec3(l), x, saturation) * shade, c.a);
    }
  `,
};

export type GradeSeason = 'spring' | 'summer' | 'autumn' | 'winter';

const GRADES: Record<GradeSeason, { lift: number[]; gamma: number[]; gain: number[]; saturation: number }> = {
  spring: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  // I3 fills these in; until then they match spring.
  summer: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  autumn: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
  winter: { lift: [0.0, 0.012, 0.03], gamma: [1.0, 1.02, 1.0], gain: [1.02, 1.0, 0.97], saturation: 1.06 },
};

/**
 * Medium and High post: gentle bloom (high threshold, so mostly lit windows and flames at night),
 * a tilt-shift that keeps the middle band sharp and grows softer as the camera pulls back, tone
 * mapping, then the seasonal grade with a soft vignette.
 */
export class PostChain {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hTilt: ShaderPass;
  private readonly vTilt: ShaderPass;
  private readonly grade: ShaderPass;
  private tilt = 1;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    const size = renderer.getSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size.clone(), 0.35, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.hTilt = new ShaderPass(HorizontalTiltShiftShader);
    this.vTilt = new ShaderPass(VerticalTiltShiftShader);
    for (const p of [this.hTilt, this.vTilt]) (p.uniforms.r as { value: number }).value = 0.5;
    this.composer.addPass(this.hTilt);
    this.composer.addPass(this.vTilt);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setSeason('spring');
    this.setSize(size.x, size.y, renderer.getPixelRatio());
  }

  /** Bloom grows a little at night so windows and lanterns glow without washing out the day. */
  setNight(night: number): void {
    this.bloom.strength = 0.25 + night * 0.45;
    this.bloom.threshold = 0.92 - night * 0.2;
  }

  private season: GradeSeason = 'spring';
  private warmth = 0;

  /** C3D-1: the seasonal grade hook (Spring only until I3). */
  setSeason(season: GradeSeason): void {
    this.season = season;
    this.applyGrade();
  }

  /** C3D-1: dusk and dawn split toning, 0 to 1: rose highlights and violet shadows. */
  setWarmth(w: number): void {
    if (Math.abs(w - this.warmth) < 0.005) return;
    this.warmth = w;
    this.applyGrade();
  }

  private applyGrade(): void {
    const g = GRADES[this.season];
    const w = this.warmth;
    const u = this.grade.uniforms as Record<string, { value: unknown }>;
    (u.lift!.value as Vector3).set(g.lift[0]! + 0.018 * w, g.lift[1]!, g.lift[2]! + 0.05 * w);
    (u.gamma!.value as Vector3).fromArray(g.gamma);
    (u.gain!.value as Vector3).set(
      g.gain[0]! * (1 + 0.03 * w),
      g.gain[1]! * (1 - 0.045 * w),
      g.gain[2]! * (1 + 0.02 * w),
    );
    u.saturation!.value = g.saturation * (1 + 0.06 * w);
  }

  /**
   * C3D-1: tilt-shift strength from the camera distance: close-ups stay crisp, wide views get the
   * miniature look.
   */
  setViewDistance(distance: number): void {
    const k = 0.6 + Math.min(1, Math.max(0, (distance - 25) / 140)) * 1.6;
    if (Math.abs(k - this.tilt) < 0.02) return;
    this.tilt = k;
    this.applyTilt();
  }

  private applyTilt(): void {
    (this.hTilt.uniforms.h as { value: number }).value = (1.5 * this.tilt) / (this.width * this.pixelRatio);
    (this.vTilt.uniforms.v as { value: number }).value = (1.5 * this.tilt) / (this.height * this.pixelRatio);
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
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
