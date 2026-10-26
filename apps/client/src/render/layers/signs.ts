import { kitById, palette } from '@qoti/art';
import { content } from '@qoti/content';
import type { BuildingView } from '@qoti/sim';
import {
  CanvasTexture,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { buildingKitOptions, buildingMatrix, footprintHeights } from '../kitGeometry';
import type { LayerContext, RenderLayer } from './types';

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Letters sign text onto a little painted board (ink on paper, a thin border). */
function signTexture(text: string, aspect: number): CanvasTexture {
  const h = 64;
  const w = Math.max(64, Math.round(h * aspect));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = css(palette.paper);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = css(palette.inkSoft);
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = css(palette.ink);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 40;
    do {
      g.font = `bold ${size}px "Alegreya", Georgia, serif`;
      size -= 2;
    } while (size > 12 && g.measureText(text).width > w - 18);
    g.fillText(text, w / 2, h / 2 + 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Sign text (C3D): buildings whose players painted a sign get its words lettered on the board the
 * kit provides (`anchors().sign`). One small textured quad per signed building.
 */
export function signsLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  const signs = new Map<number, { key: string; mesh: Mesh; material: MeshStandardMaterial }>();
  const q = new Quaternion();
  const look = new Matrix4();
  const up = new Vector3(0, 1, 0);

  function drop(id: number): void {
    const s = signs.get(id);
    if (!s) return;
    s.mesh.removeFromParent();
    s.mesh.geometry.dispose();
    s.material.map?.dispose();
    s.material.dispose();
    signs.delete(id);
  }

  function place(b: BuildingView): void {
    if (!ctx) return;
    const text = typeof b.custom?.sign === 'string' ? b.custom.sign.trim() : '';
    if (!text || b.stage !== 'built') return drop(b.id);
    const [, hi] = footprintHeights(ctx.mirror, b.def, b.x, b.z, b.rot);
    const key = `${text}|${b.x},${b.z},${b.rot},${hi}|${JSON.stringify(b.custom)}`;
    if (signs.get(b.id)?.key === key) return;
    drop(b.id);
    const def = content.buildingById.get(b.def);
    const kit = def ? kitById.get(def.art.kit) : undefined;
    const sign = kit?.anchors?.(buildingKitOptions(b)).sign;
    if (!sign) return;
    const material = new MeshStandardMaterial({
      map: signTexture(text, sign.width / sign.height),
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new Mesh(new PlaneGeometry(sign.width, sign.height), material);
    const place = buildingMatrix(b.def, b.x, b.z, b.rot, hi);
    const center = new Vector3(...sign.center).applyMatrix4(place);
    const normal = new Vector3(...sign.normal).transformDirection(place);
    look.lookAt(new Vector3(0, 0, 0), normal.clone().negate(), up);
    q.setFromRotationMatrix(look);
    mesh.position.copy(center).addScaledVector(normal, 0.004);
    mesh.quaternion.copy(q);
    mesh.userData.noCast = true;
    ctx.scene.add(mesh);
    signs.set(b.id, { key, mesh, material });
  }

  function rebuild(): void {
    if (!ctx) return;
    for (const id of [...signs.keys()]) if (!ctx.mirror.buildings.has(id)) drop(id);
    for (const b of ctx.mirror.buildings.values()) place(b);
    ctx.invalidate();
  }

  return {
    id: 'signs',
    init(c) {
      ctx = c;
      rebuild();
    },
    update(change) {
      if (change.full || change.buildings || change.rects.has('height')) rebuild();
    },
    dispose() {
      for (const id of [...signs.keys()]) drop(id);
    },
  };
}
