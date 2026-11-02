// V1.0: static and moving render layers. Every render layer draws under a root of its own, and the
// renderer tags each object added under that root, at any depth and at any time, with Three.js
// layer 1 (static) or 2 (moving). Today the camera and lights see both, so nothing changes; V1D
// draws the static layers once into the still-frame cache and then only the moving ones while the
// camera rests (docs/spec/20-architecture.md, Lean renderer).
import { Scene, type Object3D, type Object3DEventMap } from 'three';
import type { RenderLayer } from './layers/types';

/** Three.js layer of everything in a static render layer (terrain, buildings, decor, trees, ...). */
export const STATIC_LAYER = 1;
/** Three.js layer of everything in a moving render layer (residents, carts, water, smoke, ...). */
export const MOVING_LAYER = 2;

type ChildAdded = (event: Object3DEventMap['childadded'] & { target: Object3D }) => void;

const listeners = new Map<number, ChildAdded>();

/** One listener per Three.js layer, so adding it twice to an object is a no-op. */
function listenerFor(n: number): ChildAdded {
  let l = listeners.get(n);
  if (!l) {
    l = (event) => tagTree(event.child, n);
    listeners.set(n, l);
  }
  return l;
}

/** The Three.js layer a render layer's objects go on. */
export function motionLayer(layer: Pick<RenderLayer, 'motion'>): number {
  return layer.motion === 'moving' ? MOVING_LAYER : STATIC_LAYER;
}

/**
 * Puts `object` and everything under it on Three.js layer `n` alone, and keeps doing so for children
 * added to any of them later. An object moved from one tagged tree to another takes the new layer.
 */
export function tagTree(object: Object3D, n: number): void {
  const other = n === STATIC_LAYER ? MOVING_LAYER : STATIC_LAYER;
  object.traverse((o) => {
    o.layers.set(n);
    o.removeEventListener('childadded', listenerFor(other));
    o.addEventListener('childadded', listenerFor(n));
  });
}

/**
 * The root a render layer adds its objects to (its `LayerContext.scene`). A Scene rather than a
 * Group so layers keep their Scene-typed context; three.js draws a nested scene's children as it
 * would a group's and ignores its background and fog.
 */
export function layerRoot(layer: Pick<RenderLayer, 'id' | 'motion'>): Scene {
  const root = new Scene();
  root.name = `layer:${layer.id}`;
  tagTree(root, motionLayer(layer));
  return root;
}
