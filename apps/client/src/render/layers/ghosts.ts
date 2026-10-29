import { createGhostMaterial, ShapeBuilder } from '@qoti/art';
import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import type { Ghost } from '../api';
import { levelY } from '../coords';
import {
  buildingGeometry,
  buildingMatrix,
  decorGeometry,
  decorMatrix,
  standLevel,
  treeGeometry,
} from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

export interface GhostLayer extends RenderLayer {
  set(g: Ghost | null): void;
}

const SPECIES = { oak: 1, birch: 2, pine: 3 } as const;

/** Translucent previews of what the active tool would place, green when valid, red when not. */
export function ghostsLayer(): GhostLayer {
  let ctx: LayerContext | null = null;
  const group = new Group();
  group.renderOrder = 5;
  const valid = createGhostMaterial(true);
  const invalid = createGhostMaterial(false);
  /** Geometries made for one ghost (roads, tiles); kit geometries are shared and never disposed. */
  const owned: BufferGeometry[] = [];

  function clear(): void {
    group.clear();
    for (const g of owned.splice(0)) g.dispose();
  }

  function add(geometry: BufferGeometry, material: Material): Mesh {
    const mesh = new Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  }

  function tiles(list: [number, number][], material: Material, lift = 0.04, inset = 0.04): void {
    if (!ctx || list.length === 0) return;
    const s = new ShapeBuilder();
    for (const [x, z] of list) {
      const y = levelY(ctx.mirror.height(x, z)) + lift;
      s.quad(
        [x + inset, y, z + inset],
        [x + 1 - inset, y, z + inset],
        [x + 1 - inset, y, z + 1 - inset],
        [x + inset, y, z + 1 - inset],
        0xffffff,
        [0, 1, 0],
      );
    }
    const g = s.build();
    owned.push(g);
    add(g, material);
  }

  return {
    id: 'ghosts',
    init(c) {
      ctx = c;
      c.scene.add(group);
    },
    update() {},
    set(g) {
      if (!ctx) return;
      clear();
      if (g) {
        const material = g.valid ? valid : invalid;
        switch (g.kind) {
          case 'building': {
            const level = standLevel(ctx.mirror, g.def, g.x, g.z, g.rot);
            const mesh = add(buildingGeometry(g.def), material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(buildingMatrix(g.def, g.x, g.z, g.rot, level));
            break;
          }
          case 'decor': {
            const mesh = add(decorGeometry(g.def), material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(decorMatrix(ctx.mirror, g.fx, g.fz, g.rot));
            break;
          }
          case 'decorRun':
            for (const s of g.segments) {
              const mesh = add(decorGeometry(g.def), material);
              mesh.matrixAutoUpdate = false;
              mesh.matrix.copy(decorMatrix(ctx.mirror, s.fx, s.fz, s.rot));
            }
            break;
          case 'road': {
            const bad = g.badTile;
            const good = bad ? g.tiles.filter(([x, z]) => x !== bad[0] || z !== bad[1]) : g.tiles;
            tiles(good, material, 0.05, 0.12);
            if (bad) tiles([bad], invalid, 0.06, 0.06);
            break;
          }
          case 'tree': {
            const mesh = add(treeGeometry(SPECIES[g.species] ?? 1), material);
            mesh.position.set(g.x + 0.5, levelY(ctx.mirror.height(g.x, g.z)), g.z + 0.5);
            mesh.scale.setScalar(0.6);
            break;
          }
          case 'tiles':
            tiles(g.tiles, material, 0.05, 0.02);
            break;
        }
      }
      ctx.invalidate();
    },
    dispose() {
      clear();
      ctx?.scene.remove(group);
      valid.dispose();
      invalid.dispose();
    },
  };
}
