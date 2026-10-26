import { palette, ShapeBuilder } from '@qoti/art';
import { CHUNK_SIZE, Road } from '@qoti/sim';
import { MeshStandardMaterial } from 'three';
import { ChunkedMeshes } from '../chunks';
import { levelY } from '../coords';
import type { RenderLayer } from './types';

const LIFT = 0.02;

/** Roads v0: flat strips, a square per tile plus connectors towards road neighbors. */
export function roadsLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  return {
    id: 'roads',
    init(ctx) {
      const m = ctx.mirror;
      chunks = new ChunkedMeshes(ctx.scene, material, (cx, cz) => {
        const s = new ShapeBuilder();
        const up: [number, number, number] = [0, 1, 0];
        for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
          for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
            const kind = m.road(x, z);
            if (!kind) continue;
            const y = levelY(m.height(x, z)) + LIFT;
            const half = kind === Road.path ? 0.22 : 0.34;
            const color = kind === Road.path ? palette.path : palette.lane;
            const x0 = x + 0.5 - half;
            const x1 = x + 0.5 + half;
            const z0 = z + 0.5 - half;
            const z1 = z + 0.5 + half;
            s.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, up);
            if (m.road(x + 1, z)) s.quad([x1, y, z0], [x + 1, y, z0], [x + 1, y, z1], [x1, y, z1], color, up);
            if (m.road(x - 1, z)) s.quad([x, y, z0], [x0, y, z0], [x0, y, z1], [x, y, z1], color, up);
            if (m.road(x, z + 1)) s.quad([x0, y, z1], [x1, y, z1], [x1, y, z + 1], [x0, y, z + 1], color, up);
            if (m.road(x, z - 1)) s.quad([x0, y, z], [x1, y, z], [x1, y, z0], [x0, y, z0], color, up);
          }
        }
        return s.build();
      });
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const layer of ['road', 'height'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
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
