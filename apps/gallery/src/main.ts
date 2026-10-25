// Style kit gallery: every kit with seed, stage, level of detail and swatch sliders, a day and
// night slider and a turntable. URL params (?kit=cottage&seed=3&night=1&spin=0) fix a view for
// screenshots.
import { createKitMaterial, kitById, kits, palette, type KitBuildOptions } from '@qoti/art';
import { content } from '@qoti/content';
import type { BufferGeometry } from 'three';
import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const q = new URLSearchParams(location.search);
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const hemi = new HemisphereLight(0xdde8f0, 0x7a8f5a, 1.1);
scene.add(hemi);
const sun = new DirectionalLight(0xfff4e0, 1.8);
sun.position.set(4, 6, 3);
scene.add(sun);
const ground = new Mesh(
  new PlaneGeometry(9, 9),
  new MeshStandardMaterial({ color: palette.grass, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const material = createKitMaterial();
// Window panes and flames glow at night: a copy of the vertex colors blended toward window light.
material.onBeforeCompile = (shader) => {
  shader.uniforms.uNight = nightUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * vGlow * uNight * 1.4;',
    );
};
const nightUniform = { value: 0 };

const holder = new Group();
scene.add(holder);
const parts: { mesh: Mesh; speed: number }[] = [];

const state = {
  kit: q.get('kit') ?? 'cottage',
  seed: Number(q.get('seed') ?? 1),
  stage: 3,
  lod: 'high' as 'high' | 'low',
  wall: -1,
  roof: -1,
  night: Number(q.get('night') ?? 0),
  spin: q.get('spin') !== '0',
};

function sizeOf(id: string): { size: [number, number]; entrance: [number, number] } | null {
  const def = content.buildings.find((b) => b.art.kit === id);
  return def ? { size: def.size, entrance: def.entrance } : null;
}

function rebuild(): void {
  for (const c of [...holder.children]) {
    holder.remove(c);
    ((c as Mesh).geometry as BufferGeometry | undefined)?.dispose();
  }
  parts.length = 0;
  const kit = kitById.get(state.kit);
  if (!kit) return;
  const fp = sizeOf(state.kit);
  const opts: KitBuildOptions = {
    seed: state.seed,
    stage: state.stage,
    lod: state.lod,
    ...(fp ?? {}),
    params: {
      ...(state.wall >= 0 ? { wall: state.wall } : {}),
      ...(state.roof >= 0 ? { roof: state.roof } : {}),
    },
  };
  const off: [number, number] = fp ? [-fp.size[0] / 2, -fp.size[1] / 2] : [0, 0];
  const mesh = new Mesh(kit.build(opts), material);
  mesh.position.set(off[0], 0, off[1]);
  holder.add(mesh);
  for (const p of kit.parts?.(opts) ?? []) {
    const pg = p.geometry.clone().translate(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
    const pm = new Mesh(pg, material);
    pm.position.set(off[0] + p.pivot[0], p.pivot[1], off[1] + p.pivot[2]);
    holder.add(pm);
    parts.push({ mesh: pm, speed: p.spinSpeed ?? 0 });
  }
  info.textContent = `${kit.id}: ${mesh.geometry.getAttribute('position').count / 3} triangles`;
}

function applyLight(): void {
  const n = state.night;
  sun.color.set(new Color(0xfff4e0).lerp(new Color(0x9db4d8), n));
  sun.intensity = 1.8 - n * 1.4;
  hemi.color.set(new Color(0xdde8f0).lerp(new Color(0x2b3a55), n));
  hemi.groundColor.set(new Color(0x7a8f5a).lerp(new Color(0x1e2433), n));
  hemi.intensity = 1.1 - n * 0.5;
  scene.background = new Color(0xa9d3ec).lerp(new Color(0x26324a), n);
  nightUniform.value = Math.max(0, (n - 0.4) / 0.6);
}

// Controls.
const panel = document.createElement('div');
panel.className = 'label';
document.body.appendChild(panel);
const info = document.createElement('div');
const select = document.createElement('select');
for (const k of kits) select.add(new Option(`${k.kind}: ${k.id}`, k.id));
select.value = state.kit;
select.onchange = () => {
  state.kit = select.value;
  rebuild();
};
panel.append(select, info);
function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  on: (v: number) => void,
): void {
  const row = document.createElement('label');
  row.textContent = `${label} `;
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, step, value });
  input.oninput = () => on(Number(input.value));
  row.appendChild(input);
  panel.appendChild(row);
}
slider('Seed', 1, 50, 1, state.seed, (v) => ((state.seed = v), rebuild()));
slider('Stage', 0, 3, 1, 3, (v) => ((state.stage = v), rebuild()));
slider('Low LOD', 0, 1, 1, 0, (v) => ((state.lod = v ? 'low' : 'high'), rebuild()));
slider('Wall', -1, 4, 1, -1, (v) => ((state.wall = v), rebuild()));
slider('Roof', -1, 4, 1, -1, (v) => ((state.roof = v), rebuild()));
slider('Night', 0, 1, 0.01, state.night, (v) => ((state.night = v), applyLight()));
slider('Turntable', 0, 1, 1, state.spin ? 1 : 0, (v) => (state.spin = v === 1));

const camera = new PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(5.5, 4, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
rebuild();
applyLight();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.spin) holder.rotation.y += dt * 0.35;
  for (const p of parts) p.mesh.rotation.z += dt * p.speed;
  controls.update();
  renderer.render(scene, camera);
});
