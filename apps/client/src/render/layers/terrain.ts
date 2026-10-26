import { ShapeBuilder, TERRAIN_COLORS } from '@qoti/art';
import { CHUNK_SIZE, MAP_SIZE } from '@qoti/sim';
import type { BufferGeometry } from 'three';
import { ChunkedMeshes } from '../chunks';
import { hash2, levelY, shade } from '../coords';
import type { LayerContext, RenderLayer } from './types';

const RIVERBED_Y = -0.15;
const EDGE_BOTTOM = -1.5;

/** Terrain v0: one colored quad per tile at its height (stepped), with cliff sides. */
export function terrainLayer(): RenderLayer {
  let chunks: ChunkedMeshes | null = null;

  function build(ctx: LayerContext, cx: number, cz: number): BufferGeometry {
    const m = ctx.mirror;
    const s = new ShapeBuilder();
    const topY = (x: number, z: number) => (m.water(x, z) ? RIVERBED_Y : levelY(m.height(x, z)));
    for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
      for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        const y = topY(x, z);
        const base = TERRAIN_COLORS[m.terrain(x, z)] ?? TERRAIN_COLORS[0]!;
        const color = shade(base, 0.94 + hash2(x, z) * 0.12);
        s.quad([x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1], color, [0, 1, 0]);
        const side = shade(base, 0.68);
        // Sides wherever the neighbor sits lower; map edges drop to a skirt.
        const neighbors: [number, number, [number, number, number][], [number, number, number]][] = [
          [
            x + 1,
            z,
            [
              [x + 1, 0, z],
              [x + 1, 0, z + 1],
            ],
            [1, 0, 0],
          ],
          [
            x - 1,
            z,
            [
              [x, 0, z],
              [x, 0, z + 1],
            ],
            [-1, 0, 0],
          ],
          [
            x,
            z + 1,
            [
              [x, 0, z + 1],
              [x + 1, 0, z + 1],
            ],
            [0, 0, 1],
          ],
          [
            x,
            z - 1,
            [
              [x, 0, z],
              [x + 1, 0, z],
            ],
            [0, 0, -1],
          ],
        ];
        for (const [nx, nz, edge, out] of neighbors) {
          const inside = nx >= 0 && nz >= 0 && nx < MAP_SIZE && nz < MAP_SIZE;
          const ny = inside ? topY(nx, nz) : EDGE_BOTTOM;
          if (ny >= y) continue;
          const [e0, e1] = edge as [[number, number, number], [number, number, number]];
          s.quad([e0[0], ny, e0[2]], [e1[0], ny, e1[2]], [e1[0], y, e1[2]], [e0[0], y, e0[2]], side, out);
        }
      }
    }
    return s.build();
  }

  return {
    id: 'terrain',
    init(ctx) {
      chunks = new ChunkedMeshes(ctx.scene, ctx.material, (cx, cz) => build(ctx, cx, cz));
      chunks.markAll();
      chunks.rebuild();
    },
    update(change) {
      if (!chunks) return;
      if (change.full) chunks.markAll();
      for (const layer of ['height', 'terrain', 'water'] as const) {
        for (const rect of change.rects.get(layer) ?? []) chunks.markRect(rect);
      }
    },
    frame() {
      return chunks ? chunks.rebuild(2) : false;
    },
    dispose() {
      chunks?.dispose();
    },
  };
}
