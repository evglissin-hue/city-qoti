import { kitById, ShapeBuilder } from '@qoti/art';
import { content } from '@qoti/content';
import { DECOR_ROTATIONS, footprintSize, MAP_SIZE, type MapReader, type Rot4 } from '@qoti/sim';
import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { fpToWorld, levelY } from './coords';

const cache = new Map<string, BufferGeometry>();

function missing(): BufferGeometry {
  return new ShapeBuilder().box(-0.2, 0, -0.2, 0.2, 0.4, 0.2, 0xff00ff).build();
}

/** Geometry for a building def, built from its art kit at the def's footprint. */
export function buildingGeometry(defId: string): BufferGeometry {
  const key = `building:${defId}`;
  let g = cache.get(key);
  if (!g) {
    const def = content.buildingById.get(defId);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    g =
      def && kit
        ? kit.build({
            size: def.size,
            entrance: def.entrance,
            ...(def.art.params ? { params: def.art.params } : {}),
          })
        : missing();
    cache.set(key, g);
  }
  return g;
}

export function decorGeometry(defId: string): BufferGeometry {
  const key = `decor:${defId}`;
  let g = cache.get(key);
  if (!g) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    g = kit ? kit.build(def?.art.params ? { params: def.art.params } : {}) : missing();
    cache.set(key, g);
  }
  return g;
}

const SPECIES_KIT = ['', 'oak', 'birch', 'pine'];

/**
 * Forest tree geometry by tree-layer species index (1 oak, 2 birch, 3 pine) and growth stage
 * (0 to 3; the kit scales and shapes each stage).
 */
export function treeGeometry(species: number, stage = 3): BufferGeometry {
  const key = `tree:${species}:${stage}`;
  let g = cache.get(key);
  if (!g) {
    const kit = kitById.get(SPECIES_KIT[species] ?? '');
    g = kit ? kit.build({ stage }) : missing();
    cache.set(key, g);
  }
  return g;
}

const q = new Quaternion();
const up = new Vector3(0, 1, 0);
const pos = new Vector3();
const scl = new Vector3(1, 1, 1);
const toOrigin = new Matrix4();

/** Highest and lowest height level under a footprint. */
export function footprintHeights(
  reader: MapReader,
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
): [number, number] {
  const def = content.buildingById.get(defId);
  if (!def) return [0, 0];
  const [w, d] = footprintSize(def, rot);
  let lo = 15;
  let hi = 0;
  for (let tz = z; tz < z + d; tz++) {
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) continue;
      const h = reader.height(tx, tz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return [lo, hi];
}

/** Places a building kit: rotate about the footprint center, stand it on the highest tile. */
export function buildingMatrix(
  defId: string,
  x: number,
  z: number,
  rot: Rot4,
  baseLevel: number,
  out = new Matrix4(),
): Matrix4 {
  const def = content.buildingById.get(defId);
  const [w, d] = def?.size ?? [1, 1];
  const [rw, rd] = def ? footprintSize(def, rot) : [1, 1];
  toOrigin.makeTranslation(-w / 2, 0, -d / 2);
  q.setFromAxisAngle(up, (-rot * Math.PI) / 2);
  pos.set(x + rw / 2, levelY(baseLevel), z + rd / 2);
  out.compose(pos, q, scl).multiply(toOrigin);
  return out;
}

/** Places a decor kit at a fixed point position with a 0 to 63 rotation. */
export function decorMatrix(
  reader: MapReader,
  fx: number,
  fz: number,
  rot: number,
  out = new Matrix4(),
): Matrix4 {
  const x = fpToWorld(fx);
  const z = fpToWorld(fz);
  q.setFromAxisAngle(up, (-rot * 2 * Math.PI) / DECOR_ROTATIONS);
  pos.set(x, levelY(reader.height(Math.floor(x), Math.floor(z))), z);
  return out.compose(pos, q, scl);
}
