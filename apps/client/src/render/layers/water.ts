import { palette, ShapeBuilder } from '@qoti/art';
import { CHUNK_SIZE } from '@qoti/sim';
import { MeshStandardMaterial } from 'three';
import { ChunkedMeshes } from '../chunks';
import type { RenderLayer } from './types';

const SURFACE_Y = 0.12;

/** Water v0: a translucent surface over every water tile. */
export function waterLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  const material = new MeshStandardMaterial({
    color: palette.water,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
    metalness: 0,
    depthWrite: false,
  });

  return {
    id: 'water',
    init(ctx) {
      chunks = new ChunkedMeshes(
        ctx.scene,
        material,
        (cx, cz) => {
          const s = new ShapeBuilder();
          for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
            for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
              if (!ctx.mirror.water(x, z)) continue;
              s.quad(
                [x, SURFACE_Y, z],
                [x + 1, SURFACE_Y, z],
                [x + 1, SURFACE_Y, z + 1],
                [x, SURFACE_Y, z + 1],
                palette.water,
                [0, 1, 0],
              );
            }
          }
          return s.build();
        },
        2,
      );
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const rect of change.rects.get('water') ?? []) chunks.markRect(rect, 0);
    },
    frame() {
      return chunks ? chunks.rebuild(2) : false;
    },
    dispose() {
      chunks?.dispose();
      material.dispose();
    },
  };
}
