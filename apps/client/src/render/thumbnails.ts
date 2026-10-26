// Picker portraits: each building and decor piece drawn from its own art kit, a little diorama on a
// round patch of meadow, in the same warm light as the valley. Drawn once per piece on a small
// offscreen canvas of its own (so the valley's renderer never waits), a few per frame, then cached
// as image URLs for the session. The offscreen context is released when the queue runs dry.
import { createKitMaterial, palette } from '@qoti/art';
import { signal, type Signal } from '@preact/signals';
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Sphere,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { buildingGeometry, decorGeometry } from './kitGeometry';

/** Canvas size in pixels; cards show it at about half, so it stays crisp on Retina screens. */
const SIZE = 128;
/** Portraits drawn per animation frame. */
const PER_FRAME = 3;
/** The camera looks down at the valley's default angle, a little closer. */
const PITCH = 0.62;
const YAW = -0.72;

export type ThumbnailKind = 'building' | 'decor';

const cache = new Map<string, Signal<string | null>>();
const queue: { key: string; kind: ThumbnailKind; id: string }[] = [];
let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let material: MeshStandardMaterial | null = null;
let base: Mesh | null = null;
let scheduled = false;
let failed = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The portrait of a building or decor def as an image URL, or null until it is drawn (or when the
 * browser cannot draw it; cards then simply show no picture).
 */
export function thumbnail(kind: ThumbnailKind, id: string): Signal<string | null> {
  const key = `${kind}:${id}`;
  let s = cache.get(key);
  if (!s) {
    s = signal<string | null>(null);
    cache.set(key, s);
    if (!failed) {
      queue.push({ key, kind, id });
      schedule();
    }
  }
  return s;
}

function schedule(): void {
  if (scheduled || typeof requestAnimationFrame === 'undefined') return;
  scheduled = true;
  requestAnimationFrame(drain);
}

function setup(): boolean {
  if (renderer) return true;
  try {
    const canvas = document.createElement('canvas');
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    failed = true;
    queue.length = 0;
    return false;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = SRGBColorSpace;
  scene = new Scene();
  scene.add(new HemisphereLight(0xfff4e0, 0x8a7a5a, 1.6));
  const sun = new DirectionalLight(0xffe6c0, 2.2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const fill = new DirectionalLight(0xb8d4ff, 0.5);
  fill.position.set(4, 2, -3);
  scene.add(fill);
  camera = new PerspectiveCamera(26, 1, 0.05, 200);
  material = createKitMaterial();
  // A round patch of meadow with a darker earthy rim, like a game piece's base.
  const patch = new CylinderGeometry(1, 0.94, 0.12, 40);
  const colors: number[] = [];
  const pos = patch.getAttribute('position');
  const grass = new Color(palette.meadow);
  const earth = new Color(palette.soil);
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > 0.05 ? grass : earth;
    colors.push(c.r, c.g, c.b);
  }
  patch.setAttribute('color', new Float32BufferAttribute(colors, 3));
  base = new Mesh(patch, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  return true;
}

function geometryOf(kind: ThumbnailKind, id: string): BufferGeometry {
  return kind === 'building' ? buildingGeometry(id) : decorGeometry(id);
}

function draw(kind: ThumbnailKind, id: string): string | null {
  if (!renderer || !scene || !camera || !material || !base) return null;
  const g = geometryOf(kind, id);
  g.computeBoundingBox();
  const box = g.boundingBox ?? new Box3(new Vector3(), new Vector3(1, 1, 1));
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const piece = new Mesh(g, material);
  // Stand the piece in the middle of its patch.
  piece.position.set(-center.x, -box.min.y, -center.z);
  const footprint = Math.max(size.x, size.z);
  const r = footprint * 0.64 + 0.05;
  base.scale.set(r, 1, r);
  base.position.set(0, -0.06, 0);
  scene.add(piece, base);
  const sphere = new Sphere();
  new Box3(new Vector3(-r, -0.12, -r), new Vector3(r, size.y, r)).getBoundingSphere(sphere);
  const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.84;
  const look = new Vector3(0, sphere.center.y * 0.9, 0);
  camera.position.set(
    look.x + Math.sin(YAW) * Math.cos(PITCH) * dist,
    look.y + Math.sin(PITCH) * dist,
    look.z + Math.cos(YAW) * Math.cos(PITCH) * dist,
  );
  camera.lookAt(look);
  camera.near = Math.max(0.01, dist - sphere.radius * 2);
  camera.far = dist + sphere.radius * 2;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(piece, base);
  return renderer.domElement.toDataURL('image/png');
}

function drain(): void {
  scheduled = false;
  if (!queue.length) return;
  if (!setup()) return;
  for (let i = 0; i < PER_FRAME && queue.length; i++) {
    const job = queue.shift()!;
    let url: string | null;
    try {
      url = draw(job.kind, job.id);
    } catch {
      url = null;
    }
    const s = cache.get(job.key);
    if (s) s.value = url;
  }
  if (queue.length) schedule();
  else {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, 4000);
  }
}

/** Frees the offscreen context once nothing is waiting; a later request sets it up again. */
function release(): void {
  releaseTimer = null;
  if (queue.length || !renderer) return;
  base?.geometry.dispose();
  (base?.material as MeshStandardMaterial | undefined)?.dispose();
  material?.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer = null;
  scene = null;
  camera = null;
  material = null;
  base = null;
}
