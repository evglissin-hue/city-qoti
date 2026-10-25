import {
  HalfFloatType,
  Vector2,
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
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

/**
 * Medium and High post: gentle bloom (high threshold, so mostly lit windows and flames at night),
 * a subtle tilt-shift that keeps the middle band sharp, a soft vignette, then tone mapping.
 */
export class PostChain {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hTilt: ShaderPass;
  private readonly vTilt: ShaderPass;

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
    const vignette = new ShaderPass(VignetteShader);
    (vignette.uniforms.offset as { value: number }).value = 0.8;
    // Darkness 1 mixes toward black, so night corners deepen instead of turning gray.
    (vignette.uniforms.darkness as { value: number }).value = 1;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y, renderer.getPixelRatio());
  }

  /** Bloom grows a little at night so windows and lanterns glow without washing out the day. */
  setNight(night: number): void {
    this.bloom.strength = 0.25 + night * 0.45;
    this.bloom.threshold = 0.92 - night * 0.2;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    // Very soft blur away from the middle band: barely there at the edges, none in the play area.
    (this.hTilt.uniforms.h as { value: number }).value = 1.5 / (width * pixelRatio);
    (this.vTilt.uniforms.v as { value: number }).value = 1.5 / (height * pixelRatio);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
