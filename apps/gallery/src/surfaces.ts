// V1A: the gallery's surfaces section (?scene=surfaces). Every surface id on a sample of its own
// (a wall for facade surfaces, a gable for roofs, a slab for the ground), each drawn at three sizes
// in its cell, so one view shows the pattern close, at the default camera and far off, where it
// must melt into its color without shimmer. ?season=winter shows the snow, ?night=1 the night.
import { palette2, ShapeBuilder, SURFACE, SURFACES, type SurfaceName } from '@qoti/art';
import { Group, Mesh, type Material } from 'three';

/** The color each surface's sample is painted, from palette 2.0. */
const COLOR: Record<SurfaceName, number> = {
  plain: palette2.plasters[0]!,
  plaster: palette2.plasters[1]!,
  brick: palette2.bricks[0]!,
  stone: palette2.stones[0]!,
  timber: palette2.timber,
  tile: palette2.tiles[0]!,
  slate: palette2.slates[0]!,
  thatch: palette2.thatch[0]!,
  cobble: palette2.cobble,
  glass: palette2.glass,
  grass: palette2.grass,
  dirt: palette2.dirt,
  water: palette2.water,
  leaf: palette2.leaves[0]!,
  zinc: palette2.zinc,
  awning: palette2.awnings[0]!,
  field: palette2.fields[2]!,
  flags: palette2.flags,
  flowers: palette2.grass,
};

/** One sample, about 1.6 tiles across, standing on y = 0. */
function sample(name: SurfaceName): ShapeBuilder {
  const def = SURFACES[SURFACE[name]]!;
  const b = new ShapeBuilder().surface(def.id);
  const c = COLOR[name];
  if (def.mapping === 'roof') {
    // A gable at about 40 degrees, with a plaster gable end.
    const h = 0.65;
    b.quad([-0.8, 0, 0.8], [0, h, 0.8], [0, h, -0.8], [-0.8, 0, -0.8], c, [-1, 1.2, 0]);
    b.quad([0.8, 0, -0.8], [0, h, -0.8], [0, h, 0.8], [0.8, 0, 0.8], c, [1, 1.2, 0]);
    b.surface(SURFACE.plaster);
    b.tri([-0.8, 0, 0.8], [0.8, 0, 0.8], [0, h, 0.8], palette2.plasters[0]!, [0, 0, 1]);
    b.tri([0.8, 0, -0.8], [-0.8, 0, -0.8], [0, h, -0.8], palette2.plasters[0]!, [0, 0, -1]);
  } else if (def.mapping === 'top') {
    b.box(-0.8, 0, -0.8, 0.8, 0.08, 0.8, c);
  } else {
    // A wall facing the camera with a short return, so the courses are seen turning a corner.
    b.box(-0.8, 0, -0.1, 0.8, 1.1, 0.1, c);
    b.box(-0.8, 0, -0.7, -0.6, 1.1, -0.1, c);
  }
  return b;
}

const SIZES = [1, 0.4, 0.16];

/** The grid of samples: six to a row, each cell the sample at three sizes. */
export function buildSurfaces(material: Material): { group: Group; width: number; depth: number } {
  const group = new Group();
  const names = (Object.keys(SURFACE) as SurfaceName[]).filter((n) => n !== 'plain');
  const cols = 6;
  const cell = 3.2;
  names.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = (col - (cols - 1) / 2) * cell;
    const z0 = (row - 1) * cell;
    let dx = -0.75;
    for (const k of SIZES) {
      const g = sample(name).build();
      const m = new Mesh(g, material);
      m.scale.setScalar(k);
      m.position.set(x0 + dx, 0, z0);
      dx += 1.7 * k * 0.5 + 0.9 * (k === 1 ? 1 : 0.35);
      group.add(m);
    }
  });
  return { group, width: cols * cell, depth: 3 * cell };
}

/** The surface names in grid order, for the info line. */
export const SURFACE_ORDER = (Object.keys(SURFACE) as SurfaceName[]).filter((n) => n !== 'plain');
