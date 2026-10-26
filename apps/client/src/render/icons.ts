// Billboard icons: a canvas-drawn atlas and one instanced, camera-facing quad per icon. Used for
// mood and wish bubbles over residents and for building status icons. One draw call per batch.
import { palette } from '@qoti/art';
import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Scene,
} from 'three';

const CELL = 128;

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Draws one icon into a cell; (0, 0) is the cell's top left, size CELL. */
export type IconPainter = (g: CanvasRenderingContext2D) => void;

function bubble(g: CanvasRenderingContext2D, fill: number = palette.paper): void {
  const c = CELL / 2;
  g.beginPath();
  g.arc(c, c - 6, 46, 0, Math.PI * 2);
  g.moveTo(c - 12, c + 34);
  g.lineTo(c, c + 56);
  g.lineTo(c + 12, c + 34);
  g.closePath();
  g.fillStyle = css(fill);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = css(palette.ink);
  g.stroke();
  g.beginPath();
  g.arc(c, c - 6, 43, 0, Math.PI * 2);
  g.fillStyle = css(fill);
  g.fill();
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = css(fill);
  g.fill();
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.strokeStyle = css(palette.ink);
  g.stroke();
}

function heart(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: number): void {
  g.beginPath();
  g.moveTo(cx, cy + r * 0.9);
  g.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.1, cx, cy - r * 0.45);
  g.bezierCurveTo(cx + r * 0.7, cy - r * 1.1, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
  g.fillStyle = css(fill);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = css(palette.ink);
  g.stroke();
}

function cloud(g: CanvasRenderingContext2D, cx: number, cy: number, fill: number): void {
  g.beginPath();
  g.arc(cx - 14, cy, 13, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(cx - 2, cy - 12, 15, Math.PI, Math.PI * 1.9);
  g.arc(cx + 15, cy - 2, 12, Math.PI * 1.4, Math.PI * 0.5);
  g.closePath();
  g.fillStyle = css(fill);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = css(palette.ink);
  g.stroke();
}

/** Resident bubbles, in AGENT order: wish, unhappy, sleepy, happy. */
export const BUBBLE_ICONS: IconPainter[] = [
  (g) => {
    bubble(g);
    star(g, CELL / 2, CELL / 2 - 6, 28, palette.mustard);
  },
  (g) => {
    bubble(g, 0xe6e8ea);
    cloud(g, CELL / 2, CELL / 2 - 8, 0x8a96a3);
    g.strokeStyle = css(0x4f7fa8);
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (const dx of [-12, 2, 16]) {
      g.beginPath();
      g.moveTo(CELL / 2 + dx, CELL / 2 + 12);
      g.lineTo(CELL / 2 + dx - 4, CELL / 2 + 22);
      g.stroke();
    }
  },
  (g) => {
    bubble(g, 0xe3e6f2);
    g.fillStyle = css(palette.navy);
    g.font = 'bold 40px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('z', CELL / 2 - 12, CELL / 2);
    g.font = 'bold 28px Georgia, serif';
    g.fillText('z', CELL / 2 + 14, CELL / 2 - 20);
  },
  (g) => {
    bubble(g);
    heart(g, CELL / 2, CELL / 2 - 4, 24, 0xd9534f);
  },
];

/** Paints icons side by side into one atlas texture. */
export function iconAtlas(icons: IconPainter[]): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * icons.length;
  canvas.height = CELL;
  const g = canvas.getContext('2d');
  if (g) {
    icons.forEach((paint, i) => {
      g.save();
      g.translate(i * CELL, 0);
      paint(g);
      g.restore();
    });
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute float iIcon;
attribute float iPhase;
uniform float uTime;
uniform float uSize;
uniform float uIcons;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  // Grow a little with distance so icons stay legible when zoomed out.
  float size = uSize * clamp(-mv.z / 30.0, 1.0, 3.0);
  mv.xy += position.xy * size;
  mv.y += sin(uTime * 2.2 + iPhase) * 0.02 * size + size * 0.5;
  gl_Position = projectionMatrix * mv;
  vUv = vec2((uv.x + iIcon) / uIcons, uv.y);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uDim;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.35) discard;
  gl_FragColor = vec4(c.rgb * uDim, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** One batch of billboard icons from an atlas. Fill with `push` between `begin` and `end`. */
export class IconSprites {
  readonly mesh: Mesh;
  private readonly geometry = new InstancedBufferGeometry();
  private readonly material: ShaderMaterial;
  private pos: InstancedBufferAttribute;
  private icon: InstancedBufferAttribute;
  private phase: InstancedBufferAttribute;
  private n = 0;

  constructor(
    scene: Scene,
    private readonly texture: CanvasTexture,
    icons: number,
    size: number,
    capacity = 64,
  ) {
    const plane = new PlaneGeometry(1, 1);
    this.geometry.index = plane.index;
    this.geometry.setAttribute('position', plane.getAttribute('position'));
    this.geometry.setAttribute('uv', plane.getAttribute('uv'));
    this.pos = this.attr(capacity, 3);
    this.icon = this.attr(capacity, 1);
    this.phase = this.attr(capacity, 1);
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uSize: { value: size },
        uIcons: { value: icons },
        uDim: { value: 0.86 },
      },
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.userData.noCast = true;
    this.geometry.instanceCount = 0;
    scene.add(this.mesh);
  }

  private attr(capacity: number, size: number): InstancedBufferAttribute {
    const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
    a.setUsage(DynamicDrawUsage);
    return a;
  }

  private bind(): void {
    this.geometry.setAttribute('iPos', this.pos);
    this.geometry.setAttribute('iIcon', this.icon);
    this.geometry.setAttribute('iPhase', this.phase);
  }

  begin(time: number): void {
    this.n = 0;
    (this.material.uniforms.uTime as { value: number }).value = time;
  }

  push(x: number, y: number, z: number, icon: number, phase: number): void {
    if (this.n >= this.icon.count) {
      const grow = (a: InstancedBufferAttribute): InstancedBufferAttribute => {
        const b = this.attr(a.count * 2, a.itemSize);
        (b.array as Float32Array).set(a.array as Float32Array);
        return b;
      };
      this.pos = grow(this.pos);
      this.icon = grow(this.icon);
      this.phase = grow(this.phase);
      this.geometry.dispose();
    }
    const i = this.n++;
    this.pos.setXYZ(i, x, y, z);
    this.icon.setX(i, icon);
    this.phase.setX(i, phase);
  }

  end(): void {
    this.bind();
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const a of [this.pos, this.icon, this.phase]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  /** Dims icons at night so they do not bloom. */
  setDim(k: number): void {
    (this.material.uniforms.uDim as { value: number }).value = k;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
