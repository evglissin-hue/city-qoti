import type { Camera, Material, Scene } from 'three';
import type { Mirror, MirrorChange } from '../../state/mirror';
import type { WorldEnv } from '../env';

export interface LayerContext {
  /** Where the layer adds its objects: its own root under the scene (V1.0, render/layerTags.ts). */
  scene: Scene;
  mirror: Mirror;
  /** The shared kit material (vertex colors, matte). */
  material: Material;
  invalidate(): void;
  /** C3D addition: the view camera, for levels of detail and culling in per-frame work. */
  camera: Camera;
  /** C3D-1: shared look state (time, night, sky, ground lights, camera). Set by the renderer. */
  env?: WorldEnv;
}

/** A piece of the scene that keeps itself in step with the Mirror. */
export interface RenderLayer {
  id: string;
  /**
   * V1.0: `moving` for layers that change while the camera rests (residents, animals, carts, smoke,
   * water, ghosts, overlays, presence, notes); absent or `static` for the rest. The renderer puts
   * the layer's objects on Three.js layer 2 (moving) or 1 (static) (render/layerTags.ts), so V1D can
   * keep the static ones in the still-frame cache. A static layer that changes calls
   * `ctx.invalidate()`, which drops the cache.
   */
  motion?: 'static' | 'moving';
  /**
   * V2A: a static layer whose changes move no sun shadow caster (light only: the lights layer,
   * V2B's meadow carpet). Its `invalidate` and `frame()` returning true drop the still frame but
   * leave the cached shadow map alone (render/statics.ts).
   */
  shadowless?: true;
  init(ctx: LayerContext): void;
  update(change: MirrorChange): void;
  /** Per-frame work; returns true when the frame needs to be drawn. */
  frame?(dt: number): boolean;
  dispose(): void;
}

export type LayerFactory = () => RenderLayer;
