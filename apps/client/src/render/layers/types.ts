import type { Material, Scene } from 'three';
import type { Mirror, MirrorChange } from '../../state/mirror';
import type { WorldEnv } from '../env';

export interface LayerContext {
  scene: Scene;
  mirror: Mirror;
  /** The shared kit material (vertex colors, matte). */
  material: Material;
  invalidate(): void;
  /** C3D-1: shared look state (time, night, sky, ground lights, camera). Set by the renderer. */
  env?: WorldEnv;
}

/** A piece of the scene that keeps itself in step with the Mirror. */
export interface RenderLayer {
  id: string;
  init(ctx: LayerContext): void;
  update(change: MirrorChange): void;
  /** Per-frame work; returns true when the frame needs to be drawn. */
  frame?(dt: number): boolean;
  dispose(): void;
}

export type LayerFactory = () => RenderLayer;
