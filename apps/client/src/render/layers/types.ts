import type { Camera, Material, Scene } from 'three';
import type { Mirror, MirrorChange } from '../../state/mirror';

export interface LayerContext {
  scene: Scene;
  mirror: Mirror;
  /** The shared kit material (vertex colors, matte). */
  material: Material;
  invalidate(): void;
  /** C3D addition: the view camera, for levels of detail and culling in per-frame work. */
  camera: Camera;
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
