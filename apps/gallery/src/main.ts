// Gallery v0: one placeholder cottage from the art kit, with orbit controls. C2B fills it in.
import { createKitMaterial, kitById, palette } from '@qoti/art';
import { content } from '@qoti/content';
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0xa9d3ec);
scene.add(new HemisphereLight(0xd9ecff, 0x6b6040, 1));
const sun = new DirectionalLight(0xfff1d6, 1.6);
sun.position.set(4, 6, 3);
scene.add(sun);

const ground = new Mesh(
  new PlaneGeometry(6, 6),
  new MeshStandardMaterial({ color: palette.grass, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const def = content.buildingById.get('cottage')!;
const kit = kitById.get(def.art.kit)!;
const cottage = new Mesh(kit.build({ size: def.size, entrance: def.entrance }), createKitMaterial());
cottage.position.set(-def.size[0] / 2, 0, -def.size[1] / 2);
scene.add(cottage);

const camera = new PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(4.5, 3.2, 5.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
