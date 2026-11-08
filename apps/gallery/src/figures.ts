// Resident figures for the gallery: a species mesh plus the clothes it wears, each a one-instance
// InstancedMesh with the same per-instance attributes the game's agents layer uses.
import {
  extraGeometry,
  residentGeometry,
  residentLook,
  type ExtraKind,
  type ResidentDetail,
  type ResidentLookInput,
} from '@qoti/art';
import {
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type BufferGeometry,
  type Material,
} from 'three';

const geoCache = new Map<string, BufferGeometry>();

function geometry(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export interface Figure {
  group: Group;
  meshes: InstancedMesh[];
  /** Sets the animation: anim (AgentAnim number), walk phase and (C4E) the arm held out, 1 or 2. */
  pose(anim: number, phase: number, hold?: number): void;
}

function one(
  g: BufferGeometry,
  material: Material,
  fur: number,
  furLight: number,
  color: number,
): InstancedMesh {
  const geo = g.clone();
  geo.setAttribute('iFur', new InstancedBufferAttribute(new Float32Array(new Color(fur).toArray()), 3));
  geo.setAttribute('iFur2', new InstancedBufferAttribute(new Float32Array(new Color(furLight).toArray()), 3));
  geo.setAttribute('iMotion', new InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4));
  const mesh = new InstancedMesh(geo, material, 1);
  mesh.setMatrixAt(0, new Matrix4());
  mesh.setColorAt(0, new Color(color));
  mesh.frustumCulled = false;
  return mesh;
}

export function makeFigure(
  input: ResidentLookInput,
  material: Material,
  detail: ResidentDetail = 'full',
  seed = 0,
  more: { kind: ExtraKind; color: number }[] = [],
): Figure {
  const look = residentLook(input);
  look.extras.push(...more);
  const group = new Group();
  const meshes: InstancedMesh[] = [];
  const body = geometry(`${look.species}:${detail}`, () => residentGeometry(look.species, detail));
  meshes.push(one(body, material, look.fur, look.furLight, look.cloth));
  if (detail === 'full') {
    for (const e of look.extras) {
      const g = geometry(e.kind, () => extraGeometry(e.kind as ExtraKind));
      meshes.push(one(g, material, look.fur, look.furLight, e.color));
    }
  }
  for (const m of meshes) group.add(m);
  group.scale.set(look.scale[0], look.scale[1], look.scale[2]);
  return {
    group,
    meshes,
    pose(anim, phase, hold = 0) {
      for (const m of meshes) {
        const a = m.geometry.getAttribute('iMotion') as InstancedBufferAttribute;
        a.setXYZW(0, anim, phase, seed, hold);
        a.needsUpdate = true;
      }
    },
  };
}
